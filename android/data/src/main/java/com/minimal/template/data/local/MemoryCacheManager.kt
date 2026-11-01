package com.minimal.template.data.local

import com.minimal.template.domain.model.Conversation
import com.minimal.template.domain.model.LegalDocument
import com.minimal.template.domain.model.Message
import com.minimal.template.domain.model.User
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

/**
 * High-performance in-memory and disk cache store for zero-latency screen transitions.
 * Provides instant optimistic data retrieval while network syncs in background.
 */
@Singleton
class MemoryCacheManager @Inject constructor() {

    // User Profile Cache
    @Volatile
    var cachedUser: User? = null

    // Conversations List Cache
    private val conversationsListCache = mutableListOf<Conversation>()
    private val conversationsLock = Any()

    // Detail Cache: conversationId -> Triple<Conversation, List<Message>, List<LegalDocument>>
    private val conversationDetailsCache = ConcurrentHashMap<String, Triple<Conversation, List<Message>, List<LegalDocument>>>()

    fun getCachedConversations(): List<Conversation>? {
        synchronized(conversationsLock) {
            return if (conversationsListCache.isNotEmpty()) conversationsListCache.toList() else null
        }
    }

    fun setCachedConversations(list: List<Conversation>) {
        synchronized(conversationsLock) {
            conversationsListCache.clear()
            conversationsListCache.addAll(list)
        }
    }

    fun addOrUpdateConversation(conv: Conversation) {
        synchronized(conversationsLock) {
            val idx = conversationsListCache.indexOfFirst { it.id == conv.id }
            if (idx >= 0) {
                conversationsListCache[idx] = conv
            } else {
                conversationsListCache.add(0, conv)
            }
        }
    }

    fun removeConversation(id: String) {
        synchronized(conversationsLock) {
            conversationsListCache.removeAll { it.id == id }
        }
        conversationDetailsCache.remove(id)
    }

    fun getCachedDetails(id: String): Triple<Conversation, List<Message>, List<LegalDocument>>? {
        return conversationDetailsCache[id]
    }

    fun setCachedDetails(id: String, details: Triple<Conversation, List<Message>, List<LegalDocument>>) {
        conversationDetailsCache[id] = details
    }

    fun clearAll() {
        cachedUser = null
        synchronized(conversationsLock) {
            conversationsListCache.clear()
        }
        conversationDetailsCache.clear()
    }
}

