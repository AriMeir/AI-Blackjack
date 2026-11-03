import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../js/logic/game.js';
import { playPlayerTurn, MAX_PLAYER_DECISIONS } from '../js/logic/playerTurn.js';
import { handValue } from '../js/logic/hand.js';
import { fetchPlayerMove } from '../js/api/playerClient.js';

const c = (rank, suit = '♠') => ({ rank, suit });
// Forced deck in deal order: player1, dealer1, player2, dealer2, then draws.
const forced = (p1, d1, p2, d2, ...draws) => [c(p1), c(d1), c(p2), c(d2), ...draws.map((r) => c(r))];

// A manual-dealer game with an AI player and the round already dealt.
function startGame(...cards) {
  const game = createGame(forced(...cards), { manualDealer: true });
  game.aiPlayer = true;
  return game.startRound();
}

// A stand-in AI player that answers from a fixed list of decisions, in order, and records its calls.
function scriptedAgent(...actions) {
  const calls = [];
  const getMove = async (board) => {
    calls.push(board);
    const action = actions[Math.min(calls.length - 1, actions.length - 1)];
    return { action, explanation: `Scripted ${action}.` };
  };
  return { getMove, calls };
}

const thoughts = (game) => game.log.filter((entry) => entry.kind === 'thought');

// --- AI decisions are respected ---

test('player turn: an AI decision to stand on 12 is respected', async () => {
  const g = startGame('10', '9', '2', '7', '5');
  const agent = scriptedAgent('stand');
  await playPlayerTurn(g, { getMove: agent.getMove });
  assert.equal(g.player.length, 2, 'no card was drawn');
  assert.equal(g.phase, 'dealer', 'the dealer is up next');
  assert.equal(agent.calls.length, 1);
  assert.equal(g.playerNote.source, 'claude');
});

test('player turn: hit, hit, stand draws two cards and asks three times', async () => {
  const g = startGame('10', '9', '2', '7', '2', '3');
  const agent = scriptedAgent('hit', 'hit', 'stand');
  await playPlayerTurn(g, { getMove: agent.getMove });
  assert.equal(g.player.length, 4);
  assert.equal(handValue(g.player).total, 17);
  assert.equal(agent.calls.length, 3);
  assert.equal(g.phase, 'dealer');
});

test('player turn: a strategically poor but valid hit on 19 is respected, even when it busts', async () => {
  const g = startGame('10', '9', '9', '7', 'K');
  const agent = scriptedAgent('hit');
  await playPlayerTurn(g, { getMove: agent.getMove });
  assert.equal(handValue(g.player).total, 29);
  assert.equal(g.phase, 'done');
  assert.equal(g.result.reason, 'bust');
  assert.equal(agent.calls.length, 1, 'not asked again after busting');
});

test('player turn: reaching 21 ends the turn without asking again', async () => {
  const g = startGame('5', '9', '6', '7', '10');
  const agent = scriptedAgent('hit', 'hit');
  await playPlayerTurn(g, { getMove: agent.getMove });
  assert.equal(handValue(g.player).total, 21);
  assert.equal(g.phase, 'dealer');
  assert.equal(agent.calls.length, 1);
});

test("player turn: the agent never receives the dealer's hidden card", async () => {
  const g = createGame([c('10'), c('9', '♥'), c('6'), c('K', '♦')], { manualDealer: true });
  g.aiPlayer = true;
  g.startRound();
  const agent = scriptedAgent('stand');
  await playPlayerTurn(g, { getMove: agent.getMove });

  const board = agent.calls[0];
  assert.deepEqual(Object.keys(board).sort(), ['dealerUpcard', 'playerHand']);
  assert.deepEqual(board.dealerUpcard, c('9', '♥'));
  assert.ok(!JSON.stringify(board).includes('"K"'), 'the hole card K♦ is not in the board');
});

// --- invalid answers, failures and fallback ---

test('player turn: falls back to the simple rule when the agent fails', async () => {
  const g = startGame('10', '9', '6', '7', '3');
  await playPlayerTurn(g, {
    getMove: async () => {
      throw new Error('server down');
    },
  });
  assert.equal(g.player.length, 3, 'hit on 16 by the rule');
  assert.equal(g.playerNote.source, 'rule');
  assert.match(g.playerNote.text, /AI player was unavailable/);
  assert.equal(g.phase, 'dealer', 'then stood on 19');
});

const invalidAnswers = {
  'unsupported action': { action: 'double', explanation: 'Double down.' },
  'wrong case': { action: 'HIT', explanation: 'Loud hit.' },
  'missing action': { explanation: 'No action.' },
  'empty explanation': { action: 'hit', explanation: '  ' },
  'missing explanation': { action: 'hit' },
  'null answer': null,
  'a string': 'hit',
};

for (const [name, answer] of Object.entries(invalidAnswers)) {
  test(`player turn: an invalid answer falls back to the simple rule: ${name}`, async () => {
    const g = startGame('10', '9', '8', '7'); // 18: the rule stands
    await playPlayerTurn(g, { getMove: async () => answer });
    assert.equal(g.playerNote.source, 'rule');
    assert.equal(g.player.length, 2);
    assert.equal(g.phase, 'dealer');
  });
}

test('player turn: a request timeout falls back to the simple rule', async (t) => {
  t.mock.method(globalThis, 'fetch', (url, { signal }) =>
    new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))
  );
  const g = startGame('10', '9', '6', '7', '3');
  await playPlayerTurn(g, { getMove: (board) => fetchPlayerMove(board, { timeoutMs: 20 }) });
  assert.equal(g.playerNote.source, 'rule');
  assert.equal(g.player.length, 3, 'hit on 16 by the rule');
});

