package {{javaPackage}}.dtos.product;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * priceCents is a boxed Long rather than a primitive long on purpose. A missing
 * field binds a primitive to 0, which is a *valid* price — so an omitted price
 * would silently create a free product instead of failing validation. Boxed, it
 * binds to null and @NotNull catches it.
 */
public record CreateProductRequest(
        @NotBlank
                @Pattern(
                        regexp = "^[A-Za-z0-9-]{3,32}$",
                        message = "sku must be 3-32 characters of letters, digits or hyphens")
                String sku,
        @NotBlank @Size(min = 1, max = 200) String name,
        @Size(max = 2000) String description,
        @NotNull @PositiveOrZero Long priceCents,
        @PositiveOrZero Integer stock) {}
