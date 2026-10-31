package com.minimal.template.presentation.ui.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.minimal.template.domain.model.CircuitBreakerStatus
import com.minimal.template.domain.model.Conversation
import com.minimal.template.domain.model.User
import com.minimal.template.domain.repository.LegalHelpRepository
import com.minimal.template.domain.util.result.Result
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class DashboardUiState(
    val isLoading: Boolean = false,
    val conversations: List<Conversation> = emptyList(),
    val userProfile: User? = null,
    val circuitBreaker: CircuitBreakerStatus = CircuitBreakerStatus(),
    val errorMessage: String? = null,
    val infoMessage: String? = null
)

@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val repository: LegalHelpRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(DashboardUiState())
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

    init {
        loadDashboardData()
    }

    fun loadDashboardData() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)

            val profileRes = repository.getProfile()
            val convRes = repository.getConversations()
            val usageRes = repository.getUsageStatus()

            val profile = (profileRes as? Result.Success)?.data
            val convs = (convRes as? Result.Success)?.data ?: emptyList()
            val circuit = (usageRes as? Result.Success)?.data?.circuitBreaker ?: CircuitBreakerStatus()

            val error = (convRes as? Result.Error)?.exception?.message
                ?: (profileRes as? Result.Error)?.exception?.message

            _uiState.value = _uiState.value.copy(
                isLoading = false,
                conversations = convs,
                userProfile = profile,
                circuitBreaker = circuit,
                errorMessage = error
            )
        }
    }

    fun createConversation(title: String, onSuccess: (String) -> Unit) {
        if (title.isBlank()) return
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            when (val res = repository.createConversation(title.trim())) {
                is Result.Success -> {
                    _uiState.value = _uiState.value.copy(isLoading = false)
                    loadDashboardData()
                    onSuccess(res.data.id)
                }
                is Result.Error -> {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = res.exception.message ?: "Failed to create conversation"
                    )
                }
                Result.Loading -> Unit
            }
        }
    }

    fun renameConversation(id: String, newTitle: String) {
        if (newTitle.isBlank()) return
        viewModelScope.launch {
            when (val res = repository.renameConversation(id, newTitle.trim())) {
                is Result.Success -> loadDashboardData()
                is Result.Error -> {
                    _uiState.value = _uiState.value.copy(
                        errorMessage = res.exception.message ?: "Failed to rename conversation"
                    )
                }
                Result.Loading -> Unit
            }
        }
    }

    fun deleteConversation(id: String) {
        viewModelScope.launch {
            when (val res = repository.deleteConversation(id)) {
                is Result.Success -> {
                    _uiState.value = _uiState.value.copy(
                        infoMessage = "Conversation deleted. Lifetime conversation quota is preserved."
                    )
                    loadDashboardData()
                }
                is Result.Error -> {
                    _uiState.value = _uiState.value.copy(
                        errorMessage = res.exception.message ?: "Failed to delete conversation"
                    )
                }
                Result.Loading -> Unit
            }
        }
    }

    fun dismissMessages() {
        _uiState.value = _uiState.value.copy(errorMessage = null, infoMessage = null)
    }
}

