// Where a dealer decision came from, and what it was.
const SOURCE_LABELS = { claude: 'AI agent', rule: 'Fallback rule' };
const ACTION_LABELS = { hit: 'Hit', stand: 'Stand' };

function badge(className, text) {
  const el = document.createElement('span');
  el.className = `badge ${className}`;
  el.textContent = text;
  return el;
}

// One chat line. Text always goes in via textContent, never as HTML: the dealer's
// explanation comes from the AI and must not be able to inject markup.
function createEntryElement(entry) {
  const el = document.createElement('div');
  el.className = `log-entry ${entry.speaker} ${entry.kind}`;

  if (entry.kind === 'thought') {
    const head = document.createElement('div');
    head.className = 'log-head';
    head.append(badge(`source-${entry.source}`, SOURCE_LABELS[entry.source] ?? entry.source));
    if (entry.action) head.append(badge('action', ACTION_LABELS[entry.action] ?? entry.action));
    el.append(head);
  }

  const text = document.createElement('div');
  text.className = 'log-text';
  text.textContent = entry.text;
  el.append(text);
  return el;
}

/**
 * The side panel: a chat-style log of the game. Only new entries are added each time,
 * so earlier ones stay put (and keep their scroll position) until the log is cleared.
 */
export function createLogView(game) {
  const list = document.getElementById('log-list');
  const clearButton = document.getElementById('log-clear');
  let shown = 0;

  function render() {
    if (game.log.length < shown) {
      // the log was cleared
      list.replaceChildren();
      shown = 0;
    }
    if (game.log.length === shown) return;
    for (const entry of game.log.slice(shown)) list.appendChild(createEntryElement(entry));
    shown = game.log.length;
    list.scrollTop = list.scrollHeight; // show the newest entry
  }

  clearButton.addEventListener('click', () => {
    game.clearLog();
    render();
  });

  return { render };
}
