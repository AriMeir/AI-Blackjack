const TIMEOUT_MS = 25_000;

/**
 * Asks the server's dealer agent what to do on this board.
 * Resolves to { action, explanation, dealerTotal, followsRules }; rejects on any failure.
 * `baseUrl` is only needed when the page isn't served by the game server (e.g. in tests).
 */
export async function fetchDealerMove({ dealerHand, playerHand }, { baseUrl = '', timeoutMs = TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/api/dealer-move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dealerHand, playerHand }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Dealer server responded with ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
