package com.minimal.template.presentation.ui.chat

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.minimal.template.domain.model.Conversation
import com.minimal.template.domain.model.LegalDocument
import com.minimal.template.domain.model.Message
import com.minimal.template.domain.repository.LegalHelpRepository
import com.minimal.template.domain.util.result.Result
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

data class ChatUiState(
    val isLoading: Boolean = false,
    val isSending: Boolean = false,
    val isUploading: Boolean = false,
    val conversation: Conversation? = null,
    val messages: List<Message> = emptyList(),
    val documents: List<LegalDocument> = emptyList(),
    val currentQuery: String = "",
    val errorMessage: String? = null,
    val infoMessage: String? = null
)

@HiltViewModel
class ChatViewModel @Inject constructor(
    private val repository: LegalHelpRepository,
    savedStateHandle: SavedStateHandle
) : ViewModel() {

    private val conversationId: String = savedStateHandle["conversationId"] ?: ""

    private val _uiState = MutableStateFlow(ChatUiState())
    val uiState: StateFlow<ChatUiState> = _uiState.asStateFlow()

    init {
        // Zero-Latency: Immediately show cached data if present before background network sync
        val cached = repository.getCachedConversationDetails(conversationId)
        if (cached != null) {
            val (conv, msgs, docs) = cached
            _uiState.value = _uiState.value.copy(
                isLoading = false,
                conversation = conv,
                messages = msgs,
                documents = docs
            )
        }
        loadConversation()
    }

    fun loadConversation() {
        if (conversationId.isBlank()) return
        viewModelScope.launch {
            if (_uiState.value.conversation == null) {
                _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            }
            when (val res = repository.getConversationDetails(conversationId)) {
                is Result.Success -> {
                    val (conv, msgs, docs) = res.data
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        conversation = conv,
                        messages = msgs,
                        documents = docs
                    )
                }
                is Result.Error -> {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = if (_uiState.value.conversation == null) (res.exception.message ?: "Failed to load consultation details") else null
                    )
                }
                Result.Loading -> Unit
            }
        }
    }

    fun onQueryChanged(text: String) {
        _uiState.value = _uiState.value.copy(currentQuery = text, errorMessage = null)
    }

    fun sendQuery(attachedDoc: LegalDocument? = null) {
        val query = _uiState.value.currentQuery.trim()
        if (query.isBlank() || _uiState.value.isSending) return

        if (query.length > 3000) {
            _uiState.value = _uiState.value.copy(errorMessage = "Query exceeds 3,000 character limit.")
            return
        }

        val conv = _uiState.value.conversation
        if (conv != null && conv.queryCount >= conv.maxQueries) {
            _uiState.value = _uiState.value.copy(
                errorMessage = "Query allowance reached for this conversation (${conv.queryCount}/${conv.maxQueries})."
            )
            return
        }

        val idempotencyKey = "android_" + UUID.randomUUID().toString()
        val docIds = _uiState.value.documents.map { it.id }
        val attachedDocIds = if (attachedDoc != null) listOf(attachedDoc.id) else emptyList()

        // Optimistically add user message with attachment if present
        val optimisticUserMsg = Message(
            id = "temp_u_" + System.currentTimeMillis(),
            role = "user",
            content = query,
            attachments = if (attachedDoc != null) listOf(attachedDoc) else emptyList(),
            createdAt = "Just now"
        )
        val currentMsgs = _uiState.value.messages + optimisticUserMsg

        _uiState.value = _uiState.value.copy(
            isSending = true,
            currentQuery = "",
            messages = currentMsgs,
            errorMessage = null
        )

        viewModelScope.launch {
            when (val res = repository.sendChatMessage(conversationId, query, idempotencyKey, docIds, attachedDocIds)) {
                is Result.Success -> {
                    val resp = res.data
                    val updatedMsgs = _uiState.value.messages.filter { it.id != optimisticUserMsg.id } +
                            listOf(resp.userMessage, resp.modelMessage)

                    val updatedConv = _uiState.value.conversation?.copy(
                        queryCount = resp.queryCount
                    )

                    _uiState.value = _uiState.value.copy(
                        isSending = false,
                        messages = updatedMsgs,
                        conversation = updatedConv
                    )
                }
                is Result.Error -> {
                    val revertedMsgs = _uiState.value.messages.filter { it.id != optimisticUserMsg.id }
                    _uiState.value = _uiState.value.copy(
                        isSending = false,
                        messages = revertedMsgs,
                        currentQuery = query,
                        errorMessage = res.exception.message ?: "Failed to send message"
                    )
                }
                Result.Loading -> Unit
            }
        }
    }

    fun uploadAndSendQuery(fileName: String, mimeType: String, bytes: ByteArray, userQuery: String) {
        if (bytes.size > 10 * 1024 * 1024) {
            _uiState.value = _uiState.value.copy(
                errorMessage = "File size exceeds 10 MB limit."
            )
            return
        }

        val conv = _uiState.value.conversation
        if (conv != null && conv.lifetimeFilesUploaded >= conv.maxFiles) {
            _uiState.value = _uiState.value.copy(
                errorMessage = "File limit reached for this conversation (${conv.lifetimeFilesUploaded}/${conv.maxFiles})."
            )
            return
        }

        val effectivePrompt = if (userQuery.isNotBlank()) userQuery.trim() else "Please analyze this uploaded document, summarize its purpose, and detail key obligations."

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isUploading = true, errorMessage = null)
            when (val res = repository.uploadDocument(conversationId, fileName, mimeType, bytes)) {
                is Result.Success -> {
                    val newDoc = res.data
                    val updatedDocs = _uiState.value.documents + newDoc
                    val updatedConv = _uiState.value.conversation?.let {
                        it.copy(lifetimeFilesUploaded = it.lifetimeFilesUploaded + 1)
                    }
                    _uiState.value = _uiState.value.copy(
                        isUploading = false,
                        documents = updatedDocs,
                        conversation = updatedConv,
                        currentQuery = effectivePrompt
                    )
                    // Automatically trigger the chat query with the newly uploaded document attached!
                    sendQuery(attachedDoc = newDoc)
                }
                is Result.Error -> {
                    _uiState.value = _uiState.value.copy(
                        isUploading = false,
                        errorMessage = res.exception.message ?: "Document upload failed"
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
