import { createGame } from './logic/game.js';
import { playDealerTurn } from './logic/dealerTurn.js';
import { fetchDealerMove } from './api/dealerClient.js';
import { createView } from './ui/view.js';
import { createLogView } from './ui/logView.js';

const DEALER_PAUSE_MS = 700;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// manualDealer: stand() hands the dealer's turn to playDealerTurn, which asks the server for each move.
const game = createGame(undefined, { manualDealer: true });
const view = createView(game);
const logView = createLogView(game);

// Redraws everything that depends on the game state: the table and the log.
function render() {
  view.render();
  logView.render();
}

// After a player action: redraw, and if the dealer's turn has begun, play it.
async function afterPlayerAction() {
  render();
  if (game.phase !== 'dealer') return;
  await playDealerTurn(game, {
    getMove: fetchDealerMove,
    onChange: render,
    pause: () => sleep(DEALER_PAUSE_MS),
  });
}

view.buttons.deal.addEventListener('click', () => {
  view.resetAnimations();
  game.startRound();
  render();
});
view.buttons.hit.addEventListener('click', () => {
  game.hit();
  afterPlayerAction();
});
view.buttons.stand.addEventListener('click', () => {
  game.stand();
  afterPlayerAction();
});

render();
