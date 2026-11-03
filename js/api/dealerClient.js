import { postJson } from './postJson.js';

/**
 * Asks the server's dealer agent what to do on this board.
 * Resolves to { action, explanation, dealerTotal }; rejects on any failure.
 */
export function fetchDealerMove({ dealerHand, playerHand }, options) {
  return postJson('/api/dealer-move', { dealerHand, playerHand }, options);
}
