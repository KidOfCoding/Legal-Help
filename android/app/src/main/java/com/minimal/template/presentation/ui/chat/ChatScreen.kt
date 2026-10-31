package com.minimal.template.presentation.ui.chat

import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Send
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.minimal.template.domain.model.LegalDocument
import com.minimal.template.domain.model.Message

@Composable
fun ChatScreen(
    viewModel: ChatViewModel,
    onNavigateBack: () -> Unit,
    onOpenDocument: (String) -> Unit
) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val scaffoldState = rememberScaffoldState()
    val listState = rememberLazyListState()

    // Dialog state for viewing all documents uploaded to this consultation
    var showGalleryDialog by remember { mutableStateOf(false) }

    // Pending file selected in the chat input before sending
    var pendingFileUri by remember { mutableStateOf<Uri?>(null) }
    var pendingFileName by remember { mutableStateOf<String?>(null) }
    var pendingFileSize by remember { mutableStateOf<Long?>(null) }
    var pendingMimeType by remember { mutableStateOf<String?>(null) }

    // File Picker Launcher for PDFs and Images directly inside chat box
    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null) {
            try {
                var fileName = "document"
                var fileSize: Long = 0
                context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                    val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                    if (cursor.moveToFirst()) {
                        if (nameIndex >= 0) fileName = cursor.getString(nameIndex)
                        if (sizeIndex >= 0) fileSize = cursor.getLong(sizeIndex)
                    }
                }
                val mimeType = context.contentResolver.getType(uri) ?: "application/octet-stream"

                if (fileSize > 10 * 1024 * 1024) {
                    viewModel.onQueryChanged(state.currentQuery)
                    return@rememberLauncherForActivityResult
                }

                pendingFileUri = uri
                pendingFileName = fileName
                pendingFileSize = fileSize
                pendingMimeType = mimeType
            } catch (e: Exception) {
                // Ignore
            }
        }
    }

    LaunchedEffect(state.messages.size) {
        if (state.messages.isNotEmpty()) {
            listState.animateScrollToItem(state.messages.size - 1)
        }
    }

    LaunchedEffect(state.errorMessage) {
        state.errorMessage?.let {
            scaffoldState.snackbarHostState.showSnackbar(it)
            viewModel.dismissMessages()
        }
    }
    LaunchedEffect(state.infoMessage) {
        state.infoMessage?.let {
            scaffoldState.snackbarHostState.showSnackbar(it)
            viewModel.dismissMessages()
        }
    }

    Scaffold(
        modifier = Modifier
            .fillMaxSize()
            .navigationBarsPadding(),
        scaffoldState = scaffoldState,
        topBar = {
            TopAppBar(
                modifier = Modifier.statusBarsPadding(),
                title = {
                    Column {
                        Text(
                            text = state.conversation?.title ?: "Consultation",
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp,
                            maxLines = 1
                        )
                        val conv = state.conversation
                        if (conv != null) {
                            Text(
                                text = "${conv.queryCount}/${conv.maxQueries} queries · ${conv.lifetimeFilesUploaded}/${conv.maxFiles} uploads",
                                fontSize = 11.sp,
                                color = MaterialTheme.colors.primary.copy(alpha = 0.9f),
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(imageVector = Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    // Conversation Document Gallery Button
                    TextButton(
                        onClick = { showGalleryDialog = true },
                        modifier = Modifier.padding(end = 4.dp)
                    ) {
                        Text(text = "📁", fontSize = 15.sp)
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = "Gallery (${state.documents.size})",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colors.primary
                        )
                    }
                },
                backgroundColor = MaterialTheme.colors.surface,
                elevation = 4.dp
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(MaterialTheme.colors.background)
        ) {
            // Messages Container
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
            ) {
                if (state.isLoading && state.messages.isEmpty()) {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                } else if (state.messages.isEmpty()) {
                    Column(
                        modifier = Modifier
                            .align(Alignment.Center)
                            .padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(text = "⚖️", fontSize = 42.sp)
                        Spacer(modifier = Modifier.height(10.dp))
                        Text(
                            text = "Legal Consultation Ready",
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colors.onBackground
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = "Ask any legal question or tap 📎 to attach document images or PDFs directly with your message.",
                            fontSize = 13.sp,
                            color = MaterialTheme.colors.onBackground.copy(alpha = 0.6f),
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }
                } else {
                    LazyColumn(
                        state = listState,
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(horizontal = 14.dp, vertical = 10.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        items(state.messages, key = { it.id }) { msg ->
                            MessageBubble(message = msg, onOpenDocument = onOpenDocument)
                        }
                    }
                }
            }

            // Chat Input Area (With Integrated 📎 Attachment feature directly in the input box)
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .imePadding(),
                color = MaterialTheme.colors.surface,
                elevation = 6.dp
            ) {
                Column(modifier = Modifier.padding(10.dp)) {
                    // Upload indicator
                    if (state.isUploading) {
                        LinearProgressIndicator(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(bottom = 6.dp),
                            color = MaterialTheme.colors.secondary
                        )
                    }

                    // Attached preview pill before sending
                    if (pendingFileName != null) {
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(bottom = 8.dp),
                            shape = RoundedCornerShape(6.dp),
                            color = MaterialTheme.colors.primary.copy(alpha = 0.12f),
                            border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colors.primary.copy(alpha = 0.3f))
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(text = "📎", fontSize = 14.sp)
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = pendingFileName ?: "",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = MaterialTheme.colors.primary,
                                    modifier = Modifier.weight(1f),
                                    maxLines = 1
                                )
                                Text(
                                    text = "${((pendingFileSize ?: 0L) / 1024)} KB",
                                    fontSize = 11.sp,
                                    color = MaterialTheme.colors.onSurface.copy(alpha = 0.5f)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                IconButton(
                                    onClick = {
                                        pendingFileUri = null
                                        pendingFileName = null
                                        pendingFileSize = null
                                        pendingMimeType = null
                                    },
                                    modifier = Modifier.size(20.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Close,
                                        contentDescription = "Remove",
                                        tint = MaterialTheme.colors.onSurface.copy(alpha = 0.6f)
                                    )
                                }
                            }
                        }
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.Bottom
                    ) {
                        // 📎 Attachment button directly inside input row
                        val canUpload = (state.conversation?.lifetimeFilesUploaded ?: 0) < (state.conversation?.maxFiles ?: 3)
                        IconButton(
                            onClick = { filePickerLauncher.launch("*/*") },
                            enabled = canUpload && !state.isUploading && !state.isSending,
                            modifier = Modifier
                                .size(48.dp)
                                .background(
                                    MaterialTheme.colors.onSurface.copy(alpha = 0.06f),
                                    RoundedCornerShape(8.dp)
                                )
                        ) {
                            Text(text = "📎", fontSize = 18.sp)
                        }

                        Spacer(modifier = Modifier.width(8.dp))

                        OutlinedTextField(
                            value = state.currentQuery,
                            onValueChange = { viewModel.onQueryChanged(it) },
                            placeholder = { Text("Ask a question about your document...", fontSize = 13.sp) },
                            maxLines = 4,
                            modifier = Modifier
                                .weight(1f)
                                .heightIn(min = 48.dp, max = 110.dp),
                            shape = RoundedCornerShape(8.dp)
                        )

                        Spacer(modifier = Modifier.width(8.dp))

                        val charCount = state.currentQuery.length
                        val hasPendingFile = pendingFileUri != null
                        val canSend = (charCount in 1..3000 || hasPendingFile) && !state.isSending && !state.isUploading

                        IconButton(
                            onClick = {
                                val uri = pendingFileUri
                                val name = pendingFileName
                                val mime = pendingMimeType
                                val query = state.currentQuery

                                if (uri != null && name != null && mime != null) {
                                    val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                                    if (bytes != null) {
                                        viewModel.uploadAndSendQuery(name, mime, bytes, query)
                                        pendingFileUri = null
                                        pendingFileName = null
                                        pendingFileSize = null
                                        pendingMimeType = null
                                        return@IconButton
                                    }
                                }

                                viewModel.sendQuery()
                            },
                            enabled = canSend,
                            modifier = Modifier
                                .size(48.dp)
                                .background(
                                    if (canSend) MaterialTheme.colors.primary else Color.Gray.copy(alpha = 0.4f),
                                    RoundedCornerShape(8.dp)
                                )
                        ) {
                            if (state.isSending || state.isUploading) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(20.dp),
                                    color = Color.White,
                                    strokeWidth = 2.dp
                                )
                            } else {
                                Icon(
                                    imageVector = Icons.Default.Send,
                                    contentDescription = "Send",
                                    tint = Color.White
                                )
                            }
                        }
                    }

                    // Character counter
                    val charCount = state.currentQuery.length
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 4.dp, end = 4.dp),
                        horizontalArrangement = Arrangement.End
                    ) {
                        Text(
                            text = "$charCount / 3000 chars",
                            fontSize = 11.sp,
                            color = if (charCount > 3000) MaterialTheme.colors.error else MaterialTheme.colors.onSurface.copy(alpha = 0.5f)
                        )
                    }
                }
            }
        }
    }

    // Document Gallery Dialog for viewing all files/images uploaded in this consultation
    if (showGalleryDialog) {
        AlertDialog(
            onDismissRequest = { showGalleryDialog = false },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(text = "📁 ", fontSize = 18.sp)
                    Text(text = "Document Gallery", fontWeight = FontWeight.Bold, fontSize = 17.sp)
                }
            },
            text = {
                if (state.documents.isEmpty()) {
                    Text(
                        text = "No documents or images attached to this consultation yet. Use 📎 in the chat box to attach files to your questions.",
                        fontSize = 13.sp,
                        color = MaterialTheme.colors.onSurface.copy(alpha = 0.7f)
                    )
                } else {
                    LazyColumn(
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = 350.dp)
                    ) {
                        items(state.documents, key = { it.id }) { doc ->
                            val isImage = doc.fileType.contains("image", ignoreCase = true) ||
                                    doc.fileName.endsWith(".png", ignoreCase = true) ||
                                    doc.fileName.endsWith(".jpg", ignoreCase = true) ||
                                    doc.fileName.endsWith(".jpeg", ignoreCase = true)
                            Surface(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        showGalleryDialog = false
                                        onOpenDocument(doc.id)
                                    },
                                shape = RoundedCornerShape(8.dp),
                                color = MaterialTheme.colors.background,
                                border = androidx.compose.foundation.BorderStroke(
                                    1.dp,
                                    MaterialTheme.colors.onSurface.copy(alpha = 0.12f)
                                )
                            ) {
                                Row(
                                    modifier = Modifier.padding(10.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = if (isImage) "🖼️" else "📄",
                                        fontSize = 20.sp
                                    )
                                    Spacer(modifier = Modifier.width(10.dp))
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = doc.fileName,
                                            fontWeight = FontWeight.SemiBold,
                                            fontSize = 13.sp,
                                            maxLines = 1
                                        )
                                        Text(
                                            text = "${doc.fileType} • ${(doc.fileSize / 1024)} KB",
                                            fontSize = 11.sp,
                                            color = MaterialTheme.colors.onSurface.copy(alpha = 0.6f)
                                        )
                                    }
                                    Text(
                                        text = "View",
                                        color = MaterialTheme.colors.primary,
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showGalleryDialog = false }) {
                    Text("Close")
                }
            }
        )
    }
}

