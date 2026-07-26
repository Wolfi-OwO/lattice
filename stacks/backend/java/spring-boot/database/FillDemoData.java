/*
 * Lives in database/, not src/main/java/, because CONVENTIONS.md rule 5 keeps a
 * backend's demo data and the code that loads it in one place. pom.xml adds this
 * directory as a second compile source root; the package below is what decides
 * where the class actually lands, and it has to stay under {{javaPackage}} so
 * Spring's component scan reaches it.
 */
package {{javaPackage}}.database;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import {{javaPackage}}.product.Product;
import {{javaPackage}}.product.ProductRepository;
import {{javaPackage}}.user.User;
import {{javaPackage}}.user.UserRepository;

/**
 * Loads database/data/&lt;domain&gt;.json into whatever storage this project was
 * scaffolded with.
 *
 * <pre>
 *   mvn spring-boot:run -Dspring-boot.run.profiles=seed
 *   mvn spring-boot:run -Dspring-boot.run.profiles=seed -Dspring-boot.run.arguments=--reset
 * </pre>
 *
 * It goes through {@link UserRepository} — the same repository the services use —
 * and never through JDBC. That is what makes one loader work unchanged against
 * Postgres and against every other storage the template supports: the loader does
 * not know which one is underneath, and does not need to.
 *
 * <p>{@code @Profile("seed")} is load-bearing. {@code @SpringBootTest} boots the
 * application the same way {@code main} does, runners included, so without it
 * `mvn test` would seed its own test database on every run.
 */
@Component
@Profile("seed")
@RequiredArgsConstructor
public class FillDemoData implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(FillDemoData.class);

    /**
     * Relative on purpose: the loader is run through the Maven plugin, whose
     * working directory pom.xml pins to the project root. Run it any other way
     * and you must run it from the project root too.
     */
    private static final Path DATA_DIRECTORY = Path.of("database", "data");

    private final UserRepository users;
    private final ProductRepository products;
    private final PasswordEncoder passwordEncoder;
    private final ObjectMapper objectMapper;
    private final ConfigurableApplicationContext context;

    /**
     * How a row in data/&lt;domain&gt;.json becomes a row in the database.
     *
     * <p>One entry per domain. A data file with no entry here is a mistake worth
     * hearing about, so it is reported rather than skipped quietly.
     */
    private Map<String, DomainLoader> domains() {
        return Map.of("users", this::fillUsers, "products", this::fillProducts);
    }

    @Override
    public void run(String... arguments) {
        boolean reset = List.of(arguments).contains("--reset");

        if (reset) {
            log.warn("--reset: existing rows will be deleted");
        }

        try {
            for (Path file : dataFiles()) {
                String domain = domainOf(file);
                DomainLoader loader = domains().get(domain);

                if (loader == null) {
                    log.warn(
                            "No loader registered for \"{}\" — add it to domains() in FillDemoData.java",
                            domain);
                    continue;
                }

                Result result = loader.fill(file, reset);
                log.info("{}: {} created, {} already there", domain, result.created(), result.updated());
            }
        } catch (IOException failure) {
            log.error("Seeding failed: {}", failure.getMessage());
            System.exit(SpringApplication.exit(context, () -> 1));
        }

        /*
         * The seed profile still boots the web layer (application-seed.yml says
         * why), so Tomcat would otherwise hold this JVM open forever. Seeding is a
         * task: it has to end, and it has to end with an exit code CI can read.
         */
        System.exit(SpringApplication.exit(context, () -> 0));
    }

    /**
     * Matched on email, which is the natural key the API already enforces as
     * unique. Re-running therefore updates the name and role of a demo user rather
     * than failing on a duplicate — seeding is not a once-per-database event.
     */
    private Result fillUsers(Path file, boolean reset) throws IOException {
        if (reset) {
            users.deleteAll();
        }

        int created = 0;
        int updated = 0;

        for (DemoUser row : read(file, new TypeReference<List<DemoUser>>() {})) {
            User.Role role = Optional.ofNullable(row.role())
                    .map(name -> User.Role.valueOf(name.toUpperCase()))
                    .orElse(User.Role.USER);

            Optional<User> existing = users.findByEmail(row.email());

            if (existing.isPresent()) {
                User user = existing.get();
                user.setName(row.name());
                user.setRole(role);
                users.save(user);
                updated++;
                continue;
            }

            /*
             * Hashed here with the encoder the API itself uses, so a demo account
             * can actually log in. The plaintext in the JSON never reaches the
             * database.
             */
            users.save(User.builder()
                    .email(row.email())
                    .name(row.name())
                    .role(role)
                    .passwordHash(passwordEncoder.encode(row.password()))
                    .build());
            created++;
        }

        return new Result(created, updated);
    }

    /**
     * Matched on SKU, the natural key the API already enforces as unique — so a
     * second run adjusts price and stock rather than failing on a duplicate.
     */
    private Result fillProducts(Path file, boolean reset) throws IOException {
        if (reset) {
            products.deleteAll();
        }

        int created = 0;
        int updated = 0;

        for (DemoProduct row : read(file, new TypeReference<List<DemoProduct>>() {})) {
            Optional<Product> existing = products.findBySkuIgnoreCase(row.sku());

            if (existing.isPresent()) {
                Product product = existing.get();
                product.setName(row.name());
                product.setDescription(row.description() == null ? "" : row.description());
                product.setPriceCents(row.priceCents());
                product.setStock(row.stock() == null ? 0 : row.stock());
                products.save(product);
                updated++;
                continue;
            }

            products.save(Product.builder()
                    .sku(row.sku())
                    .name(row.name())
                    .description(row.description() == null ? "" : row.description())
                    .priceCents(row.priceCents())
                    .stock(row.stock() == null ? 0 : row.stock())
                    .build());
            created++;
        }

        return new Result(created, updated);
    }

    private <T> T read(Path file, TypeReference<T> shape) throws IOException {
        try {
            return objectMapper.readValue(file.toFile(), shape);
        } catch (IOException malformed) {
            throw new IOException("%s must contain a JSON array: %s".formatted(file, malformed.getMessage()));
        }
    }

    private List<Path> dataFiles() throws IOException {
        if (!Files.isDirectory(DATA_DIRECTORY)) {
            throw new IOException(
                    "%s not found — run this from the project root".formatted(DATA_DIRECTORY.toAbsolutePath()));
        }

        try (var entries = Files.list(DATA_DIRECTORY)) {
            return entries
                    .filter(path -> path.getFileName().toString().endsWith(".json"))
                    .sorted(Comparator.comparing(Path::getFileName))
                    .toList();
        }
    }

    private String domainOf(Path file) {
        String name = file.getFileName().toString();
        return name.substring(0, name.length() - ".json".length());
    }

    @FunctionalInterface
    private interface DomainLoader {
        Result fill(Path file, boolean reset) throws IOException;
    }

    private record Result(int created, int updated) {}

    /**
     * The shape of one row in data/users.json. {@code role} is optional.
     *
     * <p>Public because Jackson binds to the canonical constructor by reflection,
     * and a private record would leave it fighting the access check.
     */
    public record DemoUser(String email, String name, String password, String role) {}

    /**
     * The shape of one row in data/products.json. {@code description} and
     * {@code stock} are optional; boxed so an absent one is null rather than a
     * silent zero.
     */
    public record DemoProduct(
            String sku, String name, String description, Long priceCents, Integer stock) {}
}
