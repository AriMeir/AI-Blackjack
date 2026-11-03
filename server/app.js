import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDealerMoveRouter } from './routes/dealerMove.js';
import { createPlayerMoveRouter } from './routes/playerMove.js';

const GAME_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Builds the Express app. `getAgent` returns the dealer agent and `getPlayerAgent` the player agent;
 * they are injected so tests can pass fakes.
 */
export function createApp({ getAgent, getPlayerAgent }) {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/api', createDealerMoveRouter(getAgent));
  app.use('/api', createPlayerMoveRouter(getPlayerAgent));
  app.use('/api', (req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Unknown API route.' } });
  });

  // Serve only the game's own files (not server/ or tests/), at http://localhost:PORT
  app.get('/', (req, res) => res.sendFile(path.join(GAME_DIR, 'index.html')));
  app.use('/css', express.static(path.join(GAME_DIR, 'css')));
  app.use('/js', express.static(path.join(GAME_DIR, 'js')));

  // Malformed JSON bodies and any other error thrown while handling a request
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'invalid_json', message: 'Request body is not valid JSON.' } });
    }
    console.error(err);
    res.status(500).json({ error: { code: 'server_error', message: 'Unexpected server error.' } });
  });

  return app;
}
