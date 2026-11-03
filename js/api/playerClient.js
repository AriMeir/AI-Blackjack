import { postJson } from './postJson.js';

/**
 * Asks the server's player agent what to do. Only the player's hand and the dealer's
 * face-up card are sent: the dealer's hidden card never leaves the game.
 * Resolves to { action, explanation, playerTotal }; rejects on any failure.
 */
export function fetchPlayerMove({ playerHand, dealerUpcard }, options) {
  return postJson('/api/player-move', { playerHand, dealerUpcard }, options);
}
