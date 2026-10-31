package com.minimal.template.presentation.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.minimal.template.domain.model.GlobalQuotaStatus
import com.minimal.template.domain.model.User
import com.minimal.template.domain.repository.LegalHelpRepository
import com.minimal.template.domain.util.result.Result
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SettingsUiState(
    val isLoading: Boolean = false,
    val user: User? = null,
    val quotaStatus: GlobalQuotaStatus? = null,
    val email: String? = null,
    val isSignedOut: Boolean = false
)

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val repository: LegalHelpRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(SettingsUiState())
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()

    init {
        loadSettings()
    }

    fun loadSettings() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(
                isLoading = true,
                email = repository.getUserEmail()
            )

            val profileRes = repository.getProfile()
            val quotaRes = repository.getUsageStatus()

            _uiState.value = _uiState.value.copy(
                isLoading = false,
                user = (profileRes as? Result.Success)?.data,
                quotaStatus = (quotaRes as? Result.Success)?.data
            )
        }
    }

    fun signOut() {
        repository.clearSession()
        _uiState.value = _uiState.value.copy(isSignedOut = true)
    }
}

