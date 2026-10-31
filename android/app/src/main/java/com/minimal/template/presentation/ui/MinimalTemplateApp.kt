package com.minimal.template.presentation.ui

import androidx.compose.runtime.Composable
import androidx.navigation.compose.rememberNavController
import com.minimal.template.domain.repository.LegalHelpRepository
import com.minimal.template.presentation.ui.navigation.Destinations
import com.minimal.template.presentation.ui.navigation.RootNavGraph

@Composable
fun MinimalTemplateApp(
    repository: LegalHelpRepository
) {
    SystemUi {
        val navController = rememberNavController()
        RootNavGraph(
            navController = navController,
            repository = repository,
            startDestination = Destinations.ROUTE_SPLASH
        )
    }
}
