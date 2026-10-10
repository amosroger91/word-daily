import { env } from "@huggingface/transformers";
import { modelCacheDir, wordAppUrl } from "./config.mjs";

env.cacheDir = modelCacheDir;
const SYSTEM = `You write captions for a daily Bible verse video from "The Word", a free Bible app. Reply with JSON only: {"hook": string, "reflection": string, "hashtags": [string]}.
- hook: one short line (max 12 words) that makes someone stop scrolling. Warm, specific to this verse, faithful to what it actually says, not cheesy.
- reflection: 2 sentences of honest, plain-spoken encouragement about what this verse means for an ordinary day. Stay true to the verse. No preaching, no exclamation marks, no quotes from other verses.
- hashtags: 4 relevant tags without spaces.`;
const EXAMPLE = [
  { role: "user", content: 'Psalm 46:10 — "Be still, and know that I am God."' },
  {
    role: "assistant",
    content: JSON.stringify({
      hook: "You don't have to hold everything together today.",
      reflection: "Stillness isn't giving up, it's remembering who is actually in control. Take one quiet minute before the next thing pulls you away.",
      hashtags: ["#BeStill", "#Peace", "#DailyBread", "#Faith"],
    }),
  },
];
const messagesFor = (verse) => [
  { role: "system", content: SYSTEM },
  ...EXAMPLE,
  { role: "user", content: `${verse.reference} — "${verse.text}"` },
];

// Accepts only well-formed, on-brief output; anything else is retried.
export function parseCaption(raw) {
  const text = String(raw).replace(/<think>[\s\S]*?<\/think>/g, "");
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  const hook = String(data.hook || "").replace(/\s+/g, " ").trim().replace(/^["“]|["”]$/g, "");
  const reflection = String(data.reflection || "").replace(/\s+/g, " ").trim();
  const words = hook.split(" ").filter(Boolean).length;
  const sentences = reflection.split(/(?<=[.?])\s+/).filter(Boolean).length;
  const hashtags = [...new Set((Array.isArray(data.hashtags) ? data.hashtags : [])
    .map((tag) => `#${String(tag).replace(/^#+/, "").replace(/[^\p{L}\p{N}]/gu, "")}`)
    .filter((tag) => tag.length > 2 && tag.length < 30))];
  if (words < 3 || words > 16 || sentences < 1 || sentences > 3 || reflection.length > 320 || /!/.test(hook + reflection))
    return null;
  return { hook, reflection, hashtags: hashtags.slice(0, 4) };
}

async function remote(verse, signal) {
  const response = await fetch(`${process.env.LLM_URL.replace(/\/+$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.LLM_API_KEY && { Authorization: `Bearer ${process.env.LLM_API_KEY}` }),
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL || "default",
      messages: messagesFor(verse),
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 220,
    }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(90000)]),
  });
  if (!response.ok) throw new Error(`Caption model returned ${response.status}.`);
  return (await response.json()).choices?.[0]?.message?.content || "";
}

let local;
async function onDevice(verse, report) {
  const { pipeline } = await import("@huggingface/transformers");
  local ||= pipeline("text-generation", process.env.CAPTION_MODEL || "onnx-community/Qwen3-1.7B-ONNX", {
    dtype: "q4",
    device: "cpu",
    progress_callback: (event) => {
      if (event.status === "progress") report(`Downloading the caption model: ${Math.round(event.progress || 0)}%…`);
    },
  });
  const generate = await local;
  // Qwen3's soft switch: answer directly instead of spending the budget thinking.
  const messages = messagesFor(verse);
  messages.at(-1).content += " /no_think";
  const output = await generate(messages, {
    max_new_tokens: 180,
    do_sample: true,
    temperature: 0.7,
    top_p: 0.9,
    tokenizer_encode_kwargs: { enable_thinking: false },
  });
  return output[0].generated_text.at(-1).content;
}

export const fallbackCaption = (verse) => ({
  hook: "Today's verse, read slowly.",
  reflection: "Let these words be the first thing you carry into your day. Read them once more, slowly, and see what stays with you.",
  hashtags: ["#Faith", "#Scripture", "#Jesus", "#DailyBread"],
});

export function composeCaption(verse, parts) {
  const tags = [...new Set(["#TheWord", "#VerseOfTheDay", ...parts.hashtags, "#Bible"])].slice(0, 7);
  return [
    parts.hook,
    "",
    `“${verse.text.replace(/^[“"]|[”"]$/g, "")}” — ${verse.reference}`,
    "",
    parts.reflection,
    "",
    `📖 Read it free in The Word: ${wordAppUrl}`,
    `Verse of the day from ${verse.source}.`,
    "",
    tags.join(" "),
  ]
    .filter((line) => line !== null)
    .join("\n");
}

// Frees the on-device model before the voice and timing models load.
async function releaseLocal() {
  if (!local) return;
  const generate = await local.catch(() => null);
  local = null;
  await generate?.dispose?.();
}

export async function writeCaption(verse, report = () => {}, signal) {
  try {
    return await draftCaption(verse, report, signal);
  } finally {
    await releaseLocal();
  }
}
async function draftCaption(verse, report, signal) {
  const attempts = process.env.LLM_URL ? 3 : 2;
  for (let i = 0; i < attempts; i++) {
    signal?.throwIfAborted();
    try {
      const raw = process.env.LLM_URL ? await remote(verse, signal) : await onDevice(verse, report);
      const parsed = parseCaption(raw);
      if (!parsed) console.warn(`Caption attempt ${i + 1} was off-brief: ${String(raw).slice(0, 400)}`);
      if (parsed) return { ...parsed, model: process.env.LLM_URL ? process.env.LLM_MODEL || "remote" : "Qwen3-1.7B" };
    } catch (error) {
      if (signal?.aborted) throw error;
      console.warn(`Caption attempt ${i + 1} failed: ${error.message}`);
    }
  }
  return { ...fallbackCaption(verse), model: "template" };
}
