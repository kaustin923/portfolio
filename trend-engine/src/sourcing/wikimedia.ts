/**
 * Wikimedia Commons provider — CC / public-domain footage with per-file
 * license verification.
 *
 * Unlike stock, Commons files each carry their OWN license, so every hit must
 * be resolved individually from the file's `imageinfo.extmetadata` block
 * (LicenseShortName / License / LicenseUrl / Artist / UsageTerms / …).
 * {@link mapWikimediaLicense} is the pure, unit-testable core of that
 * resolution; anything it cannot establish beyond doubt comes back as
 * `unknown`, which the compliance gate hard-blocks. The search wrapper then
 * drops `unknown` results entirely, so this provider never returns a
 * candidate without a defensible license.
 *
 * Deliberately conservative mappings (documented so future edits don't
 * "helpfully" loosen them):
 *   - CC BY-SA  → `unknown`. Our LicenseType has no ShareAlike slot, and the
 *     pipeline cannot honor the obligation to release derivatives under the
 *     same license. Claiming `cc-by` would silently drop the SA condition.
 *   - CC …-NC…  → `unknown` with `commercialUse: false`. The channel is
 *     monetized; NC footage is never usable here.
 *   - CC …-ND…  → `unknown`. Clipping/captioning is derivative work.
 *
 * This module performs REAL network calls only (DRY_RUN mocking lives in the
 * sourcing agent), except for the pure helpers, which are import-safe anywhere.
 */

import type { LicenseInfo, SourceClipCandidate, Topic } from '../types.js';

// ── extmetadata shapes ─────────────────────────────────────────────────────

/** A single extmetadata entry as the Commons API returns it (`{ value, source, hidden? }`). */
export type WikimediaExtMetadataField = { value?: unknown } | string | null | undefined;

/**
 * The `imageinfo[].extmetadata` map. Typed loosely on purpose: this data is
 * community-edited wikitext at heart, and the mapper must survive anything.
 */
export type WikimediaExtMetadata = Record<string, WikimediaExtMetadataField>;

