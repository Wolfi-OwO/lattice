package {{javaPackage}}.mappers;

import org.mapstruct.Mapper;
import {{javaPackage}}.dtos.user.UserDto;
import {{javaPackage}}.models.User;

/** MapStruct generates the implementation at compile time — no reflection. */
@Mapper(componentModel = "spring")
public interface UserMapper {

    UserDto toDto(User user);
}
