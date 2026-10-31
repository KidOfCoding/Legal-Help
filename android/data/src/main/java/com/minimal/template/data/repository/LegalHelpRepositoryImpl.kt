package com.minimal.template.data.repository

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.minimal.template.data.local.SessionManager
import com.minimal.template.data.remote.LegalHelpApi
import com.minimal.template.data.remote.dto.*
import com.minimal.template.domain.model.*
import com.minimal.template.domain.repository.LegalHelpRepository
import com.minimal.template.domain.util.result.Result
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import retrofit2.HttpException
import timber.log.Timber
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class LegalHelpRepositoryImpl @Inject constructor(
    private val api: LegalHelpApi,
    private val sessionManager: SessionManager,
    private val gson: Gson
) : LegalHelpRepository {

    override suspend fun startSignUp(email: String, password: String): Result<Pair<String, String>> {
        return safeApiCall {
            val res = api.clerkFlow(
                authToken = null,
                body = ClerkFlowRequest(
                    action = "start_sign_up",
                    email = email,
                    password = password
                )
            )
            if (!res.success) {
                throw Exception(res.error ?: "Sign up failed")
            }
            val signUpId = res.signUpId ?: throw Exception("Sign up ID missing")
            val authToken = res.authToken ?: ""
            Pair(signUpId, authToken)
        }
    }

    override suspend fun verifySignUpOtp(signUpId: String, code: String, authToken: String): Result<String> {
        return safeApiCall {
            val res = api.clerkFlow(
                authToken = authToken,
                body = ClerkFlowRequest(
                    action = "verify_sign_up_code",
                    signUpId = signUpId,
                    code = code
                )
            )
            if (!res.success) {
                throw Exception(res.error ?: "Verification failed")
            }
            res.token ?: throw Exception("Session token not returned by Clerk")
        }
    }

    override suspend fun signIn(email: String, password: String): Result<String> {
        return safeApiCall {
            val res = api.clerkFlow(
                authToken = null,
                body = ClerkFlowRequest(
                    action = "sign_in",
                    email = email,
                    password = password
                )
            )
            if (!res.success) {
                throw Exception(res.error ?: "Sign in failed")
            }
            res.token ?: throw Exception("Session token not returned by Clerk")
        }
    }

    override suspend fun getProfile(): Result<User> {
        return safeApiCall {
            val response = api.getProfile()
            val u = response.user ?: throw Exception("User profile not returned")
            User(
                userId = u.userId,
                email = u.email,
                name = u.name,
                lifetimeConversationsCreated = u.lifetimeConversationsCreated,
                maxConversations = u.maxConversations,
                remainingConversations = u.remainingConversations
            )
        }
    }

    override suspend fun getConversations(): Result<List<Conversation>> {
        return safeApiCall {
            val response = api.getConversations()
            val list = response.conversations ?: emptyList()
            list.map { it.toDomain() }
        }
    }

    override suspend fun createConversation(title: String): Result<Conversation> {
        return safeApiCall {
            val response = api.createConversation(CreateConversationRequest(title = title))
            val c = response.conversation ?: throw Exception("Conversation not returned")
            c.toDomain()
        }
    }

    override suspend fun getConversationDetails(id: String): Result<Triple<Conversation, List<Message>, List<LegalDocument>>> {
        return safeApiCall {
            val response = api.getConversationDetail(id)
            val conv = response.conversation?.toDomain() ?: throw Exception("Conversation not found")
            val messages = response.messages?.map { it.toDomain() } ?: emptyList()
            val documents = response.documents?.map { it.toDomain() } ?: emptyList()
            Triple(conv, messages, documents)
        }
    }

    override suspend fun renameConversation(id: String, newTitle: String): Result<Conversation> {
        return safeApiCall {
            val response = api.renameConversation(id, RenameConversationRequest(newTitle))
            response.conversation?.toDomain() ?: throw Exception("Failed to rename conversation")
        }
    }

    override suspend fun deleteConversation(id: String): Result<Unit> {
        return safeApiCall {
            api.deleteConversation(id)
            Unit
        }
    }

    override suspend fun sendChatMessage(
        conversationId: String,
        queryText: String,
        idempotencyKey: String,
        documentIds: List<String>,
        attachedDocIds: List<String>
    ): Result<ChatResponse> {
        return safeApiCall {
            val request = ChatRequest(
                conversationId = conversationId,
                queryText = queryText,
                idempotencyKey = idempotencyKey,
                documentIds = documentIds,
                attachedDocIds = attachedDocIds
            )
            val res = api.sendChatMessage(request)
            ChatResponse(
                userMessage = res.userMessage.toDomain(),
                modelMessage = res.modelMessage.toDomain(),
                queryCount = res.usage.queryCount,
                remainingQueries = res.usage.remainingQueries,
                idempotent = res.idempotent ?: false
            )
        }
    }

    override suspend fun uploadDocument(
        conversationId: String,
        fileName: String,
        mimeType: String,
        fileBytes: ByteArray
    ): Result<LegalDocument> {
        return safeApiCall {
            val convIdBody = conversationId.toRequestBody("text/plain".toMediaTypeOrNull())
            val filePart = MultipartBody.Part.createFormData(
                "file",
                fileName,
                fileBytes.toRequestBody(mimeType.toMediaTypeOrNull())
            )
            val res = api.uploadDocument(convIdBody, filePart)
            val doc = res.document ?: throw Exception("Uploaded document data missing")
            doc.toDomain()
        }
    }

    override suspend fun getDocument(id: String): Result<LegalDocument> {
        return safeApiCall {
            val response = api.getDocument(id)
            response.document?.toDomain() ?: throw Exception("Document not found")
        }
    }

    override suspend fun getUsageStatus(): Result<GlobalQuotaStatus> {
        return safeApiCall {
            val res = api.getUsageStatus()
            val g = res.globalQuota ?: GlobalQuotaDto(null, 0, 1000, 0, 15, 0, 3)
            GlobalQuotaStatus(
                circuitBreaker = CircuitBreakerStatus(
                    state = g.circuitBreaker?.state ?: "CLOSED",
                    tripReason = g.circuitBreaker?.tripReason
                ),
                dailyRequests = g.dailyRequests,
                maxDailyRequests = g.maxDailyRequests,
                minuteRequests = g.minuteRequests,
                maxMinuteRequests = g.maxMinuteRequests,
                activeConcurrentRequests = g.activeConcurrentRequests,
                maxConcurrentRequests = g.maxConcurrentRequests
            )
        }
    }

    override fun getSessionToken(): String? = sessionManager.token
    override fun getUserEmail(): String? = sessionManager.userEmail

    override fun saveSession(token: String, email: String) {
        sessionManager.token = token
        sessionManager.userEmail = email
    }

    override fun clearSession() {
        sessionManager.clear()
    }

    private suspend fun <T> safeApiCall(call: suspend () -> T): Result<T> {
        return try {
            Result.Success(call())
        } catch (e: HttpException) {
            val errorMsg = extractErrorMessage(e)
            Timber.e("API HTTP error [${e.code()}]: $errorMsg")
            Result.Error(Exception(errorMsg))
        } catch (e: IOException) {
            Timber.e("Network IO error: ${e.message}")
            Result.Error(Exception("Network error. Please check your internet connection and server status."))
        } catch (e: Exception) {
            Timber.e(e, "Unexpected error: ${e.message}")
            Result.Error(e)
        }
    }

    private fun extractErrorMessage(e: HttpException): String {
        return try {
            val body = e.response()?.errorBody()?.string()
            if (!body.isNullOrBlank()) {
                val json = gson.fromJson(body, JsonObject::class.java)
                if (json.has("error")) {
                    return json.get("error").asString
                }
            }
            "Server error (${e.code()})"
        } catch (ex: Exception) {
            "Server error (${e.code()})"
        }
    }

    private fun ConversationItemDto.toDomain() = Conversation(
        id = id,
        title = title,
        queryCount = queryCount,
        maxQueries = maxQueries,
        lifetimeFilesUploaded = lifetimeFilesUploaded,
        maxFiles = maxFiles,
        createdAt = createdAt,
        updatedAt = updatedAt
    )

    private fun MessageDto.toDomain() = Message(
        id = id ?: ("msg_" + System.currentTimeMillis()),
        role = role ?: "user",
        content = content ?: "",
        createdAt = createdAt ?: "",
        attachments = attachments?.map { it.toDomain() } ?: emptyList()
    )

    private fun DocumentDto.toDomain() = LegalDocument(
        id = id ?: "",
        conversationId = conversationId ?: "",
        fileName = fileName ?: "Document",
        fileType = fileType ?: "application/octet-stream",
        fileSize = fileSize ?: 0L,
        cloudinaryUrl = cloudinaryUrl ?: "",
        rawUrl = rawUrl,
        summary = summary,
        extractedText = extractedText,
        createdAt = createdAt ?: ""
    )
}

