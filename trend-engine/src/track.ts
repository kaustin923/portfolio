import {
  readManualPosts,
  recordManualOutcome,
  registerManualPost,
} from './manualPosts.js';
import { refreshManualPostStats } from './agents/monitor.js';

const USAGE = `usage:
  npm run track register <outboxDir> <platform> <postUrl>
  npm run track views <postUrl> <views> [likes] [comments]
  npm run track refresh
  npm run track list`;

function usage(): never {
  console.error(USAGE);
  process.exitCode = 1;
  throw new Error('invalid track command');
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'register') {
    if (args.length !== 3) usage();
    const [outboxDir, platform, postUrl] = args as [string, string, string];
    await registerManualPost(outboxDir, platform, postUrl);
    console.log(`registered: ${platform} ${postUrl}`);
    return;
  }
  if (command === 'views') {
    if (args.length < 2 || args.length > 4) usage();
    const [postUrl, viewsText, likesText, commentsText] = args;
    const views = Number(viewsText);
    const likes = likesText === undefined ? 0 : Number(likesText);
    const comments = commentsText === undefined ? 0 : Number(commentsText);
    await recordManualOutcome(postUrl!, views, likes, comments);
    console.log(`recorded: ${views} views for ${postUrl}`);
    return;
  }
  if (command === 'refresh') {
    if (args.length !== 0) usage();
    const result = await refreshManualPostStats();
    console.log(`refreshed: ${result.refreshed}, skipped: ${result.skipped}`);
    return;
  }
  if (command === 'list') {
    if (args.length !== 0) usage();
    const posts = await readManualPosts();
    if (posts.length === 0) {
      console.log('no registered manual posts');
      return;
    }
    for (const post of posts) console.log(JSON.stringify(post));
    return;
  }
  usage();
}

main().catch((err: unknown) => {
  if (err instanceof Error && err.message === 'invalid track command') return;
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
