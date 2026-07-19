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
                                                         │     Monitor      │ ──┐ metrics
                                                         └──────────────────┘   │
                                                                  ▲             │
                                                                  └─── feeds back into Trend Scout
```

Each agent is a small module in `src/agents/`. The **reasoning** (ranking topics, writing captions) is Claude; the **control flow** (`src/orchestrator.ts`) is deterministic code. Nothing outward-facing happens without passing the Compliance Gate and — for anything but your own original content — an explicit Telegram approval.

### The agents

| Agent | File | What it does | Status |
|---|---|---|---|
| **Trend Scout** | `agents/trendScout.ts` | Pulls signals from Reddit, Google Trends, YouTube, Hacker News; Claude clusters + ranks them into scored topics (momentum, longevity, saturation, opportunity). | **Built out** (live free APIs + fixtures) |
| **Sourcing** | `agents/sourcing.ts` | Finds footage **with license metadata** — original / stock / Creative Commons. Refuses arbitrary copyrighted clips. | Real license model, mocked providers |
| **Editor** | `agents/editor.ts` | Claude writes the caption + hashtags; ffmpeg cuts to 9:16, burns captions + attribution. | Copy is live; ffmpeg stubbed |
| **Compliance Gate** | `agents/compliance.ts` | Hard-blocks anything without a defensible license; flags everything non-original for human review. | **Built out** |
| **Telegram approval** | `approval/telegram.ts` | DMs you the topic, caption, license + source; ✅/❌ buttons, or reply to override the caption. | **Built out** (raw Bot API, no deps) |
| **Publisher** | `agents/publisher.ts` | Posts via each platform's **official** content API. | Stubbed adapters |
| **Monitor** | `agents/monitor.ts` | Pulls per-post metrics, writes `data/metrics.jsonl` to feed the Scout. | Stubbed |

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
2. Set `DRY_RUN=false` + free source keys (`YOUTUBE_API_KEY`, `PEXELS_API_KEY`) → real signals and real sourcing.
3. Wire the **Telegram** bot (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) → you get the approval card on your phone.
4. Implement the **ffmpeg** exec in `editor.ts` and the **official publish** clients in `publisher.ts` (marked with explicit `throw`s so live mode can't silently ship a stub).

Each step is isolated, so you can turn the system on one stage at a time.

---

## Where to take it next

- **Scheduling:** wrap `runOnce()` in a cron (or a Claude Managed Agents scheduled deployment) to run every few hours.
- **Learning loop:** feed `data/metrics.jsonl` back into the Scout's prompt so it learns which domains/angles actually convert.
- **Per-domain studios:** the Scout already tags `domains` — fork the pipeline per vertical (educational, sports, finance) with different sourcing + voice.
