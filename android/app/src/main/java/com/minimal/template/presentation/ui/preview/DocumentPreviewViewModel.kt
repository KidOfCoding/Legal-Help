package com.minimal.template.presentation.ui.preview

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.minimal.template.domain.model.LegalDocument
import com.minimal.template.domain.repository.LegalHelpRepository
import com.minimal.template.domain.util.result.Result
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class DocumentPreviewUiState(
    val isLoading: Boolean = false,
    val document: LegalDocument? = null,
    val errorMessage: String? = null
)

@HiltViewModel
class DocumentPreviewViewModel @Inject constructor(
    private val repository: LegalHelpRepository,
    savedStateHandle: SavedStateHandle
) : ViewModel() {

    private val documentId: String = savedStateHandle["documentId"] ?: ""

    private val _uiState = MutableStateFlow(DocumentPreviewUiState())
    val uiState: StateFlow<DocumentPreviewUiState> = _uiState.asStateFlow()

    init {
        loadDocument()
    }

    private fun loadDocument() {
        if (documentId.isBlank()) return
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            when (val res = repository.getDocument(documentId)) {
                is Result.Success -> {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        document = res.data
                    )
                }
                is Result.Error -> {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = res.exception.message ?: "Failed to load document preview"
                    )
                }
                Result.Loading -> Unit
            }
        }
    }
}

