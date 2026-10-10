# Daily Verse Studio · The Word

Videos are voice only, so music can be added in TikTok's editor.

One click turns today's verse into a polished 1080 × 1920 video in The Word's style: the verse is read aloud by a natural voice, every word lights up gold as it is spoken, over calm nature B-roll, with The Word's logo at the start and end and an AI-written caption ready to post or send to TikTok drafts.

## How a video is made

```text
Daily Discovery API ──► verse (cached per day)
                        ├─ caption: Qwen3 (server llama.cpp, or on-device) → hook + reflection + tags
                        ├─ narration: Kokoro-82M, sentence by sentence, with natural pauses
                        ├─ word timing: Whisper hears each phrase → aligned onto the exact verse words
                        ├─ B-roll: 3 Mixkit clips matched to the verse's imagery, cross-faded and graded
                        └─ render: The Word overlay (Canvas) + FFmpeg → H.264 CRF 17 / AAC 256k, -14 LUFS
```

The look comes straight from The Word's landing page: deep sage `#17211b`, Literata for Scripture and the wordmark, Atkinson Hyperlegible for labels, the gold ✦ flourish, the reader's "Reading aloud" indicator and read bar, and the gold "speaking" highlight that glides from word to word.

## Run locally

```bash
npm install
npm run dev     # http://127.0.0.1:4319
```

The first generation downloads the voice (~330 MB), Whisper (~140 MB), and, without `LLM_URL`, the on-device caption model (~1.1 GB) into `MODEL_CACHE_DIR`. B-roll downloads on first use into `data/library`.

| Variable | Default / purpose |
| --- | --- |
| `PORT`, `HOST` | `4319`, `127.0.0.1` |
| `DATA_DIR` | `./data`: videos, verse cache, media library, jobs |
| `MODEL_CACHE_DIR` | `~/.cache/word-daily/models` |
| `LLM_URL`, `LLM_MODEL`, `LLM_API_KEY` | OpenAI-compatible caption model. Unset → on-device Qwen3-1.7B. |
| `KOKORO_DTYPE` | `fp32` (best quality); `q8` is smaller |
| `WORD_APP_URL` | The Word link shown in videos and captions |
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | Enables Send to TikTok drafts |
| `TIKTOK_TOKEN_FILE`, `TIKTOK_CONNECT_URL` | Share a TikTok connection made in another studio |
| `PUBLIC_URL` | Public origin behind a reverse proxy |

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/verse` | Today's verse |
| GET | `/api/options` | Voices |
| POST | `/api/videos` | Generate `{ voice?, variation? }` → job |
| GET | `/api/jobs/:id` | Progress (`stage`: verse, caption, voice, timing, media, render, check) |
| GET | `/api/videos` | Recent videos |
| GET | `/api/videos/:id/{video,download,poster,caption}` | Files |
| POST | `/api/tiktok/drafts` | `{ videoId }` → upload to TikTok inbox |

## Production

`deploy/` holds the Docker Compose file (studio; captions use the server's existing llama.cpp container), the Apache vhost, and the server deploy script. Deployed at https://word.wellspringstudiollc.com behind the studio login; `/site/` (homepage, privacy, terms) is public.

## Credits

Narration: [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (Apache-2.0). Timing: Whisper. B-roll: [Mixkit](https://mixkit.co/license/). Fonts: Literata and Atkinson Hyperlegible (OFL). Logo mark: Font Awesome Free (CC BY 4.0). Verses: [Daily Discovery Bible Study](https://discoverybiblestudy.org/daily/).
