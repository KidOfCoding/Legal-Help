package com.minimal.template.data.remote

import com.minimal.template.data.remote.dto.*
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.*

interface LegalHelpApi {

    @POST("api/auth/clerk-flow")
    suspend fun clerkFlow(
        @Header("x-clerk-auth-token") authToken: String?,
        @Body body: ClerkFlowRequest
    ): ClerkFlowResponse

    @GET("api/auth/me")
    suspend fun getProfile(): AuthMeResponse

    @GET("api/conversations")
    suspend fun getConversations(): ConversationsResponse

    @POST("api/conversations")
    suspend fun createConversation(
        @Body body: CreateConversationRequest
    ): CreateConversationResponse

    @GET("api/conversations/{id}")
    suspend fun getConversationDetail(
        @Path("id") id: String
    ): ConversationDetailResponse

    @PUT("api/conversations/{id}")
    suspend fun renameConversation(
        @Path("id") id: String,
        @Body body: RenameConversationRequest
    ): CreateConversationResponse

    @DELETE("api/conversations/{id}")
    suspend fun deleteConversation(
        @Path("id") id: String
    ): Map<String, Any>

    @POST("api/chat")
    suspend fun sendChatMessage(
        @Body body: ChatRequest
    ): ChatResponseDto

    @Multipart
    @POST("api/documents/upload")
    suspend fun uploadDocument(
        @Part("conversationId") conversationId: RequestBody,
        @Part file: MultipartBody.Part
    ): UploadDocumentResponse

    @GET("api/documents/{id}")
    suspend fun getDocument(
        @Path("id") id: String
    ): DocumentDetailResponse

    @GET("api/usage/status")
    suspend fun getUsageStatus(): UsageStatusResponse
}

