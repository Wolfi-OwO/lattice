package {{javaPackage}}.product;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import {{javaPackage}}.product.dto.CreateProductRequest;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ProductControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private ProductRepository repository;

    /** Every test starts from an empty table — the suite shares one H2 instance. */
    @BeforeEach
    void clear() {
        repository.deleteAll();
    }

    private static CreateProductRequest widget(String sku) {
        return new CreateProductRequest(sku, "Widget", "A widget.", 1999L, 0);
    }

    /**
     * Creates a product and returns its id.
     *
     * Deliberately not annotated: @WithMockUser only applies to test methods, so
     * an annotation here would look like it granted authentication and would not.
     * The security context comes from the calling test, which is why every test
     * that uses this helper carries the annotation itself.
     */
    private UUID create(CreateProductRequest request) throws Exception {
        String body = mockMvc.perform(post("/api/products")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();

        return UUID.fromString(objectMapper.readTree(body).get("id").asText());
    }

    @Test
    @WithMockUser
    void createsAProduct() throws Exception {
        mockMvc.perform(post("/api/products")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new CreateProductRequest("ANVIL-1", "Anvil", "Heavy.", 4500L, 3))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.sku").value("ANVIL-1"))
                .andExpect(jsonPath("$.priceCents").value(4500))
                .andExpect(jsonPath("$.stock").value(3))
                .andExpect(jsonPath("$.id").exists());
    }

    @Test
    void refusesToCreateAnonymously() throws Exception {
        mockMvc.perform(post("/api/products")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(widget("WIDGET-1"))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser
    void storesTheSkuUppercased() throws Exception {
        /*
         * Product.normaliseSku runs in @PrePersist, so this holds regardless of
         * what the caller sent — and it is what makes the unique constraint
         * case-insensitive without relying on a collation.
         */
        mockMvc.perform(post("/api/products")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(widget("widget-1"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.sku").value("WIDGET-1"));
    }

    @Test
    @WithMockUser
    void refusesADuplicateSkuRegardlessOfCase() throws Exception {
        create(widget("WIDGET-1"));

        mockMvc.perform(post("/api/products")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(widget("widget-1"))))
                .andExpect(status().isConflict());
    }

    @Test
    @WithMockUser
    void rejectsAMissingPrice() throws Exception {
        /*
         * priceCents is a boxed Long precisely so this is a 400 and not a free
         * product: a primitive would have bound the absent field to 0.
         */
        mockMvc.perform(post("/api/products")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("sku", "WIDGET-1", "name", "Widget"))))
                .andExpect(status().isBadRequest());
    }

    @Test
    @WithMockUser
    void rejectsANegativePrice() throws Exception {
        mockMvc.perform(post("/api/products")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new CreateProductRequest("WIDGET-1", "Widget", "", -1L, 0))))
                .andExpect(status().isBadRequest());
    }

    @Test
    @WithMockUser
    void rejectsAMalformedSku() throws Exception {
        mockMvc.perform(post("/api/products")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new CreateProductRequest("no spaces", "Widget", "", 100L, 0))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void listsPubliclyWithThePageEnvelope() throws Exception {
        mockMvc.perform(get("/api/products"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray())
                .andExpect(jsonPath("$.total").exists())
                .andExpect(jsonPath("$.pages").exists());
    }

    @Test
    @WithMockUser
    void findsAProductBySkuFragment() throws Exception {
        create(widget("WIDGET-1"));
        create(new CreateProductRequest("OTHER-9", "Other", "", 100L, 0));

        mockMvc.perform(get("/api/products").param("q", "OTHER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].sku").value("OTHER-9"));
    }

    @Test
    void notFoundForAnUnknownId() throws Exception {
        mockMvc.perform(get("/api/products/" + UUID.randomUUID()))
                .andExpect(status().isNotFound());
    }

    @Test
    @WithMockUser
    void updatesAField() throws Exception {
        UUID id = create(widget("WIDGET-1"));

        mockMvc.perform(patch("/api/products/" + id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Renamed\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Renamed"))
                .andExpect(jsonPath("$.sku").value("WIDGET-1"));
    }

    @Test
    @WithMockUser
    void refusesASkuTakenByAnotherProduct() throws Exception {
        create(widget("WIDGET-1"));
        UUID second = create(widget("WIDGET-2"));

        mockMvc.perform(patch("/api/products/" + second)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sku\":\"WIDGET-1\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    @WithMockUser
    void allowsAProductToKeepItsOwnSku() throws Exception {
        /*
         * The conflict check excludes the row being edited; without that, a PATCH
         * carrying the unchanged SKU would conflict with itself.
         */
        UUID id = create(widget("WIDGET-1"));

        mockMvc.perform(patch("/api/products/" + id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sku\":\"WIDGET-1\",\"name\":\"Renamed\"}"))
                .andExpect(status().isOk());
    }

    @Test
    @WithMockUser
    void ignoresStockSentToPatch() throws Exception {
        /*
         * `stock` is not a field on UpdateProductRequest, so it cannot be set this
         * way. Jackson is not configured to fail on unknown properties, so the
         * request succeeds and the value is simply not applied — what matters is
         * that stock did NOT change.
         */
        UUID id = create(new CreateProductRequest("WIDGET-1", "Widget", "", 100L, 5));

        mockMvc.perform(patch("/api/products/" + id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"stock\":999}"))
                .andExpect(jsonPath("$.stock").value(5));
    }

    @Test
    @WithMockUser
    void addsAndRemovesStock() throws Exception {
        UUID id = create(new CreateProductRequest("WIDGET-1", "Widget", "", 100L, 2));

        mockMvc.perform(post("/api/products/" + id + "/stock")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"delta\":3}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stock").value(5));

        mockMvc.perform(post("/api/products/" + id + "/stock")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"delta\":-2}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stock").value(3));
    }

    @Test
    @WithMockUser
    void refusesToTakeStockBelowZeroAndLeavesItUntouched() throws Exception {
        // A rejected movement that still wrote would be worse than no check at all.
        UUID id = create(new CreateProductRequest("WIDGET-1", "Widget", "", 100L, 1));

        mockMvc.perform(post("/api/products/" + id + "/stock")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"delta\":-2}"))
                .andExpect(status().isConflict());

        mockMvc.perform(get("/api/products/" + id)).andExpect(jsonPath("$.stock").value(1));
    }

    @Test
    @WithMockUser
    void rejectsAZeroDelta() throws Exception {
        UUID id = create(widget("WIDGET-1"));

        mockMvc.perform(post("/api/products/" + id + "/stock")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"delta\":0}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @WithMockUser
    void refusesADeleteFromANonAdmin() throws Exception {
        UUID id = create(widget("WIDGET-1"));

        mockMvc.perform(delete("/api/products/" + id)).andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void letsAnAdminDelete() throws Exception {
        UUID id = create(widget("WIDGET-1"));

        mockMvc.perform(delete("/api/products/" + id)).andExpect(status().isNoContent());
        mockMvc.perform(get("/api/products/" + id)).andExpect(status().isNotFound());
    }

    /** Guards the response contract: the entity is never serialised directly. */
    @Test
    @WithMockUser
    void returnsOnlyTheDtoFields() throws Exception {
        String body = mockMvc.perform(post("/api/products")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(widget("WIDGET-1"))))
                .andReturn()
                .getResponse()
                .getContentAsString();

        JsonNode json = objectMapper.readTree(body);
        json.fieldNames().forEachRemaining(field -> {
            if (!java.util.List.of(
                            "id",
                            "sku",
                            "name",
                            "description",
                            "priceCents",
                            "stock",
                            "createdAt",
                            "updatedAt")
                    .contains(field)) {
                throw new AssertionError("ProductDto leaked an unexpected field: " + field);
            }
        });
    }
}
