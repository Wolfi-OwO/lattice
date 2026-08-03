package {{javaPackage}}.services;

import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import {{javaPackage}}.common.ApiException;
import {{javaPackage}}.dtos.product.CreateProductRequest;
import {{javaPackage}}.dtos.product.ProductDto;
import {{javaPackage}}.dtos.product.UpdateProductRequest;
import {{javaPackage}}.mappers.ProductMapper;
import {{javaPackage}}.models.Product;
import {{javaPackage}}.repositories.ProductRepository;

/**
 * Business rules live here. No HTTP types cross this boundary, which is what
 * lets these methods be unit-tested without a web context.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ProductService {

    private final ProductRepository repository;
    private final ProductMapper mapper;

    public Page<ProductDto> list(String query, Pageable pageable) {
        Page<Product> page = (query == null || query.isBlank())
                ? repository.findAll(pageable)
                : repository.findByNameContainingIgnoreCaseOrSkuContainingIgnoreCase(
                        query, query, pageable);

        return page.map(mapper::toDto);
    }

    public ProductDto get(UUID id) {
        return repository.findById(id)
                .map(mapper::toDto)
                .orElseThrow(() -> ApiException.notFound("Product %s not found".formatted(id)));
    }

    @Transactional
    public ProductDto create(CreateProductRequest request) {
        if (repository.existsBySkuIgnoreCase(request.sku())) {
            throw ApiException.conflict("A product with SKU %s already exists".formatted(request.sku()));
        }

        Product product = Product.builder()
                .sku(request.sku())
                .name(request.name())
                /*
                 * The DTO leaves these nullable so "absent" is distinguishable from
                 * "zero"; the defaults are applied here, once, rather than at each
                 * call site.
                 */
                .description(request.description() == null ? "" : request.description())
                .priceCents(request.priceCents())
                .stock(request.stock() == null ? 0 : request.stock())
                .build();

        return mapper.toDto(repository.save(product));
    }

    @Transactional
    public ProductDto update(UUID id, UpdateProductRequest request) {
        Product product = repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Product %s not found".formatted(id)));

        if (request.sku() != null) {
            /*
             * Checked against the row being edited, not just for existence: without
             * the id comparison, a PATCH carrying the product's own unchanged SKU
             * would conflict with itself.
             */
            repository.findBySkuIgnoreCase(request.sku()).ifPresent(existing -> {
                if (!existing.getId().equals(id)) {
                    throw ApiException.conflict(
                            "A product with SKU %s already exists".formatted(request.sku()));
                }
            });
            product.setSku(request.sku());
        }

        if (request.name() != null) product.setName(request.name());
        if (request.description() != null) product.setDescription(request.description());
        if (request.priceCents() != null) product.setPriceCents(request.priceCents());

        /*
         * saveAndFlush, not a bare return of the managed entity — see UserService
         * for why: @PreUpdate fires at flush, which would otherwise happen after
         * this method returns and hand the caller a stale updatedAt.
         */
        return mapper.toDto(repository.saveAndFlush(product));
    }

    @Transactional
    public void delete(UUID id) {
        if (!repository.existsById(id)) {
            throw ApiException.notFound("Product %s not found".formatted(id));
        }
        repository.deleteById(id);
    }

    /**
     * Stock movement, expressed as a delta rather than a new absolute value.
     *
     * "Set stock to 7" loses a concurrent sale; "subtract 1" does not. This is the
     * one product operation with a real invariant — stock must not go negative —
     * and it belongs here rather than in a controller, where a caller could skip
     * it by PATCHing `stock` directly. That is also why `stock` is not a field on
     * UpdateProductRequest.
     */
    @Transactional
    public ProductDto adjustStock(UUID id, int delta) {
        if (delta == 0) {
            throw ApiException.badRequest(
                    "delta must be a non-zero integer — use a negative number to remove stock");
        }

        Product product = repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Product %s not found".formatted(id)));

        int next = product.getStock() + delta;
        if (next < 0) {
            throw ApiException.conflict(
                    "Cannot remove %d from stock — only %d of %s remain"
                            .formatted(Math.abs(delta), product.getStock(), product.getSku()));
        }

        product.setStock(next);
        return mapper.toDto(repository.saveAndFlush(product));
    }
}
