package {{javaPackage}}.controllers;

import jakarta.validation.Valid;
import java.net.URI;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import {{javaPackage}}.common.PageResponse;
import {{javaPackage}}.dtos.product.AdjustStockRequest;
import {{javaPackage}}.dtos.product.CreateProductRequest;
import {{javaPackage}}.dtos.product.ProductDto;
import {{javaPackage}}.dtos.product.UpdateProductRequest;
import {{javaPackage}}.services.ProductService;

/**
 * HTTP surface only: bind, delegate, shape the response. Any logic here that
 * is not about status codes belongs in ProductService.
 *
 * Reading a catalogue is public; changing it is not. That split mirrors users,
 * where anyone may register but only an authenticated caller may edit — and it
 * is declared twice on purpose: here with @PreAuthorize, and in SecurityConfig
 * where the GET routes are opened. SecurityConfig ends with
 * .anyRequest().authenticated(), so a route is closed unless both agree.
 */
@RestController
@RequestMapping("/api/products")
@RequiredArgsConstructor
public class ProductController {

    private final ProductService service;

    @GetMapping
    public PageResponse<ProductDto> list(
            @RequestParam(required = false) String q,
            @PageableDefault(size = 20) Pageable pageable) {
        return PageResponse.from(service.list(q, pageable));
    }

    @GetMapping("/{id}")
    public ProductDto get(@PathVariable UUID id) {
        return service.get(id);
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ProductDto> create(@Valid @RequestBody CreateProductRequest request) {
        ProductDto created = service.create(request);
        return ResponseEntity.created(URI.create("/api/products/" + created.id())).body(created);
    }

    @PatchMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ProductDto update(
            @PathVariable UUID id, @Valid @RequestBody UpdateProductRequest request) {
        return service.update(id, request);
    }

    /** Stock is a delta, not an assignment — see ProductService.adjustStock. */
    @PostMapping("/{id}/stock")
    @PreAuthorize("isAuthenticated()")
    public ProductDto adjustStock(
            @PathVariable UUID id, @Valid @RequestBody AdjustStockRequest request) {
        return service.adjustStock(id, request.delta());
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
