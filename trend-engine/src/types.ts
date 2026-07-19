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
 * A ranked, de-duplicated topic synthesized from many raw signals by Claude.
 * This is the crown-jewel output of the whole system — knowing *what* is about
 * to boom is the hard, valuable, and fully-legal part.
 */
export interface Topic {
  id: string;
  title: string;
  summary: string;
  whyTrending: string;
  momentum: Momentum;
  longevity: Longevity;
  /** Which content verticals this topic fits (educational, sports, etc.). */
  domains: string[];
  /** A concrete, defensible content angle we could actually make. */
  suggestedAngle: string;
  saturationRisk: SaturationRisk;
  /** 0–100 composite of momentum, longevity, fit, and saturation. */
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
  url: string;
  durationSec: number;
  thumbnailUrl?: string;
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
