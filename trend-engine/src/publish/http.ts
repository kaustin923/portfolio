export type FetchFn = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

let injectedFetch: FetchFn | undefined;

/** Every live publisher request goes through this seam so tests stay offline. */
export function getFetch(): FetchFn {
  return injectedFetch ?? ((input, init) => globalThis.fetch(input, init));
}

export function setFetch(fn: FetchFn): void {
  injectedFetch = fn;
}

export function resetFetch(): void {
  injectedFetch = undefined;
}

export function requireEnv(platform: string, names: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  const missing: string[] = [];

  for (const name of names) {
    const value = process.env[name];
    if (value == null || value.trim() === '') {
      missing.push(name);
    } else {
      values[name] = value;
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required env for ${platform} publishing: ${missing.join(', ')} — refusing to publish`,
    );
  }

  return values;
}

export async function expectOk(res: Response, context: string): Promise<void> {
  if (res.ok) return;

  let bodyExcerpt = '';
  try {
    bodyExcerpt = (await res.text()).replace(/\s+/g, ' ').trim().slice(0, 500);
  } catch {
    // The status and context still make a useful error if the body cannot be read.
  }

  throw new Error(`${context}: HTTP ${res.status} ${bodyExcerpt}`.trimEnd());
}

export async function expectJson<T>(res: Response, context: string): Promise<T> {
  const body = await res.text();
  const excerpt = body.replace(/\s+/g, ' ').trim();

  if (!res.ok) {
    throw new Error(
      `${context} failed: HTTP ${res.status} ${res.statusText} — ${excerpt.slice(0, 500)}`,
    );
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`${context} returned non-JSON response: ${excerpt.slice(0, 200)}`);
  }
}

export function composeCaption(caption: string, hashtags: string[], limit: number): string {
  const tags = hashtags
    .map((hashtag) => hashtag.trim())
    .map((hashtag) => hashtag.replace(/^#/, ''))
    .filter(Boolean)
    .map((hashtag) => `#${hashtag}`);
  if (tags.length === 0 || caption.length + 2 >= limit) return caption.slice(0, limit);

  const included: string[] = [];
  for (const tag of tags) {
    const tagBlock = [...included, tag].join(' ');
    if (`${caption}\n\n${tagBlock}`.length > limit) break;
    included.push(tag);
  }
  return included.length > 0 ? `${caption}\n\n${included.join(' ')}` : caption.slice(0, limit);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
