/**
 * Shared domain types for the trend-tracking → clipping → publishing pipeline.
 *
 * The whole system is a pipeline of small agents that hand these objects to
 * each other. Keeping the contracts in one place makes it easy to reason about
 * where a piece of data came from and what still needs to happen to it before
 * anything is published.
 */

// ────────────────────────────────────────────────────────────────────────────
// Content / legal model
// ────────────────────────────────────────────────────────────────────────────

/**
 * The legal basis a piece of source footage is used under. This is the single
 * most important field in the system — the Compliance agent refuses to let
 * anything reach the Publisher unless it can point to a defensible license.
 */
export type LicenseType =
  | 'stock' //          Paid/licensed stock (Pexels, Storyblocks, Artgrid, Getty…)
  | 'cc0' //            Creative Commons Zero — public-domain dedication
  | 'cc-by' //          Creative Commons Attribution (attribution required)
  | 'public-domain' //  Gov archives, NASA, pre-1929 works, etc.
  | 'original' //       We generated it (AI b-roll + TTS, our own footage)
  | 'youtube-cc' //     A YouTube video the uploader marked Creative Commons
  | 'unknown'; //       Provenance not established → NEVER auto-publishable

export interface LicenseInfo {
  type: LicenseType;
  requiresAttribution: boolean;
  attributionText?: string;
  commercialUse: boolean | 'unknown';
  /** Where the license claim can be verified. */
  sourceUrl: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Trend Scout
// ────────────────────────────────────────────────────────────────────────────

export type SignalSource = 'reddit' | 'google-trends' | 'youtube' | 'hackernews' | 'mock';

/** A raw, per-source observation before any cross-source reasoning. */
export interface TrendSignal {
  source: SignalSource;
  externalId: string;
  title: string;
  url?: string;
  /** Source-native popularity number (upvotes, view count, search volume…). */
  score: number;
  /** How fast it is climbing, if the source exposes it (0–1, source-relative). */
  velocity?: number;
  category?: string;
  capturedAt: string; // ISO
}

export type Momentum = 'exploding' | 'rising' | 'steady' | 'fading';
/** How long the topic is likely to stay relevant — drives publish urgency. */
export type Longevity = 'spike' | 'sustained' | 'evergreen';
export type SaturationRisk = 'low' | 'medium' | 'high';

/**
 * Where a topic sits on its hype curve. This is the whole point of the
 * redesign: you make money by posting into `emerging`/`rising`, BEFORE the
 * wave. Posting into `peaking`/`saturated` (e.g. World Cup content once the
 * World Cup is already here) is a losing game — the feed is already flooded.
 */
export type TrendStage = 'emerging' | 'rising' | 'peaking' | 'saturated' | 'declining';

/** What to actually do about a topic, given its stage and lead time. */
export type Recommendation =
  | 'post-now' //       Rising with a real window still open — move.
  | 'prepare' //        Emerging / scheduled catalyst ahead — build the asset now, post before peak.
  | 'watch' //          Signal is early/weak — keep monitoring, don't commit yet.
  | 'skip-saturated'; // Already peaked or flooded — do not waste a slot on it.

/**
 * A known FUTURE catalyst — a scheduled or predictable event that will drive
 * attention (a tournament, election, product/movie/game launch, holiday, major
 * anniversary). These are how we get *ahead* of trends instead of chasing them.
 */
export interface UpcomingCatalyst {
  id: string;
  title: string;
  /** ISO date (or best estimate) of the event. */
  date: string;
  /** Days from "now" until the event. */
  daysUntil: number;
  category: string;
  /** How confident we are it will actually drive attention (0–1). */
  confidence: number;
  source: string;
}

/**
 * A ranked, forward-looking topic forecast — the crown-jewel output.
 *
 * It fuses reactive signals (what's rising now) with upcoming catalysts (what's
 * scheduled) and, crucially, tells you WHEN to post via `stage`, `leadTimeDays`,
 * and `postWindow` — not just what's loud today.
 */
export interface Topic {
  id: string;
  title: string;
  summary: string;
  /** Why attention is (or will be) rising — the causal story. */
  whyTrending: string;
  momentum: Momentum;
  longevity: Longevity;

  // ── Forecasting (the part that makes this predictive, not reactive) ──
  stage: TrendStage;
  /** Days until predicted peak. Negative ⇒ already peaked (avoid). */
  leadTimeDays: number;
  /** Human-readable posting window, e.g. "post 3–7 days out, before the final". */
  postWindow: string;
  /** The upcoming catalyst driving this, if any (else null). */
  catalyst: string | null;
  recommendation: Recommendation;

  /** Which content verticals this topic fits (educational, sports, etc.). */
  domains: string[];
  /** A concrete, defensible content angle we could actually make. */
  suggestedAngle: string;
  saturationRisk: SaturationRisk;
  /** 0–100 composite of lead time, momentum, longevity, fit, and low saturation. */
  opportunityScore: number;
  /** Which SignalSources contributed evidence for this topic. */
  contributingSources: SignalSource[];
}

// ────────────────────────────────────────────────────────────────────────────
// Sourcing → Editing → Compliance
// ────────────────────────────────────────────────────────────────────────────

export interface SourceClipCandidate {
  id: string;
  provider: string; // 'pexels' | 'wikimedia' | 'youtube-cc' | 'generated' | ...
  title: string;
  /** MUST be a direct-downloadable MP4/WebM/OGV file URL on the provider's CDN. */
  url: string;
  durationSec: number;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  /** Human-facing page for this specific asset. */
  pageUrl?: string;
  /** `license.sourceUrl` is the human-verifiable page supporting the license claim. */
  license: LicenseInfo;
}

export type AspectRatio = '9:16' | '1:1' | '16:9';
export type Platform = 'tiktok' | 'youtube-shorts' | 'instagram-reels' | 'x';

/** An edited, captioned clip ready for the compliance gate + human approval. */
export interface ClipDraft {
  id: string;
  topicId: string;
  sourceCandidateId: string;
  /** Local path (or object-store key) of the rendered file. */
  outputPath: string;
  aspectRatio: AspectRatio;
  caption: string;
  hashtags: string[];
  targetPlatforms: Platform[];
  license: LicenseInfo;
}

export interface ComplianceResult {
  approved: boolean;
  reasons: string[];
  /** True when a human must sign off (the default for anything but `original`). */
  requiresHumanReview: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Approval → Publishing → Monitoring
// ────────────────────────────────────────────────────────────────────────────

export type ApprovalStatus = 'approved' | 'rejected' | 'timeout';

export interface ApprovalDecision {
  status: ApprovalStatus;
  decidedBy?: string;
  /** The human may tweak the caption before approving. */
  editedCaption?: string;
  note?: string;
}

export interface PublishResult {
  platform: Platform;
  status: 'published' | 'skipped' | 'error';
  postId?: string;
  url?: string;
  error?: string;
}

export interface PostMetrics {
  postId: string;
  platform: Platform;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  capturedAt: string;
}
