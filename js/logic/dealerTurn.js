import { BLACKJACK } from '../config.js';
import { handValue, dealerShouldHit } from './hand.js';

export const MAX_DEALER_DECISIONS = 15; // safety cap so a turn can never loop forever

const ACTIONS = ['hit', 'stand'];

// The standard dealer rule (hit below 17), used only as a fallback when the AI agent can't decide.
function fallbackMove(hand) {
  const { total, soft } = handValue(hand);
  const text = soft ? `soft ${total}` : String(total);
  const action = dealerShouldHit(hand) ? 'hit' : 'stand';
  const rule = action === 'hit' ? `the dealer has ${text} and must hit` : `the dealer has ${text} and stands`;
  return {
    action,
    explanation: `The AI dealer was unavailable, so the standard dealer rule applied: ${rule}.`,
    source: 'rule',
  };
}

// An agent answer is usable if it is well formed. Whether it is a *good* move is the agent's business:
// a stand on 16 or a hit on 18 is respected.
function isValidAnswer(answer) {
  return (
    answer !== null &&
    typeof answer === 'object' &&
    ACTIONS.includes(answer.action) &&
    typeof answer.explanation === 'string' &&
    answer.explanation.trim() !== ''
  );
}

// Asks the AI agent (via getMove) for a decision. If it fails or answers badly, the fallback rule decides.
async function decideMove(game, getMove) {
  try {
    const answer = await getMove({ dealerHand: game.dealer, playerHand: game.player });
    if (isValidAnswer(answer)) {
      return { action: answer.action, explanation: answer.explanation.trim(), source: 'claude' };
    }
  } catch {
    // network error, timeout, server error...: use the fallback below
  }
  return fallbackMove(game.dealer);
}

/**
 * Plays the dealer's turn for a game created with `manualDealer: true`, one decision at a time:
 * ask for a move, show its explanation, draw if it says hit, repeat until stand, bust or the
 * decision cap, then settle. The agent only suggests; the engine (game.dealerHit) does the drawing.
 *
 * Does nothing if the round is already over (e.g. the player busted), so no request is made.
 *
 * @param game      the game, in phase 'player' or 'dealer'
 * @param getMove   async ({dealerHand, playerHand}) => { action, explanation }; may reject
 * @param onChange  called whenever the game changed and the screen should redraw
 * @param pause     async function awaited between steps, for pacing the animation
 */
export async function playDealerTurn(game, { getMove, onChange = () => {}, pause = async () => {} }) {
  if (game.phase !== 'player' && game.phase !== 'dealer') return game;

  game.startDealerTurn();
  onChange();

  for (let i = 0; i < MAX_DEALER_DECISIONS; i++) {
    if (handValue(game.dealer).total > BLACKJACK) break; // busted: nothing left to decide

    game.dealerThinking = true;
    game.dealerNote = null;
    onChange();

    const move = await decideMove(game, getMove);

    game.dealerThinking = false;
    game.dealerNote = { text: move.explanation, source: move.source };
    onChange();
    if (move.action !== 'hit') break;

    await pause();
    const cardsBefore = game.dealer.length;
    game.dealerHit();
    onChange();
    if (game.dealer.length === cardsBefore) break; // the engine refused the hit (e.g. no cards left)
    await pause();
  }

  game.settle();
  onChange();
  return game;
}
