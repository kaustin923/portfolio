import { config } from '../config.js';
import type { SourceClipCandidate, Topic } from '../types.js';
import { pexelsFixtures } from './fixtures.js';
import { getFetch, requireEnv } from './http.js';

export function mapPexels(json: any, topic: Topic): SourceClipCandidate[] {
  const candidates: SourceClipCandidate[] = [];

  for (const video of Array.isArray(json?.videos) ? json.videos : []) {
    const files = (Array.isArray(video?.video_files) ? video.video_files : [])
      .filter(
        (file: any) =>
          file?.file_type === 'video/mp4' &&
          typeof file.link === 'string' &&
          file.link.length > 0 &&
          Number.isFinite(Number(file.height)),
      )
      .sort((a: any, b: any) => {
        const distance =
          Math.abs(Number(a.height) - 1920) - Math.abs(Number(b.height) - 1920);
        const aBelowTarget = Number(a.height) >= 1920 ? 0 : 1;
        const bBelowTarget = Number(b.height) >= 1920 ? 0 : 1;
        return (
          distance ||
          aBelowTarget - bBelowTarget
        );
      });
    const file = files[0];
    if (video?.id == null || !file) continue;

    const creator =
      typeof video.user?.name === 'string' && video.user.name.trim()
        ? video.user.name.trim()
        : 'Pexels creator';
    candidates.push({
      id: `pexels-${video.id}`,
      provider: 'pexels',
      title: `${topic.title} — Pexels stock video`,
      url: file.link,
      durationSec: Number(video.duration ?? 0),
      thumbnailUrl: typeof video.image === 'string' ? video.image : undefined,
      width: Number(file.width),
      height: Number(file.height),
      pageUrl: typeof video.url === 'string' ? video.url : undefined,
      license: {
        type: 'stock',
        requiresAttribution: false,
        attributionText: `Video by ${creator} on Pexels`,
        commercialUse: true,
        sourceUrl: 'https://www.pexels.com/license/',
      },
    });
  }

  return candidates;
}

export async function searchPexels(topic: Topic): Promise<SourceClipCandidate[]> {
  if (config.dryRun) return pexelsFixtures(topic);

  const key = config.apiKeys.pexels.trim() || requireEnv('PEXELS_API_KEY', 'Pexels');
  const url =
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(topic.title)}` +
    '&orientation=portrait&per_page=5';

  const response = await getFetch()(url, { headers: { Authorization: key } });
  if (!response.ok) {
    throw new Error(`Pexels search failed: HTTP ${response.status}`);
  }
  if (response.headers.get('X-Ratelimit-Remaining') === '0') {
    console.warn('[pexels] hourly API allowance exhausted after this request');
  }

  return mapPexels(await response.json(), topic);
}
