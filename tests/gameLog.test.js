import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../js/logic/game.js';
import { playDealerTurn } from '../js/logic/dealerTurn.js';
import { describeHand, formatCard } from '../js/logic/hand.js';

const c = (rank, suit = '♠') => ({ rank, suit });
// Forced deck in deal order: player1, dealer1, player2, dealer2, then draws.
const forced = (p1, d1, p2, d2, ...draws) => [c(p1), c(d1), c(p2), c(d2), ...draws.map((r) => c(r))];
const startGame = (...cards) => createGame(forced(...cards), { manualDealer: true }).startRound();

const kinds = (game) => game.log.map((entry) => entry.kind);
const texts = (game, kind) => game.log.filter((entry) => entry.kind === kind).map((entry) => entry.text);

// --- formatting helpers ---

test('formatCard and describeHand', () => {
  assert.equal(formatCard(c('10', '♥')), '10♥');
  assert.equal(describeHand([c('10'), c('6', '♥')]), '10♠ 6♥ (16)');
  assert.equal(describeHand([c('A'), c('6', '♥')]), 'A♠ 6♥ (soft 17)');
  assert.equal(describeHand([c('K'), c('Q'), c('5')]), 'K♠ Q♠ 5♠ (25, bust)');
  assert.equal(describeHand([c('A'), c('K')]), 'A♠ K♠ (soft 21)');
});

// --- the engine writes the log ---

test('a new game has an empty log', () => {
  assert.deepEqual(createGame().log, []);
});

test('a round start is logged with the player hand and the dealer upcard only', () => {
  const g = startGame('10', '9', '6', '8');
  assert.equal(g.log.length, 1);
  assert.deepEqual(g.log[0], {
    round: 1,
    speaker: 'system',
    kind: 'deal',
    text: 'Round 1. You were dealt 10♠ 6♠ (16). The dealer shows 9♠.',
  });
  assert.ok(!g.log[0].text.includes('8♠'), 'the hole card is not revealed');
});

test('a full round is logged in order, from the deal to the result', () => {
  // Player 10+6 hits a 2 (18) and stands. Dealer 10+7 = 17 stands by rule.
  const g = createGame(forced('10', '10', '6', '7', '2')).startRound();
  g.hit();
  g.stand();
  assert.deepEqual(kinds(g), ['deal', 'hit', 'stand', 'reveal', 'result']);
  assert.equal(texts(g, 'hit')[0], 'You hit and drew 2♠. You now have 10♠ 6♠ 2♠ (18).');
  assert.equal(texts(g, 'stand')[0], 'You stand on 18.');
  assert.equal(texts(g, 'reveal')[0], 'Dealer reveals 10♠ 7♠ (17).');
  assert.match(texts(g, 'result')[0], /You win, 18 to 17!/);
  assert.match(texts(g, 'result')[0], /Wins: 1, Losses: 0, Pushes: 0\./);
});

test('speakers: you, dealer, system', () => {
  const g = createGame(forced('10', '10', '6', '7', '2')).startRound();
  g.hit();
  g.stand();
  assert.deepEqual(
    g.log.map((entry) => entry.speaker),
    ['system', 'you', 'you', 'dealer', 'system']
  );
});

test('the dealer drawing cards is logged', () => {
  const g = createGame(forced('10', '10', '8', '6', '3')).startRound(); // dealer 16 hits a 3 by rule
  g.stand();
  assert.deepEqual(kinds(g), ['deal', 'stand', 'reveal', 'draw', 'result']);
  assert.equal(texts(g, 'draw')[0], 'Dealer draws 3♠. Dealer now has 10♠ 6♠ 3♠ (19).');
});

test('a player bust is logged and ends the round', () => {
  const g = startGame('10', '5', '6', '6', 'K');
  g.hit();
  assert.deepEqual(kinds(g), ['deal', 'hit', 'result']);
  assert.match(texts(g, 'hit')[0], /\(26, bust\)/);
  assert.match(texts(g, 'result')[0], /You bust with 26/);
});

test('reaching 21 logs an automatic stand', () => {
  const g = startGame('5', '10', '6', '6', '10');
  g.hit();
  assert.equal(texts(g, 'stand')[0], 'You stand on 21.');
});

test('natural blackjacks reveal the dealer hand and log the result at the deal', () => {
  const player = startGame('A', '9', 'K', '8');
  assert.deepEqual(kinds(player), ['deal', 'reveal', 'result']);
  const dealer = startGame('9', 'A', '8', 'K');
  assert.deepEqual(kinds(dealer), ['deal', 'reveal', 'result']);
  assert.match(texts(dealer, 'reveal')[0], /A♠ K♠/);
});

