package com.minimal.template.presentation.ui

import android.app.Activity
import androidx.compose.material.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

@Composable
fun SystemUi(content: @Composable () -> Unit) {
    val view = LocalView.current
    val navigationColor = MaterialTheme.colors.surface.copy(alpha = .5f)
    val useDarkIcons = MaterialTheme.colors.isLight

    SideEffect {
        val activity = view.context as? Activity ?: return@SideEffect
        val window = activity.window
        window.statusBarColor = Color.Transparent.toArgb()
        window.navigationBarColor = navigationColor.toArgb()
        WindowCompat.getInsetsController(window, view).apply {
            isAppearanceLightStatusBars = useDarkIcons
            isAppearanceLightNavigationBars = useDarkIcons
        }
    }

    content()
}