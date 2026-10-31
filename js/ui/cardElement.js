const RED_SUITS = ['♥', '♦'];

export function createCardElement(card, { hidden, animate, flip }) {
  const el = document.createElement('div');
  if (hidden) {
    el.className = 'card back' + (animate ? ' deal' : '');
    return el;
  }
  const red = RED_SUITS.includes(card.suit);
  el.className = 'card' + (red ? ' red' : '') + (animate ? ' deal' : '') + (flip ? ' flip' : '');
  el.innerHTML =
    `<span class="corner">${card.rank}<br>${card.suit}</span>` +
    `<span class="pip">${card.suit}</span>` +
    `<span class="corner bottom">${card.rank}<br>${card.suit}</span>`;
  return el;
}
