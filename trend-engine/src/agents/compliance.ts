/**
 * Compliance gate — the non-negotiable checkpoint.
 *
 * Nothing reaches the Publisher without passing here. This is what turns the
 * project from "a lawsuit waiting to happen" into a real business: every draft
 * must carry a defensible license, and anything that isn't self-produced is
 * routed to a human (via Telegram) for a final look.
 *
 * The rules are intentionally conservative and boring — that's the point.
 */

import { isSocialPlatformCdn } from './sourcing.js';
import type {
  ClipDraft,
  ComplianceResult,
  ComplianceTier,
  LicenseType,
} from '../types.js';

/** License types we consider safe enough to publish (after human review). */
const PUBLISHABLE: LicenseType[] = [
  'original',
  'stock',
  'licensed',
  'cc0',
  'public-domain',
  'cc-by',
  'youtube-cc',
];

/** Types that ALWAYS block, no matter what. */
const HARD_BLOCK: LicenseType[] = ['unknown'];

export function checkCompliance(draft: ClipDraft): ComplianceResult {
  const reasons: string[] = [];
  const { license } = draft;
  const redReasons: string[] = [];

  if (HARD_BLOCK.includes(license.type)) {
    redReasons.push(
      `[red] License type "${license.type}" has no established provenance — blocked.`,
    );
  }

  const audio = draft.audioProvenance;
  if (!audio) {
    // Fail closed: a draft with no audio provenance is treated as "unknown".
    // No draft path (sourced, original, or future) may bypass the music gate
    // simply by omitting the field.
    redReasons.push(
      '[red] MUSIC GATE: audio provenance is missing — treated as "unknown" and blocked.',
    );
  } else {
    const renderableKinds = new Set(['tts', 'licensed', 'source-native', 'none']);
    if (!renderableKinds.has(audio.kind)) {
      redReasons.push(
        `[red] MUSIC GATE: audio provenance kind "${String(audio.kind)}" is not renderable.`,
      );
    } else if (audio.kind === 'licensed' && !audio.licenseRef?.trim()) {
      redReasons.push(
        '[red] MUSIC GATE: licensed audio is missing a receipt/order ID or license page URL.',
      );
    }
  }

  if (isSocialPlatformCdn(license.sourceUrl)) {
    redReasons.push('[red] WATERMARK BACKSTOP: the license source uses a social-platform CDN.');
  }

  if (draft.editorialOnly && draft.adAdjacent) {
    redReasons.push(
      '[red] Editorial-only footage cannot be used in ad-adjacent styling.',
    );
  }

  if (!HARD_BLOCK.includes(license.type) && !PUBLISHABLE.includes(license.type)) {
    reasons.push(`License type "${license.type}" is not on the allowlist.`);
  }

  if (license.commercialUse === false) {
    reasons.push('License does not permit commercial use, but the channel is monetized.');
  }
  if (license.commercialUse === 'unknown') {
    reasons.push('Commercial-use rights are unverified — needs human confirmation.');
  }

  if (license.requiresAttribution && !license.attributionText) {
    reasons.push('Attribution is required but no attribution text is attached to the clip.');
  }

  if (!license.sourceUrl) {
    reasons.push('No source URL to verify the license claim against.');
  }

  if (redReasons.length > 0) {
    return {
      approved: false,
      requiresHumanReview: false,
      reasons: [
        ...redReasons,
        ...reasons.map((reason) => `[red] ${reason}`),
      ],
      tier: 'red',
      tierReasons: redReasons,
    };
  }

  const tierReasons: string[] = [];
  if (license.type === 'cc-by' || license.type === 'youtube-cc') {
    tierReasons.push(
      'CC verification: verify uploader is original creator.',
      'CC verification: check embedded music.',
      'CC verification: attribution rendered.',
      'CC verification: verification note stored in provenance ledger.',
    );
  }
  if (license.type === 'licensed') {
    tierReasons.push(
      'Paid clip: license tier covers all target platforms.',
      'Paid clip: receipt/order ID stored.',
      'Paid clip: transformation bar met.',
      'Paid clip: record an expected-value note.',
    );
  }
  if (draft.editorialOnly) {
    tierReasons.push(
      'Editorial-only asset: confirm no recognizable people/logos/brands/events are used ad-adjacently, or replace the asset.',
    );
  }
  for (const flag of draft.complianceFlags ?? []) {
    const normalizedFlag = flag.trim();
    if (normalizedFlag) {
      tierReasons.push(`${normalizedFlag}: vary hook/structure before posting`);
    }
  }

  const tier: ComplianceTier = tierReasons.length > 0 ? 'yellow' : 'green';
  if (tier === 'green') {
    tierReasons.push(
      license.type === 'original'
        ? 'green: owner-original content'
        : 'green: licensed/PD b-roll faceless original lane',
    );
  }

  const approved = reasons.length === 0;

  // Everything except our own original content gets a human sign-off. Cheap
  // insurance, and it doubles as a quality filter.
  const requiresHumanReview = license.type !== 'original' || tier === 'yellow';

  return {
    approved,
    requiresHumanReview,
    reasons: approved ? ['License is present and consistent with commercial publishing.'] : reasons,
    tier,
    tierReasons,
  };
}
