package com.minimal.template.data.remote

import com.minimal.template.data.local.SessionManager
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthInterceptor @Inject constructor(
    private val sessionManager: SessionManager
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        val token = sessionManager.token

        val requestBuilder = original.newBuilder()
        if (!token.isNullOrBlank()) {
            requestBuilder.header("Authorization", "Bearer $token")
        }
        val email = sessionManager.userEmail
        if (!email.isNullOrBlank()) {
            requestBuilder.header("x-user-email", email)
        }

        return chain.proceed(requestBuilder.build())
    }
}

