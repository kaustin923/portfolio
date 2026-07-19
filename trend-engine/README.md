# trend-engine

A multi-agent workflow that **detects trending topics**, **sources footage under a defensible license**, **clips + captions it**, routes it through a **human approval gate on Telegram**, and **publishes to multiple platforms** — then **monitors performance** to make the trend detection smarter over time.

Built with the Claude Agent SDK / Anthropic SDK (`claude-opus-4-8`). Runs fully offline in `DRY_RUN` mode (the default) with mocked sources so you can see the whole pipeline before wiring a single credential.

> ⚠️ **Read [Legal model](#legal-model) first.** This is designed around *licensed / Creative Commons / original* footage plus a mandatory human sign-off — not around reposting other people's copyrighted videos. That distinction is what makes it a business instead of a lawsuit.

---

## Architecture

```
                        ┌──────────────────────────┐
                        │       Orchestrator       │   deterministic control flow
                        └────────────┬─────────────┘
                                     │
   ┌─────────────┐   topics   ┌──────▼──────┐  candidates  ┌──────────────┐
   │ Trend Scout │ ─────────▶ │  Sourcing   │ ───────────▶ │    Editor    │
   │ (crown jewel)│           │ (+license)  │              │ ffmpeg+caption│
   └─────┬───────┘            └─────────────┘              └──────┬───────┘
         │ signals                                                │ draft
   Reddit·Trends·YouTube·HN                              ┌────────▼─────────┐
                                                         │ Compliance Gate  │  ⛔ hard stop
                                                         │  (license req'd) │
                                                         └────────┬─────────┘
                                                                  │ passes
                                                         ┌────────▼─────────┐
                                                         │ Telegram approval│  🙋 human-in-loop
                                                         └────────┬─────────┘
                                                                  │ approved
                                             ┌────────────────────▼───────────────┐
                                             │ Publisher (official platform APIs)  │
                                             └────────────────────┬───────────────┘
                                                                  │ posted
                                                         ┌────────▼─────────┐
                                                         │     Monitor      │ ──┐ metrics + topic outcomes
                                                         └──────────────────┘   │
                                                                  ▲             │
                                                                  └─── learning loop feeds back into Trend Scout
```

Each agent is a small module in `src/agents/`. The **reasoning** (ranking topics, writing captions) is Claude; the **control flow** (`src/orchestrator.ts`) is deterministic code. Nothing outward-facing happens without passing the Compliance Gate and — for anything but your own original content — an explicit Telegram approval. The scheduler daemon (`src/scheduler.ts`, `npm run daemon`) runs the whole pipeline continuously on a jittered schedule with a lock file so only one instance runs.

### The agents

| Agent | File | What it does | Status |
|---|---|---|---|
| **Trend Scout** | `agents/trendScout.ts` | Pulls signals from Reddit, Google Trends, YouTube, Hacker News; Claude clusters + ranks them into scored topics (momentum, longevity, saturation, opportunity), biased by past performance (platform summary + topic-outcome learning summary). | **Built out** (live free APIs + fixtures) |
| **Sourcing** | `agents/sourcing.ts` | Finds footage **with license metadata** via the live providers in `src/clips/` (Pexels, Pixabay, NASA, Wikimedia Commons) — original / stock / Creative Commons only. Refuses arbitrary copyrighted clips. | **Built out** (live providers + DRY_RUN fixtures) |
| **Editor** | `agents/editor.ts` | Claude writes the caption + hashtags; `src/media/ffmpeg.ts` cuts to the requested aspect ratio (9:16 / 1:1 / 16:9), burns the caption (libass subtitles or word-wrapped drawtext fallback) + license attribution. | **Built out** (real ffmpeg render) |
| **Compliance Gate** | `agents/compliance.ts` | Hard-blocks anything without a defensible license; flags everything non-original for human review. | **Built out** |
| **Telegram approval** | `approval/telegram.ts` | DMs you the topic, caption, license + source; ✅/❌ buttons, or reply to override the caption. | **Built out** (raw Bot API, no deps) |
| **Publisher** | `agents/publisher.ts` | Posts via each platform's **official** content API through the adapters in `src/publish/` — TikTok, YouTube Shorts, Instagram Reels, and X. Refuses non-approved decisions and re-appends required attribution to human-edited captions. | **Built out** (live adapters, DRY_RUN mocks) |
| **Monitor** | `agents/monitor.ts` | Records per-post metrics to `data/metrics.jsonl` and topic-joined outcomes to `data/outcomes.jsonl`; deterministic hash-derived metrics in DRY_RUN; per-platform live-analytics scaffolding. | Persistence built out; live analytics stubbed |
| **Learning loop** | `src/learning.ts` | Aggregates `data/outcomes.jsonl` (last 500 records, DRY_RUN filtered) into a prompt-ready summary of avg views by domain / stage / recommendation that the Trend Scout injects into its forecast. | **Built out** |

### Module layout

```
src/
  agents/        the six pipeline agents (scout, sourcing, editor, compliance, publisher, monitor)
  clips/         licensed-footage providers: pexels, pixabay, nasa, wikimedia (+ DRY_RUN fixtures)
  media/         ffmpeg rendering (aspect ratios, caption burn-in, streamed downloads) + caption helpers
  publish/       platform adapters: tiktok, youtube (Shorts), instagram (Reels, resumable upload), x — plus shared http/caption helpers
  approval/      Telegram human-in-the-loop gate
  sources/       trend signal collectors + upcoming-catalyst calendar
  learning.ts    outcome aggregation → forecaster prompt bias
  scheduler.ts   daemon: jittered continuous runs with a single-instance lock
  orchestrator.ts / index.ts   deterministic control flow + CLI (scout | run | daemon)
```

---

## Legal model

Taking someone else's video, clipping it, and posting it for profit is **copyright infringement by default** — Content ID will catch it and platform ToS separately ban it. This system is deliberately built around the models that survive:

| License type | Source | Publishable? |
|---|---|---|
| `original` | AI/stock b-roll + TTS you produce | ✅ auto (no human review needed) |
| `stock` | Pexels, Storyblocks, Getty… | ✅ after human review |
| `cc0` / `public-domain` | Wikimedia, gov archives, NASA | ✅ after human review |
| `cc-by` / `youtube-cc` | CC-marked works (attribution tracked) | ✅ after human review |
| `unknown` | anything unverified | ⛔ **hard-blocked** |

The **Compliance Gate** (`agents/compliance.ts`) enforces this in code, and the **Telegram gate** puts a human on every non-original post. Together they make the whole thing defensible. None of this is legal advice — talk to a lawyer before monetizing.

The **Trend Scout is fully legal on its own** and is the most valuable component — knowing *what* is about to boom (your World Cup example) is the hard part, independent of where the footage comes from.

---

## Setup

```bash
cd trend-engine
npm install
cp .env.example .env      # DRY_RUN=true by default
```

Run the Trend Scout on its own (needs only an Anthropic key; sources are mocked in DRY_RUN):

```bash
npm run scout
```

Run the full pipeline once (mocked end-to-end in DRY_RUN — auto-approves and "publishes" to console):

```bash
npm start
```

### Going live (incrementally)

1. Set `ANTHROPIC_API_KEY`. Leave `DRY_RUN=true` — the Scout now reasons over real signals but still publishes nothing.
2. Set `DRY_RUN=false` + free source keys (`YOUTUBE_API_KEY`, `PEXELS_API_KEY`, `PIXABAY_API_KEY`) → real signals and real sourcing (Wikimedia + NASA need no key).
3. Wire the **Telegram** bot (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) → you get the approval card on your phone.
4. Add platform credentials per adapter in `src/publish/` (each fails loud, naming exactly which env vars are missing): TikTok (`TIKTOK_ACCESS_TOKEN`), YouTube (`YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET`/`YOUTUBE_REFRESH_TOKEN`), Instagram (`IG_USER_ID` + `IG_ACCESS_TOKEN` — clips upload directly, no public hosting needed), X (`X_ACCESS_TOKEN`, user-context OAuth 2.0 with `media.write`).
5. Opt into X by adding it to `PUBLISH_PLATFORMS=tiktok,youtube-shorts,instagram-reels,x` — the default platform list deliberately excludes it.
6. Run `npm run daemon` to keep the pipeline running on a jittered schedule.

Each step is isolated, so you can turn the system on one stage at a time. Every live publish path throws immediately under `DRY_RUN`, so a misconfigured flag can never silently post.

## Running without a terminal (launchd daemon)

From the repository, install the macOS launchd job with `bash scripts/daemon-install.sh`. The installer is safe when the repository path contains spaces and writes `~/Library/LaunchAgents/com.trendengine.daemon.plist`.

launchd runs one `npm start` pipeline pass at load and every `StartInterval = 86400 / RUNS_PER_DAY` seconds. The existing `data/run.lock` prevents overlapping passes. Output and errors go to `data/daemon.log`; follow them with `tail -f data/daemon.log`. `DRY_RUN` in `.env` still controls whether the pipeline can perform live work, and the installer does not change it.

Remove the job and its plist with `bash scripts/daemon-uninstall.sh`.

---

## Where to take it next

- **Live analytics:** the Monitor's per-platform stat fetchers (`agents/monitor.ts`) are typed stubs with the exact API endpoints documented — fill them in to replace the recorded zeros.
- **X token auto-refresh:** the X adapter ships with a static `X_ACCESS_TOKEN` (~2h expiry unless refreshed); wiring `offline.access` refresh-token rotation through `state.ts` is the documented follow-up in `src/publish/x.ts`.
- **Per-domain studios:** the Scout already tags `domains` — fork the pipeline per vertical (educational, sports, finance) with different sourcing + voice.
