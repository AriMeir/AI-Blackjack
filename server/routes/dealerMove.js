import { Router } from 'express';
import { BLACKJACK } from '../config.js';
import { handTotal } from '../hand.js';
import { handProblem, sendError, respondWithDecision } from './common.js';

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
    return respondWithDecision(res, 'dealer-move', () => getAgent().decide({ dealerHand, playerHand }));
  });

  return router;
}
