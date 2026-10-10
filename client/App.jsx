import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, Check, Copy, LoaderCircle, Send, Sparkles, X } from "lucide-react";

async function api(url, body, signal) {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || "Request failed.");
  return json;
}
const active = (job) => job && ["queued", "running"].includes(job.status);
const STAGES = [
  ["verse", "Today's verse"],
  ["caption", "AI caption"],
  ["voice", "Narration"],
  ["timing", "Word timing"],
  ["media", "B-roll"],
  ["render", "Rendering"],
  ["check", "Final check"],
];

function Mark(props) {
  return (
    <svg viewBox="0 0 448 512" width="1em" height="1em" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M96 0C43 0 0 43 0 96V416c0 53 43 96 96 96H384h32c17.7 0 32-14.3 32-32s-14.3-32-32-32V384c17.7 0 32-14.3 32-32V32c0-17.7-14.3-32-32-32H384 96zm0 384H352v64H96c-17.7 0-32-14.3-32-32s14.3-32 32-32zM208 80c0-8.8 7.2-16 16-16h32c8.8 0 16 7.2 16 16v48h48c8.8 0 16 7.2 16 16v32c0 8.8-7.2 16-16 16H272V304c0 8.8-7.2 16-16 16H224c-8.8 0-16-7.2-16-16V192H160c-8.8 0-16-7.2-16-16V144c0-8.8 7.2-16 16-16h48V80z" />
    </svg>
  );
}
// Per-viewer preferences; storage can be unavailable.
const read = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {}
};
const prettyDate = (iso) =>
  iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";

