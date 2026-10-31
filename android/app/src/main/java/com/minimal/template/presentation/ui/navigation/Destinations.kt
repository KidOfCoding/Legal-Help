package com.minimal.template.presentation.ui.navigation

object Destinations {
    const val ROUTE_SPLASH = "splash"
    const val ROUTE_AUTH = "auth"
    const val ROUTE_DASHBOARD = "dashboard"
    const val ROUTE_CHAT = "chat/{conversationId}"
    const val ROUTE_DOC_PREVIEW = "doc_preview/{documentId}"
    const val ROUTE_SETTINGS = "settings"

    fun chatRoute(conversationId: String) = "chat/$conversationId"
    fun docPreviewRoute(documentId: String) = "doc_preview/$documentId"
}
