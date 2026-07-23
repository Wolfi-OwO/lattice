package {{javaPackage}}.product.dto;

import jakarta.validation.constraints.NotNull;

/**
 * Stock movement, expressed as a delta rather than a new absolute value.
 *
 * Boxed Integer for the same reason CreateProductRequest boxes its price: a
 * primitive would bind a missing field to 0, and 0 is the one value this
 * deliberately rejects — so an omitted delta would be indistinguishable from a
 * no-op the caller did not ask for.
 */
public record AdjustStockRequest(@NotNull Integer delta) {}
