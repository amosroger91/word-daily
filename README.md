# Daily Verse Studio · The Word

Videos are voice only, so music can be added in TikTok's editor.

One click turns today's verse into a polished 1080 × 1920 video in The Word's style: the verse is read aloud by a natural voice, every word lights up gold as it is spoken, over calm nature B-roll, with The Word's logo at the start and end and an AI-written caption ready to post or send to TikTok drafts.

## Verses and styles

Use today's Daily Discovery verse, or choose any passage (up to 12 verses) by reference: `Joshua 1:9`, `Eph 6:10-17`, `Psalm 23`. Picked verses come from the public-domain World English Bible or King James Version bundled with The Word.

| Style | Look | Voice |
| --- | --- | --- |
| **The Word** | Deep sage reader card over calm nature B-roll | Heart, unhurried |
| **Uplifting** | Light paper card, gold sparkles, bright footage: dancing in flowers, sunrise, worship, singing | Bella, brighter |
| **Warrior** | Black-and-white Doré engravings and dark footage cut hard on each phrase, The Word's mark burning red, flash frames, huge single-line type | Lewis, pitched ~2.5 semitones down, slow, gritty, cathedral reverb (KJV by default) |

Warrior captions stay about courage, discipline, and spiritual warfare, never hostility toward any group.

### How footage is matched

Every shot is chosen from the words spoken during it (`server/matcher.mjs`), all on the CPU:

1. **Gates.** Crucifixion and Christ imagery appears only when the verse is about Christ (cross, Jesus, "his blood", "only begotten Son"…). A David verse can never show the cross.
2. **Stories.** Names lock a verse to its story (David, Goliath, Philistine → *David Slays Goliath*; Pharaoh → the Red Sea). Other stories' engravings then stay out. Theme words (lion, wrestle, devil) only lean.
3. **Meaning.** A MiniLM sentence-embedding model (ONNX, ~23 MB) scores each asset's written description against the phrase and the whole verse ("a strong tower" → gothic columns, "wings as eagles" → the eagle).
4. **Variety.** No asset twice within three shots, except the verse's own story plate, which can return on its key moments.

Warrior also punches in on every cut, tears the colour channels for a few frames, bleeds a red light leak, adds film scratches and flicker, shakes as each phrase lands, and burns words of power red. An optional sub-bass hit can land on every cut. Uplifting adds drifting bokeh and a warm light leak across each cross-fade.

## How a video is made

```text
Daily Discovery API ──► verse (cached per day)
                        ├─ caption: Qwen3 (server llama.cpp, or on-device) → hook + reflection + tags
                        ├─ narration: Kokoro-82M, sentence by sentence, with natural pauses
                        ├─ word timing: Whisper hears each phrase → aligned onto the exact verse words
                        ├─ footage: Mixkit clips and Doré engravings matched to the verse, prepared once as 1080×1920 crops
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
| GET | `/api/options` | Voices, styles, translations |
| GET | `/api/bible?ref=Joshua 1:9&translation=kjv` | Look up any passage |
| POST | `/api/videos` | Generate `{ style?, ref?, translation?, voice?, variation? }` → job |
| GET | `/api/jobs/:id` | Progress (`stage`: verse, caption, voice, timing, media, render, check) |
| GET | `/api/videos` | Recent videos |
| GET | `/api/videos/:id/{video,download,poster,caption}` | Files |
| POST | `/api/tiktok/drafts` | `{ videoId }` → upload to TikTok inbox |

## Production

`deploy/` holds the Docker Compose file (studio; captions use the server's existing llama.cpp container), the Apache vhost, and the server deploy script. Deployed at https://word.wellspringstudiollc.com behind the studio login; `/site/` (homepage, privacy, terms) is public.

## Credits

Narration: [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (Apache-2.0). Timing: Whisper. Footage: [Mixkit](https://mixkit.co/license/). Engravings: Gustave Doré via Wikimedia Commons (public domain). Scripture: WEB and KJV (public domain). Fonts: Literata and Atkinson Hyperlegible (OFL). Logo mark: Font Awesome Free (CC BY 4.0). Verses: [Daily Discovery Bible Study](https://discoverybiblestudy.org/daily/).
