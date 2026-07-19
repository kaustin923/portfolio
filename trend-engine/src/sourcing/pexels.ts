/**
 * Pexels Videos provider — licensed stock footage.
 *
 * Everything on Pexels is covered by the blanket Pexels license
 * (https://www.pexels.com/license/): free for commercial use, no attribution
 * required. That makes every hit a `stock` LicenseInfo with a single, stable
 * verification URL — the simplest possible provenance story in the pipeline.
 *
 * This module performs REAL network calls only. DRY_RUN short-circuiting (and
 * its mock candidates) lives in the sourcing agent so offline runs never
 * touch this file's fetch path.
 */

import { config } from '../config.js';
import type { LicenseInfo, SourceClipCandidate, Topic } from '../types.js';

/** The blanket Pexels license every returned candidate carries. */
export const PEXELS_LICENSE: LicenseInfo = {
  type: 'stock',
  requiresAttribution: false,
  commercialUse: true,
  sourceUrl: 'https://www.pexels.com/license/',
};

// ── Minimal response shapes (only the fields we read) ──────────────────────

interface PexelsVideo {
  id?: number;
  /** Canonical Pexels page for the video. */
  url?: string;
  duration?: number;
  /** Poster/thumbnail image. */
  image?: string;
}

interface PexelsSearchResponse {
  videos?: PexelsVideo[];
}

/**
 * Search Pexels Videos for footage matching the topic.
 *
 * Requires `config.apiKeys.pexels`; returns `[]` when the key is missing or
 * the API call fails — a degraded provider must never sink the whole sourcing
 * run, and it must never fabricate candidates.
 */
export async function searchPexelsVideos(topic: Topic, perPage = 5): Promise<SourceClipCandidate[]> {
  const apiKey = config.apiKeys.pexels;
  if (!apiKey) return [];

  const url = new URL('https://api.pexels.com/videos/search');
  url.searchParams.set('query', topic.title);
  url.searchParams.set('per_page', String(perPage));

  const res = await fetch(url, { headers: { Authorization: apiKey } });
  if (!res.ok) return [];

  const json = (await res.json()) as PexelsSearchResponse;
  const videos = Array.isArray(json.videos) ? json.videos : [];

  const candidates: SourceClipCandidate[] = [];
  for (const v of videos) {
    // A candidate without a stable id + verifiable page URL is not defensible.
    if (typeof v.id !== 'number' || typeof v.url !== 'string' || v.url.length === 0) continue;
    candidates.push({
      id: `pexels-${v.id}`,
      provider: 'pexels',
      title: `Stock b-roll for "${topic.title}" (Pexels #${v.id})`,
      url: v.url,
      durationSec: typeof v.duration === 'number' && v.duration > 0 ? v.duration : 15,
      ...(typeof v.image === 'string' && v.image.length > 0 ? { thumbnailUrl: v.image } : {}),
      license: PEXELS_LICENSE,
    });
  }
  return candidates;
}
