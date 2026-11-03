import { playPlayerTurn } from './playerTurn.js';
import { playDealerTurn } from './dealerTurn.js';

export const MAX_AUTO_ROUNDS = 5; // rounds per click, so AI vs AI can't spend credit forever

/**
 * AI vs AI: plays rounds in a row with an AI player and the AI dealer.
 * Each round is: deal, the AI player's turn, the AI dealer's turn (each one skipped by the
 * turn functions if the round is already over, e.g. after a Blackjack or a bust).
 *
 * Stopping is graceful: stop() lets the current round finish and then ends the session, so the
 * game is never left half-way through a round with nobody driving it.
 *
 * @param getPlayerMove  async ({playerHand, dealerUpcard}) => { action, explanation }
 * @param getDealerMove  async ({dealerHand, playerHand}) => { action, explanation }
 * @param onChange       called whenever the game changed and the screen should redraw
 * @param pause          async, awaited between steps within a round
 * @param roundPause     async, awaited between rounds
 * @param beforeRound    called just before each new round is dealt
 */
export function createAutoPlay(
  game,
  { getPlayerMove, getDealerMove, onChange = () => {}, pause = async () => {}, roundPause = async () => {}, beforeRound = () => {}, maxRounds = MAX_AUTO_ROUNDS }
) {
  async function start() {
    if (game.autoPlaying) return;
    if (game.phase === 'player' || game.phase === 'dealer') return; // a round is in progress

    game.autoPlaying = true;
    game.autoStopping = false;
    game.aiPlayer = true;
    onChange();
    try {
      for (let round = 1; round <= maxRounds; round++) {
        beforeRound();
        game.startRound();
        onChange();
        await playPlayerTurn(game, { getMove: getPlayerMove, onChange, pause });
        await playDealerTurn(game, { getMove: getDealerMove, onChange, pause });

        if (game.autoStopping || round === maxRounds) break;
        await roundPause();
        if (game.autoStopping) break;
      }
    } finally {
      game.autoPlaying = false;
      game.autoStopping = false;
      onChange();
    }
  }

  // Asks the session to end after the current round.
  function stop() {
    if (!game.autoPlaying) return;
    game.autoStopping = true;
    onChange();
  }

  return { start, stop };
}
