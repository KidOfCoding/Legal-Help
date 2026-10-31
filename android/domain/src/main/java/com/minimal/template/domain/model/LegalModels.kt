package com.minimal.template.domain.model

data class User(
    val userId: String,
    val email: String,
    val name: String? = null,
    val lifetimeConversationsCreated: Int,
    val maxConversations: Int = 3,
    val remainingConversations: Int = 0
)

data class Conversation(
    val id: String,
    val title: String,
    val queryCount: Int = 0,
    val maxQueries: Int = 20,
    val lifetimeFilesUploaded: Int = 0,
    val maxFiles: Int = 3,
    val createdAt: String,
    val updatedAt: String
) {
    val remainingQueries: Int
        get() = (maxQueries - queryCount).coerceAtLeast(0)

    val remainingFiles: Int
        get() = (maxFiles - lifetimeFilesUploaded).coerceAtLeast(0)
}

data class Message(
    val id: String,
    val role: String, // "user" or "model"
    val content: String,
    val createdAt: String,
    val attachments: List<LegalDocument> = emptyList()
) {
    val isUser: Boolean
        get() = role.equals("user", ignoreCase = true)
}

data class LegalDocument(
    val id: String = "",
    val conversationId: String = "",
    val fileName: String = "",
    val fileType: String = "",
    val fileSize: Long = 0L,
    val cloudinaryUrl: String = "",
    val rawUrl: String? = null,
    val summary: String? = null,
    val extractedText: String? = null,
    val createdAt: String = ""
)

data class CircuitBreakerStatus(
    val state: String = "CLOSED", // CLOSED, OPEN, HALF_OPEN
    val tripReason: String? = null
)

data class GlobalQuotaStatus(
    val circuitBreaker: CircuitBreakerStatus = CircuitBreakerStatus(),
    val dailyRequests: Int = 0,
    val maxDailyRequests: Int = 1000,
    val minuteRequests: Int = 0,
    val maxMinuteRequests: Int = 15,
    val activeConcurrentRequests: Int = 0,
    val maxConcurrentRequests: Int = 3
)

data class ChatResponse(
    val userMessage: Message,
    val modelMessage: Message,
    val queryCount: Int,
    val remainingQueries: Int,
    val idempotent: Boolean = false
)

