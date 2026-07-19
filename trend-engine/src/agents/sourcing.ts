/**
 * Sourcing agent — finds footage for a topic *with license metadata attached*.
 *
 * This is where the legal model lives. Every candidate it returns carries a
 * {@link LicenseInfo}. The provider adapters below only return sources whose
 * license we can actually establish:
 *   - Pexels / stock  → licensed, commercial-safe
 *   - Wikimedia       → CC / public-domain (attribution tracked)
 *   - generated       → original b-roll + TTS we own outright
 *   - youtube-cc      → uploader-marked Creative Commons (still verify!)
 *
 * The one model it will NOT do is "grab an arbitrary trending YouTube video" —
 * that path has no defensible license and is deliberately absent.
 */

import { config } from '../config.js';
import type { LicenseInfo, SourceClipCandidate, Topic } from '../types.js';

const STOCK_LICENSE: LicenseInfo = {
  type: 'stock',
  requiresAttribution: false,
  commercialUse: true,
  sourceUrl: 'https://www.pexels.com/license/',
};

function ccByLicense(sourceUrl: string, author: string): LicenseInfo {
  return {
    type: 'cc-by',
    requiresAttribution: true,
    attributionText: `Source: ${author} (CC BY), via Wikimedia Commons`,
    commercialUse: true,
    sourceUrl,
  };
}

const ORIGINAL_LICENSE: LicenseInfo = {
  type: 'original',
  requiresAttribution: false,
  commercialUse: true,
  sourceUrl: 'self-produced',
};

/** Licensed stock (Pexels Videos). Free key; commercial use allowed. */
async function fromPexels(topic: Topic): Promise<SourceClipCandidate[]> {
  if (config.dryRun || !config.apiKeys.pexels) {
    return [
      {
        id: `pexels-mock-${topic.id}`,
        provider: 'pexels',
        title: `Stock b-roll matching "${topic.title}"`,
        url: 'https://www.pexels.com/video/mock',
        durationSec: 18,
        license: STOCK_LICENSE,
      },
    ];
  }
  const url = new URL('https://api.pexels.com/videos/search');
  url.searchParams.set('query', topic.title);
  url.searchParams.set('per_page', '5');
  const res = await fetch(url, { headers: { Authorization: config.apiKeys.pexels } });
  if (!res.ok) return [];
  const json = (await res.json()) as any;
  return (json.videos ?? []).map((v: any) => ({
    id: `pexels-${v.id}`,
    provider: 'pexels',
    title: `${topic.title} — stock`,
    url: v.url,
    durationSec: v.duration ?? 15,
    thumbnailUrl: v.image,
    license: STOCK_LICENSE,
  }));
}

/** Creative Commons / public-domain footage (Wikimedia Commons). */
async function fromWikimedia(topic: Topic): Promise<SourceClipCandidate[]> {
  // Real impl would query the Commons API and read each file's license
  // template. Mocked here; the important part is the license is carried through.
  return [
    {
      id: `wikimedia-mock-${topic.id}`,
      provider: 'wikimedia',
      title: `Archival / CC footage for "${topic.title}"`,
      url: 'https://commons.wikimedia.org/wiki/File:Mock.webm',
      durationSec: 22,
      license: ccByLicense('https://commons.wikimedia.org/wiki/File:Mock.webm', 'Example Author'),
    },
  ];
}

/**
 * Original generated b-roll (AI/stock montage + TTS narration about the topic).
 * You own this outright — the safest option and often the best for explainers.
 */
async function generatedOriginal(topic: Topic): Promise<SourceClipCandidate[]> {
  return [
    {
      id: `generated-${topic.id}`,
      provider: 'generated',
      title: `Original explainer b-roll for "${topic.title}"`,
      url: 'generated://pending-render',
      durationSec: 30,
      license: ORIGINAL_LICENSE,
    },
  ];
}

/**
 * Return candidates for a topic, best-licensed first. Order encodes preference:
 * original (own it) → stock (clean) → CC (attribution) so downstream picks the
 * lowest-risk option available.
 */
export async function findClips(topic: Topic): Promise<SourceClipCandidate[]> {
  const groups = await Promise.all([
    generatedOriginal(topic),
    fromPexels(topic),
    fromWikimedia(topic),
  ]);
  return groups.flat();
}
