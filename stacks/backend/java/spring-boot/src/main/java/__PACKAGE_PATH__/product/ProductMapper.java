package {{javaPackage}}.product;

import {{javaPackage}}.product.dto.ProductDto;
import org.mapstruct.Mapper;

/** MapStruct generates the implementation at compile time — no reflection. */
@Mapper(componentModel = "spring")
public interface ProductMapper {

    ProductDto toDto(Product product);
}
