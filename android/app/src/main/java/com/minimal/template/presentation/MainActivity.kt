package com.minimal.template.presentation

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.view.WindowCompat
import com.minimal.template.domain.repository.LegalHelpRepository
import com.minimal.template.presentation.ui.MinimalTemplateApp
import com.minimal.template.presentation.ui.theme.MinimalTemplateTheme
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var repository: LegalHelpRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        WindowCompat.setDecorFitsSystemWindows(window, false)

        setContent {
            MinimalTemplateTheme {
                MinimalTemplateApp(repository = repository)
            }
        }
    }
}
