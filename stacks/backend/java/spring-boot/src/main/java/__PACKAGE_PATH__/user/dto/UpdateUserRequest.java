package {{javaPackage}}.user.dto;

import jakarta.validation.constraints.Size;
import {{javaPackage}}.user.User;

public record UpdateUserRequest(@Size(min = 2, max = 80) String name, User.Role role) {}
