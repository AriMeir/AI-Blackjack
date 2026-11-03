import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../js/logic/game.js';
import { createView } from '../js/ui/view.js';

// A very small stand-in for the page, so the table's code can run in Node.
class FakeElement {
  constructor() {
    this.className = '';
    this.textContent = '';
    this.innerHTML = '';
    this.disabled = false;
    this.children = [];
    this.listeners = {};
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  append(...nodes) {
    for (const node of nodes) this.children.push(typeof node === 'string' ? { textContent: node, children: [] } : node);
  }
  replaceChildren() {
    this.children = [];
    this.textContent = '';
  }
  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }
}

let elements;

beforeEach(() => {
  elements = {};
  globalThis.document = {
    getElementById: (id) => (elements[id] ??= new FakeElement()),
    createElement: () => new FakeElement(),
  };
});

const c = (rank, suit = '♠') => ({ rank, suit });
const newGame = () => createGame([c('10'), c('9'), c('8'), c('7'), c('2'), c('3')], { manualDealer: true });
const el = (id) => elements[id];
const textOf = (node) => (node.textContent ?? '') + (node.children ?? []).map(textOf).join('');

test('at the start: Deal and AI vs AI are on, Hit and Stand are off', () => {
  createView(newGame()).render();
  assert.equal(el('hit').disabled, true);
  assert.equal(el('stand').disabled, true);
  assert.equal(el('deal').disabled, false);
  assert.equal(el('deal').textContent, 'Deal');
  assert.equal(el('auto').disabled, false);
  assert.equal(el('auto').textContent, 'AI vs AI');
  assert.equal(el('player-title').textContent, 'You');
});

test('during your own turn: Hit and Stand are on, and Deal and AI vs AI are off', () => {
  const game = newGame().startRound();
  createView(game).render();
  assert.equal(el('hit').disabled, false);
  assert.equal(el('stand').disabled, false);
  assert.equal(el('deal').disabled, true);
  assert.equal(el('auto').disabled, true);
});

test('during the dealer turn of your round: everything is off', () => {
  const game = newGame().startRound();
  game.stand();
  createView(game).render();
  assert.equal(el('hit').disabled, true);
  assert.equal(el('stand').disabled, true);
  assert.equal(el('deal').disabled, true);
  assert.equal(el('auto').disabled, true);
});

test('after a round: New Round and AI vs AI are on', () => {
  const game = newGame().startRound();
  game.stand();
  game.settle();
  createView(game).render();
  assert.equal(el('deal').disabled, false);
  assert.equal(el('deal').textContent, 'New Round');
  assert.equal(el('auto').disabled, false);
});

test('while the AI player is playing: you cannot hit or stand, and the heading says AI Player', () => {
  const game = newGame();
  game.aiPlayer = true;
  game.autoPlaying = true;
  game.startRound();
  assert.equal(game.phase, 'player');
  createView(game).render();
  assert.equal(el('hit').disabled, true, 'the human buttons stay off on the AI player turn');
  assert.equal(el('stand').disabled, true);
  assert.equal(el('deal').disabled, true);
  assert.equal(el('player-title').textContent, 'AI Player');
});

test('during AI vs AI the AI vs AI button becomes Stop', () => {
  const game = newGame();
  game.aiPlayer = true;
  game.autoPlaying = true;
  game.startRound();
  createView(game).render();
  assert.equal(el('auto').textContent, 'Stop');
  assert.equal(el('auto').disabled, false);
});

test('after pressing Stop the button says Stopping and is off', () => {
  const game = newGame();
  game.autoPlaying = true;
  game.autoStopping = true;
  createView(game).render();
  assert.equal(el('auto').textContent, 'Stopping…');
  assert.equal(el('auto').disabled, true);
});

test('the heading goes back to You when a human round starts', () => {
  const game = newGame();
  game.aiPlayer = true;
  const view = createView(game);
  view.render();
  assert.equal(el('player-title').textContent, 'AI Player');
  game.aiPlayer = false;
  view.render();
  assert.equal(el('player-title').textContent, 'You');
});

test('thinking messages for the AI player and the dealer', () => {
  const game = newGame().startRound();
  game.playerThinking = true;
  createView(game).render();
  assert.equal(el('player-note').textContent, 'AI player is thinking…');

  game.playerThinking = false;
  game.dealerThinking = true;
  createView(game).render();
  assert.equal(el('dealer-note').textContent, 'Dealer is thinking…');
});

test('notes show the explanation with an AI agent or Fallback rule label', () => {
  const game = newGame().startRound();
  game.playerNote = { text: 'I stand on 18.', source: 'claude' };
  game.dealerNote = { text: 'Rule applied.', source: 'rule' };
  createView(game).render();
  assert.match(textOf(el('player-note')), /AI agent.*I stand on 18\./);
  assert.match(textOf(el('dealer-note')), /Fallback rule.*Rule applied\./);
});
