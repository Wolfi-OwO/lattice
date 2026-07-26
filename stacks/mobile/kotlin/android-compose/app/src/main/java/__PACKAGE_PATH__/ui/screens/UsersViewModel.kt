package {{javaPackage}}.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import {{javaPackage}}.data.remote.UserDto
import {{javaPackage}}.data.repository.UserRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * One immutable state object per screen. The UI is a pure function of it —
 * that is what makes Compose recomposition predictable.
 */
data class UsersUiState(
    val users: List<UserDto> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
)

class UsersViewModel(
    private val repository: UserRepository = UserRepository(),
) : ViewModel() {

    private val _state = MutableStateFlow(UsersUiState())
    val state: StateFlow<UsersUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        /*
         * viewModelScope is cancelled when the ViewModel clears, so a rotation
         * mid-request cannot leak a coroutine.
         */
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)

            repository.getUsers()
                .onSuccess { users ->
                    _state.value = UsersUiState(users = users, isLoading = false)
                }
                .onFailure { throwable ->
                    _state.value = UsersUiState(
                        isLoading = false,
                        error = throwable.message ?: "Could not load users",
                    )
                }
        }
    }
}
