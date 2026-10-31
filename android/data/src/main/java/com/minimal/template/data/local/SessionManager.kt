package com.minimal.template.data.local

import android.content.Context
import android.content.SharedPreferences
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SessionManager @Inject constructor(
    @ApplicationContext context: Context
) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    var token: String?
        get() = prefs.getString(KEY_TOKEN, null)
        set(value) {
            prefs.edit().putString(KEY_TOKEN, value).apply()
        }

    var userEmail: String?
        get() = prefs.getString(KEY_EMAIL, null)
        set(value) {
            prefs.edit().putString(KEY_EMAIL, value).apply()
        }

    fun clear() {
        prefs.edit().clear().apply()
    }

    val isLoggedIn: Boolean
        get() = !token.isNullOrBlank()

    companion object {
        private const val PREFS_NAME = "legalhelp_session_prefs"
        private const val KEY_TOKEN = "auth_token"
        private const val KEY_EMAIL = "user_email"
    }
}

