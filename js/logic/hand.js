import { TEN_VALUE_RANKS, BLACKJACK, DEALER_STANDS_ON } from '../config.js';

export function cardValue(card) {
  if (card.rank === 'A') return 11;
  if (TEN_VALUE_RANKS.includes(card.rank)) return 10;
  return Number(card.rank);
}

// Aces count as 11 unless that would bust, then 1. `soft` = an ace is still counted as 11.
export function handValue(hand) {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    total += cardValue(card);
    if (card.rank === 'A') aces++;
  }
  while (total > BLACKJACK && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

// Natural blackjack: exactly two cards totalling 21 (Ace + 10-value card).
export function isNatural(hand) {
  return hand.length === 2 && handValue(hand).total === BLACKJACK;
}

// Dealer hits on 16 or less and stands on every 17, including soft 17.
export function dealerShouldHit(hand) {
  return handValue(hand).total < DEALER_STANDS_ON;
}
