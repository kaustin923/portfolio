/**
 * Sourcing agent — returns only candidates with resolved, commercial-safe
 * license metadata. Provider order is the downstream editor's preference.
 */

import { searchNasa } from '../clips/nasa.js';
import { searchPexels } from '../clips/pexels.js';
import { searchPixabay } from '../clips/pixabay.js';
import { searchWikimedia } from '../clips/wikimedia.js';
import {
  loadBlacklist,
  matchesBlacklist,
  type BlacklistEntry,
} from '../claims.js';
import type { SourceClipCandidate, Topic } from '../types.js';

const SOCIAL_CDN_HOSTS = [
  'tiktokcdn.com',
  'tiktokcdn-us.com',
  'ttwstatic.com',
  'douyinvod.com',
  'cdninstagram.com',
  'fbcdn.net',
  'twimg.com',
] as const;

const PLATFORM_REEXPORT_PATTERN =
  /\b(tiktok|instagram reels|reposted from|re-?upload(ed)? from|watermark(ed)?)\b/i;

const EDITORIAL_LICENSES = new Set(['stock', 'cc0', 'cc-by', 'youtube-cc']);

const EDITORIAL_METADATA_RULES: ReadonlyArray<{
  pattern: RegExp;
  category: string;
}> = [
  { pattern: /\blogos?\b/i, category: 'recognizable logo' },
  { pattern: /\bbrand(?:ed|s)?\b/i, category: 'brand' },
  { pattern: /\bcelebr(?:ity|ities)\b/i, category: 'celebrity' },
  { pattern: /\bfamous\b/i, category: 'recognizable person' },
  { pattern: /\brecognizable (?:person|people)\b/i, category: 'recognizable person' },
  { pattern: /\b(?:nike|adidas|apple|disney)\b/i, category: 'brand' },
  { pattern: /\b(?:nfl|nba|mlb|fifa|olympics)\b/i, category: 'live event' },
  {
    pattern: /\b(?:live events?|super bowl|world cup|comic-con|concert|festival crowd|stadium crowd|red carpet)\b/i,
    category: 'live event',
  },
  { pattern: /\b(?:president|trump|taylor swift)\b/i, category: 'recognizable person' },
];

const providers = [
  { name: 'pexels', search: searchPexels },
  { name: 'pixabay', search: searchPixabay },
  { name: 'nasa', search: searchNasa },
  { name: 'wikimedia', search: searchWikimedia },
] as const;

export function isSocialPlatformCdn(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/\.$/, '');
    return SOCIAL_CDN_HOSTS.some(
      (socialHost) => hostname === socialHost || hostname.endsWith(`.${socialHost}`),
    );
  } catch {
    return false;
  }
}

/** Flag stock-like assets whose metadata indicates editorial-use residual risk. */
export function flagEditorialOnly(candidate: SourceClipCandidate): SourceClipCandidate {
  if (!EDITORIAL_LICENSES.has(candidate.license.type)) return candidate;

  const fields: Array<[string, string]> = [
    ['title', candidate.title],
    ['description', candidate.description ?? ''],
    ...(candidate.tags ?? []).map((tag): [string, string] => ['tag', tag]),
  ];
  const reasons = [...(candidate.editorialReasons ?? [])];

  for (const [field, value] of fields) {
    if (!value) continue;
    for (const rule of EDITORIAL_METADATA_RULES) {
      const match = value.match(rule.pattern)?.[0];
      if (!match) continue;
      const reason = `${field} mentions '${match.toLowerCase()}' (${rule.category})`;
      if (!reasons.includes(reason)) reasons.push(reason);
    }
  }

  if (reasons.length > 0) {
    candidate.editorialOnly = true;
    candidate.editorialReasons = reasons;
  }
  return candidate;
}

/** Apply the fail-closed license and platform re-export guards to sourced candidates. */
export function applySourcingFilters(
  candidates: SourceClipCandidate[],
  blacklist: BlacklistEntry[] = [],
): SourceClipCandidate[] {
  return candidates
    .filter(
      (candidate) =>
        candidate.license.type !== 'unknown' && candidate.license.commercialUse === true,
    )
    .filter((candidate) => {
      let reason: string | undefined;
      if (isSocialPlatformCdn(candidate.url)) {
        reason = 'asset URL is hosted on a social-platform CDN';
      } else if (isSocialPlatformCdn(candidate.pageUrl ?? '')) {
        reason = 'source page URL is hosted on a social-platform CDN';
      } else {
        const metadataFields: Array<[string, string]> = [
          ['title', candidate.title],
          ['description', candidate.description ?? ''],
          ...(candidate.tags ?? []).map((tag): [string, string] => ['tag', tag]),
        ];
        for (const [field, value] of metadataFields) {
          const match = value.match(PLATFORM_REEXPORT_PATTERN)?.[0];
          if (!match) continue;
          reason = `${field} mentions '${match}'`;
          break;
        }
      }

      if (!reason) return true;
      console.warn(
        `[sourcing] rejected platform re-export/watermark candidate: ${candidate.id} (${reason})`,
      );
      return false;
    })
    .filter((candidate) => {
      const match = matchesBlacklist(candidate, blacklist);
      if (!match) return true;
      console.warn(
        `[sourcing] BLACKLISTED rights holder match: ${candidate.id} — ${match.entry.rightsHolder} term '${match.term}' in ${match.field} (stop-the-line; see data/blacklist.json)`,
      );
      return false;
    })
    .map(flagEditorialOnly);
}

// Never add a placeholder `original`/generated candidate here: compliance
// intentionally exempts originals from human review. Generation can return
// only after a real renderer produces a verifiable, downloadable asset.
export async function findClips(topic: Topic): Promise<SourceClipCandidate[]> {
  const blacklist = loadBlacklist();
  const results = await Promise.allSettled(providers.map(({ search }) => search(topic)));
  const candidates: SourceClipCandidate[] = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      candidates.push(...result.value);
      return;
    }
    const provider = providers[index]?.name ?? 'unknown provider';
    const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
    console.warn(`[sourcing] ${provider}: ${message}`);
  });

  return applySourcingFilters(candidates, blacklist);
}
