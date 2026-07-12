import { Router } from 'express';

export const healthRoutes = Router();

/**
 * Liveness — "is this process alive", and nothing more.
 *
 * Two rules this endpoint must obey, both of which are load-bearing:
 *
 *   1. It must not touch the database. A liveness probe that checks a
 *      dependency turns a slow database into a restart loop: the DB blips, every
 *      replica reports dead, the orchestrator kills them all, and now the outage
 *      is yours too. Dependency health is *readiness*, which is in server.js.
 *
 *   2. It must keep answering 200 while the process is shutting down. Terminus
 *      fails every probe it owns once a signal arrives — correct for readiness,
 *      fatal for liveness, because a failing liveness probe makes the kubelet
 *      SIGKILL the pod *mid-drain*, which is precisely what graceful shutdown
 *      exists to prevent. So liveness is deliberately served here by Express and
 *      not handed to terminus.
 */
healthRoutes.get('/live', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});
