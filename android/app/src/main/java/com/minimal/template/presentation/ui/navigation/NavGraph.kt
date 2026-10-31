package com.minimal.template.presentation.ui.navigation

import androidx.compose.runtime.Composable
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.minimal.template.domain.repository.LegalHelpRepository
import com.minimal.template.presentation.ui.auth.AuthScreen
import com.minimal.template.presentation.ui.chat.ChatScreen
import com.minimal.template.presentation.ui.dashboard.DashboardScreen
import com.minimal.template.presentation.ui.preview.DocumentPreviewScreen
import com.minimal.template.presentation.ui.settings.SettingsScreen
import com.minimal.template.presentation.ui.splash.SplashScreen

@Composable
fun RootNavGraph(
    navController: NavHostController = rememberNavController(),
    repository: LegalHelpRepository,
    startDestination: String = Destinations.ROUTE_SPLASH
) {
    NavHost(
        navController = navController,
        startDestination = startDestination
    ) {
        composable(Destinations.ROUTE_SPLASH) {
            SplashScreen(
                repository = repository,
                onNavigate = { route ->
                    navController.navigate(route) {
                        popUpTo(Destinations.ROUTE_SPLASH) { inclusive = true }
                    }
                }
            )
        }

        composable(Destinations.ROUTE_AUTH) {
            AuthScreen(
                viewModel = hiltViewModel(),
                onAuthSuccess = {
                    navController.navigate(Destinations.ROUTE_DASHBOARD) {
                        popUpTo(Destinations.ROUTE_AUTH) { inclusive = true }
                    }
                }
            )
        }

        composable(Destinations.ROUTE_DASHBOARD) {
            DashboardScreen(
                viewModel = hiltViewModel(),
                onOpenConversation = { conversationId ->
                    navController.navigate(Destinations.chatRoute(conversationId))
                },
                onOpenSettings = {
                    navController.navigate(Destinations.ROUTE_SETTINGS)
                }
            )
        }

        composable(
            route = Destinations.ROUTE_CHAT,
            arguments = listOf(navArgument("conversationId") { type = NavType.StringType })
        ) {
            ChatScreen(
                viewModel = hiltViewModel(),
                onNavigateBack = { navController.popBackStack() },
                onOpenDocument = { documentId ->
                    navController.navigate(Destinations.docPreviewRoute(documentId))
                }
            )
        }

        composable(
            route = Destinations.ROUTE_DOC_PREVIEW,
            arguments = listOf(navArgument("documentId") { type = NavType.StringType })
        ) {
            DocumentPreviewScreen(
                viewModel = hiltViewModel(),
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable(Destinations.ROUTE_SETTINGS) {
            SettingsScreen(
                viewModel = hiltViewModel(),
                onNavigateBack = { navController.popBackStack() },
                onSignOutSuccess = {
                    navController.navigate(Destinations.ROUTE_AUTH) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            )
        }
    }
}
