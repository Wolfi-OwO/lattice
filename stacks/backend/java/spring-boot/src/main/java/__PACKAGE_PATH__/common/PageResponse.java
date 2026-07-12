package {{javaPackage}}.common;

import java.util.List;
import org.springframework.data.domain.Page;

/**
 * Spring's Page serialises to an unstable, verbose JSON shape. This is the
 * envelope we actually commit to as an API contract.
 */
public record PageResponse<T>(List<T> items, long total, int page, int limit, int pages) {

    public static <T> PageResponse<T> from(Page<T> page) {
        return new PageResponse<>(
                page.getContent(),
                page.getTotalElements(),
                page.getNumber() + 1,
                page.getSize(),
                page.getTotalPages());
    }
}
