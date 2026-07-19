import type { SourceClipCandidate, Topic } from '../types.js';

export function pexelsFixtures(topic: Topic): SourceClipCandidate[] {
  const key = encodeURIComponent(topic.id);
  return [
    {
      id: `pexels-fixture-${topic.id}`,
      provider: 'pexels',
      title: `${topic.title} — Pexels fixture`,
      url: `https://videos.pexels.com/video-files/${key}/${key}-hd_1080_1920_30fps.mp4`,
      durationSec: 18,
      thumbnailUrl: `https://images.pexels.com/videos/${key}/free-video-${key}.jpg`,
      width: 1080,
      height: 1920,
      pageUrl: `https://www.pexels.com/video/${key}/`,
      license: {
        type: 'stock',
        requiresAttribution: false,
        attributionText: 'Video by Pexels Fixture Creator on Pexels',
        commercialUse: true,
        sourceUrl: 'https://www.pexels.com/license/',
      },
    },
  ];
}

export function pixabayFixtures(topic: Topic): SourceClipCandidate[] {
  const key = encodeURIComponent(topic.id);
  return [
    {
      id: `pixabay-fixture-${topic.id}`,
      provider: 'pixabay',
      title: `${topic.title} — Pixabay fixture`,
      url: `https://cdn.pixabay.com/video/${key}/${key}-large.mp4`,
      durationSec: 20,
      width: 1920,
      height: 1080,
      pageUrl: `https://pixabay.com/videos/id-${key}/`,
      license: {
        type: 'stock',
        requiresAttribution: false,
        attributionText: 'Video by Pixabay Fixture Creator on Pixabay',
        commercialUse: true,
        sourceUrl: 'https://pixabay.com/service/license-summary/',
      },
    },
  ];
}

export function nasaFixtures(topic: Topic): SourceClipCandidate[] {
  const key = encodeURIComponent(topic.id);
  const pageUrl = `https://images.nasa.gov/details/fixture-${key}`;
  return [
    {
      id: `nasa-fixture-${topic.id}`,
      provider: 'nasa',
      title: `${topic.title} — NASA fixture`,
      url: `https://images-assets.nasa.gov/video/fixture-${key}/fixture-${key}~orig.mp4`,
      durationSec: 30,
      pageUrl,
      license: {
        type: 'public-domain',
        requiresAttribution: true,
        attributionText: 'Video: NASA',
        commercialUse: true,
        sourceUrl: pageUrl,
      },
    },
  ];
}

export function wikimediaFixtures(topic: Topic): SourceClipCandidate[] {
  const key = encodeURIComponent(topic.id);
  const pageUrl = `https://commons.wikimedia.org/wiki/File:Fixture-${key}.webm`;
  return [
    {
      id: `wikimedia-fixture-${topic.id}`,
      provider: 'wikimedia',
      title: `File:Fixture-${topic.title}.webm`,
      url: `https://upload.wikimedia.org/wikipedia/commons/fixture/Fixture-${key}.webm`,
      durationSec: 22,
      width: 1080,
      height: 1920,
      pageUrl,
      license: {
        type: 'cc-by',
        requiresAttribution: true,
        attributionText: `"File:Fixture-${topic.title}.webm" by Fixture Creator, via Wikimedia Commons, CC BY 4.0 — modified`,
        commercialUse: true,
        sourceUrl: pageUrl,
      },
    },
  ];
}
