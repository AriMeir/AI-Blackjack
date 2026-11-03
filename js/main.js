import { createGame } from './logic/game.js';
import { playDealerTurn } from './logic/dealerTurn.js';
import { createAutoPlay } from './logic/autoPlay.js';
import { fetchDealerMove } from './api/dealerClient.js';
import { fetchPlayerMove } from './api/playerClient.js';
import { createView } from './ui/view.js';
import { createLogView } from './ui/logView.js';

const MOVE_PAUSE_MS = 700; // between steps of a turn, so you can follow what is happening
const ROUND_PAUSE_MS = 2500; // between rounds in AI vs AI
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

// After a human action: redraw, and if the dealer's turn has begun, play it.
async function afterPlayerAction() {
  render();
  if (game.phase !== 'dealer') return;
  await playDealerTurn(game, {
    getMove: fetchDealerMove,
    onChange: render,
    pause: () => sleep(MOVE_PAUSE_MS),
  });
}

// AI vs AI: an AI player and the AI dealer play a few rounds against each other.
const autoPlay = createAutoPlay(game, {
  getPlayerMove: fetchPlayerMove,
  getDealerMove: fetchDealerMove,
  onChange: render,
  pause: () => sleep(MOVE_PAUSE_MS),
  roundPause: () => sleep(ROUND_PAUSE_MS),
  beforeRound: () => view.resetAnimations(),
});

view.buttons.deal.addEventListener('click', () => {
  game.aiPlayer = false; // a round you start yourself is played by you
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
view.buttons.auto.addEventListener('click', () => {
  if (game.autoPlaying) autoPlay.stop();
  else autoPlay.start();
});

render();
