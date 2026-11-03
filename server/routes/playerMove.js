import { Router } from 'express';
import { BLACKJACK } from '../config.js';
import { handTotal } from '../hand.js';
import { handProblem, isCard, sendError, respondWithDecision } from './common.js';

// Checks the request body. Returns an error message, or null if the board is valid.
// The board holds the player's hand and ONLY the dealer's face-up card: the dealer's hidden
// card must never reach the player agent, so a body that includes a dealer hand is refused.
export function playerBoardProblem(body) {
  if (body === null || typeof body !== 'object') return 'Request body must be a JSON object.';
  if ('dealerHand' in body) return "Send only dealerUpcard: the dealer's face-down card must not be shared with the player.";
  const problem = handProblem('playerHand', body.playerHand);
  if (problem) return problem;
  if (!isCard(body.dealerUpcard)) return 'dealerUpcard must be a single card with a valid rank and suit.';
  // The game engine ends these rounds itself and never asks, but the server defends against it anyway.
  if (handTotal(body.playerHand) > BLACKJACK) return 'The player has already busted; the round is over.';
  return null;
}

/**
 * POST /player-move: receives the player's hand and the dealer's face-up card, asks the player agent,
 * returns its decision. `getAgent` is called on each request, like in the dealer route.
 */
export function createPlayerMoveRouter(getAgent) {
  const router = Router();

  router.post('/player-move', async (req, res) => {
    const problem = playerBoardProblem(req.body);
    if (problem) return sendError(res, 400, 'invalid_board', problem);

    const { playerHand, dealerUpcard } = req.body;
    return respondWithDecision(res, 'player-move', () => getAgent().decide({ playerHand, dealerUpcard }));
  });

  return router;
}
