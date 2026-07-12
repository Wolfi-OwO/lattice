package {{javaPackage}}.user;

import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import {{javaPackage}}.common.ApiException;
import {{javaPackage}}.user.dto.CreateUserRequest;
import {{javaPackage}}.user.dto.UpdateUserRequest;
import {{javaPackage}}.user.dto.UserDto;

/**
 * Business rules live here. No HTTP types cross this boundary, which is what
 * lets these methods be unit-tested without a web context.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class UserService {

    private final UserRepository repository;
    private final UserMapper mapper;
    private final PasswordEncoder passwordEncoder;

    public Page<UserDto> list(String query, Pageable pageable) {
        Page<User> page = (query == null || query.isBlank())
                ? repository.findAll(pageable)
                : repository.findByNameContainingIgnoreCaseOrEmailContainingIgnoreCase(
                        query, query, pageable);

        return page.map(mapper::toDto);
    }

    public UserDto get(UUID id) {
        return repository.findById(id)
                .map(mapper::toDto)
                .orElseThrow(() -> ApiException.notFound("User %s not found".formatted(id)));
    }

    @Transactional
    public UserDto create(CreateUserRequest request) {
        if (repository.existsByEmail(request.email())) {
            throw ApiException.conflict("A user with email %s already exists".formatted(request.email()));
        }

        User user = User.builder()
                .email(request.email())
                .name(request.name())
                .passwordHash(passwordEncoder.encode(request.password()))
                .build();

        return mapper.toDto(repository.save(user));
    }

    @Transactional
    public UserDto update(UUID id, UpdateUserRequest request) {
        User user = repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("User %s not found".formatted(id)));

        if (request.name() != null) user.setName(request.name());
        if (request.role() != null) user.setRole(request.role());

        return mapper.toDto(user); // Managed entity: JPA flushes on commit.
    }

    @Transactional
    public void delete(UUID id) {
        if (!repository.existsById(id)) {
            throw ApiException.notFound("User %s not found".formatted(id));
        }
        repository.deleteById(id);
    }
}
