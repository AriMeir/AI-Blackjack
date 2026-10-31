import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../js/logic/game.js';
import { playDealerTurn, MAX_DEALER_DECISIONS } from '../js/logic/dealerTurn.js';
import { handValue } from '../js/logic/hand.js';
import { fetchDealerMove } from '../js/api/dealerClient.js';

const c = (rank, suit = '♠') => ({ rank, suit });
// Forced deck in deal order: player1, dealer1, player2, dealer2, then draws.
const forced = (p1, d1, p2, d2, ...draws) => [c(p1), c(d1), c(p2), c(d2), ...draws.map((r) => c(r))];

// A manual-dealer game with the round already dealt.
const startGame = (...cards) => createGame(forced(...cards), { manualDealer: true }).startRound();

// A stand-in AI agent that plays the traditional way (hit below 17, otherwise stand) and records its calls.
function goodAgent() {
  const calls = [];
  const getMove = async (board) => {
    calls.push(board);
    const total = handValue(board.dealerHand).total;
    return total < 17
      ? { action: 'hit', explanation: `I have ${total}, I hit.` }
      : { action: 'stand', explanation: `I have ${total}, I stand.` };
  };
  return { getMove, calls };
}

// A stand-in AI agent that answers from a fixed list of decisions, in order, and records its calls.
function scriptedAgent(...actions) {
  const calls = [];
  const getMove = async (board) => {
    calls.push(board);
    const action = actions[Math.min(calls.length - 1, actions.length - 1)];
    return { action, explanation: `Scripted ${action}.` };
  };
  return { getMove, calls };
}

// --- manual dealer mode in the game engine ---

test('manualDealer: stand() reveals the hole card but does not play the dealer', () => {
  const g = startGame('10', '10', '8', '6', '2');
  g.stand();
  assert.equal(g.phase, 'dealer');
  assert.ok(g.revealed);
  assert.equal(g.dealer.length, 2);
  assert.equal(g.result, null);
});

test('manualDealer: the player cannot act during the dealer turn', () => {
  const g = startGame('10', '10', '8', '6', '2');
  g.stand();
  g.hit();
  g.stand();
  assert.equal(g.player.length, 2);
  assert.equal(g.phase, 'dealer');
});

test('manualDealer: a player hit to 21 starts the dealer turn', () => {
  const g = startGame('5', '10', '6', '6', '10');
  g.hit();
  assert.equal(handValue(g.player).total, 21);
  assert.equal(g.phase, 'dealer');
});

test('dealerHit draws one card only during the dealer turn', () => {
  const g = startGame('10', '10', '8', '6', '2', '3');
  g.dealerHit();
  assert.equal(g.dealer.length, 2, 'ignored during the player turn');
  g.stand();
  g.dealerHit();
  assert.equal(g.dealer.length, 3);
});

test('dealerHit is ignored once the dealer has busted', () => {
  const g = startGame('10', '10', '8', '6', 'K', '2');
  g.stand();
  g.dealerHit(); // 10 + 6 + K = 26
  assert.equal(handValue(g.dealer).total, 26);
  g.dealerHit();
  assert.equal(g.dealer.length, 3);
});

test('dealerHit is ignored when the deck is empty', () => {
  const g = startGame('10', '10', '8', '6');
  g.stand();
  g.dealerHit();
  assert.equal(g.dealer.length, 2);
  assert.ok(g.dealer.every(Boolean), 'no undefined card was dealt');
});

test('settle records the result and ignores calls outside the dealer turn', () => {
  const g = startGame('10', '10', '8', '8');
  g.settle();
  assert.equal(g.phase, 'player');
  g.stand();
  g.settle();
  assert.equal(g.phase, 'done');
  assert.equal(g.result.outcome, 'push');
  assert.deepEqual(g.tally, { win: 0, lose: 0, push: 1 });
});

test('the default game still plays the whole dealer turn in stand()', () => {
  const g = createGame(forced('10', '10', '8', '6', '3')).startRound();
  g.stand();
  assert.equal(g.phase, 'done');
  assert.equal(g.dealer.length, 3);
  assert.equal(g.result.outcome, 'lose');
});

