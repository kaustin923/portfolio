import { config } from '../config.js';
import type { SourceClipCandidate, Topic } from '../types.js';
import { pixabayFixtures } from './fixtures.js';
import { cachedJson, getFetch, requireEnv } from './http.js';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function mapPixabay(json: any, topic: Topic): SourceClipCandidate[] {
  const candidates: SourceClipCandidate[] = [];

  for (const hit of Array.isArray(json?.hits) ? json.hits : []) {
    const large = hit?.videos?.large;
    const medium = hit?.videos?.medium;
    const rendition =
      typeof large?.url === 'string' && large.url.trim().length > 0 ? large : medium;
    if (hit?.id == null || typeof rendition?.url !== 'string' || !rendition.url.trim()) continue;

    const creator =
      typeof hit.user === 'string' && hit.user.trim() ? hit.user.trim() : 'Pixabay creator';
    candidates.push({
      id: `pixabay-${hit.id}`,
      provider: 'pixabay',
      title: `${topic.title} — Pixabay stock video`,
      url: rendition.url,
      durationSec: Number(hit.duration ?? 0),
      width: Number(rendition.width),
      height: Number(rendition.height),
      pageUrl: typeof hit.pageURL === 'string' ? hit.pageURL : undefined,
      license: {
        type: 'stock',
        requiresAttribution: false,
        attributionText: `Video by ${creator} on Pixabay`,
        commercialUse: true,
        sourceUrl: 'https://pixabay.com/service/license-summary/',
      },
    });
  }

  return candidates;
}

export async function searchPixabay(topic: Topic): Promise<SourceClipCandidate[]> {
  if (config.dryRun) return pixabayFixtures(topic);

  const key = requireEnv('PIXABAY_API_KEY', 'Pixabay');
  const url =
    `https://pixabay.com/api/videos/?key=${encodeURIComponent(key)}` +
    `&q=${encodeURIComponent(topic.title)}&safesearch=true&per_page=5`;

  // Pixabay caps clients at 100 requests/minute and requires 24-hour caching.
  const json = await cachedJson(url, CACHE_TTL_MS, async () => {
    const response = await getFetch()(url);
    if (!response.ok) {
      throw new Error(`Pixabay search failed: HTTP ${response.status}`);
    }
    return response.json();
  });

  return mapPixabay(json, topic);
}
