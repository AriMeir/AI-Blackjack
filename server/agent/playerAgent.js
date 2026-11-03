import Anthropic from '@anthropic-ai/sdk';
import { PLAYER_SYSTEM_PROMPT } from './playerPrompt.js';
import { playerActionTool } from './playerTool.js';
import { askAgent } from './callAgent.js';
import { formatHand, describeTotal, handTotal } from '../hand.js';

// Builds the message sent to Claude: the player's hand with its total, and only the dealer's face-up card.
function boardMessage({ playerHand, dealerUpcard }) {
  return [
    `Your hand: ${formatHand(playerHand)} (total ${describeTotal(playerHand)})`,
    `Dealer's face-up card: ${formatHand([dealerUpcard])}`,
    'Hit or stand?',
  ].join('\n');
}

/**
 * Creates the player agent, which exposes one method: decide(board).
 * Pass your own `client` (e.g. a fake in tests); by default it reads ANTHROPIC_API_KEY from the environment.
 */
export function createPlayerAgent({ client = new Anthropic() } = {}) {
  /**
   * Asks Claude whether the player should hit or stand. The agent sees only its own hand and the
   * dealer's face-up card: the dealer's hidden card is never part of the board.
   * @param {{playerHand: {rank,suit}[], dealerUpcard: {rank,suit}}} board
   * @returns {Promise<{action, explanation, playerTotal}>}
   */
  async function decide(board) {
    const decision = await askAgent({
      client,
      system: PLAYER_SYSTEM_PROMPT,
      tool: playerActionTool,
      message: boardMessage(board),
    });
    return { ...decision, playerTotal: handTotal(board.playerHand) };
  }

  return { decide };
}
