package {{javaPackage}}.models;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.*;

@Entity
@Table(name = "products")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Product {

    @Id
    @GeneratedValue
    private UUID id;

    /** SKU is to a product what email is to a user: the key a human already knows. */
    @Column(nullable = false, unique = true, length = 64)
    private String sku;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, columnDefinition = "TEXT")
    @Builder.Default
    private String description = "";

    /**
     * Integer cents, never a float or a double. Binary floating point cannot hold
     * 0.10 exactly, and money that drifts by a cent is a bug nobody can reproduce.
     * The unit is in the name so no caller has to guess which one it is.
     *
     * BigDecimal would also be correct, but it is a heavier type for what is
     * genuinely a count, and it invites the same rounding questions back in.
     */
    @Column(name = "price_cents", nullable = false)
    private long priceCents;

    @Column(nullable = false)
    @Builder.Default
    private int stock = 0;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /**
     * See User.onCreate — the timestamps belong to the entity, not to a caller.
     *
     * SKU normalisation rides along here rather than in its own callback: JPA
     * allows exactly one @PrePersist method per entity class, so a second one
     * would fail at boot rather than run. It belongs on the entity either way,
     * because the unique constraint applies to the *stored* value — normalising
     * later means two rows the database calls distinct and a human does not.
     */
    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
        normaliseSku();
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
        normaliseSku();
    }

    private void normaliseSku() {
        if (sku != null) sku = sku.toUpperCase();
    }
}
