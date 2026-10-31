import { BLACKJACK } from './config.js';

const TEN_VALUE_RANKS = ['10', 'J', 'Q', 'K'];

function cardValue(card) {
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

export const handTotal = (hand) => handValue(hand).total;
