/**
 * Liveness — "is this process alive", and nothing more.
 *
 * Two rules this endpoint must obey, both of which are load-bearing:
 *
 *   1. It must not touch the database. A liveness probe that checks a dependency
 *      turns a slow database into a restart loop: the database blips, every
 *      replica reports dead, the orchestrator kills them all, and now the outage
 *      is yours too. Dependency health is *readiness*, which is in server.js.
 *
 *   2. It must keep answering 200 while the process is shutting down. Terminus
 *      fails every probe it owns once a signal arrives — correct for readiness,
 *      fatal for liveness, because a failing liveness probe makes the kubelet
 *      SIGKILL the pod *mid-drain*, which is precisely what graceful shutdown
 *      exists to prevent. So liveness is deliberately served here by Fastify and
 *      not handed to terminus.
 *
 * /api/health/readiness is therefore NOT in this file. It is registered on the
 * http.Server by terminus, underneath Fastify — the only place it can answer 503
 * from the instant a signal lands while the app above goes on serving the
 * requests already in flight.
 */
export async function healthRoutes(app) {
  app.get('/liveness', async () => ({ status: 'ok', uptime: process.uptime() }));
}
