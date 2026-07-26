# Health probes and shutdown

Every generated backend exposes two probes, and they are **meant to disagree**.

```
GET /api/health/liveness    200 while alive, even while draining
GET /api/health/readiness   503 while draining, or if storage is down
```

## Why two

They answer different questions, and an orchestrator does different things with
the answers.

| | Liveness | Readiness |
| --- | --- | --- |
| Asks | "Is this process alive?" | "Should traffic come here?" |
| Failing means | The process is wedged | Not now — try another instance |
| Kubernetes responds by | **SIGKILL and restart** | Removing it from the load balancer |

Collapsing them into one endpoint is the common mistake, and it is not a
cosmetic one. If the single probe reports "not ready" during a graceful
shutdown, Kubernetes reads that as *liveness* failing and **SIGKILLs the pod
mid-drain** — killing the in-flight requests that draining exists to protect.

So during shutdown:

- **readiness turns 503 immediately**, which is what lets the load balancer take
  the instance out of rotation *before* the socket closes;
- **liveness stays 200**, because the process is fine. It is finishing work.

## The drain

On `SIGTERM` (or `SIGINT`):

1. **Readiness flips to 503.**
2. **A pause** — five seconds, in production only. Readiness is already failing,
   but endpoint propagation is eventually consistent, so the load balancer has
   not necessarily noticed yet. Closing the socket at this moment still drops
   live requests. The pause is the difference between "we stopped saying we were
   ready" and "everyone stopped sending us traffic".
3. **In-flight requests finish**, with a hard 10-second cap before the process is
   torn down regardless.
4. **Storage is disconnected.**
5. The process exits.

This is verified with a **real SIGTERM** in the generated project's own test
suite, not asserted in a comment. A shutdown path that has never received the
signal it exists to handle is a shutdown path that does not work — it is the
single most common thing to get wrong and the least likely to be noticed,
because nothing fails until production traffic is being dropped during a deploy.

## Served by different layers, on purpose

The two probes are deliberately not implemented in the same place.

Readiness is answered by the shutdown machinery — `@godaddy/terminus` in the Node
backends — because that is the thing that actually knows whether a drain is in
progress, and it is the thing that runs the storage `ping()`.

Liveness is answered by Express directly, and is **deliberately not registered
with terminus**. Terminus fails every probe it owns the moment a signal arrives.
That is correct for readiness and fatal for liveness: handing liveness to
terminus would make the kubelet SIGKILL the pod mid-drain, which is precisely
what graceful shutdown exists to prevent.

Liveness also **must not touch the database**, for the mirror-image reason. A
liveness probe that checks a dependency turns a slow database into a restart
loop: the database blips, every replica reports dead, the orchestrator kills them
all, and now the outage is yours too.

## Storage going away is not death

A scaffolded app survives its database disappearing:

- readiness reports `storage: down` and returns 503;
- the process **keeps running**;
- it recovers on its own when the database comes back.

The alternative — exiting when the database is unreachable — turns a thirty-second
database restart into a crash-loop across every instance you have, and the
restarts consume the connection capacity the database needs to come back.

```console
$ curl -s localhost:3000/api/health/readiness
{"status":"ok","info":{"storage":"up"},"details":{"storage":"up"}}

$ docker compose stop database
$ curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/api/health/readiness
503

$ curl -s localhost:3000/api/health/liveness
{"status":"ok","uptime":184.02}
```

Liveness never wavered, which is the point: nothing is wrong with the process.

## In a deployment

```yaml
livenessProbe:
  httpGet: { path: /api/health/liveness, port: 3000 }
  periodSeconds: 10
readinessProbe:
  httpGet: { path: /api/health/readiness, port: 3000 }
  periodSeconds: 5
```

Point them at the same path and you have built the crash-during-deploy described
above.
