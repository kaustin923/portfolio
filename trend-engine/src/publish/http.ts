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

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
