package {{javaPackage}}.data.remote

import kotlinx.serialization.Serializable
import retrofit2.http.GET
import retrofit2.http.Query

@Serializable
data class UserDto(
    val id: String,
    val email: String,
    val name: String,
    val role: String,
)

@Serializable
data class PageDto<T>(
    val items: List<T>,
    val total: Int,
    val page: Int,
    val pages: Int,
)

interface UserApi {

    @GET("users")
    suspend fun listUsers(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 20,
    ): PageDto<UserDto>
}
