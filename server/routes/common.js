import { RANKS, SUITS, MAX_HAND_SIZE } from '../config.js';
import { AgentError } from '../agent/callAgent.js';

// What the two move routes (dealer and player) have in common.

// How each kind of agent failure is reported to the browser.
const STATUS_BY_AGENT_ERROR = {
  timeout: 504,
  api_error: 502,
  refusal: 502,
  truncated: 502,
  no_tool_call: 502,
  invalid_output: 502,
};

export const isCard = (card) =>
  card !== null && typeof card === 'object' && !Array.isArray(card) && RANKS.includes(card.rank) && SUITS.includes(card.suit);

// Returns an error message if `hand` is not a usable list of 2+ valid cards, otherwise null.
export function handProblem(name, hand) {
  if (!Array.isArray(hand)) return `${name} must be an array of cards.`;
  if (hand.length < 2) return `${name} must have at least 2 cards.`;
  if (hand.length > MAX_HAND_SIZE) return `${name} has too many cards.`;
  if (!hand.every(isCard)) return `${name} contains an invalid card (each needs a valid rank and suit).`;
  return null;
}

export const sendError = (res, status, code, message) => res.status(status).json({ error: { code, message } });

// Runs the agent for a route and sends the decision, or the right error status if the agent fails.
export async function respondWithDecision(res, label, makeDecision) {
  try {
    return res.json(await makeDecision());
  } catch (error) {
    if (error instanceof AgentError) {
      console.error(`${label} failed (${error.code}): ${error.message}`);
      return sendError(res, STATUS_BY_AGENT_ERROR[error.code] ?? 502, error.code, error.message);
    }
    console.error(`${label} unexpected error:`, error);
    return sendError(res, 500, 'server_error', 'Unexpected server error.');
  }
}
