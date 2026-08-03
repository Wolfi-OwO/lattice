package {{javaPackage}}.dtos.user;

import java.time.Instant;
import java.util.UUID;
import {{javaPackage}}.models.User;

/**
 * What the API returns. Deliberately has no passwordHash — the entity is never
 * serialised directly, so a new sensitive column cannot leak by accident.
 */
public record UserDto(
        UUID id, String email, String name, User.Role role, Instant createdAt, Instant updatedAt) {}
