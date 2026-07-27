import { config } from '../config.js';
import type { SourceClipCandidate, Topic } from '../types.js';
import { nasaFixtures } from './fixtures.js';
import { getFetch } from './http.js';

const THIRD_PARTY = /copyright|courtesy of|getty|reuters|associated press|shutterstock/i;

function isThirdParty(item: any): boolean {
  const metadata = item?.data?.[0] ?? {};
  return THIRD_PARTY.test(`${metadata.title ?? ''} ${metadata.description ?? ''}`);
}

function renditionUrls(item: any): string[] {
  const renditions =
    item?._renditions ??
    item?.renditions ??
    item?.assets ??
    (Array.isArray(item?.href) ? item.href : undefined) ??
    item?.data?.[0]?.renditions;
  return Array.isArray(renditions)
    ? renditions.filter((value: unknown): value is string => typeof value === 'string')
    : [];
}

function pickRendition(urls: string[]): string | undefined {
  return (
    urls.find((url) => url.toLowerCase().endsWith('~orig.mp4')) ??
    urls.find((url) => url.toLowerCase().endsWith('~large.mp4')) ??
    urls.find((url) => url.toLowerCase().endsWith('.mp4'))
  );
}

function durationSeconds(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return undefined;

  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parts = value.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return undefined;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

export function mapNasa(json: any, topic: Topic): SourceClipCandidate[] {
  const candidates: SourceClipCandidate[] = [];
  const items = Array.isArray(json?.collection?.items) ? json.collection.items : [];

  for (const item of items) {
    if (isThirdParty(item)) continue;
    const metadata = item?.data?.[0] ?? {};
    const nasaId = metadata.nasa_id;
    const rendition = pickRendition(renditionUrls(item));
    if (nasaId == null || !rendition) continue;

    const pageUrl = `https://images.nasa.gov/details/${encodeURIComponent(String(nasaId))}`;
    const thumbnailUrl = Array.isArray(item?.links)
      ? item.links.find((link: any) => typeof link?.href === 'string')?.href
      : undefined;
    candidates.push({
      id: `nasa-${nasaId}`,
      provider: 'nasa',
      title: typeof metadata.title === 'string' ? metadata.title : `${topic.title} — NASA video`,
      url: rendition,
      durationSec: durationSeconds(metadata.duration) ?? 30,
      thumbnailUrl,
      pageUrl,
      license: {
        type: 'public-domain',
        // NASA requests credit; keep the compliance attribution check engaged.
        // Editors must credit NASA without ever overlaying the NASA insignia.
        requiresAttribution: true,
        attributionText: 'Video: NASA',
        commercialUse: true,
        sourceUrl: pageUrl,
      },
    });
  }

  return candidates;
}

export async function searchNasa(topic: Topic): Promise<SourceClipCandidate[]> {
  if (config.dryRun) return nasaFixtures(topic);

  const url =
    `https://images-api.nasa.gov/search?q=${encodeURIComponent(topic.title)}` +
    '&media_type=video&page_size=5';

  const response = await getFetch()(url);
  if (response.status === 429) return [];
  if (!response.ok) {
    throw new Error(`NASA search failed: HTTP ${response.status}`);
  }

  const json = (await response.json()) as any;
  const items = Array.isArray(json?.collection?.items) ? json.collection.items : [];
  const enriched: any[] = [];
  for (const item of items) {
    // Apply the copyright guard before following the asset collection URL.
    if (isThirdParty(item) || typeof item?.href !== 'string') continue;
    const renditionResponse = await getFetch()(item.href);
    if (renditionResponse.status === 429) return [];
    if (!renditionResponse.ok) {
      throw new Error(`NASA search failed: HTTP ${renditionResponse.status}`);
    }
    enriched.push({ ...item, _renditions: await renditionResponse.json() });
  }

  return mapNasa(
    { ...json, collection: { ...json.collection, items: enriched } },
    topic,
  );
}
