package {{javaPackage}}.user;

import {{javaPackage}}.user.dto.UserDto;
import org.mapstruct.Mapper;

/** MapStruct generates the implementation at compile time — no reflection. */
@Mapper(componentModel = "spring")
public interface UserMapper {

    UserDto toDto(User user);
}
