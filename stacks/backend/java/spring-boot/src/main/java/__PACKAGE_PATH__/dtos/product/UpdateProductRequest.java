package {{javaPackage}}.dtos.product;

import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Every field is nullable: null means "leave it alone", which is what makes this
 * a PATCH rather than a PUT.
 *
 * `stock` is deliberately absent. It moves through POST /{id}/stock as a delta,
 * so a concurrent sale cannot be overwritten by a stale absolute value — and
 * leaving it out of this record is what makes that impossible rather than merely
 * discouraged.
 */
public record UpdateProductRequest(
        @Pattern(
                        regexp = "^[A-Za-z0-9-]{3,32}$",
                        message = "sku must be 3-32 characters of letters, digits or hyphens")
                String sku,
        @Size(min = 1, max = 200) String name,
        @Size(max = 2000) String description,
        @PositiveOrZero Long priceCents) {}