// --- playDealerTurn: AI decisions are respected ---

test('dealer turn: asks the agent for each decision and shows its explanation', async () => {
  // Player 18; dealer 10+6 hits a 2 to reach 18, then stands: push.
  const g = startGame('10', '10', '8', '6', '2');
  g.stand();
  const agent = goodAgent();
  await playDealerTurn(g, { getMove: agent.getMove });

  assert.equal(agent.calls.length, 2, 'one call before the hit, one before standing');
  assert.equal(g.dealer.length, 3);
  assert.equal(g.phase, 'done');
  assert.equal(g.result.outcome, 'push');
  assert.deepEqual(g.dealerNote, { text: 'I have 18, I stand.', source: 'claude' });
  assert.equal(g.dealerThinking, false);
});

test('dealer turn: also starts the turn itself if the player just stood', async () => {
  const g = startGame('10', '10', '8', '8');
  await playDealerTurn(g, { getMove: goodAgent().getMove });
  assert.equal(g.phase, 'done');
});

test('dealer turn: the agent receives the full board, including the hole card', async () => {
  const g = startGame('10', '10', '8', '7');
  const agent = goodAgent();
  await playDealerTurn(g, { getMove: agent.getMove });
  assert.deepEqual(agent.calls[0].dealerHand, [c('10'), c('7')]);
  assert.deepEqual(agent.calls[0].playerHand, [c('10'), c('8')]);
});

test('dealer turn: an AI decision to stand on 16 is respected', async () => {
  const g = startGame('10', '10', '8', '6', '3');
  const agent = scriptedAgent('stand');
  await playDealerTurn(g, { getMove: agent.getMove });
  assert.equal(g.dealer.length, 2, 'no card was drawn');
  assert.equal(g.dealerNote.source, 'claude');
  assert.equal(g.result.outcome, 'win', 'the player wins: 18 beats the dealer 16');
});

test('dealer turn: an AI decision to hit on a hard 17 is respected', async () => {
  // Player 18; the dealer's 17 would win, but the agent hits anyway and reaches 20 with a 3.
  const g = startGame('10', '10', '8', '7', '3');
  const agent = scriptedAgent('hit', 'stand');
  await playDealerTurn(g, { getMove: agent.getMove });
  assert.equal(g.dealer.length, 3);
  assert.equal(handValue(g.dealer).total, 20);
  assert.equal(g.result.outcome, 'lose', 'the player lost, 20 to 18');
  assert.equal(g.dealerNote.source, 'claude');
});

test('dealer turn: an AI decision to hit on a soft 17 is respected', async () => {
  const g = startGame('10', 'A', '8', '6', '5');
  const agent = scriptedAgent('hit', 'stand');
  await playDealerTurn(g, { getMove: agent.getMove });
  assert.equal(g.dealer.length, 3, 'A+6 hit a 5');
  assert.equal(handValue(g.dealer).total, 12);
  assert.equal(g.dealerNote.source, 'claude');
});

test('dealer turn: a strategically poor but valid decision is respected', async () => {
  // Dealer 10+8 = 18 already beats the player's 15. Hitting is a bad idea, but it is a legal move.
  const g = startGame('10', '10', '5', '8', 'K');
  const agent = scriptedAgent('hit');
  await playDealerTurn(g, { getMove: agent.getMove });
  assert.equal(handValue(g.dealer).total, 28);
  assert.equal(g.result.reason, 'dealer-bust');
  assert.equal(g.result.outcome, 'win', 'the dealer busted and the player wins');
  assert.equal(agent.calls.length, 1, 'not asked again after busting');
});

// --- playDealerTurn: invalid answers, failures and fallback ---

test('dealer turn: falls back to the standard rule when the agent fails', async () => {
  const g = startGame('10', '10', '8', '6', '3');
  await playDealerTurn(g, {
    getMove: async () => {
      throw new Error('server down');
    },
  });
  assert.equal(g.phase, 'done');
  assert.equal(g.dealer.length, 3, 'hit on 16 by the standard rule');
  assert.equal(g.dealerNote.source, 'rule');
  assert.equal(g.result.outcome, 'lose');
});

