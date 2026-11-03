# Blackjack

Play Blackjack against a computer dealer. Plain HTML, CSS and JavaScript, no backend, no betting.

## Run

The game uses ES modules, which browsers block when `index.html` is opened directly from disk. Run the game server, which also serves the page:

```
cd card-game/server
npm install      (first time only)
npm start
```

Then open http://localhost:3000.

### The dealer

The dealer is an AI agent (Claude, `claude-haiku-5-5`). On the dealer's turn the game sends the server both hands, and the agent decides for itself whether to hit or stand, trying to win the round. It is **not** bound to the traditional "hit below 17, stand on 17" rule. Its explanation is shown under the dealer's cards with an **AI agent** label.

How the pieces share the work:
- **The agent only suggests.** It returns a `dealer_action` (`hit` or `stand`, plus an explanation). It never touches the game state.
- **The game engine acts.** It checks the answer is well formed, draws the card, and enforces the limits (no hitting after a bust or with an empty deck, at most 15 decisions per turn). A valid but poor decision, such as hitting on 18, is respected.
- **Rounds that are already over never reach the agent.** If you bust, the engine ends the round locally and no request is made. The server also rejects such boards.
- **Fallback.** If there's no API key, the server is down, the request times out, or the answer is malformed, the standard rule (hit on 16 or less, stand on 17 or more) decides that move, and the note shows a **Fallback rule** label saying the AI was unavailable.

### The game log

A chat-style **Game log** sits beside the table (below it on narrow screens). It records everything that happens: the deal, each of your hits and stands, the dealer's reveal and draws, and **every explanation the dealer gives** (labelled AI agent or Fallback rule, with the action it chose), then the result and score. Unlike the note under the dealer's cards, which is replaced by each new decision, the log keeps them all. It lasts for the browser session (a reload starts it empty), and the **Clear log** button empties it.

To enable the agent, put your key in `server/.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

`npm start` loads that file automatically (and still starts without it, using the fallback rule).

## Tests

```
cd card-game
node tests/tests.js                     game rules
node --test "tests/*.test.js"           dealer turn, server client, game log
npm test                                both of the above

cd server
npm test                                server, agent and route
```

## Structure

```
card-game/
  index.html
  package.json
  css/
    base.css        variables, page background
    table.css       table layout, scores, banner
    cards.css       card faces/backs and animations
    controls.css    buttons
    log.css         page layout and the game log panel
  js/
    main.js         entry point: wires game, view and buttons
    config.js       constants (ranks, suits, 21, dealer limit)
    logic/          no DOM, testable in Node
      deck.js       build and shuffle a deck
      hand.js       hand value, natural blackjack, dealer hit rule
      game.js       round flow and results
      dealerTurn.js plays the dealer's turn one decision at a time; AI decisions, with fallback to the standard rule
    api/
      dealerClient.js  POST /api/dealer-move
    ui/
      view.js       renders the game state into the page
      logView.js    the game log panel (chat-style)
      cardElement.js builds one card element
  tests/
    tests.js
    dealerTurn.test.js
    gameLog.test.js
    logView.test.js
  server/           Express server + dealer agent (see below)
```

The server has its own `package.json`, constants and tests: `app.js`, `index.js`, `routes/dealerMove.js`, `agent/` (tool, prompt, `dealerAgent.js`), `hand.js`, `config.js`.

## Rules

- One deck, reshuffled when fewer than 15 cards remain.
- Number cards count face value, J/Q/K count 10, aces count 11 or 1.
- You can **Hit** or **Stand** (no double down, split or insurance).
- **Dealer:** the AI agent decides when to hit or stand. Only if it is unavailable does the standard rule apply (hit on 16 or less, stand on every 17, including soft 17 such as A+6).
- **Natural blackjack:** an Ace plus a 10-value card as the first two cards.
  - It is checked right after the deal, before you act.
  - Player natural only: you win. Dealer natural only: you lose.
  - Both have a natural: push.
  - A natural beats a non-natural 21 (e.g. 7+7+7).
- Going over 21 loses immediately. Equal totals are a push.
