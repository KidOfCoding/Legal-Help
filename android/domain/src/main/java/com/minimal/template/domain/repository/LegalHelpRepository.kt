package com.minimal.template.domain.repository

import com.minimal.template.domain.model.*
import com.minimal.template.domain.util.result.Result

interface LegalHelpRepository {
    suspend fun startSignUp(email: String, password: String): Result<Pair<String, String>> // Pair<signUpId, authToken>
    suspend fun verifySignUpOtp(signUpId: String, code: String, authToken: String): Result<String> // Returns session token
    suspend fun signIn(email: String, password: String): Result<String> // Returns session token
    suspend fun getProfile(): Result<User>
    suspend fun getConversations(): Result<List<Conversation>>
    suspend fun createConversation(title: String): Result<Conversation>
    suspend fun getConversationDetails(id: String): Result<Triple<Conversation, List<Message>, List<LegalDocument>>>
    suspend fun renameConversation(id: String, newTitle: String): Result<Conversation>
    suspend fun deleteConversation(id: String): Result<Unit>
    suspend fun sendChatMessage(conversationId: String, queryText: String, idempotencyKey: String, documentIds: List<String> = emptyList(), attachedDocIds: List<String> = emptyList()): Result<ChatResponse>
    suspend fun uploadDocument(conversationId: String, fileName: String, mimeType: String, fileBytes: ByteArray): Result<LegalDocument>
    suspend fun getDocument(id: String): Result<LegalDocument>
    suspend fun getUsageStatus(): Result<GlobalQuotaStatus>
    fun getSessionToken(): String?
    fun getUserEmail(): String?
    fun saveSession(token: String, email: String)
    fun clearSession()
}