test('dealer turn: a fallback decision says it is a fallback', async () => {
  const g = startGame('10', '10', '8', '7');
  await playDealerTurn(g, {
    getMove: async () => {
      throw new Error('boom');
    },
  });
  assert.equal(g.dealerNote.source, 'rule');
  assert.match(g.dealerNote.text, /AI dealer was unavailable/);
  assert.match(g.dealerNote.text, /standard dealer rule/);
});

const invalidAnswers = {
  'unsupported action': { action: 'double', explanation: 'Double down.' },
  'wrong case': { action: 'HIT', explanation: 'Loud hit.' },
  'missing action': { explanation: 'No action.' },
  'empty explanation': { action: 'stand', explanation: '  ' },
  'missing explanation': { action: 'stand' },
  'non-string explanation': { action: 'stand', explanation: 42 },
  'null answer': null,
  'empty object': {},
  'a string': 'stand',
};

for (const [name, answer] of Object.entries(invalidAnswers)) {
  test(`dealer turn: an invalid answer falls back to the standard rule: ${name}`, async () => {
    const g = startGame('10', '10', '8', '7'); // dealer 17: the standard rule stands
    await playDealerTurn(g, { getMove: async () => answer });
    assert.equal(g.dealerNote.source, 'rule');
    assert.equal(g.dealer.length, 2);
    assert.equal(g.phase, 'done');
  });
}

test('dealer turn: a request timeout falls back to the standard rule', async (t) => {
  // The server never answers, so the client request times out after 20 ms.
  t.mock.method(globalThis, 'fetch', (url, { signal }) =>
    new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))
  );
  const g = startGame('10', '10', '8', '6', '3');
  await playDealerTurn(g, { getMove: (board) => fetchDealerMove(board, { timeoutMs: 20 }) });
  assert.equal(g.dealerNote.source, 'rule');
  assert.equal(g.dealer.length, 3, 'hit on 16 by the standard rule');
  assert.equal(g.phase, 'done');
});

test('dealer turn: the fallback is decided per move, so a turn can mix AI and fallback decisions', async () => {
  // Player 19. Dealer 12: the AI hits a 3 (15), then fails, so the rule hits a 2 (17) and stands.
  const g = startGame('10', '10', '9', '2', '3', '2');
  const sources = [];
  let call = 0;
  await playDealerTurn(g, {
    getMove: async () => {
      if (++call === 1) return { action: 'hit', explanation: 'I need more.' };
      throw new Error('lost connection');
    },
    onChange: () => g.dealerNote && sources.push(g.dealerNote.source),
  });
  assert.equal(g.dealer.length, 4);
  assert.equal(handValue(g.dealer).total, 17);
  assert.ok(sources.includes('claude'));
  assert.equal(g.dealerNote.source, 'rule', 'the last decision was the fallback');
});

// --- playDealerTurn: round state and limits ---

test('dealer turn: after busting, the agent is not asked again', async () => {
  // Dealer 10+6 draws K and busts with 26.
  const g = startGame('10', '10', '8', '6', 'K');
  const agent = goodAgent();
  await playDealerTurn(g, { getMove: agent.getMove });
  assert.equal(handValue(g.dealer).total, 26);
  assert.equal(agent.calls.length, 1, 'only asked about the 16');
  assert.equal(g.result.reason, 'dealer-bust');
  assert.equal(g.result.outcome, 'win');
});

test('no agent call when the player busted: the engine ends the round locally', async () => {
  // Player 10+6 hits a K and busts; the round is over before the dealer's turn.
  const g = startGame('10', '5', '6', '6', 'K');
  g.hit();
  assert.equal(g.phase, 'done');
  assert.equal(g.result.reason, 'bust');

  const agent = goodAgent();
  await playDealerTurn(g, { getMove: agent.getMove });
  assert.equal(agent.calls.length, 0);
  assert.equal(g.result.reason, 'bust', 'the result is unchanged');
  assert.deepEqual(g.tally, { win: 0, lose: 1, push: 0 }, 'counted once');
});

