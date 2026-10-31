import assert from 'assert';
import { buildDeck, shuffle } from '../js/logic/deck.js';
import { handValue, isNatural, dealerShouldHit } from '../js/logic/hand.js';
import { createGame } from '../js/logic/game.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}\n      ${e.message}`);
  }
}

// Card shorthand: c('A') or c('10', '♥')
const c = (rank, suit = '♠') => ({ rank, suit });
const hand = (...ranks) => ranks.map((r) => c(r));
// Forced deck in deal order: player1, dealer1, player2, dealer2, then draws.
const forced = (p1, d1, p2, d2, ...draws) => [c(p1), c(d1), c(p2), c(d2), ...draws.map((r) => c(r))];

// --- Task 2: deck ---
test('deck has 52 unique cards', () => {
  const deck = buildDeck();
  assert.strictEqual(deck.length, 52);
  assert.strictEqual(new Set(deck.map((x) => x.rank + x.suit)).size, 52);
});
test('shuffle keeps all cards and changes the order', () => {
  const a = buildDeck();
  const b = shuffle(buildDeck());
  assert.strictEqual(b.length, 52);
  assert.strictEqual(new Set(b.map((x) => x.rank + x.suit)).size, 52);
  const same = a.every((x, i) => x.rank === b[i].rank && x.suit === b[i].suit);
  assert.ok(!same, 'order unchanged after shuffle');
});

// --- Task 3: scoring ---
test('A+K = 21', () => assert.strictEqual(handValue(hand('A', 'K')).total, 21));
test('A+A+9 = 21', () => assert.strictEqual(handValue(hand('A', 'A', '9')).total, 21));
test('K+Q+5 = 25 (bust)', () => assert.strictEqual(handValue(hand('K', 'Q', '5')).total, 25));
test('A+6 is soft 17', () => {
  const v = handValue(hand('A', '6'));
  assert.deepStrictEqual(v, { total: 17, soft: true });
});
test('A+6+10 is hard 17', () => {
  const v = handValue(hand('A', '6', '10'));
  assert.deepStrictEqual(v, { total: 17, soft: false });
});

// --- Task 4: naturals ---
test('A+10-value is a natural for every 10-value rank', () => {
  for (const r of ['10', 'J', 'Q', 'K']) assert.ok(isNatural(hand('A', r)), r);
});
test('3-card 21 is not a natural', () => assert.ok(!isNatural(hand('7', '7', '7'))));
test('player natural only: player wins immediately', () => {
  const g = createGame(forced('A', '9', 'K', '8')).startRound();
  assert.strictEqual(g.phase, 'done');
  assert.deepStrictEqual([g.result.outcome, g.result.reason], ['win', 'blackjack']);
  assert.ok(g.revealed);
});
test('dealer natural only: dealer wins immediately, hole card revealed', () => {
  const g = createGame(forced('9', 'A', '8', 'K')).startRound();
  assert.strictEqual(g.phase, 'done');
  assert.deepStrictEqual([g.result.outcome, g.result.reason], ['lose', 'blackjack']);
  assert.ok(g.revealed);
});
test('both naturals: push', () => {
  const g = createGame(forced('A', 'A', 'K', 'Q')).startRound();
  assert.deepStrictEqual([g.result.outcome, g.result.reason], ['push', 'blackjack']);
});
test('natural beats non-natural 21 (dealer 7+7+7)', () => {
  // Player has A+K. Round ends at the deal, so dealer never draws to 21.
  const g = createGame(forced('A', '7', 'K', '7', '7')).startRound();
  assert.strictEqual(g.result.outcome, 'win');
});
test('player 3-card 21 loses to dealer natural', () => {
  const g = createGame(forced('7', 'A', '7', 'K', '7')).startRound();
  assert.strictEqual(g.result.outcome, 'lose');
});
test('player 3-card 21 vs dealer 3-card 21 is a push, not a natural win', () => {
  // Player 5+6, hits 10 -> 21. Dealer 7+7, draws 7 -> 21.
  const g = createGame(forced('5', '7', '6', '7', '10', '7')).startRound();
  assert.strictEqual(g.phase, 'player');
  g.hit(); // 21 -> auto-stand
  assert.strictEqual(g.phase, 'done');
  assert.deepStrictEqual([g.result.outcome, g.result.reason], ['push', 'tie']);
});

// --- Task 5: dealer rules and round flow ---
test('dealer stands on soft 17 (A+6)', () => assert.ok(!dealerShouldHit(hand('A', '6'))));
test('dealer stands on hard 17 (10+7)', () => assert.ok(!dealerShouldHit(hand('10', '7'))));
test('dealer hits on 16 (10+6)', () => assert.ok(dealerShouldHit(hand('10', '6'))));
test('dealer hits on soft 16 (A+5)', () => assert.ok(dealerShouldHit(hand('A', '5'))));
test('dealer A+6 stands in a real round', () => {
  // Player 10+8=18, dealer A+6 stands on soft 17, so the player wins 18 to 17.
  const g = createGame(forced('10', 'A', '8', '6', '5')).startRound();
  g.stand();
  assert.strictEqual(g.dealer.length, 2);
  assert.strictEqual(g.result.outcome, 'win');
});
test('dealer 10+6 hits in a real round', () => {
  const g = createGame(forced('10', '10', '8', '6', '3')).startRound();
  g.stand();
  assert.strictEqual(g.dealer.length, 3);
  assert.strictEqual(handValue(g.dealer).total, 19);
  assert.strictEqual(g.result.outcome, 'lose');
});
test('dealer bust -> player wins', () => {
  const g = createGame(forced('10', '10', '8', '6', 'K')).startRound();
  g.stand();
  assert.deepStrictEqual([g.result.outcome, g.result.reason], ['win', 'dealer-bust']);
});
test('player bust -> loses and dealer does not draw', () => {
  const g = createGame(forced('10', '10', '6', '6', 'K', '2')).startRound();
  g.hit();
  assert.deepStrictEqual([g.result.outcome, g.result.reason], ['lose', 'bust']);
  assert.strictEqual(g.dealer.length, 2);
});
test('equal totals push', () => {
  const g = createGame(forced('10', '10', '8', '8')).startRound();
  g.stand();
  assert.strictEqual(g.result.outcome, 'push');
});
test('higher total wins / lower total loses', () => {
  const w = createGame(forced('10', '10', '9', '8')).startRound();
  w.stand();
  assert.strictEqual(w.result.outcome, 'win');
  const l = createGame(forced('10', '10', '7', '9')).startRound();
  l.stand();
  assert.strictEqual(l.result.outcome, 'lose');
});
test('actions are ignored once the round is done', () => {
  const g = createGame(forced('10', '10', '8', '8', '5')).startRound();
  g.stand();
  const len = g.player.length;
  g.hit();
  assert.strictEqual(g.player.length, len);
  assert.deepStrictEqual(g.tally, { win: 0, lose: 0, push: 1 });
});

// --- Task 8: random playtest (stress) ---
test('1000 random rounds finish cleanly with consistent tallies', () => {
  const g = createGame();
  for (let i = 0; i < 1000; i++) {
    g.startRound();
    while (g.phase === 'player') {
      if (handValue(g.player).total < 17) g.hit();
      else g.stand();
    }
    assert.strictEqual(g.phase, 'done');
    assert.ok(g.result);
    assert.ok(g.deck.length >= 0);
    for (const card of [...g.player, ...g.dealer]) assert.ok(card && card.rank, 'undefined card dealt');
  }
  const { win, lose, push } = g.tally;
  assert.strictEqual(win + lose + push, 1000);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
