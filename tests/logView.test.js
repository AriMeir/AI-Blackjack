import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../js/logic/game.js';
import { createLogView } from '../js/ui/logView.js';

// A very small stand-in for the page, so the log panel's code can run in Node.
class FakeElement {
  constructor() {
    this.className = '';
    this.textContent = '';
    this.children = [];
    this.scrollTop = 0;
    this.scrollHeight = 1000;
    this.listeners = {};
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  append(...nodes) {
    for (const node of nodes) this.children.push(node);
  }
  replaceChildren() {
    this.children = [];
  }
  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }
}

let list;
let clearButton;

beforeEach(() => {
  list = new FakeElement();
  clearButton = new FakeElement();
  globalThis.document = {
    getElementById: (id) => ({ 'log-list': list, 'log-clear': clearButton })[id],
    createElement: () => new FakeElement(),
  };
});

const c = (rank, suit = '♠') => ({ rank, suit });
const startGame = (...ranks) =>
  createGame(ranks.map((r) => c(r)), { manualDealer: true }).startRound();

// All the text of one chat line (its own text plus its children's).
const textOf = (el) => (el.textContent ?? '') + el.children.map(textOf).join(' ');

test('renders one chat line per log entry', () => {
  const game = startGame('10', '10', '8', '7');
  const view = createLogView(game);
  view.render();
  assert.equal(list.children.length, game.log.length);
  assert.match(textOf(list.children[0]), /Round 1/);
});

test('each line has the classes for its speaker and kind', () => {
  const game = startGame('10', '10', '8', '7');
  game.stand();
  createLogView(game).render();
  const classes = list.children.map((el) => el.className);
  assert.ok(classes.some((name) => name.includes('system') && name.includes('deal')));
  assert.ok(classes.some((name) => name.includes('you') && name.includes('stand')));
  assert.ok(classes.some((name) => name.includes('dealer') && name.includes('reveal')));
});

test('only new entries are added, earlier ones are left alone', () => {
  const game = startGame('10', '10', '8', '7');
  const view = createLogView(game);
  view.render();
  const first = list.children[0];
  game.stand();
  view.render();
  assert.equal(list.children.length, game.log.length);
  assert.equal(list.children[0], first, 'the first line is the same element');
  view.render();
  assert.equal(list.children.length, game.log.length, 'rendering again adds nothing');
});

test('the panel scrolls to the newest entry', () => {
  const game = startGame('10', '10', '8', '7');
  createLogView(game).render();
  assert.equal(list.scrollTop, list.scrollHeight);
});

test('AI thoughts show the AI agent badge, the action and the explanation', () => {
  const game = startGame('10', '10', '8', '7');
  game.addLog('dealer', 'thought', 'I stand on 17.', { source: 'claude', action: 'stand' });
  createLogView(game).render();
  const line = textOf(list.children.at(-1));
  assert.match(line, /AI agent/);
  assert.match(line, /Stand/);
  assert.match(line, /I stand on 17\./);
});

test('fallback thoughts show the Fallback rule badge', () => {
  const game = startGame('10', '10', '8', '7');
  game.addLog('dealer', 'thought', 'Rule applied.', { source: 'rule', action: 'hit' });
  createLogView(game).render();
  const line = textOf(list.children.at(-1));
  assert.match(line, /Fallback rule/);
  assert.match(line, /Hit/);
});

test('text is inserted as text, never as markup', () => {
  const game = startGame('10', '10', '8', '7');
  game.addLog('dealer', 'thought', '<img src=x onerror=alert(1)>', { source: 'claude', action: 'stand' });
  createLogView(game).render();
  const line = list.children.at(-1);
  assert.equal('innerHTML' in line, false, 'innerHTML is never used');
  assert.match(textOf(line), /<img src=x onerror=alert\(1\)>/);
});

test('the Clear log button empties the panel and the game log', () => {
  const game = startGame('10', '10', '8', '7');
  const view = createLogView(game);
  view.render();
  assert.ok(list.children.length > 0);

  clearButton.listeners.click();
  assert.equal(list.children.length, 0);
  assert.deepEqual(game.log, []);
});

test('entries added after clearing show up again from the top', () => {
  const game = startGame('10', '10', '8', '7');
  const view = createLogView(game);
  view.render();
  clearButton.listeners.click();
  game.stand();
  view.render();
  assert.equal(list.children.length, game.log.length);
  assert.match(textOf(list.children[0]), /You stand/);
});
