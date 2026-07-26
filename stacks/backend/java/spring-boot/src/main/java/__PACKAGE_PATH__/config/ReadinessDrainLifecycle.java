package {{javaPackage}}.config;

import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.availability.AvailabilityChangeEvent;
import org.springframework.boot.availability.ReadinessState;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * The gap between "graceful shutdown" and *actually* not dropping requests.
 *
 * `server.shutdown: graceful` alone is not enough, and it is worth being precise
 * about why, because the name suggests it is. What it does is stop accepting new
 * connections and let the requests already in flight finish. What it does NOT do is
 * tell anyone first — and it stops accepting immediately, so the readiness probe
 * does not go to 503, it becomes *unreachable*.
 *
 * That is the wrong signal at the worst moment. A load balancer's endpoint list is
 * eventually consistent: for a beat after this process decides to die it is still
 * being sent new connections, and those now hit a paused connector. Refused, not
 * drained. The requests graceful shutdown exists to protect are the in-flight ones;
 * these are the ones that never got in.
 *
 * So this runs first, and buys the window that makes readiness mean something:
 *
 *   1. publish REFUSING_TRAFFIC  ->  /api/health/readiness answers 503 immediately,
 *                                    while the server is still accepting and serving
 *   2. wait                      ->  the load balancer notices and takes us out of
 *                                    rotation, so no new work arrives
 *   3. return                    ->  only now does Spring pause the connector and
 *                                    drain what is left
 *
 * Liveness is untouched throughout and keeps answering 200 — a failing liveness
 * probe makes the kubelet SIGKILL the pod mid-drain, killing the very drain this
 * exists to perform.
 *
 * This is the same shape the JavaScript backends get from terminus's `beforeShutdown`,
 * and the Python one from its patched signal handler. Three languages, one behaviour.
 *
 * HOW THE ORDERING IS ACHIEVED
 * SmartLifecycle beans are stopped in DESCENDING phase order, so the highest phase
 * stops first. Spring Boot's own graceful-shutdown lifecycle sits below
 * SmartLifecycle.DEFAULT_PHASE, so DEFAULT_PHASE puts this ahead of it. The ordering
 * is the entire mechanism: at any lower phase the connector would already be paused
 * and the announcement would be shouted at a closed door.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ReadinessDrainLifecycle implements SmartLifecycle {

    private final ApplicationEventPublisher events;

    /**
     * How long readiness reports 503 before the server stops accepting. Zero in the
     * test profile, so the suite does not pay for it; override with SHUTDOWN_GRACE.
     */
    @Value("${app.shutdown.grace:5s}")
    private Duration grace;

    private volatile boolean running;

    @Override
    public int getPhase() {
        // Highest phase => stopped first => before the web server pauses. See above.
        return SmartLifecycle.DEFAULT_PHASE;
    }

    @Override
    public void start() {
        running = true;
    }

    @Override
    public boolean isRunning() {
        return running;
    }

    @Override
    public void stop() {
        running = false;

        log.info("Shutdown signal received — readiness now refusing traffic");
        AvailabilityChangeEvent.publish(events, this, ReadinessState.REFUSING_TRAFFIC);

        if (grace.isZero() || grace.isNegative()) {
            return;
        }

        try {
            log.info("Draining for {} before the server stops accepting", grace);
            Thread.sleep(grace.toMillis());
        } catch (InterruptedException interrupted) {
            /*
             * Someone wants us gone now. Honour that rather than finishing the nap:
             * re-assert the flag so the shutdown that follows still sees it.
             */
            Thread.currentThread().interrupt();
        }
    }
}
