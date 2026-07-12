package {{javaPackage}}.data.repository

import {{javaPackage}}.data.remote.ApiClient
import {{javaPackage}}.data.remote.UserApi
import {{javaPackage}}.data.remote.UserDto

/**
 * The repository is the boundary the ViewModel talks to. It hides *where* data
 * comes from, so adding a cache or an offline store later changes only this
 * file. The api is injected so a test can pass a fake.
 */
class UserRepository(private val api: UserApi = ApiClient.userApi) {

    suspend fun getUsers(page: Int = 1): Result<List<UserDto>> = runCatching {
        api.listUsers(page = page).items
    }
}
