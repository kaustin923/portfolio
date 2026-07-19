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

import type { ClipDraft, ComplianceResult, LicenseType } from '../types.js';

/** License types we consider safe enough to publish (after human review). */
const PUBLISHABLE: LicenseType[] = ['original', 'stock', 'cc0', 'public-domain', 'cc-by', 'youtube-cc'];

/** Types that ALWAYS block, no matter what. */
const HARD_BLOCK: LicenseType[] = ['unknown'];

export function checkCompliance(draft: ClipDraft): ComplianceResult {
  const reasons: string[] = [];
  const { license } = draft;

  if (HARD_BLOCK.includes(license.type)) {
    return {
      approved: false,
      requiresHumanReview: false,
      reasons: [`License type "${license.type}" has no established provenance — blocked.`],
    };
  }

  if (!PUBLISHABLE.includes(license.type)) {
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

  const approved = reasons.length === 0;

  // Everything except our own original content gets a human sign-off. Cheap
  // insurance, and it doubles as a quality filter.
  const requiresHumanReview = license.type !== 'original';

  return {
    approved,
    requiresHumanReview,
    reasons: approved ? ['License is present and consistent with commercial publishing.'] : reasons,
  };
}
