package {{javaPackage}}.product.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * What the API returns. Products have nothing to hide today, so this looks
 * redundant next to the entity — it exists anyway for the same reason UserDto
 * does: the entity is never serialised directly, so the day a product grows a
 * cost price or a supplier margin, there is already exactly one place that
 * decides whether it is public.
 */
public record ProductDto(
        UUID id,
        String sku,
        String name,
        String description,
        long priceCents,
        int stock,
        Instant createdAt,
        Instant updatedAt) {}
