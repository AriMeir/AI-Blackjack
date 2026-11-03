import { handValue } from './hand.js';

export const MAX_PLAYER_DECISIONS = 15; // safety cap so a turn can never loop forever

const ACTIONS = ['hit', 'stand'];
const FALLBACK_STANDS_ON = 17;

// A simple rule (hit below 17), used only as a fallback when the AI player can't decide.
function fallbackMove(hand) {
  const { total, soft } = handValue(hand);
  const text = soft ? `soft ${total}` : String(total);
  const action = total < FALLBACK_STANDS_ON ? 'hit' : 'stand';
  const rule = action === 'hit' ? `it has ${text} and must hit below ${FALLBACK_STANDS_ON}` : `it has ${text} and stands`;
  return {
    action,
    explanation: `The AI player was unavailable, so a simple rule applied: ${rule}.`,
    source: 'rule',
  };
}

// An agent answer is usable if it is well formed. Whether it is a good move is the agent's business.
function isValidAnswer(answer) {
  return (
    answer !== null &&
    typeof answer === 'object' &&
    ACTIONS.includes(answer.action) &&
    typeof answer.explanation === 'string' &&
    answer.explanation.trim() !== ''
  );
}

// Asks the AI player (via getMove) for a decision. If it fails or answers badly, the fallback rule decides.
// The board holds the player's hand and ONLY the dealer's face-up card: the hole card is never shared.
async function decideMove(game, getMove) {
  try {
    const answer = await getMove({ playerHand: game.player, dealerUpcard: game.dealer[0] });
    if (isValidAnswer(answer)) {
      return { action: answer.action, explanation: answer.explanation.trim(), source: 'claude' };
    }
  } catch {
    // network error, timeout, server error...: use the fallback below
  }
  return fallbackMove(game.player);
}

/**
 * Plays the AI player's turn, one decision at a time: ask for a move, show its explanation, draw if
 * it says hit, repeat until it stands, busts, reaches 21 or hits the decision cap. The agent only
 * suggests; the engine (game.hit / game.stand) does the drawing and enforces the rules.
 *
 * Does nothing if it is not the player's turn (e.g. a Blackjack already ended the round), so no request is made.
 *
 * @param game      the game, in phase 'player'
 * @param getMove   async ({playerHand, dealerUpcard}) => { action, explanation }; may reject
 * @param onChange  called whenever the game changed and the screen should redraw
 * @param pause     async function awaited between steps, for pacing the animation
 */
export async function playPlayerTurn(game, { getMove, onChange = () => {}, pause = async () => {} }) {
  if (game.phase !== 'player') return game;

  for (let i = 0; i < MAX_PLAYER_DECISIONS && game.phase === 'player'; i++) {
    game.playerThinking = true;
    game.playerNote = null;
    onChange();

    const move = await decideMove(game, getMove);

    game.playerThinking = false;
    game.playerNote = { text: move.explanation, source: move.source };
    game.addLog('you', 'thought', move.explanation, { source: move.source, action: move.action });
    onChange();
    if (move.action !== 'hit') break;

    await pause();
    const cardsBefore = game.player.length;
    game.hit();
    onChange();
    if (game.player.length === cardsBefore) break; // the engine refused the hit (e.g. no cards left)
    await pause();
  }

  // Still the player's turn means it stood, or the decision cap / the engine stopped the player: stand.
  if (game.phase === 'player') {
    game.stand();
    onChange();
  }
  return game;
}
