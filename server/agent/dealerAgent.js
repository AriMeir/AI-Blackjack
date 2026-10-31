import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT } from './prompt.js';
import { dealerActionTool, ACTIONS } from './tool.js';
import { handValue } from '../hand.js';

export const MODEL = 'claude-haiku-5-5';
export const EFFORT = 'medium'; // choosing a strategy takes more thought than following a fixed rule
const MAX_TOKENS = 16000;
const TIMEOUT_MS = 20_000;

/** Failure of the dealer agent. `code` tells the caller what kind, `status` is the upstream HTTP status if any. */
export class DealerAgentError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'DealerAgentError';
    this.code = code; // timeout | api_error | refusal | truncated | no_tool_call | invalid_output
    this.status = status;
  }
}

// Turns a list of cards into readable text, e.g. "10♠, 6♥".
const formatHand = (hand) => hand.map((c) => `${c.rank}${c.suit}`).join(', ');

// Describes a hand's total, e.g. "16" or "soft 17". The server counts it so the model doesn't have to.
function describeTotal(hand) {
  const { total, soft } = handValue(hand);
  return soft ? `soft ${total}` : String(total);
}

// Builds the message sent to Claude: both hands with their totals, and the question.
function boardMessage({ dealerHand, playerHand }) {
  return [
    `Your hand (including your face-down card): ${formatHand(dealerHand)} (total ${describeTotal(dealerHand)})`,
    `Player's final hand: ${formatHand(playerHand)} (total ${describeTotal(playerHand)})`,
    'Hit or stand?',
  ].join('\n');
}

// Converts an error from the Anthropic SDK into a DealerAgentError (timeout or api_error).
// Any other kind of error is returned unchanged.
function toAgentError(error) {
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new DealerAgentError('timeout', 'The request to Claude timed out.');
  }
  if (error instanceof Anthropic.APIError) {
    return new DealerAgentError('api_error', `Claude API error: ${error.message}`, error.status);
  }
  return error;
}

// Pulls the dealer_action call out of Claude's response and checks it is usable.
// Returns { action, explanation }, or throws a DealerAgentError if the reply is a refusal,
// truncated, has no tool call, or has an invalid action or empty explanation.
function readDecision(response) {
  if (response.stop_reason === 'refusal') {
    throw new DealerAgentError('refusal', 'Claude declined to answer.');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new DealerAgentError('truncated', 'Claude ran out of tokens before answering.');
  }
  const call = response.content.find(
    (block) => block.type === 'tool_use' && block.name === dealerActionTool.name
  );
  if (!call) {
    throw new DealerAgentError('no_tool_call', 'Claude did not call dealer_action.');
  }
  const { action, explanation } = call.input ?? {};
  if (!ACTIONS.includes(action)) {
    throw new DealerAgentError('invalid_output', `Invalid action: ${JSON.stringify(action)}.`);
  }
  if (typeof explanation !== 'string' || explanation.trim() === '') {
    throw new DealerAgentError('invalid_output', 'Missing explanation.');
  }
  return { action, explanation: explanation.trim() };
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
    let response;
    try {
      response = await client.messages.create(
        {
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: SYSTEM_PROMPT,
          tools: [dealerActionTool],
          output_config: { effort: EFFORT },
          messages: [{ role: 'user', content: boardMessage(board) }],
        },
        { timeout: TIMEOUT_MS }
      );
    } catch (error) {
      throw toAgentError(error);
    }

    const decision = readDecision(response);
    return { ...decision, dealerTotal: handValue(board.dealerHand).total };
  }

  return { decide };
}
