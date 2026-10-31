import { Router } from 'express';
import { RANKS, SUITS, MAX_HAND_SIZE, BLACKJACK } from '../config.js';
import { handTotal } from '../hand.js';
import { DealerAgentError } from '../agent/dealerAgent.js';

// How each kind of agent failure is reported to the browser.
const STATUS_BY_AGENT_ERROR = {
  timeout: 504,
  api_error: 502,
  refusal: 502,
  truncated: 502,
  no_tool_call: 502,
  invalid_output: 502,
};

const isCard = (card) =>
  card !== null && typeof card === 'object' && RANKS.includes(card.rank) && SUITS.includes(card.suit);

// Returns an error message if `hand` is not a usable list of 2+ valid cards, otherwise null.
function handProblem(name, hand) {
  if (!Array.isArray(hand)) return `${name} must be an array of cards.`;
  if (hand.length < 2) return `${name} must have at least 2 cards.`;
  if (hand.length > MAX_HAND_SIZE) return `${name} has too many cards.`;
  if (!hand.every(isCard)) return `${name} contains an invalid card (each needs a valid rank and suit).`;
  return null;
}

// Checks the request body. Returns an error message, or null if the board is valid.
export function boardProblem(body) {
  if (body === null || typeof body !== 'object') return 'Request body must be a JSON object.';
  const problem = handProblem('dealerHand', body.dealerHand) ?? handProblem('playerHand', body.playerHand);
  if (problem) return problem;
  // The game engine ends these rounds itself and never asks, but the server defends against it anyway.
  if (handTotal(body.playerHand) > BLACKJACK) return 'The player has already busted; the round is over.';
  if (handTotal(body.dealerHand) > BLACKJACK) return 'The dealer has already busted; there is no decision to make.';
  return null;
}

const sendError = (res, status, code, message) => res.status(status).json({ error: { code, message } });

/**
 * POST /dealer-move: receives the board, asks the dealer agent, returns its decision.
 * `getAgent` is called on each request, so the agent (and API key) is only needed once a move is requested.
 */
export function createDealerMoveRouter(getAgent) {
  const router = Router();

  router.post('/dealer-move', async (req, res) => {
    const problem = boardProblem(req.body);
    if (problem) return sendError(res, 400, 'invalid_board', problem);

    const { dealerHand, playerHand } = req.body;
    try {
      const decision = await getAgent().decide({ dealerHand, playerHand });
      return res.json(decision);
    } catch (error) {
      if (error instanceof DealerAgentError) {
        console.error(`dealer-move failed (${error.code}): ${error.message}`);
        return sendError(res, STATUS_BY_AGENT_ERROR[error.code] ?? 502, error.code, error.message);
      }
      console.error('dealer-move unexpected error:', error);
      return sendError(res, 500, 'server_error', 'Unexpected server error.');
    }
  });

  return router;
}
