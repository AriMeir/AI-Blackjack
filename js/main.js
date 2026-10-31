import { createGame } from './logic/game.js';
import { playDealerTurn } from './logic/dealerTurn.js';
import { fetchDealerMove } from './api/dealerClient.js';
import { createView } from './ui/view.js';

const DEALER_PAUSE_MS = 700;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// manualDealer: stand() hands the dealer's turn to playDealerTurn, which asks the server for each move.
const game = createGame(undefined, { manualDealer: true });
const view = createView(game);

// After a player action: redraw, and if the dealer's turn has begun, play it.
async function afterPlayerAction() {
  view.render();
  if (game.phase !== 'dealer') return;
  await playDealerTurn(game, {
    getMove: fetchDealerMove,
    onChange: view.render,
    pause: () => sleep(DEALER_PAUSE_MS),
  });
}

view.buttons.deal.addEventListener('click', () => {
  view.resetAnimations();
  game.startRound();
  view.render();
});
view.buttons.hit.addEventListener('click', () => {
  game.hit();
  afterPlayerAction();
});
view.buttons.stand.addEventListener('click', () => {
  game.stand();
  afterPlayerAction();
});

view.render();
