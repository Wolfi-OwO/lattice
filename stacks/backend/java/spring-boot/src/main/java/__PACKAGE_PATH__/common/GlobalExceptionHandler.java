package {{javaPackage}}.common;

import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Maps exceptions to responses in one place, so controllers contain no
 * try/catch and no status-code logic.
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ApiErrorResponse> handleApi(ApiException ex) {
        return ResponseEntity.status(ex.getStatus())
                .body(ApiErrorResponse.of(ex.getStatus().value(), ex.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiErrorResponse> handleValidation(MethodArgumentNotValidException ex) {
        List<ApiErrorResponse.FieldError> details = ex.getBindingResult().getFieldErrors().stream()
                .map(error -> new ApiErrorResponse.FieldError(
                        error.getField(), error.getDefaultMessage()))
                .toList();

        return ResponseEntity.badRequest()
                .body(ApiErrorResponse.of(400, "Validation failed", details));
    }

    /**
     * A @PreAuthorize denial is thrown inside the dispatcher, not in the filter
     * chain, so Spring Security's ExceptionTranslationFilter never sees it and it
     * lands here. Without this handler it matched the catch-all below and every
     * "you may not do that" came back as 500 Internal server error — which tells
     * the caller to retry, and tells the operator to go looking for a fault that
     * does not exist.
     *
     * AuthorizationDeniedException extends AccessDeniedException, so catching the
     * parent covers both the method-security and the manual forms.
     */
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiErrorResponse> handleAccessDenied(AccessDeniedException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ApiErrorResponse.of(HttpStatus.FORBIDDEN.value(), "Forbidden"));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiErrorResponse> handleUnexpected(Exception ex) {
        // Unexpected: log the stack, but never leak internals to the caller.
        log.error("Unhandled exception", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiErrorResponse.of(500, "Internal server error"));
    }
}
