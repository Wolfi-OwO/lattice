import { ping } from '../../database/index.js';

/**
 * Liveness and readiness are different questions, and conflating them is how a
 * database blip becomes an outage.
 *
 *   /live   "is this process alive?"        — never touches the database
 *   /ready  "should traffic be sent here?"  — does
 *
 * If liveness checked the database, a slow database would read as a dead
 * process; every replica would fail liveness at once and the orchestrator would
 * restart the entire fleet. Dependency health is a readiness question.
 */

let draining = false;

/** Called by the shutdown handler in server.js, before the socket closes. */
export function setDraining() {
  draining = true;
}

export async function healthRoutes(app) {
  app.get('/live', async () => ({ status: 'ok', uptime: process.uptime() }));

  app.get('/ready', async (_request, reply) => {
    if (draining) {
      return reply.status(503).send({ status: 'shutting_down', storage: 'draining' });
    }

    const up = await ping();
    if (!up) {
      return reply.status(503).send({ status: 'error', storage: 'down' });
    }

    return { status: 'ok', storage: 'up' };
  });
}
