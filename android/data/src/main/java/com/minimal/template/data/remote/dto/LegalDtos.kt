package com.minimal.template.data.remote.dto

import com.google.gson.annotations.SerializedName

data class ClerkFlowRequest(
    @SerializedName("action") val action: String,
    @SerializedName("email") val email: String? = null,
    @SerializedName("password") val password: String? = null,
    @SerializedName("code") val code: String? = null,
    @SerializedName("signUpId") val signUpId: String? = null,
    @SerializedName("signInId") val signInId: String? = null
)

data class ClerkFlowResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("message") val message: String? = null,
    @SerializedName("error") val error: String? = null,
    @SerializedName("signUpId") val signUpId: String? = null,
    @SerializedName("signInId") val signInId: String? = null,
    @SerializedName("authToken") val authToken: String? = null,
    @SerializedName("token") val token: String? = null,
    @SerializedName("userId") val userId: String? = null,
    @SerializedName("sessionId") val sessionId: String? = null
)

data class AuthMeResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("user") val user: UserDto?
)

data class UserDto(
    @SerializedName("userId") val userId: String,
    @SerializedName("email") val email: String,
    @SerializedName("name") val name: String?,
    @SerializedName("lifetimeConversationsCreated") val lifetimeConversationsCreated: Int,
    @SerializedName("maxConversations") val maxConversations: Int,
    @SerializedName("remainingConversations") val remainingConversations: Int
)

data class ConversationsResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("conversations") val conversations: List<ConversationItemDto>?
)

data class CreateConversationRequest(
    @SerializedName("title") val title: String
)

data class CreateConversationResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("conversation") val conversation: ConversationItemDto?
)

data class ConversationItemDto(
    @SerializedName("id") val id: String,
    @SerializedName("title") val title: String,
    @SerializedName("queryCount") val queryCount: Int,
    @SerializedName("maxQueries") val maxQueries: Int,
    @SerializedName("lifetimeFilesUploaded") val lifetimeFilesUploaded: Int,
    @SerializedName("maxFiles") val maxFiles: Int,
    @SerializedName("createdAt") val createdAt: String,
    @SerializedName("updatedAt") val updatedAt: String
)

data class ConversationDetailResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("conversation") val conversation: ConversationItemDto?,
    @SerializedName("messages") val messages: List<MessageDto>?,
    @SerializedName("documents") val documents: List<DocumentDto>?
)

data class MessageDto(
    @SerializedName("id") val id: String? = null,
    @SerializedName("role") val role: String? = null,
    @SerializedName("content") val content: String? = null,
    @SerializedName("createdAt") val createdAt: String? = null,
    @SerializedName("attachments") val attachments: List<DocumentDto>? = null
)

data class DocumentDto(
    @SerializedName("id") val id: String? = null,
    @SerializedName("conversationId") val conversationId: String? = null,
    @SerializedName("fileName") val fileName: String? = null,
    @SerializedName("fileType") val fileType: String? = null,
    @SerializedName("fileSize") val fileSize: Long? = null,
    @SerializedName("cloudinaryUrl") val cloudinaryUrl: String? = null,
    @SerializedName("rawUrl") val rawUrl: String? = null,
    @SerializedName("summary") val summary: String? = null,
    @SerializedName("extractedText") val extractedText: String? = null,
    @SerializedName("createdAt") val createdAt: String? = null
)

data class RenameConversationRequest(
    @SerializedName("title") val title: String
)

data class ChatRequest(
    @SerializedName("conversationId") val conversationId: String,
    @SerializedName("queryText") val queryText: String,
    @SerializedName("idempotencyKey") val idempotencyKey: String,
    @SerializedName("documentIds") val documentIds: List<String> = emptyList(),
    @SerializedName("attachedDocIds") val attachedDocIds: List<String> = emptyList()
)

data class ChatResponseDto(
    @SerializedName("success") val success: Boolean,
    @SerializedName("userMessage") val userMessage: MessageDto,
    @SerializedName("modelMessage") val modelMessage: MessageDto,
    @SerializedName("usage") val usage: UsageInfoDto,
    @SerializedName("idempotent") val idempotent: Boolean?
)

data class UsageInfoDto(
    @SerializedName("queryCount") val queryCount: Int,
    @SerializedName("maxQueries") val maxQueries: Int,
    @SerializedName("remainingQueries") val remainingQueries: Int
)

data class DocumentDetailResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("document") val document: DocumentDto?
)

data class UploadDocumentResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("document") val document: DocumentDto?,
    @SerializedName("usage") val usage: FileUsageDto?
)

data class FileUsageDto(
    @SerializedName("lifetimeFilesUploaded") val lifetimeFilesUploaded: Int,
    @SerializedName("maxFiles") val maxFiles: Int,
    @SerializedName("remainingFiles") val remainingFiles: Int
)

data class UsageStatusResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("globalQuota") val globalQuota: GlobalQuotaDto?
)

data class GlobalQuotaDto(
    @SerializedName("circuitBreaker") val circuitBreaker: CircuitBreakerDto?,
    @SerializedName("dailyRequests") val dailyRequests: Int,
    @SerializedName("maxDailyRequests") val maxDailyRequests: Int,
    @SerializedName("minuteRequests") val minuteRequests: Int,
    @SerializedName("maxMinuteRequests") val maxMinuteRequests: Int,
    @SerializedName("activeConcurrentRequests") val activeConcurrentRequests: Int,
    @SerializedName("maxConcurrentRequests") val maxConcurrentRequests: Int
)

data class CircuitBreakerDto(
    @SerializedName("state") val state: String,
    @SerializedName("tripReason") val tripReason: String?
)

