package {{javaPackage}}.data.remote

import {{javaPackage}}.BuildConfig
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/**
 * One Retrofit instance for the whole app. Building a new one per request
 * would throw away OkHttp's connection pool and thread pool.
 */
object ApiClient {

    private var authToken: String? = null

    fun setAuthToken(token: String?) {
        authToken = token
    }

    private val json = Json {
        ignoreUnknownKeys = true // Backend may add fields; don't crash on them.
    }

    private val okHttp = OkHttpClient.Builder()
        .addInterceptor { chain ->
            val request = chain.request().newBuilder()
                .apply { authToken?.let { header("Authorization", "Bearer $it") } }
                .build()
            chain.proceed(request)
        }
        .addInterceptor(
            HttpLoggingInterceptor().apply {
                level = if (BuildConfig.DEBUG) {
                    HttpLoggingInterceptor.Level.BODY
                } else {
                    HttpLoggingInterceptor.Level.NONE
                }
            }
        )
        .build()

    val userApi: UserApi = Retrofit.Builder()
        .baseUrl(BuildConfig.API_BASE_URL)
        .client(okHttp)
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
        .build()
        .create(UserApi::class.java)
}
