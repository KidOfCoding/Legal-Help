package com.minimal.template.presentation.ui.splash

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.CircularProgressIndicator
import androidx.compose.material.MaterialTheme
import androidx.compose.material.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.minimal.template.domain.repository.LegalHelpRepository
import com.minimal.template.presentation.ui.navigation.Destinations
import kotlinx.coroutines.delay

@Composable
fun SplashScreen(
    repository: LegalHelpRepository,
    onNavigate: (String) -> Unit
) {
    LaunchedEffect(Unit) {
        delay(600) // Brief smooth splash
        if (!repository.getSessionToken().isNullOrBlank()) {
            onNavigate(Destinations.ROUTE_DASHBOARD)
        } else {
            onNavigate(Destinations.ROUTE_AUTH)
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colors.background),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(text = "⚖️", fontSize = 56.sp)
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = "LegalHelp",
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colors.onBackground
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = "AI Legal Document Assistant",
                fontSize = 14.sp,
                color = MaterialTheme.colors.onBackground.copy(alpha = 0.6f)
            )
            Spacer(modifier = Modifier.height(32.dp))
            CircularProgressIndicator(
                color = MaterialTheme.colors.primary,
                strokeWidth = 3.dp,
                modifier = Modifier.size(28.dp)
            )
        }
    }
}

