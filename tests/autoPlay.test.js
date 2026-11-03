import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../js/logic/game.js';
import { createAutoPlay, MAX_AUTO_ROUNDS } from '../js/logic/autoPlay.js';
import { handValue } from '../js/logic/hand.js';

const c = (rank, suit = '♠') => ({ rank, suit });

// A stand-in AI that plays "hit below 17, otherwise stand" and records every board it is shown.
function simpleAgent(handKey) {
  const calls = [];
  const getMove = async (board) => {
    calls.push(board);
    const total = handValue(board[handKey]).total;
    return total < 17
      ? { action: 'hit', explanation: `I have ${total}, I hit.` }
      : { action: 'stand', explanation: `I have ${total}, I stand.` };
  };
  return { getMove, calls };
}

const failingAgent = async () => {
  throw new Error('server down');
};

// A random (shuffled) manual-dealer game, like the real one.
const newGame = () => createGame(undefined, { manualDealer: true });

const count = (game, kind) => game.log.filter((entry) => entry.kind === kind).length;

test('runs the default number of rounds, each from the deal to the result', async () => {
  const game = newGame();
  const player = simpleAgent('playerHand');
  const dealer = simpleAgent('dealerHand');
  await createAutoPlay(game, { getPlayerMove: player.getMove, getDealerMove: dealer.getMove }).start();

  assert.equal(MAX_AUTO_ROUNDS, 5);
  assert.equal(game.round, MAX_AUTO_ROUNDS);
  assert.equal(count(game, 'deal'), MAX_AUTO_ROUNDS);
  assert.equal(count(game, 'result'), MAX_AUTO_ROUNDS);
  assert.equal(game.tally.win + game.tally.lose + game.tally.push, MAX_AUTO_ROUNDS);
  assert.equal(game.phase, 'done');
});

test('maxRounds sets the number of rounds', async () => {
  const game = newGame();
  const player = simpleAgent('playerHand');
  const dealer = simpleAgent('dealerHand');
  await createAutoPlay(game, { getPlayerMove: player.getMove, getDealerMove: dealer.getMove, maxRounds: 2 }).start();
  assert.equal(game.round, 2);
});

test('the flags show a session is running and are reset when it ends', async () => {
  const game = newGame();
  const seen = [];
  const player = simpleAgent('playerHand');
  const dealer = simpleAgent('dealerHand');
  await createAutoPlay(game, {
    getPlayerMove: player.getMove,
    getDealerMove: dealer.getMove,
    maxRounds: 1,
    onChange: () => seen.push([game.autoPlaying, game.aiPlayer]),
  }).start();

  assert.ok(seen.some(([running, ai]) => running && ai), 'running as the AI player during the session');
  assert.equal(game.autoPlaying, false);
  assert.equal(game.autoStopping, false);
  assert.equal(game.aiPlayer, true, 'the AI wording stays until a human starts a round');
});

test('stop() lets the current round finish and then ends the session', async () => {
  // A fixed deck with no Blackjack, so the AI player is always asked in round 1: 10+6 against 9+7.
  const game = createGame([c('10'), c('9'), c('6'), c('7'), c('2'), c('3'), c('4'), c('5')], { manualDealer: true });
  let auto;
  const dealer = simpleAgent('dealerHand');
  const player = simpleAgent('playerHand');
  let stopped = false;
  auto = createAutoPlay(game, {
    getPlayerMove: async (board) => {
      if (!stopped) {
        stopped = true;
        auto.stop(); // pressed during round 1
      }
      return player.getMove(board);
    },
    getDealerMove: dealer.getMove,
  });
  await auto.start();

  assert.equal(game.round, 1, 'only the round in progress was played');
  assert.equal(game.phase, 'done', 'it was finished, not abandoned halfway');
  assert.equal(game.result !== null, true);
  assert.equal(game.autoPlaying, false);
  assert.equal(game.autoStopping, false);
});

test('stop() between rounds prevents the next round', async () => {
  const game = newGame();
  let auto;
  const player = simpleAgent('playerHand');
  const dealer = simpleAgent('dealerHand');
  auto = createAutoPlay(game, {
    getPlayerMove: player.getMove,
    getDealerMove: dealer.getMove,
    roundPause: async () => auto.stop(),
  });
  await auto.start();
  assert.equal(game.round, 1);
});

test('stop() does nothing when no session is running', () => {
  const game = newGame();
  const auto = createAutoPlay(game, { getPlayerMove: failingAgent, getDealerMove: failingAgent });
  auto.stop();
  assert.equal(game.autoStopping, false);
});

test('start() is ignored while a round is in progress (a human is playing)', async () => {
  // A fixed deck with no Blackjack, so the round really is in progress: 10+6 against 9+7.
  const game = createGame([c('10'), c('9'), c('6'), c('7'), c('2'), c('3')], { manualDealer: true });
  game.startRound();
  assert.equal(game.phase, 'player');
  const logLength = game.log.length;
  const player = simpleAgent('playerHand');
  await createAutoPlay(game, { getPlayerMove: player.getMove, getDealerMove: failingAgent }).start();
  assert.equal(game.autoPlaying, false);
  assert.equal(game.aiPlayer, false);
  assert.equal(game.log.length, logLength);
  assert.equal(player.calls.length, 0);
});

test('start() is ignored while a session is already running', async () => {
  const game = newGame();
  const player = simpleAgent('playerHand');
  const dealer = simpleAgent('dealerHand');
  const auto = createAutoPlay(game, { getPlayerMove: player.getMove, getDealerMove: dealer.getMove, maxRounds: 2 });
  await Promise.all([auto.start(), auto.start()]);
  assert.equal(game.round, 2, 'one session of two rounds, not two sessions');
});

