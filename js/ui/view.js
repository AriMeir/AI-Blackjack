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
    playerNote: $('player-note'),
    playerTitle: $('player-title'),
    banner: $('banner'),
    hit: $('hit'),
    stand: $('stand'),
    deal: $('deal'),
    auto: $('auto'),
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

// Where a decision came from: the AI agent, or the rule-based fallback.
const SOURCE_LABELS = { claude: 'AI agent', rule: 'Fallback rule' };

// Shows what a side is doing: "thinking…" while waiting, then the explanation of its latest decision.
function renderNote(el, { thinking, thinkingText, note }) {
  el.replaceChildren();
  if (thinking) {
    el.textContent = thinkingText;
    return;
  }
  if (!note) return;
  const badge = document.createElement('span');
  badge.className = `source ${note.source}`;
  badge.textContent = SOURCE_LABELS[note.source] ?? note.source;
  el.append(badge, ` ${note.text}`);
}

// The AI vs AI button: starts a session, becomes Stop while one runs, and is off during a human round.
function renderAutoButton(button, game) {
  button.textContent = game.autoStopping ? 'Stopping…' : game.autoPlaying ? 'Stop' : 'AI vs AI';
  button.disabled = game.autoStopping || (!game.autoPlaying && (game.phase === 'player' || game.phase === 'dealer'));
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

    // The human can only act on their own turn, never while the AI player is playing.
    const humanTurn = game.phase === 'player' && !game.aiPlayer;
    els.hit.disabled = !humanTurn;
    els.stand.disabled = !humanTurn;
    els.deal.disabled = game.autoPlaying || game.phase === 'player' || game.phase === 'dealer';
    els.deal.textContent = game.phase === 'idle' ? 'Deal' : 'New Round';
    renderAutoButton(els.auto, game);

    els.playerTitle.textContent = game.aiPlayer ? 'AI Player' : 'You';
    renderNote(els.playerNote, { thinking: game.playerThinking, thinkingText: 'AI player is thinking…', note: game.playerNote });
    renderNote(els.dealerNote, { thinking: game.dealerThinking, thinkingText: 'Dealer is thinking…', note: game.dealerNote });

    els.banner.textContent = game.result ? game.result.message : '';
    els.banner.className = 'banner' + (game.result ? ` show ${game.result.outcome}` : '');
    els.wins.textContent = game.tally.win;
    els.losses.textContent = game.tally.lose;
    els.pushes.textContent = game.tally.push;

    shown = { player: game.player.length, dealer: game.dealer.length, revealed: game.revealed };
  }

  return { render, resetAnimations, buttons: { hit: els.hit, stand: els.stand, deal: els.deal, auto: els.auto } };
}
