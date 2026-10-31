import { BLACKJACK } from '../config.js';
import { cardValue, handValue } from '../logic/hand.js';
import { createCardElement } from './cardElement.js';

function getElements() {
  const $ = (id) => document.getElementById(id);
  return {
    dealer: $('dealer-hand'),
    player: $('player-hand'),
    dealerScore: $('dealer-score'),
    dealerNote: $('dealer-note'),
    playerScore: $('player-score'),
    banner: $('banner'),
    hit: $('hit'),
    stand: $('stand'),
    deal: $('deal'),
    wins: $('wins'),
    losses: $('losses'),
    pushes: $('pushes'),
  };
}

function scoreText(hand, hideSecond) {
  if (!hand.length) return '';
  if (hideSecond) return String(cardValue(hand[0]));
  const { total, soft } = handValue(hand);
  return soft && total < BLACKJACK ? `${total - 10}/${total}` : String(total);
}

function renderHand(container, hand, { alreadyShown, hideSecond, justRevealed }) {
  container.replaceChildren();
  hand.forEach((card, i) => {
    container.appendChild(
      createCardElement(card, {
        hidden: hideSecond && i === 1,
        animate: i >= alreadyShown,
        flip: justRevealed && i === 1,
      })
    );
  });
}

// Where the dealer's latest decision came from: the AI agent, or the rule-based fallback.
const SOURCE_LABELS = { claude: 'AI agent', rule: 'Fallback rule' };

// Shows what the dealer is doing: "thinking…" while waiting, then the explanation of its decision.
function renderDealerNote(el, game) {
  el.replaceChildren();
  if (game.dealerThinking) {
    el.textContent = 'Dealer is thinking…';
    return;
  }
  if (!game.dealerNote) return;
  const badge = document.createElement('span');
  badge.className = `source ${game.dealerNote.source}`;
  badge.textContent = SOURCE_LABELS[game.dealerNote.source] ?? game.dealerNote.source;
  el.append(badge, ` ${game.dealerNote.text}`);
}

/** Draws the game state into the page. Remembers what was shown so only new cards animate. */
export function createView(game) {
  const els = getElements();
  let shown = { player: 0, dealer: 0, revealed: false };

  function resetAnimations() {
    shown = { player: 0, dealer: 0, revealed: false };
  }

  function render() {
    const hideDealer = !game.revealed && game.phase !== 'idle';
    const justRevealed = game.revealed && !shown.revealed;

    renderHand(els.player, game.player, { alreadyShown: shown.player });
    renderHand(els.dealer, game.dealer, {
      alreadyShown: justRevealed ? game.dealer.length : shown.dealer,
      hideSecond: hideDealer,
      justRevealed,
    });
    els.playerScore.textContent = scoreText(game.player, false);
    els.dealerScore.textContent = scoreText(game.dealer, hideDealer);

    const playing = game.phase === 'player';
    els.hit.disabled = !playing;
    els.stand.disabled = !playing;
    els.deal.disabled = playing || game.phase === 'dealer';
    renderDealerNote(els.dealerNote, game);
    els.deal.textContent = game.phase === 'idle' ? 'Deal' : 'New Round';

    els.banner.textContent = game.result ? game.result.message : '';
    els.banner.className = 'banner' + (game.result ? ` show ${game.result.outcome}` : '');
    els.wins.textContent = game.tally.win;
    els.losses.textContent = game.tally.lose;
    els.pushes.textContent = game.tally.push;

    shown = { player: game.player.length, dealer: game.dealer.length, revealed: game.revealed };
  }

  return { render, resetAnimations, buttons: { hit: els.hit, stand: els.stand, deal: els.deal } };
}
