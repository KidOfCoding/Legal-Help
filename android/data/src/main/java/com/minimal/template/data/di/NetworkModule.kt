package com.minimal.template.data.di

import com.google.gson.Gson
import com.google.gson.GsonBuilder
import com.minimal.template.data.local.SessionManager
import com.minimal.template.data.remote.AuthInterceptor
import com.minimal.template.data.remote.LegalHelpApi
import com.minimal.template.data.repository.LegalHelpRepositoryImpl
import com.minimal.template.domain.repository.LegalHelpRepository
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

@InstallIn(SingletonComponent::class)
@Module
object NetworkModule {

    // Default to loopback which works 100% reliably via 'adb reverse tcp:3000 tcp:3000'
    const val BASE_URL = "http://127.0.0.1:3000/"
    const val LAN_FALLBACK_IP = "192.168.1.14"

    @Provides
    @Singleton
    fun provideGson(): Gson = GsonBuilder()
        .setLenient()
        .create()

    @Provides
    @Singleton
    fun provideHttpLoggingInterceptor(): HttpLoggingInterceptor =
        HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        }

    @Provides
    @Singleton
    fun provideOkHttpClient(
        authInterceptor: AuthInterceptor,
        loggingInterceptor: HttpLoggingInterceptor
    ): OkHttpClient {
        // Smart host failover: If 127.0.0.1 (USB adb reverse) fails, automatically try 192.168.1.14 (Wi-Fi LAN)
        val hostFailoverInterceptor = Interceptor { chain ->
            val request = chain.request()
            try {
                chain.proceed(request)
            } catch (ioErr: Exception) {
                val originalUrl = request.url
                val fallbackHost = if (originalUrl.host == "127.0.0.1" || originalUrl.host == "localhost") {
                    LAN_FALLBACK_IP
                } else if (originalUrl.host == LAN_FALLBACK_IP) {
                    "127.0.0.1"
                } else {
                    null
                }

                if (fallbackHost != null) {
                    val fallbackUrl = originalUrl.newBuilder().host(fallbackHost).build()
                    val fallbackRequest = request.newBuilder().url(fallbackUrl).build()
                    chain.proceed(fallbackRequest)
                } else {
                    throw ioErr
                }
            }
        }

        return OkHttpClient.Builder()
            .addInterceptor(authInterceptor)
            .addInterceptor(hostFailoverInterceptor)
            .addInterceptor(loggingInterceptor)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
    }

    @Provides
    @Singleton
    fun provideRetrofit(
        okHttpClient: OkHttpClient,
        gson: Gson
    ): Retrofit = Retrofit.Builder()
        .baseUrl(BASE_URL)
        .client(okHttpClient)
        .addConverterFactory(GsonConverterFactory.create(gson))
        .build()

    @Provides
    @Singleton
    fun provideLegalHelpApi(retrofit: Retrofit): LegalHelpApi =
        retrofit.create(LegalHelpApi::class.java)
}

@InstallIn(SingletonComponent::class)
@Module
abstract class DataModule {

    @Binds
    @Singleton
    abstract fun bindLegalHelpRepository(
        repositoryImpl: LegalHelpRepositoryImpl
    ): LegalHelpRepository
}
