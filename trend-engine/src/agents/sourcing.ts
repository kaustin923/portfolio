/**
 * Sourcing agent — finds footage for a topic *with license metadata attached*.
 *
 * This is where the legal model lives. Every candidate it returns carries a
 * {@link LicenseInfo}. The provider adapters (src/sourcing/) only return
 * sources whose license we can actually establish:
 *   - Pexels / stock  → licensed, commercial-safe (blanket Pexels license)
 *   - Wikimedia       → CC / public-domain, resolved per-file from extmetadata
 *                       (anything unresolvable is dropped, never returned)
 *   - generated       → original b-roll + TTS we own outright
 *   - youtube-cc      → uploader-marked Creative Commons (still verify!)
 *
 * The one model it will NOT do is "grab an arbitrary trending YouTube video" —
 * that path has no defensible license and is deliberately absent.
 *
 * DRY_RUN discipline: when `config.dryRun` is true this agent returns mocked
 * candidates and never imports a network path's fetch; the real providers in
 * src/sourcing/ are only invoked when `!config.dryRun`.
 */

import { config } from '../config.js';
import { searchPexelsVideos, PEXELS_LICENSE } from '../sourcing/pexels.js';
import { searchWikimediaVideos } from '../sourcing/wikimedia.js';
import type { LicenseInfo, SourceClipCandidate, Topic } from '../types.js';

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

/** Run a real provider, degrading to "no candidates" instead of failing the run. */
async function safely(
  provider: string,
  call: () => Promise<SourceClipCandidate[]>,
): Promise<SourceClipCandidate[]> {
  try {
    return await call();
  } catch (err) {
    console.error(`[sourcing] ${provider} provider failed:`, err);
    return [];
  }
}

/** Licensed stock (Pexels Videos). Free key; commercial use allowed. */
async function fromPexels(topic: Topic): Promise<SourceClipCandidate[]> {
  if (config.dryRun) {
    return [
      {
        id: `pexels-mock-${topic.id}`,
        provider: 'pexels',
        title: `Stock b-roll matching "${topic.title}"`,
        url: 'https://www.pexels.com/video/mock',
        durationSec: 18,
        license: PEXELS_LICENSE,
      },
    ];
  }
  // Live mode without a key: skip the provider — never fabricate candidates.
  if (!config.apiKeys.pexels) return [];
  return safely('pexels', () => searchPexelsVideos(topic));
}

/** Creative Commons / public-domain footage (Wikimedia Commons). */
async function fromWikimedia(topic: Topic): Promise<SourceClipCandidate[]> {
  if (config.dryRun) {
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
  return safely('wikimedia', () => searchWikimediaVideos(topic));
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
 *
 * Invariant: no candidate ever leaves this function with an `unknown` license.
 * The providers already guarantee this; the final filter enforces it at the
 * agent boundary so the compliance gate never even sees unestablished footage.
 */
export async function findClips(topic: Topic): Promise<SourceClipCandidate[]> {
  const groups = await Promise.all([
    generatedOriginal(topic),
    fromPexels(topic),
    fromWikimedia(topic),
  ]);
  return groups.flat().filter((c) => c.license.type !== 'unknown');
}
