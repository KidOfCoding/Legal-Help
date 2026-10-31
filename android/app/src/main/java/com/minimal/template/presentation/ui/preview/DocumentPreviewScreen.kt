package com.minimal.template.presentation.ui.preview

import android.content.Intent
import android.net.Uri
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Share
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import java.net.URLEncoder

@Composable
fun DocumentPreviewScreen(
    viewModel: DocumentPreviewViewModel,
    onNavigateBack: () -> Unit
) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    Scaffold(
        topBar = {
            TopAppBar(
                modifier = Modifier.statusBarsPadding(),
                title = {
                    Text(
                        text = state.document?.fileName ?: "Document Preview",
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp,
                        maxLines = 1
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(imageVector = Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    val url = state.document?.cloudinaryUrl
                    if (!url.isNullOrBlank()) {
                        IconButton(onClick = {
                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                            context.startActivity(intent)
                        }) {
                            Icon(imageVector = Icons.Default.Share, contentDescription = "Open in App")
                        }
                    }
                },
                backgroundColor = MaterialTheme.colors.surface,
                elevation = 4.dp
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(MaterialTheme.colors.background)
        ) {
            if (state.isLoading) {
                CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            } else if (state.document != null) {
                val doc = state.document!!
                val isImage = doc.fileType.contains("image", ignoreCase = true) ||
                        doc.fileName.endsWith(".png", ignoreCase = true) ||
                        doc.fileName.endsWith(".jpg", ignoreCase = true) ||
                        doc.fileName.endsWith(".jpeg", ignoreCase = true)

                val fileUrl = doc.cloudinaryUrl

                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(12.dp)
                ) {
                    // Meta Header Card
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        backgroundColor = MaterialTheme.colors.surface,
                        shape = RoundedCornerShape(8.dp),
                        elevation = 2.dp
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 14.dp, vertical = 10.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = doc.fileName,
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colors.onSurface,
                                    maxLines = 1
                                )
                                Spacer(modifier = Modifier.height(2.dp))
                                Text(
                                    text = "${doc.fileType} · ${(doc.fileSize / 1024)} KB",
                                    fontSize = 11.sp,
                                    color = MaterialTheme.colors.onSurface.copy(alpha = 0.6f)
                                )
                            }

                            if (fileUrl.isNotBlank()) {
                                Button(
                                    onClick = {
                                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(fileUrl))
                                        context.startActivity(intent)
                                    },
                                    shape = RoundedCornerShape(6.dp),
                                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp)
                                ) {
                                    Text(text = "Open in App ↗", fontSize = 11.sp)
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    // Real File Viewer (WebView for Image & PDF display)
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f)
                            .clip(RoundedCornerShape(8.dp))
                            .border(1.dp, MaterialTheme.colors.onSurface.copy(alpha = 0.15f), RoundedCornerShape(8.dp))
                            .background(MaterialTheme.colors.surface)
                    ) {
                        AndroidView(
                            factory = { ctx ->
                                WebView(ctx).apply {
                                    settings.javaScriptEnabled = true
                                    settings.loadWithOverviewMode = true
                                    settings.useWideViewPort = true
                                    settings.builtInZoomControls = true
                                    settings.displayZoomControls = false
                                    settings.allowFileAccess = true
                                    settings.domStorageEnabled = true
                                    webViewClient = WebViewClient()
                                }
                            },
                            update = { webView ->
                                if (fileUrl.isNotBlank()) {
                                    if (isImage) {
                                        val html = """
                                            <!DOCTYPE html>
                                            <html>
                                            <head>
                                            <meta name='viewport' content='width=device-width, initial-scale=1.0'>
                                            <style>
                                              body { margin:0; padding:12px; background-color:#0f172a; display:flex; align-items:center; justify-content:center; min-height:100vh; }
                                              img { max-width:100%; height:auto; object-fit:contain; border-radius:6px; box-shadow:0 4px 12px rgba(0,0,0,0.5); }
                                            </style>
                                            </head>
                                            <body>
                                              <img src='$fileUrl' />
                                            </body>
                                            </html>
                                        """.trimIndent()
                                        webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)
                                    } else {
                                        val viewerUrl = "https://docs.google.com/gview?embedded=true&url=" + URLEncoder.encode(fileUrl, "UTF-8")
                                        webView.loadUrl(viewerUrl)
                                    }
                                }
                            },
                            modifier = Modifier.fillMaxSize()
                        )
                    }
                }
            } else if (state.errorMessage != null) {
                Text(
                    text = state.errorMessage ?: "Failed to load document.",
                    color = MaterialTheme.colors.error,
                    modifier = Modifier.align(Alignment.Center)
                )
            }
        }
    }
}
