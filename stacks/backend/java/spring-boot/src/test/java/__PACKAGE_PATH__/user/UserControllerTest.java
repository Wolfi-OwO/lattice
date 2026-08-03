package {{javaPackage}}.user;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import {{javaPackage}}.dtos.user.CreateUserRequest;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class UserControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void createsUserAndNeverReturnsThePasswordHash() throws Exception {
        var request = new CreateUserRequest("ada@example.com", "Ada", "supersecret");

        mockMvc.perform(post("/api/users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.email").value("ada@example.com"))
                .andExpect(jsonPath("$.passwordHash").doesNotExist());
    }

    @Test
    void rejectsInvalidPayloadWithFieldLevelDetails() throws Exception {
        var request = new CreateUserRequest("not-an-email", "A", "short");

        mockMvc.perform(post("/api/users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Validation failed"))
                .andExpect(jsonPath("$.details").isNotEmpty());
    }

    @Test
    void listReturnsThePageEnvelope() throws Exception {
        mockMvc.perform(get("/api/users"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray())
                .andExpect(jsonPath("$.total").exists())
                .andExpect(jsonPath("$.pages").exists());
    }

    /**
     * 401, not 403. A caller with no token is told to go and get one; 403 would
     * say "authenticated, but not allowed", which is false and unactionable.
     * This route answered 403 until an authenticationEntryPoint was configured.
     */
    @Test
    void anonymousModificationIsUnauthorised() throws Exception {
        mockMvc.perform(patch("/api/users/" + UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Nobody\"}"))
                .andExpect(status().isUnauthorized());
    }

    /**
     * 403, not 500. DELETE carries @PreAuthorize("hasRole('ADMIN')"), whose denial
     * is thrown inside the dispatcher and so reaches GlobalExceptionHandler rather
     * than the filter chain. With no AccessDeniedException handler it matched the
     * catch-all and every refusal came back as "Internal server error" — telling
     * the caller to retry and the operator to hunt a fault that does not exist.
     */
    @Test
    @WithMockUser
    void deleteByANonAdminIsForbiddenNotAServerError() throws Exception {
        mockMvc.perform(delete("/api/users/" + UUID.randomUUID()))
                .andExpect(status().isForbidden());
    }
}
