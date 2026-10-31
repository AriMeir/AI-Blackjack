import { BLACKJACK, RESHUFFLE_BELOW } from '../config.js';
import { buildDeck, shuffle } from './deck.js';
import { handValue, isNatural, dealerShouldHit } from './hand.js';

/**
 * One game session. Pass a `forcedDeck` to fix the card order (cards are dealt from the
 * front, in order: player, dealer, player, dealer, then draws). Without one, a fresh
 * shuffled deck is used and reshuffled when it runs low.
 *
 * By default stand() plays the whole dealer turn at once using the house rule. With
 * `manualDealer: true`, stand() only starts the dealer's turn (phase 'dealer'); the caller then
 * drives it with dealerHit() and settle(), e.g. to ask the dealer agent for each move.
 */
export function createGame(forcedDeck, { manualDealer = false } = {}) {
  const game = {
    deck: forcedDeck ? forcedDeck.slice() : shuffle(buildDeck()),
    autoShuffle: !forcedDeck,
    manualDealer,
    player: [],
    dealer: [],
    phase: 'idle', // idle | player | dealer | done
    revealed: false, // dealer's hole card visible
    dealerThinking: false, // waiting for the dealer's next decision
    dealerNote: null, // { text, source } explanation of the dealer's latest decision
    result: null, // { outcome: 'win'|'lose'|'push', reason, message }
    tally: { win: 0, lose: 0, push: 0 },
  };

  const draw = () => game.deck.shift();

  function finish(outcome, reason, message) {
    game.phase = 'done';
    game.revealed = true;
    game.dealerThinking = false;
    game.result = { outcome, reason, message };
    game.tally[outcome]++;
  }

  game.startRound = function () {
    if (game.autoShuffle && game.deck.length < RESHUFFLE_BELOW) game.deck = shuffle(buildDeck());
    game.player = [draw(), null];
    game.dealer = [draw(), null];
    game.player[1] = draw();
    game.dealer[1] = draw();
    game.revealed = false;
    game.dealerThinking = false;
    game.dealerNote = null;
    game.result = null;
    game.phase = 'player';

    const playerNatural = isNatural(game.player);
    const dealerNatural = isNatural(game.dealer);
    if (playerNatural && dealerNatural) finish('push', 'blackjack', 'Both have Blackjack. Push!');
    else if (playerNatural) finish('win', 'blackjack', 'Blackjack! You win!');
    else if (dealerNatural) finish('lose', 'blackjack', 'Dealer has Blackjack. You lose.');
    return game;
  };

  game.hit = function () {
    if (game.phase !== 'player') return game;
    game.player.push(draw());
    const { total } = handValue(game.player);
    if (total > BLACKJACK) finish('lose', 'bust', `You bust with ${total}. Dealer wins.`);
    else if (total === BLACKJACK) game.stand();
    return game;
  };

  // Starts the dealer's turn: the hole card is revealed and the player can no longer act.
  game.startDealerTurn = function () {
    if (game.phase !== 'player') return game;
    game.phase = 'dealer';
    game.revealed = true;
    return game;
  };

  // The dealer draws one card. The engine decides what is allowed: not outside the dealer's
  // turn, not once the dealer has busted, and not when the deck is empty.
  game.dealerHit = function () {
    if (game.phase !== 'dealer') return game;
    if (handValue(game.dealer).total > BLACKJACK) return game;
    if (game.deck.length === 0) return game;
    game.dealer.push(draw());
    return game;
  };

  // Ends the dealer's turn by comparing the two hands and recording the result.
  game.settle = function () {
    if (game.phase !== 'dealer') return game;
    const p = handValue(game.player).total;
    const d = handValue(game.dealer).total;
    if (d > BLACKJACK) finish('win', 'dealer-bust', `Dealer busts with ${d}. You win!`);
    else if (p > d) finish('win', 'higher', `You win, ${p} to ${d}!`);
    else if (p < d) finish('lose', 'lower', `Dealer wins, ${d} to ${p}.`);
    else finish('push', 'tie', `Push, both have ${p}.`);
    return game;
  };

  game.stand = function () {
    if (game.phase !== 'player') return game;
    game.startDealerTurn();
    if (game.manualDealer) return game;
    while (dealerShouldHit(game.dealer)) game.dealerHit();
    return game.settle();
  };

  return game;
}