test('beforeRound is called once for every round', async () => {
  const game = newGame();
  let calls = 0;
  const player = simpleAgent('playerHand');
  const dealer = simpleAgent('dealerHand');
  await createAutoPlay(game, {
    getPlayerMove: player.getMove,
    getDealerMove: dealer.getMove,
    maxRounds: 3,
    beforeRound: () => calls++,
  }).start();
  assert.equal(calls, 3);
});

test('the round pause is awaited between rounds, not after the last one', async () => {
  const game = newGame();
  let pauses = 0;
  const player = simpleAgent('playerHand');
  const dealer = simpleAgent('dealerHand');
  await createAutoPlay(game, {
    getPlayerMove: player.getMove,
    getDealerMove: dealer.getMove,
    maxRounds: 3,
    roundPause: async () => {
      pauses++;
    },
  }).start();
  assert.equal(pauses, 2);
});

test('both agents failing: every round still completes using the fallback rules', async () => {
  const game = newGame();
  await createAutoPlay(game, { getPlayerMove: failingAgent, getDealerMove: failingAgent, maxRounds: 5 }).start();

  assert.equal(game.round, 5);
  assert.equal(count(game, 'result'), 5);
  const sources = game.log.filter((entry) => entry.kind === 'thought').map((entry) => entry.source);
  assert.ok(sources.length > 0);
  assert.ok(sources.every((source) => source === 'rule'), 'every decision is labelled as the fallback');
});

test('a Blackjack at the deal ends the round without asking either agent', async () => {
  const game = createGame([c('A'), c('9'), c('K'), c('8')], { manualDealer: true });
  const player = simpleAgent('playerHand');
  const dealer = simpleAgent('dealerHand');
  await createAutoPlay(game, { getPlayerMove: player.getMove, getDealerMove: dealer.getMove, maxRounds: 1 }).start();
  assert.equal(player.calls.length, 0);
  assert.equal(dealer.calls.length, 0);
  assert.equal(game.result.message, 'Blackjack! AI player wins!');
});

test('a player bust ends the round without asking the dealer', async () => {
  // Player 10+6 hits a K and busts.
  const game = createGame([c('10'), c('5'), c('6'), c('6'), c('K')], { manualDealer: true });
  const dealer = simpleAgent('dealerHand');
  await createAutoPlay(game, {
    getPlayerMove: async () => ({ action: 'hit', explanation: 'Risky hit.' }),
    getDealerMove: dealer.getMove,
    maxRounds: 1,
  }).start();
  assert.equal(game.result.reason, 'bust');
  assert.equal(dealer.calls.length, 0);
});

test('each agent sees only what it should: the player never sees the hole card, the dealer sees everything', async () => {
  const game = createGame([c('10', '♠'), c('9', '♥'), c('8', '♦'), c('K', '♣'), c('2')], { manualDealer: true });
  const player = simpleAgent('playerHand');
  const dealer = simpleAgent('dealerHand');
  await createAutoPlay(game, { getPlayerMove: player.getMove, getDealerMove: dealer.getMove, maxRounds: 1 }).start();

  for (const board of player.calls) {
    assert.deepEqual(Object.keys(board).sort(), ['dealerUpcard', 'playerHand']);
    assert.deepEqual(board.dealerUpcard, c('9', '♥'));
    assert.ok(!JSON.stringify(board).includes('"K"'), 'the dealer hole card K♣ is hidden from the player');
  }
  assert.ok(dealer.calls.length > 0);
  for (const board of dealer.calls) {
    assert.deepEqual(Object.keys(board).sort(), ['dealerHand', 'playerHand']);
    assert.ok(board.dealerHand.some((card) => card.rank === 'K'), 'the dealer knows its own hole card');
  }
});

test('the log tells the whole story with AI wording and labelled thoughts', async () => {
  // Player 10+8 = 18 stands. Dealer 10+6 = 16 hits a 3 and stands on 19.
  const game = createGame([c('10'), c('10', '♥'), c('8'), c('6', '♦'), c('3', '♣')], { manualDealer: true });
  const player = simpleAgent('playerHand');
  const dealer = simpleAgent('dealerHand');
  await createAutoPlay(game, { getPlayerMove: player.getMove, getDealerMove: dealer.getMove, maxRounds: 1 }).start();

  assert.deepEqual(
    game.log.map((entry) => `${entry.speaker}:${entry.kind}`),
    ['system:deal', 'you:thought', 'you:stand', 'dealer:reveal', 'dealer:thought', 'dealer:draw', 'dealer:thought', 'system:result']
  );
  assert.match(game.log[0].text, /AI player was dealt/);
  assert.match(game.log.at(-1).text, /Dealer wins, 19 to 18\./);
  assert.ok(game.log.filter((entry) => entry.kind === 'thought').every((entry) => entry.source === 'claude'));
});

test('after a session a human round uses the human wording again', async () => {
  const game = newGame();
  const player = simpleAgent('playerHand');
  const dealer = simpleAgent('dealerHand');
  await createAutoPlay(game, { getPlayerMove: player.getMove, getDealerMove: dealer.getMove, maxRounds: 1 }).start();

  game.aiPlayer = false; // what the Deal button does
  game.startRound();
  const deal = game.log.filter((entry) => entry.kind === 'deal').at(-1);
  assert.match(deal.text, /You were dealt/);
});
