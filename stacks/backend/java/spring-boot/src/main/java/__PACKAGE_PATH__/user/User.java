package {{javaPackage}}.user;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.*;

@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(nullable = false)
    private String name;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private Role role = Role.USER;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /**
     * Both timestamps are owned by the lifecycle callbacks, not by the service.
     * createdAt was already set here; updatedAt joins it rather than being
     * assigned at each call site, because a caller that forgets is a NOT NULL
     * violation at flush — and because "every write refreshes updatedAt" is a
     * property of the entity, not of one service method.
     */
    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        // Same instant, not a second Instant.now(): a row that has never been
        // updated must read createdAt == updatedAt, not "a few microseconds off".
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public enum Role {
        USER,
        ADMIN
    }
}