export default function App() {
  const [verse, setVerse] = useState(null);
  const [options, setOptions] = useState(null);
  const [voice, setVoice] = useState("");
  const [style, setStyle] = useState("classic");
  const [source, setSource] = useState("daily");
  const [ref, setRef] = useState("");
  const [translation, setTranslation] = useState("");
  const [picked, setPicked] = useState(null);
  const [pickError, setPickError] = useState("");
  const [job, setJob] = useState(null);
  const [video, setVideo] = useState(null);
  const [caption, setCaption] = useState("");
  const [recent, setRecent] = useState([]);
  const [tiktok, setTiktok] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const variation = useRef(0);

  function open(next) {
    setVideo(next);
    setCaption(next.caption);
    setCopied(false);
  }
  useEffect(() => {
    api("api/verse").then(setVerse).catch((e) => setError(e.message));
    api("api/options")
      .then((data) => {
        setOptions(data);
        const saved = read("word-style");
        const first = data.styles.find((s) => s.id === saved) || data.styles[0];
        setStyle(first.id);
        setVoice(read(`word-voice-${first.id}`) || first.voice);
        setTranslation(first.translation);
        setRef(read("word-ref") || "");
        if (read("word-source") === "pick") setSource("pick");
      })
      .catch((e) => setError(e.message));
    api("api/videos")
      .then((videos) => {
        setRecent(videos);
        if (videos[0]) open(videos[0]);
      })
      .catch(() => {});
    api("api/jobs")
      .then((jobs) => {
        const running = jobs.find(active);
        if (running) setJob(running);
      })
      .catch(() => {});
    api("api/tiktok/status").then(setTiktok).catch(() => {});
    const result = new URLSearchParams(location.search).get("tiktok");
    if (result) {
      if (result === "connected") setNotice("TikTok connected. Generated videos can now go straight to your drafts.");
      else setError(result);
      history.replaceState(null, "", location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!active(job)) return;
    let cancelled = false, timer;
    async function poll() {
      try {
        const next = await api(`api/jobs/${job.id}`);
        if (cancelled) return;
        setJob(next);
        if (next.status === "complete") {
          if (next.type === "video") {
            open(next.result);
            setRecent((current) => [next.result, ...current.filter((item) => item.id !== next.result.id)].slice(0, 12));
          } else if (next.type === "tiktok")
            setNotice(
              next.result.inbox
                ? "Sent to your TikTok inbox. Open the notification in TikTok, paste the caption (it's on your clipboard), and post."
                : "Uploaded. TikTok is still processing it; the inbox notification should arrive shortly.",
            );
        } else if (next.status === "failed") setError(next.error);
        else if (active(next)) timer = setTimeout(poll, 900);
      } catch (e) {
        if (!cancelled) timer = setTimeout(poll, 3000);
      }
    }
    timer = setTimeout(poll, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [job?.id, job?.status]);

  // A typed reference previews as soon as it resolves.
  useEffect(() => {
    if (source !== "pick" || !ref.trim() || !translation) {
      setPicked(null);
      setPickError("");
      return;
    }
    const timer = setTimeout(() => {
      api(`api/bible?ref=${encodeURIComponent(ref)}&translation=${translation}`)
        .then((next) => {
          setPicked(next);
          setPickError("");
        })
        .catch((e) => {
          setPicked(null);
          setPickError(e.message);
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [source, ref, translation]);

  function chooseStyle(id) {
    const next = options.styles.find((s) => s.id === id);
    setStyle(id);
    setVoice(read(`word-voice-${id}`) || next.voice);
    setTranslation(next.translation);
    write("word-style", id);
  }
  async function generate() {
    setError("");
    setNotice("");
    try {
      write(`word-voice-${style}`, voice);
      write("word-source", source);
      if (source === "pick") write("word-ref", ref);
      setJob(await api("api/videos", { style, voice, variation: variation.current, ...(source === "pick" && { ref, translation }) }));
      variation.current += 1;
    } catch (e) {
      setError(e.message);
    }
  }
  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
    } catch {
      setError("Clipboard access was unavailable. Select the caption text and copy it.");
    }
  }
  async function sendToTiktok() {
    setError("");
    setNotice("");
    await navigator.clipboard.writeText(caption).catch(() => {});
    try {
      setJob(await api("api/tiktok/drafts", { videoId: video.id }));
    } catch (e) {
      setError(e.message);
    }
  }

  const shown = source === "pick" ? picked : verse;
  const ready = source === "pick" ? Boolean(picked) : Boolean(verse);
  const busy = active(job);
  const generating = busy && job.type === "video";
  const stageIndex = generating ? STAGES.findIndex(([id]) => id === job.stage) : -1;

  return (
    <div className="studio">
      <header className="bar">
        <div className="brand">
          <span className="brand-mark"><Mark /></span>
          <div className="wordmark">
            The Word<span>Daily Verse Studio</span>
          </div>
        </div>
        <div className="bar-status">
          {tiktok?.connected ? (
            <span className="chip ok"><Check size={14} /> TikTok{tiktok.displayName ? ` · @${tiktok.displayName}` : ""}</span>
          ) : tiktok?.configured ? (
            <a className="chip" href="api/tiktok/connect">Connect TikTok</a>
          ) : null}
        </div>
      </header>

      <main className="layout">
        <section className="left">
          <article className="verse-card">
            <div className="verse-art" style={video?.backdropUrl ? { backgroundImage: `url(${video.backdropUrl})` } : undefined}>
              <div className="verse-scrim" />
              <div className="verse-copy">
                <div className="eyebrow">
                  <span className="flourish">✦</span>{" "}
                  {source === "pick" ? (picked ? picked.translationName.toUpperCase() : "CHOOSE A VERSE") : `VERSE OF THE DAY${verse ? ` · ${prettyDate(verse.date).toUpperCase()}` : ""}`}
                </div>
                {shown ? (
                  <>
                    <blockquote>{shown.text}</blockquote>
                    <cite>{shown.reference}</cite>
                    <span className="credit">{shown.picked ? `${shown.translationName} · public domain` : `From ${shown.source}${shown.stale ? " · offline copy" : ""}`}</span>
                  </>
                ) : (
                  <blockquote className="loading">
                    {source === "pick" ? pickError || "Type a reference below, like Joshua 1:9 or Romans 8:31–39." : "Opening today's verse…"}
                  </blockquote>
                )}
              </div>
            </div>
            <div className="verse-tools">
              <div className="tabs" role="tablist" aria-label="Verse">
                <button role="tab" aria-selected={source === "daily"} className={source === "daily" ? "tab on" : "tab"} onClick={() => setSource("daily")} disabled={busy}>
                  Today's verse
                </button>
                <button role="tab" aria-selected={source === "pick"} className={source === "pick" ? "tab on" : "tab"} onClick={() => setSource("pick")} disabled={busy}>
                  Choose a verse
                </button>
              </div>
              {source === "pick" && (
                <div className="pick">
                  <label>
                    Reference
                    <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Joshua 1:9" disabled={busy} autoComplete="off" spellCheck="false" />
                  </label>
                  <label>
                    Translation
                    <select value={translation} onChange={(e) => setTranslation(e.target.value)} disabled={busy || !options}>
                      {options?.translations.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.short} · {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {pickError && <p className="pick-error">{pickError}</p>}
                </div>
              )}
              <div className="styles" role="radiogroup" aria-label="Video style">
                {options?.styles.map((s) => (
                  <button key={s.id} role="radio" aria-checked={style === s.id} className={`style-card style-${s.id}${style === s.id ? " on" : ""}`} onClick={() => chooseStyle(s.id)} disabled={busy}>
                    <span className="swatch" aria-hidden="true">{s.id === "warrior" ? "✠" : "✦"}</span>
                    <strong>{s.name}</strong>
                    <small>{s.tagline}</small>
                  </button>
                ))}
              </div>
              <div className="selects">
                <label>
                  Voice
                  <select value={voice} onChange={(e) => setVoice(e.target.value)} disabled={busy || !options}>
                    {options?.voices.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                  </select>
                </label>
              </div>
              <button className="primary" onClick={generate} disabled={busy || !ready}>
                {generating ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
                {generating ? "Generating…" : video && video.style === style && video.verse?.reference === shown?.reference ? "Generate another take" : "Generate video"}
              </button>
              <p className="hint">One click: the verse is read aloud, every word is highlighted as it's spoken, over B-roll, with an AI-written caption. No music, so you can pick a sound in TikTok.</p>
            </div>
          </article>

          {busy && (
            <section className="progress" role="status" aria-live="polite">
              {generating ? (
                <ol className="stages">
                  {STAGES.map(([id, label], index) => (
                    <li key={id} className={index < stageIndex ? "done" : index === stageIndex ? "now" : ""}>
                      <span className="dot">{index < stageIndex ? <Check size={12} /> : null}</span>
                      {label}
                    </li>
                  ))}
                </ol>
              ) : null}
              <div className="progress-line">
                <span>{job.message}</span>
                <strong>{job.progress}%</strong>
              </div>
              <div className="read-bar"><i style={{ width: `${job.progress}%` }} /></div>
              <button className="text-button" onClick={() => api(`api/jobs/${job.id}/cancel`, {}).then(setJob).catch((e) => setError(e.message))}>
                <X size={14} /> Cancel
              </button>
            </section>
          )}
          {error && <p className="message error" role="alert">{error}</p>}
          {notice && <p className="message" role="status">{notice}</p>}

          {recent.length > 1 && (
            <section className="recent">
              <h2>Recent videos</h2>
              <div className="recent-grid">
                {recent.map((item) => (
                  <button key={item.id} className={item.id === video?.id ? "recent-item selected" : "recent-item"} onClick={() => open(item)}>
                    <img src={item.posterUrl} alt="" />
                    <span>{item.verse.reference}<small>{prettyDate(item.verse.date)}</small></span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </section>

        <section className="right" aria-label="Finished video">
          <div className="phone">
            {video ? (
              <video key={video.id} src={video.videoUrl} poster={video.posterUrl} controls playsInline preload="metadata" />
            ) : (
              <div className="phone-empty">
                <Mark className="phone-mark" />
                <p>Your verse video will appear here.</p>
              </div>
            )}
          </div>
          {video && (
            <div className="post">
              <div className="post-meta">
                <strong>{video.verse.reference}</strong>
                <span>{video.styleName || "The Word"} · {video.voiceLabel?.split(" — ")[0]} · {Math.round(video.duration)}s · voice only</span>
              </div>
              <label htmlFor="caption">Caption</label>
              <textarea id="caption" value={caption} onChange={(e) => { setCaption(e.target.value); setCopied(false); }} rows={11} />
              <div className="post-actions">
                <button className="primary" onClick={sendToTiktok} disabled={busy || !tiktok?.connected} title={tiktok?.connected ? "" : "Connect TikTok first"}>
                  <Send size={16} /> Send to TikTok drafts
                </button>
                <button className="secondary" onClick={copyCaption}>
                  {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copied" : "Copy caption"}
                </button>
                <a className="secondary" href={video.downloadUrl}>
                  <ArrowDownToLine size={16} /> Download MP4
                </a>
              </div>
              <p className="credits">{video.footage?.some((f) => f.kind === "still") ? "Engravings by Gustave Doré (public domain). " : ""}Footage from Mixkit. Add music in TikTok's editor. Caption by {video.captionModel === "template" ? "template" : "AI"}; review before posting.</p>
            </div>
          )}
        </section>
      </main>
      <footer className="foot">
        <span>Scripture from Daily Discovery Bible Study · Read free in <a href={options?.wordAppUrl}>The Word</a></span>
        <span><a href="site/privacy.html">Privacy</a> · <a href="site/terms.html">Terms</a></span>
      </footer>
    </div>
  );
}
