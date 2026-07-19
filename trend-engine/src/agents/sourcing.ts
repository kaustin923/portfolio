/**
 * Sourcing agent — returns only candidates with resolved, commercial-safe
 * license metadata. Provider order is the downstream editor's preference.
 */

import { searchNasa } from '../clips/nasa.js';
import { searchPexels } from '../clips/pexels.js';
import { searchPixabay } from '../clips/pixabay.js';
import { searchWikimedia } from '../clips/wikimedia.js';
import type { SourceClipCandidate, Topic } from '../types.js';

const providers = [
  { name: 'pexels', search: searchPexels },
  { name: 'pixabay', search: searchPixabay },
  { name: 'nasa', search: searchNasa },
  { name: 'wikimedia', search: searchWikimedia },
] as const;

// Never add a placeholder `original`/generated candidate here: compliance
// intentionally exempts originals from human review. Generation can return
// only after a real renderer produces a verifiable, downloadable asset.
export async function findClips(topic: Topic): Promise<SourceClipCandidate[]> {
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

  return candidates.filter(
    (candidate) => candidate.license.type !== 'unknown' && candidate.license.commercialUse === true,
  );
}
