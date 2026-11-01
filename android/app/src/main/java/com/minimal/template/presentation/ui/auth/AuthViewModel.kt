package com.minimal.template.presentation.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.minimal.template.domain.repository.LegalHelpRepository
import com.minimal.template.domain.util.result.Result
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class AuthMode {
    SIGN_IN,
    SIGN_UP,
    VERIFY_OTP
}

data class AuthUiState(
    val email: String = "",
    val password: String = "",
    val otpCode: String = "",
    val mode: AuthMode = AuthMode.SIGN_UP,
    val isLoading: Boolean = false,
    val infoMessage: String? = null,
    val errorMessage: String? = null,
    val isSuccess: Boolean = false,
    val signUpId: String? = null,
    val authToken: String? = null
)

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val repository: LegalHelpRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(AuthUiState())
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    init {
        val existingToken = repository.getSessionToken()
        if (!existingToken.isNullOrBlank()) {
            _uiState.value = _uiState.value.copy(isSuccess = true)
        }
    }

    fun onEmailChanged(email: String) {
        _uiState.value = _uiState.value.copy(email = email, errorMessage = null)
    }

    fun onPasswordChanged(password: String) {
        _uiState.value = _uiState.value.copy(password = password, errorMessage = null)
    }

    fun onOtpCodeChanged(code: String) {
        _uiState.value = _uiState.value.copy(otpCode = code, errorMessage = null)
    }

    fun switchMode(newMode: AuthMode) {
        _uiState.value = _uiState.value.copy(
            mode = newMode,
            errorMessage = null,
            infoMessage = null
        )
    }

    fun submit() {
        when (_uiState.value.mode) {
            AuthMode.SIGN_IN -> handleSignIn()
            AuthMode.SIGN_UP -> handleStartSignUp()
            AuthMode.VERIFY_OTP -> handleVerifyOtp()
        }
    }

    private fun handleSignIn() {
        val email = _uiState.value.email.trim()
        val password = _uiState.value.password
        if (email.isBlank() || !email.contains("@")) {
            _uiState.value = _uiState.value.copy(errorMessage = "Please enter a valid email address.")
            return
        }
        if (password.isBlank()) {
            _uiState.value = _uiState.value.copy(errorMessage = "Please enter your password.")
            return
        }

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null, infoMessage = null)
            when (val res = repository.signIn(email, password)) {
                is Result.Success -> {
                    val token = res.data
                    repository.saveSession(token, email)
                    _uiState.value = _uiState.value.copy(isLoading = false, isSuccess = true)
                }
                is Result.Error -> {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = res.exception.message ?: "Sign in failed."
                    )
                }
                Result.Loading -> Unit
            }
        }
    }

    private fun handleStartSignUp() {
        val email = _uiState.value.email.trim()
        val password = _uiState.value.password
        if (email.isBlank() || !email.contains("@")) {
            _uiState.value = _uiState.value.copy(errorMessage = "Please enter a valid email address.")
            return
        }
        if (password.length !in 8..15) {
            _uiState.value = _uiState.value.copy(errorMessage = "Password must be between 8 and 15 characters long.")
            return
        }

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null, infoMessage = null)
            when (val res = repository.startSignUp(email, password)) {
                is Result.Success -> {
                    val (signUpId, authToken) = res.data
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        mode = AuthMode.VERIFY_OTP,
                        signUpId = signUpId,
                        authToken = authToken,
                        infoMessage = "A 6-digit verification code was sent to $email. Please enter it below to complete registration."
                    )
                }
                is Result.Error -> {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = res.exception.message ?: "Sign up failed."
                    )
                }
                Result.Loading -> Unit
            }
        }
    }

    private fun handleVerifyOtp() {
        val code = _uiState.value.otpCode.trim()
        val signUpId = _uiState.value.signUpId
        val authToken = _uiState.value.authToken ?: ""
        val email = _uiState.value.email.trim()

        if (code.length < 4) {
            _uiState.value = _uiState.value.copy(errorMessage = "Please enter the verification code.")
            return
        }
        if (signUpId.isNullOrBlank()) {
            _uiState.value = _uiState.value.copy(errorMessage = "Session expired. Please try signing up again.")
            return
        }

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            when (val res = repository.verifySignUpOtp(signUpId, code, authToken)) {
                is Result.Success -> {
                    val token = res.data
                    repository.saveSession(token, email)
                    _uiState.value = _uiState.value.copy(isLoading = false, isSuccess = true)
                }
                is Result.Error -> {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = res.exception.message ?: "Invalid verification code."
                    )
                }
                Result.Loading -> Unit
            }
        }
    }
}
