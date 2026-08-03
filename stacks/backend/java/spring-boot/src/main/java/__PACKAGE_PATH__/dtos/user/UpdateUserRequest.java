package {{javaPackage}}.dtos.user;

import jakarta.validation.constraints.Size;
import {{javaPackage}}.models.User;

public record UpdateUserRequest(@Size(min = 2, max = 80) String name, User.Role role) {}
