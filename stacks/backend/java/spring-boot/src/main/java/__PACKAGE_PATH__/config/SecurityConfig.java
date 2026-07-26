package {{javaPackage}}.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import {{javaPackage}}.common.ApiErrorResponse;
import {{javaPackage}}.security.JwtAuthenticationFilter;

@Configuration
@EnableMethodSecurity // turns on @PreAuthorize
@RequiredArgsConstructor
public class SecurityConfig {

    /**
     * A private mapper, not the application's: this writes from inside the filter
     * chain, where the Spring MVC one is not guaranteed to be available yet. The
     * JavaTimeModule is what keeps ApiErrorResponse.timestamp an ISO-8601 string
     * rather than serialising Instant as a numeric array.
     */
    private static final ObjectMapper MAPPER = new ObjectMapper().registerModule(new JavaTimeModule());

    private final JwtAuthenticationFilter jwtFilter;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
                // Stateless JWT auth: there is no session cookie for CSRF to protect.
                .csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        /*
                         * The probes are moved off /actuator to /api/health in
                         * application.yml, to match the contract every backend keeps.
                         * A probe behind authentication is not a probe: the kubelet
                         * sends no bearer token, reads the 401 as "not alive", and
                         * restarts a process that was perfectly healthy.
                         */
                        .requestMatchers("/api/health/**").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/users").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/users/**").permitAll()
                        /*
                         * Reading the catalogue is public; changing it is not. Only
                         * GET is opened here — every other verb on /api/products
                         * falls through to authenticated() below, and the controller
                         * states the same rule again with @PreAuthorize.
                         */
                        .requestMatchers(HttpMethod.GET, "/api/products/**").permitAll()
                        .anyRequest().authenticated())
                /*
                 * Without this, an anonymous request to a protected route answers
                 * 403. That is the wrong code and a genuinely unhelpful one: 403
                 * means "authenticated, but not allowed", so a client that has no
                 * token at all is told refreshing it will not help. 401 is the
                 * answer that tells it to go and get one.
                 *
                 * Spring only defaults to 403 here because the chain is stateless
                 * and no entry point was named. Express and Fastify both return
                 * 401 for the same request; this makes the three agree.
                 */
                .exceptionHandling(handling -> handling
                        .authenticationEntryPoint(
                                (request, response, ex) -> write(response, HttpStatus.UNAUTHORIZED, "Unauthorized"))
                        .accessDeniedHandler(
                                (request, response, ex) -> write(response, HttpStatus.FORBIDDEN, "Forbidden")))
                .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class)
                .build();
    }

    /**
     * These two run in the filter chain, before any controller, so
     * GlobalExceptionHandler cannot shape them — the response has to be written by
     * hand. It is written to the same ApiErrorResponse shape anyway, so a client
     * still needs exactly one branch to handle failures.
     */
    private static void write(HttpServletResponse response, HttpStatus status, String message)
            throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter()
                .write(MAPPER.writeValueAsString(ApiErrorResponse.of(status.value(), message)));
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