test('no agent call when a natural Blackjack ended the round at the deal', async () => {
  const g = startGame('A', '9', 'K', '8');
  assert.equal(g.phase, 'done');
  const agent = goodAgent();
  await playDealerTurn(g, { getMove: agent.getMove });
  assert.equal(agent.calls.length, 0);
});

test('no agent call when the round is not started yet', async () => {
  const g = createGame(forced('10', '10', '8', '7'), { manualDealer: true });
  const agent = goodAgent();
  await playDealerTurn(g, { getMove: agent.getMove });
  assert.equal(agent.calls.length, 0);
  assert.equal(g.phase, 'idle');
});

test('dealer turn: the decision limit stops an agent that never stops hitting', async () => {
  // Zero-value cards keep the dealer at 16, so only the decision limit can end this turn.
  const zeros = Array(MAX_DEALER_DECISIONS + 10).fill('0');
  const g = startGame('10', '10', '8', '6', ...zeros);
  const agent = scriptedAgent('hit');
  await playDealerTurn(g, { getMove: agent.getMove });
  assert.equal(agent.calls.length, MAX_DEALER_DECISIONS);
  assert.equal(g.phase, 'done', 'the round still ends and settles');
});

test('dealer turn: if the engine refuses a hit (no cards left), the turn ends', async () => {
  const g = startGame('10', '10', '8', '6'); // empty deck after the deal
  const agent = scriptedAgent('hit');
  await playDealerTurn(g, { getMove: agent.getMove });
  assert.equal(agent.calls.length, 1);
  assert.equal(g.dealer.length, 2);
  assert.equal(g.phase, 'done');
});

test('dealer turn: onChange fires for each step and shows the thinking state', async () => {
  const g = startGame('10', '10', '8', '6', '2');
  const thinking = [];
  await playDealerTurn(g, { getMove: goodAgent().getMove, onChange: () => thinking.push(g.dealerThinking) });
  assert.ok(thinking.includes(true), 'was thinking at some point');
  assert.equal(thinking.at(-1), false, 'not thinking at the end');
});

test('dealer turn: waits for the pause function between steps', async () => {
  const g = startGame('10', '10', '8', '6', '2');
  let pauses = 0;
  await playDealerTurn(g, {
    getMove: goodAgent().getMove,
    pause: async () => {
      pauses++;
    },
  });
  assert.equal(pauses, 2, 'before and after the one dealer hit');
});

// --- fetchDealerMove ---

test('fetchDealerMove posts the board and returns the decision', async (t) => {
  const decision = { action: 'hit', explanation: 'x', dealerTotal: 16 };
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(decision)));
  const dealerHand = [c('10'), c('6')];
  const playerHand = [c('10'), c('9')];

  const result = await fetchDealerMove({ dealerHand, playerHand, ignored: 'x' });

  assert.deepEqual(result, decision);
  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, '/api/dealer-move');
  assert.equal(options.method, 'POST');
  assert.deepEqual(JSON.parse(options.body), { dealerHand, playerHand });
});

test('fetchDealerMove uses baseUrl when given', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response('{}'));
  await fetchDealerMove({ dealerHand: [], playerHand: [] }, { baseUrl: 'http://localhost:3000' });
  assert.equal(fetchMock.mock.calls[0].arguments[0], 'http://localhost:3000/api/dealer-move');
});

test('fetchDealerMove rejects on an error status', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 502 }));
  await assert.rejects(fetchDealerMove({ dealerHand: [], playerHand: [] }), /502/);
});

test('fetchDealerMove rejects when the request times out', async (t) => {
  t.mock.method(globalThis, 'fetch', (url, { signal }) =>
    new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))
  );
  await assert.rejects(fetchDealerMove({ dealerHand: [], playerHand: [] }, { timeoutMs: 20 }), /aborted/);
});
