package com.minimal.template.presentation.ui.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Settings
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.minimal.template.domain.model.Conversation
import com.minimal.template.presentation.ui.theme.LegalDanger
import com.minimal.template.presentation.ui.theme.LegalSuccess
import com.minimal.template.presentation.ui.theme.LegalWarning

@Composable
fun DashboardScreen(
    viewModel: DashboardViewModel,
    onOpenConversation: (String) -> Unit,
    onOpenSettings: () -> Unit
) {
    val state by viewModel.uiState.collectAsState()
    var showNewDialog by remember { mutableStateOf(false) }
    var newTitle by remember { mutableStateOf("") }

    var showRenameDialog by remember { mutableStateOf(false) }
    var renameTargetId by remember { mutableStateOf("") }
    var renameTitle by remember { mutableStateOf("") }

    val scaffoldState = rememberScaffoldState()

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
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(text = "⚖️ ", fontSize = 18.sp)
                        Text(
                            text = "LegalHelp",
                            fontWeight = FontWeight.Bold,
                            fontSize = 18.sp
                        )
                    }
                },
                actions = {
                    IconButton(onClick = onOpenSettings) {
                        Icon(
                            imageVector = Icons.Default.Settings,
                            contentDescription = "Settings",
                            tint = MaterialTheme.colors.onSurface
                        )
                    }
                },
                backgroundColor = MaterialTheme.colors.surface,
                elevation = 4.dp
            )
        },
        floatingActionButton = {
            val lifetime = state.userProfile?.lifetimeConversationsCreated ?: 0
            val max = state.userProfile?.maxConversations ?: 3
            val canCreate = lifetime < max

            FloatingActionButton(
                onClick = {
                    if (canCreate) {
                        newTitle = "Contract Review ${state.conversations.size + 1}"
                        showNewDialog = true
                    } else {
                        viewModel.createConversation("blocked") {} // triggers informative error
                    }
                },
                backgroundColor = if (canCreate) MaterialTheme.colors.primary else Color.Gray,
                contentColor = Color.White
            ) {
                Icon(imageVector = Icons.Default.Add, contentDescription = "New Consultation")
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(MaterialTheme.colors.background)
        ) {
            // Lifetime Quota Banner
            val lifetime = state.userProfile?.lifetimeConversationsCreated ?: 0
            val max = state.userProfile?.maxConversations ?: 3

            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = MaterialTheme.colors.surface,
                elevation = 2.dp
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "Lifetime Allowance",
                            fontSize = 12.sp,
                            color = MaterialTheme.colors.onSurface.copy(alpha = 0.6f)
                        )
                        Text(
                            text = "$lifetime of $max consultations created",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = if (lifetime >= max) LegalWarning else MaterialTheme.colors.onSurface
                        )
                    }

                    if (lifetime >= max) {
                        Text(
                            text = "Max Limit Reached",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = LegalWarning
                        )
                    }
                }
            }

            if (state.isLoading && state.conversations.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
            } else if (state.conversations.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(32.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(text = "📂", fontSize = 48.sp)
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            text = "No active consultations",
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colors.onBackground
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = "Tap the + button below to start an AI legal document analysis or ask a legal question.",
                            fontSize = 13.sp,
                            color = MaterialTheme.colors.onBackground.copy(alpha = 0.6f),
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(state.conversations, key = { it.id }) { conv ->
                        ConversationCard(
                            conversation = conv,
                            onClick = { onOpenConversation(conv.id) },
                            onRename = {
                                renameTargetId = conv.id
                                renameTitle = conv.title
                                showRenameDialog = true
                            },
                            onDelete = {
                                viewModel.deleteConversation(conv.id)
                            }
                        )
                    }
                }
            }
        }
    }

    // New Conversation Dialog
    if (showNewDialog) {
        AlertDialog(
            onDismissRequest = { showNewDialog = false },
            title = { Text(text = "New Legal Consultation", fontWeight = FontWeight.Bold) },
            text = {
                Column {
                    Text(
                        text = "Enter a title for your document review or legal matter:",
                        fontSize = 13.sp,
                        color = MaterialTheme.colors.onSurface.copy(alpha = 0.7f)
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    OutlinedTextField(
                        value = newTitle,
                        onValueChange = { newTitle = it },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        showNewDialog = false
                        viewModel.createConversation(newTitle) { convId ->
                            onOpenConversation(convId)
                        }
                    }
                ) {
                    Text("Start Consultation")
                }
            },
            dismissButton = {
                TextButton(onClick = { showNewDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    // Rename Dialog
    if (showRenameDialog) {
        AlertDialog(
            onDismissRequest = { showRenameDialog = false },
            title = { Text(text = "Rename Consultation", fontWeight = FontWeight.Bold) },
            text = {
                OutlinedTextField(
                    value = renameTitle,
                    onValueChange = { renameTitle = it },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        showRenameDialog = false
                        viewModel.renameConversation(renameTargetId, renameTitle)
                    }
                ) {
                    Text("Save")
                }
            },
            dismissButton = {
                TextButton(onClick = { showRenameDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }
}

@Composable
fun ConversationCard(
    conversation: Conversation,
    onClick: () -> Unit,
    onRename: () -> Unit,
    onDelete: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        backgroundColor = MaterialTheme.colors.surface,
        shape = RoundedCornerShape(10.dp),
        elevation = 2.dp
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = conversation.title,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colors.onSurface,
                    modifier = Modifier.weight(1f)
                )

                Row {
                    IconButton(onClick = onRename, modifier = Modifier.size(28.dp)) {
                        Icon(
                            imageVector = Icons.Default.Edit,
                            contentDescription = "Rename",
                            tint = MaterialTheme.colors.onSurface.copy(alpha = 0.5f),
                            modifier = Modifier.size(16.dp)
                        )
                    }
                    Spacer(modifier = Modifier.width(6.dp))
                    IconButton(onClick = onDelete, modifier = Modifier.size(28.dp)) {
                        Icon(
                            imageVector = Icons.Default.Delete,
                            contentDescription = "Delete",
                            tint = LegalDanger.copy(alpha = 0.7f),
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    // Queries Badge
                    Surface(
                        color = MaterialTheme.colors.primary.copy(alpha = 0.12f),
                        shape = RoundedCornerShape(6.dp)
                    ) {
                        Text(
                            text = "${conversation.queryCount}/${conversation.maxQueries} queries",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Medium,
                            color = MaterialTheme.colors.primary,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                        )
                    }

                    // Files Badge
                    Surface(
                        color = MaterialTheme.colors.secondary.copy(alpha = 0.12f),
                        shape = RoundedCornerShape(6.dp)
                    ) {
                        Text(
                            text = "${conversation.lifetimeFilesUploaded}/${conversation.maxFiles} files",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Medium,
                            color = MaterialTheme.colors.secondary,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                        )
                    }
                }

                Text(
                    text = "Tap to view",
                    fontSize = 12.sp,
                    color = MaterialTheme.colors.primary,
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}

