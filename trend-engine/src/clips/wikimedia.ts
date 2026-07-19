import { config } from '../config.js';
import type { LicenseInfo, SourceClipCandidate, Topic } from '../types.js';
import { wikimediaFixtures } from './fixtures.js';
import { getFetch } from './http.js';

const USER_AGENT = `trend-engine/0.1 (contact: ${process.env.CONTACT_EMAIL ?? 'set-CONTACT_EMAIL-in-env'})`;

function metadataValue(field: any): string {
  return typeof field?.value === 'string'
    ? field.value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
    : '';
}

function mapLicense(
  shortName: string,
  pageTitle: string,
  artist: string,
  sourceUrl: string,
): LicenseInfo | undefined {
  if (/^cc0/i.test(shortName)) {
    return {
      type: 'cc0',
      requiresAttribution: false,
      commercialUse: true,
      sourceUrl,
    };
  }
  if (/public domain|^pd\b/i.test(shortName)) {
    return {
      type: 'public-domain',
      requiresAttribution: false,
      commercialUse: true,
      sourceUrl,
    };
  }
  if (/^cc by(?!-(sa|nc|nd))[ -]?\d/i.test(shortName) && artist) {
    return {
      type: 'cc-by',
      requiresAttribution: true,
      attributionText: `"${pageTitle}" by ${artist}, via Wikimedia Commons, ${shortName} — modified`,
      commercialUse: true,
      sourceUrl,
    };
  }
  return undefined;
}

export function mapWikimedia(json: any, _topic: Topic): SourceClipCandidate[] {
  const candidates: SourceClipCandidate[] = [];
  const pages = json?.query?.pages;
  if (!pages || typeof pages !== 'object') return candidates;

  for (const page of Object.values(pages) as any[]) {
    const videoInfo = page?.videoinfo?.[0];
    const metadata = videoInfo?.extmetadata;
    const pageTitle = typeof page?.title === 'string' ? page.title : '';
    const sourceUrl = typeof videoInfo?.descriptionurl === 'string' ? videoInfo.descriptionurl : '';
    const directUrl = typeof videoInfo?.url === 'string' ? videoInfo.url : '';
    const durationSec = Math.round(Number(videoInfo?.duration ?? 0));
    if (!metadata || !pageTitle || !sourceUrl || !directUrl || durationSec <= 0) continue;

    const shortName = metadataValue(metadata.LicenseShortName);
    const artist = metadataValue(metadata.Artist) || metadataValue(metadata.Credit);
    const license = mapLicense(shortName, pageTitle, artist, sourceUrl);
    if (!license) continue;

    candidates.push({
      id: `wikimedia-${page.pageid}`,
      provider: 'wikimedia',
      title: pageTitle,
      url: directUrl,
      durationSec,
      width: Number(videoInfo.width),
      height: Number(videoInfo.height),
      pageUrl: sourceUrl,
      license,
    });
  }

  return candidates;
}

export async function searchWikimedia(topic: Topic): Promise<SourceClipCandidate[]> {
  if (config.dryRun) return wikimediaFixtures(topic);

  const search = encodeURIComponent(`filetype:video ${topic.title}`);
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&generator=search' +
    `&gsrsearch=${search}&gsrnamespace=6&gsrlimit=5&prop=videoinfo` +
    '&viprop=url%7Csize%7Cmime%7Cduration%7Cextmetadata&format=json';

  const response = await getFetch()(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) {
    throw new Error(`Wikimedia search failed: HTTP ${response.status}`);
  }
  return mapWikimedia(await response.json(), topic);
}