test('rounds are numbered and the log keeps every round', () => {
  const g = createGame(forced('10', '10', '8', '8')).startRound();
  g.stand();
  g.deck.push(c('10'), c('10'), c('9'), c('8'));
  g.startRound();
  const deals = g.log.filter((entry) => entry.kind === 'deal');
  assert.deepEqual(
    deals.map((entry) => entry.round),
    [1, 2]
  );
  assert.ok(g.log.some((entry) => entry.round === 1 && entry.kind === 'result'), 'round 1 is still there');
});

test('actions that are ignored are not logged', () => {
  const g = startGame('10', '10', '8', '8');
  g.stand();
  g.settle();
  const length = g.log.length;
  g.hit();
  g.stand();
  g.dealerHit();
  g.settle();
  assert.equal(g.log.length, length);
});

test('clearLog empties the log but keeps the round count and the tally', () => {
  const g = createGame(forced('10', '10', '8', '8')).startRound();
  g.stand();
  g.clearLog();
  assert.deepEqual(g.log, []);
  assert.equal(g.round, 1);
  assert.deepEqual(g.tally, { win: 0, lose: 0, push: 1 });
});

// --- the dealer's thoughts are kept ---

// A stand-in AI agent that plays hit below 17, otherwise stand.
const agent = async ({ dealerHand }) => {
  const total = dealerHand.reduce((sum, card) => sum + (['J', 'Q', 'K'].includes(card.rank) ? 10 : Number(card.rank)), 0);
  return total < 17
    ? { action: 'hit', explanation: `I have ${total}, so I draw.` }
    : { action: 'stand', explanation: `I have ${total}, so I stand.` };
};

test('every dealer decision stays in the log, even though the dealer note is replaced', async () => {
  // Player 18. Dealer 10+2 = 12: hits a 3 (15), hits a 4 (19), stands.
  const g = startGame('10', '10', '8', '2', '3', '4');
  g.stand();
  await playDealerTurn(g, { getMove: agent });

  const thoughts = g.log.filter((entry) => entry.kind === 'thought');
  assert.deepEqual(
    thoughts.map((entry) => entry.text),
    ['I have 12, so I draw.', 'I have 15, so I draw.', 'I have 19, so I stand.']
  );
  assert.deepEqual(
    thoughts.map((entry) => entry.action),
    ['hit', 'hit', 'stand']
  );
  assert.equal(g.dealerNote.text, 'I have 19, so I stand.', 'only the latest is in the note');
});

test('thoughts and draws are interleaved in the order they happened', async () => {
  const g = startGame('10', '10', '8', '6', '3');
  g.stand();
  await playDealerTurn(g, { getMove: agent });
  assert.deepEqual(kinds(g), ['deal', 'stand', 'reveal', 'thought', 'draw', 'thought', 'result']);
});

test('AI thoughts are labelled as the AI agent', async () => {
  const g = startGame('10', '10', '8', '7');
  g.stand();
  await playDealerTurn(g, { getMove: agent });
  const thought = g.log.find((entry) => entry.kind === 'thought');
  assert.equal(thought.source, 'claude');
  assert.equal(thought.speaker, 'dealer');
});

test('fallback decisions are labelled as the fallback rule', async () => {
  const g = startGame('10', '10', '8', '7');
  g.stand();
  await playDealerTurn(g, {
    getMove: async () => {
      throw new Error('server down');
    },
  });
  const thought = g.log.find((entry) => entry.kind === 'thought');
  assert.equal(thought.source, 'rule');
  assert.match(thought.text, /AI dealer was unavailable/);
});

test('a turn can mix AI and fallback thoughts, each labelled', async () => {
  // Dealer 12: the AI hits a 3 (15), then the request fails and the rule hits a 2 (17) and stands.
  const g = startGame('10', '10', '9', '2', '3', '2');
  g.stand();
  let call = 0;
  await playDealerTurn(g, {
    getMove: async () => {
      if (++call === 1) return { action: 'hit', explanation: 'I need more.' };
      throw new Error('lost connection');
    },
  });
  const sources = g.log.filter((entry) => entry.kind === 'thought').map((entry) => entry.source);
  assert.deepEqual(sources, ['claude', 'rule', 'rule']);
});

test('no thoughts are logged when the round ended before the dealer turn', async () => {
  const g = startGame('10', '5', '6', '6', 'K');
  g.hit(); // player busts
  const before = g.log.length;
  await playDealerTurn(g, { getMove: agent });
  assert.equal(g.log.length, before);
});