/**
 * Formats AI text into an AnnotatedString:
 * - Strips raw '#' and '###' heading hashes
 * - Strips horizontal dividers ('---')
 * - Normalizes bullet points ('*' -> '•')
 * - Parses '**bold**' into bold SpanStyles
 */
fun formatAnnotatedLegalText(content: String): androidx.compose.ui.text.AnnotatedString {
    val cleaned = content
        .replace(Regex("(?m)^#{1,6}\\s*"), "")
        .replace(Regex("(?m)^[*-]{3,}\\s*$"), "")
        .replace(Regex("(?m)^\\s*\\*\\s+"), "• ")

    return buildAnnotatedString {
        val pattern = Regex("\\*\\*(.*?)\\*\\*")
        var lastIndex = 0
        for (match in pattern.findAll(cleaned)) {
            val range = match.range
            if (range.first > lastIndex) {
                append(cleaned.substring(lastIndex, range.first))
            }
            val boldText = match.groupValues[1]
            pushStyle(SpanStyle(fontWeight = FontWeight.Bold))
            append(boldText)
            pop()
            lastIndex = range.last + 1
        }
        if (lastIndex < cleaned.length) {
            append(cleaned.substring(lastIndex))
        }
    }
}

@Composable
fun MessageBubble(
    message: Message,
    onOpenDocument: (String) -> Unit
) {
    val isUser = message.role == "user"
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = if (isUser) Alignment.End else Alignment.Start
    ) {
        Surface(
            shape = RoundedCornerShape(
                topStart = 10.dp,
                topEnd = 10.dp,
                bottomStart = if (isUser) 10.dp else 2.dp,
                bottomEnd = if (isUser) 2.dp else 10.dp
            ),
            color = if (isUser) MaterialTheme.colors.primary else MaterialTheme.colors.surface,
            elevation = 1.dp,
            modifier = Modifier.widthIn(max = 320.dp)
        ) {
            Column(modifier = Modifier.padding(12.dp)) {
                // If message has attached documents (exactly like ChatGPT / Gemini)
                if (message.attachments.isNotEmpty()) {
                    message.attachments.forEach { doc ->
                        val isImage = doc.fileType.contains("image", ignoreCase = true) ||
                                doc.fileName.endsWith(".png", ignoreCase = true) ||
                                doc.fileName.endsWith(".jpg", ignoreCase = true) ||
                                doc.fileName.endsWith(".jpeg", ignoreCase = true)

                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(bottom = 8.dp)
                                .clickable { onOpenDocument(doc.id) },
                            shape = RoundedCornerShape(8.dp),
                            color = if (isUser) Color.White.copy(alpha = 0.2f) else MaterialTheme.colors.background,
                            border = androidx.compose.foundation.BorderStroke(
                                1.dp,
                                if (isUser) Color.White.copy(alpha = 0.35f) else MaterialTheme.colors.onSurface.copy(alpha = 0.12f)
                            )
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = if (isImage) "🖼️" else "📄",
                                    fontSize = 16.sp
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = doc.fileName,
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = if (isUser) Color.White else MaterialTheme.colors.onSurface,
                                        maxLines = 1
                                    )
                                    Text(
                                        text = "${((doc.fileSize) / 1024)} KB · Tap to preview",
                                        fontSize = 10.sp,
                                        color = if (isUser) Color.White.copy(alpha = 0.85f) else MaterialTheme.colors.onSurface.copy(alpha = 0.6f)
                                    )
                                }
                            }
                        }
                    }
                }

                Text(
                    text = formatAnnotatedLegalText(message.content),
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    color = if (isUser) Color.White else MaterialTheme.colors.onSurface
                )
            }
        }
        Text(
            text = message.createdAt,
            fontSize = 10.sp,
            color = MaterialTheme.colors.onBackground.copy(alpha = 0.4f),
            modifier = Modifier.padding(top = 2.dp, start = 4.dp, end = 4.dp)
        )
    }
}
