package {{javaPackage}}.mappers;

import org.mapstruct.Mapper;
import {{javaPackage}}.dtos.product.ProductDto;
import {{javaPackage}}.models.Product;

/** MapStruct generates the implementation at compile time — no reflection. */
@Mapper(componentModel = "spring")
public interface ProductMapper {

    ProductDto toDto(Product product);
}
