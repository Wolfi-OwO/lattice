package {{javaPackage}}.common;

import java.time.Instant;
import java.util.List;

/**
 * The error body every failing endpoint returns. Keeping one shape means
 * clients need exactly one branch to handle failures.
 */
public record ApiErrorResponse(
        Instant timestamp,
        int status,
        String message,
        List<FieldError> details) {

    public record FieldError(String field, String message) {}

    public static ApiErrorResponse of(int status, String message) {
        return new ApiErrorResponse(Instant.now(), status, message, List.of());
    }

    public static ApiErrorResponse of(int status, String message, List<FieldError> details) {
        return new ApiErrorResponse(Instant.now(), status, message, details);
    }
}