test('player turn: a turn can mix AI and fallback decisions', async () => {
  // 10+2: the AI hits a 3 (15), then fails, so the rule hits a 2 (17) and stands.
  const g = startGame('10', '9', '2', '7', '3', '2');
  let call = 0;
  await playPlayerTurn(g, {
    getMove: async () => {
      if (++call === 1) return { action: 'hit', explanation: 'I need more.' };
      throw new Error('lost connection');
    },
  });
  assert.deepEqual(thoughts(g).map((entry) => entry.source), ['claude', 'rule', 'rule']);
  assert.equal(handValue(g.player).total, 17);
});

// --- round state and limits ---

test('no agent call when a Blackjack ended the round at the deal', async () => {
  const g = startGame('A', '9', 'K', '8');
  assert.equal(g.phase, 'done');
  const agent = scriptedAgent('hit');
  await playPlayerTurn(g, { getMove: agent.getMove });
  assert.equal(agent.calls.length, 0);
});

test('no agent call when the round is not started yet, or already in the dealer turn', async () => {
  const idle = createGame(forced('10', '9', '8', '7'), { manualDealer: true });
  const agent = scriptedAgent('hit');
  await playPlayerTurn(idle, { getMove: agent.getMove });
  assert.equal(idle.phase, 'idle');

  const dealerTurn = startGame('10', '9', '8', '7');
  dealerTurn.stand();
  await playPlayerTurn(dealerTurn, { getMove: agent.getMove });
  assert.equal(agent.calls.length, 0);
});

test('player turn: the decision limit stops an agent that never stops hitting', async () => {
  // Zero-value cards keep the player at 10, so only the decision limit can end this turn.
  const zeros = Array(MAX_PLAYER_DECISIONS + 10).fill('0');
  const g = startGame('5', '9', '5', '7', ...zeros);
  const agent = scriptedAgent('hit');
  await playPlayerTurn(g, { getMove: agent.getMove });
  assert.equal(agent.calls.length, MAX_PLAYER_DECISIONS);
  assert.equal(g.phase, 'dealer', 'the player is made to stand');
});

test('player turn: if the engine refuses a hit (no cards left), the player stands', async () => {
  const g = startGame('10', '9', '6', '7'); // empty deck after the deal
  const agent = scriptedAgent('hit');
  await playPlayerTurn(g, { getMove: agent.getMove });
  assert.equal(agent.calls.length, 1);
  assert.equal(g.player.length, 2);
  assert.equal(g.phase, 'dealer');
});

// --- the log and the screen hooks ---

test('player turn: every decision is logged as the AI player, with its source and action', async () => {
  const g = startGame('10', '9', '2', '7', '3');
  await playPlayerTurn(g, { getMove: scriptedAgent('hit', 'stand').getMove });
  assert.deepEqual(
    thoughts(g).map((entry) => [entry.speaker, entry.source, entry.action, entry.text]),
    [
      ['you', 'claude', 'hit', 'Scripted hit.'],
      ['you', 'claude', 'stand', 'Scripted stand.'],
    ]
  );
});

test('player turn: the log uses AI player wording', async () => {
  const g = startGame('10', '9', '2', '7', '3');
  await playPlayerTurn(g, { getMove: scriptedAgent('hit', 'stand').getMove });
  const texts = g.log.map((entry) => entry.text);
  assert.match(texts[0], /Round 1\. AI player was dealt 10♠ 2♠ \(12\)/);
  assert.ok(texts.some((text) => text.startsWith('AI player hits and draws 3♠')));
  assert.ok(texts.some((text) => text === 'AI player stands on 15.'));
  assert.ok(!texts.some((text) => /\bYou\b/.test(text)), 'no human wording');
});

test('results say AI player when the AI player is playing', () => {
  const win = createGame(forced('A', '9', 'K', '8'), { manualDealer: true });
  win.aiPlayer = true;
  win.startRound();
  assert.equal(win.result.message, 'Blackjack! AI player wins!');

  const bust = startGame('10', '9', '6', '7', 'K');
  bust.hit();
  assert.equal(bust.result.message, 'AI player busts with 26. Dealer wins.');
});

test('results still say You for the human player', () => {
  const g = createGame(forced('10', '9', '6', '7', 'K'), { manualDealer: true }).startRound();
  g.hit();
  assert.equal(g.result.message, 'You bust with 26. Dealer wins.');
});

test('player turn: onChange shows the thinking state and the pause is awaited between steps', async () => {
  const g = startGame('10', '9', '2', '7', '3');
  const states = [];
  let pauses = 0;
  await playPlayerTurn(g, {
    getMove: scriptedAgent('hit', 'stand').getMove,
    onChange: () => states.push(g.playerThinking),
    pause: async () => {
      pauses++;
    },
  });
  assert.ok(states.includes(true), 'was thinking at some point');
  assert.equal(g.playerThinking, false);
  assert.equal(pauses, 2, 'before and after the one hit');
});

// --- the player client ---

test('fetchPlayerMove posts only the player hand and the dealer upcard', async (t) => {
  const decision = { action: 'hit', explanation: 'x', playerTotal: 16 };
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(decision)));
  const playerHand = [c('10'), c('6')];
  const dealerUpcard = c('9', '♦');

  const result = await fetchPlayerMove({ playerHand, dealerUpcard, dealerHand: [c('9'), c('K')] });

  assert.deepEqual(result, decision);
  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, '/api/player-move');
  assert.equal(options.method, 'POST');
  assert.deepEqual(JSON.parse(options.body), { playerHand, dealerUpcard }, 'a dealer hand is never sent');
});

test('fetchPlayerMove rejects on an error status', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 502 }));
  await assert.rejects(fetchPlayerMove({ playerHand: [], dealerUpcard: c('9') }), /502/);
});
