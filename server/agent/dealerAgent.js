import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT } from './prompt.js';
import { dealerActionTool } from './tool.js';
import { askAgent } from './callAgent.js';
import { formatHand, describeTotal, handTotal } from '../hand.js';

// Re-exported so callers can import everything about the dealer agent from here.
export { MODEL, EFFORT, AgentError } from './callAgent.js';

// Builds the message sent to Claude: both hands with their totals, and the question.
function boardMessage({ dealerHand, playerHand }) {
  return [
    `Your hand (including your face-down card): ${formatHand(dealerHand)} (total ${describeTotal(dealerHand)})`,
    `Player's final hand: ${formatHand(playerHand)} (total ${describeTotal(playerHand)})`,
    'Hit or stand?',
  ].join('\n');
}

/**
 * Creates the dealer agent, which exposes one method: decide(board).
 * Pass your own `client` (e.g. a fake in tests); by default it reads ANTHROPIC_API_KEY from the environment.
 */
export function createDealerAgent({ client = new Anthropic() } = {}) {
  /**
   * Asks Claude whether the dealer should hit or stand on this board and checks the answer is
   * well formed. The decision itself is Claude's: it is not compared with any dealer rule.
   * @param {{dealerHand: {rank,suit}[], playerHand: {rank,suit}[]}} board
   * @returns {Promise<{action, explanation, dealerTotal}>}
   */
  async function decide(board) {
    const decision = await askAgent({
      client,
      system: SYSTEM_PROMPT,
      tool: dealerActionTool,
      message: boardMessage(board),
    });
    return { ...decision, dealerTotal: handTotal(board.dealerHand) };
  }

  return { decide };
}