/** Extract a trimmed string from an extmetadata field, tolerating garbage. */
function fieldText(md: WikimediaExtMetadata | null | undefined, key: string): string {
  const field = md?.[key];
  if (field == null) return '';
  if (typeof field === 'string') return field.trim();
  if (typeof field === 'object') {
    const v = (field as { value?: unknown }).value;
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return '';
}

/** Commons Artist/Attribution values are HTML fragments; flatten to plain text. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── The pure license mapper ────────────────────────────────────────────────

/**
 * Map a Commons file's `extmetadata` to a {@link LicenseInfo}.
 *
 * PURE: no I/O, no config. Decision procedure, in order, over the combined
 * lowercase text of `License`, `LicenseShortName`, `LicenseUrl`, `UsageTerms`:
 *
 *   1. CC0 markers ("cc0", "publicdomain/zero")            → `cc0`
 *   2. Public-domain markers ("public domain", "pd-…")     → `public-domain`
 *   3. NonCommercial markers ("-nc", "noncommercial")      → `unknown`, commercialUse false
 *   4. NoDerivatives / ShareAlike markers                  → `unknown`
 *   5. Plain CC BY markers ("cc-by", "licenses/by/…")      → `cc-by` + required attribution
 *   6. Anything else (including empty/garbage metadata)    → `unknown`
 *
 * `unknown` is the fail-closed default — the compliance gate hard-blocks it.
 * (YouTube-CC never appears here: Commons is not YouTube, so `youtube-cc` is
 * n/a for this provider by construction.)
 */
export function mapWikimediaLicense(
  extmetadata: WikimediaExtMetadata | null | undefined,
  sourceUrl: string,
): LicenseInfo {
  const licenseCode = fieldText(extmetadata, 'License');
  const shortName = fieldText(extmetadata, 'LicenseShortName');
  const licenseUrl = fieldText(extmetadata, 'LicenseUrl');
  const usageTerms = fieldText(extmetadata, 'UsageTerms');
  const artist = stripHtml(fieldText(extmetadata, 'Artist'));
  const attributionField = stripHtml(fieldText(extmetadata, 'Attribution'));

  const haystack = `${licenseCode} ${shortName} ${licenseUrl} ${usageTerms}`.toLowerCase();

  const unknown: LicenseInfo = {
    type: 'unknown',
    requiresAttribution: false,
    commercialUse: 'unknown',
    sourceUrl,
  };

  if (haystack.trim() === '') return unknown;

  // 1. CC0 — public-domain dedication. No attribution, commercial OK.
  if (/\bcc0\b|cc-zero|publicdomain\/zero/.test(haystack)) {
    return { type: 'cc0', requiresAttribution: false, commercialUse: true, sourceUrl };
  }

  // 2. Public domain (expired copyright, US gov works, PD marks, "pd-*" codes).
  if (/public\s*domain|publicdomain\/mark|(^|\s)pd(\s|$)|(^|\s)pd-/.test(haystack)) {
    return { type: 'public-domain', requiresAttribution: false, commercialUse: true, sourceUrl };
  }

  // 3. NonCommercial — categorically unusable on a monetized channel.
  if (/-nc\b|non-?commercial/.test(haystack)) {
    return { ...unknown, commercialUse: false };
  }

  // 4. NoDerivatives / ShareAlike — obligations the pipeline cannot honor.
  if (/-nd\b|no-?deriv|by-sa|-sa\b|share-?alike/.test(haystack)) {
    return unknown;
  }

  // 5. Plain CC BY (any version). Attribution is legally REQUIRED, so we
  //    always attach non-empty attribution text, even if the author is unnamed.
  if (/\bcc[\s-]?by\b|licenses\/by\//.test(haystack)) {
    const attributionText =
      attributionField !== ''
        ? attributionField
        : `${artist !== '' ? artist : 'Author unspecified'} — ${shortName !== '' ? shortName : 'CC BY'}, via Wikimedia Commons (${licenseUrl !== '' ? licenseUrl : sourceUrl})`;
    return {
      type: 'cc-by',
      requiresAttribution: true,
      attributionText,
      commercialUse: true,
      sourceUrl,
    };
  }

  // 6. Fail closed.
  return unknown;
}

// ── Real Commons search ────────────────────────────────────────────────────

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

interface WikimediaImageInfo {
  url?: string;
  /** The File: description page — where the license claim is verifiable. */
  descriptionurl?: string;
  mediatype?: string;
  /** Present for audio/video files. */
  duration?: number;
  /** Present when iiurlwidth is requested. */
  thumburl?: string;
  extmetadata?: WikimediaExtMetadata;
}

interface WikimediaPage {
  pageid?: number;
  title?: string;
  imageinfo?: WikimediaImageInfo[];
}

interface WikimediaQueryResponse {
  query?: { pages?: WikimediaPage[] };
}

const VIDEO_EXT_RE = /\.(webm|ogv|ogg|mpg|mpeg|mp4|mov)$/i;

/**
 * Search Wikimedia Commons (File: namespace, video files only) and return
 * candidates whose license could be positively established. Files whose
 * extmetadata maps to `unknown` are dropped here — this provider's contract
 * is that every returned clip carries a defensible license.
 *
 * Returns `[]` on API failure; a degraded provider must not sink the run.
 */
export async function searchWikimediaVideos(topic: Topic, limit = 5): Promise<SourceClipCandidate[]> {
  const url = new URL(COMMONS_API);
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('generator', 'search');
  url.searchParams.set('gsrsearch', `filetype:video ${topic.title}`);
  url.searchParams.set('gsrnamespace', '6'); // File:
  url.searchParams.set('gsrlimit', String(limit));
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'url|extmetadata|mediatype|size');
  url.searchParams.set('iiurlwidth', '480'); // yields thumburl

  const res = await fetch(url, {
    headers: {
      // Wikimedia API etiquette: identify the client.
      'User-Agent': 'trend-engine/0.1 (footage sourcing; license-verified use only)',
    },
  });
  if (!res.ok) return [];

  const json = (await res.json()) as WikimediaQueryResponse;
  const pages = Array.isArray(json.query?.pages) ? json.query.pages : [];

  const candidates: SourceClipCandidate[] = [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info) continue;

    // Keep only genuine video files (belt: API mediatype; suspenders: extension).
    const isVideo =
      info.mediatype === 'VIDEO' ||
      (info.mediatype == null &&
        (VIDEO_EXT_RE.test(page.title ?? '') || VIDEO_EXT_RE.test(info.url ?? '')));
    if (!isVideo) continue;

    // The description page is where a human can verify the license claim.
    const sourceUrl = info.descriptionurl ?? info.url ?? '';
    if (sourceUrl === '') continue;

    const license = mapWikimediaLicense(info.extmetadata, sourceUrl);
    if (license.type === 'unknown') continue; // fail closed: no defensible license, no candidate

    const title = (page.title ?? 'Untitled').replace(/^File:/, '');
    candidates.push({
      id: page.pageid != null ? `wikimedia-${page.pageid}` : `wikimedia-${title}`,
      provider: 'wikimedia',
      title: `${title} (Wikimedia Commons, ${license.type})`,
      url: info.url ?? sourceUrl,
      durationSec:
        typeof info.duration === 'number' && info.duration > 0 ? Math.round(info.duration) : 20,
      ...(typeof info.thumburl === 'string' && info.thumburl.length > 0
        ? { thumbnailUrl: info.thumburl }
        : {}),
      license,
    });
  }
  return candidates;
}
