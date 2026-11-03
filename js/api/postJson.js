const TIMEOUT_MS = 25_000;

/**
 * Sends `body` as JSON to the game server and returns the JSON reply; rejects on any failure
 * (network error, timeout, or a non-2xx status).
 * `baseUrl` is only needed when the page isn't served by the game server (e.g. in tests).
 */
export async function postJson(path, body, { baseUrl = '', timeoutMs = TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Server responded with ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
