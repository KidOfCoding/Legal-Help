// State management
function getValidSavedToken() {
  const t = localStorage.getItem('legalhelp_token');
  if (t && t !== 'undefined' && t !== 'null' && t.trim() !== '' && t.split('.').length === 3) {
    return t.trim();
  }
  return '';
}

let state = {
  token: getValidSavedToken(),
  user: null,
  conversations: [],
  activeConversation: null,
  activeMessages: [],
  activeDocuments: [],
  circuitBreaker: { state: 'CLOSED' },
  authMode: 'SIGN_UP', // Default to professional registration with OTP
  pendingFile: null,
  signUpId: null,
  authToken: null
};

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  const token = getValidSavedToken();
  if (token) {
    state.token = token;
    initDashboard();
  } else {
    handleSignOut();
  }
});

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 4000);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, function(m) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m];
  });
}

// ---------------------------------------------------------------------------
// Professional Authentication Flow (Sign Up with OTP vs Sign In)
// ---------------------------------------------------------------------------
function setAuthMode(mode) {
  state.authMode = mode;
  const tabSignUp = document.getElementById('tabSignUp');
  const tabSignIn = document.getElementById('tabSignIn');
  const pwdHint = document.getElementById('pwdHint');
  const groupOtp = document.getElementById('groupOtp');
  const groupEmail = document.getElementById('groupEmail');
  const groupPassword = document.getElementById('groupPassword');
  const submitBtn = document.getElementById('authSubmitBtn');
  const switchText = document.getElementById('switchText');
  const switchBtn = document.getElementById('switchBtn');
  const errorAlert = document.getElementById('authErrorAlert');
  const infoAlert = document.getElementById('authInfoAlert');

  errorAlert.style.display = 'none';
  infoAlert.style.display = 'none';

  if (mode === 'SIGN_UP') {
    tabSignUp.classList.add('active');
    tabSignIn.classList.remove('active');
    pwdHint.style.display = 'inline';
    groupOtp.style.display = 'none';
    groupEmail.style.display = 'flex';
    groupPassword.style.display = 'flex';
    submitBtn.innerText = 'Send Verification Code';
    switchText.innerText = 'Already have an account?';
    switchBtn.innerText = 'Sign In';
  } else if (mode === 'SIGN_IN') {
    tabSignIn.classList.add('active');
    tabSignUp.classList.remove('active');
    pwdHint.style.display = 'none';
    groupOtp.style.display = 'none';
    groupEmail.style.display = 'flex';
    groupPassword.style.display = 'flex';
    submitBtn.innerText = 'Sign In';
    switchText.innerText = "Don't have an account?";
    switchBtn.innerText = 'Create Account';
  } else if (mode === 'VERIFY_OTP') {
    tabSignUp.classList.add('active');
    tabSignIn.classList.remove('active');
    groupOtp.style.display = 'flex';
    groupPassword.style.display = 'none';
    submitBtn.innerText = 'Verify & Enter LegalHelp';
    switchText.innerText = 'Mistyped your email?';
    switchBtn.innerText = 'Start Over';
  }
}

function toggleAuthMode() {
  if (state.authMode === 'VERIFY_OTP' || state.authMode === 'SIGN_IN') {
    setAuthMode('SIGN_UP');
  } else {
    setAuthMode('SIGN_IN');
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const emailInput = document.getElementById('authEmail');
  const pwdInput = document.getElementById('authPassword');
  const otpInput = document.getElementById('authOtp');
  const submitBtn = document.getElementById('authSubmitBtn');
  const errorAlert = document.getElementById('authErrorAlert');
  const infoAlert = document.getElementById('authInfoAlert');

  const email = emailInput.value.trim();
  const password = pwdInput.value;

  errorAlert.style.display = 'none';
  infoAlert.style.display = 'none';

  // 1. SIGN IN (Existing user)
  if (state.authMode === 'SIGN_IN') {
    submitBtn.disabled = true;
    submitBtn.innerText = 'Signing In...';
    try {
      const res = await fetch('/api/auth/clerk-flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sign_in', email, password })
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.token) {
        throw new Error(data.error || 'Invalid credentials or failed to acquire session token.');
      }

      state.token = data.token;
      localStorage.setItem('legalhelp_token', data.token);
      localStorage.setItem('legalhelp_email', data.email || email);
      initDashboard();
    } catch (err) {
      errorAlert.innerText = err.message;
      errorAlert.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerText = 'Sign In';
    }
    return;
  }

  // 2. SIGN UP - STEP 1 (Send OTP)
  if (state.authMode === 'SIGN_UP') {
    if (password.length < 8) {
      errorAlert.innerText = 'Password must be at least 8 characters long.';
      errorAlert.style.display = 'block';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerText = 'Sending OTP...';

    try {
      const res = await fetch('/api/auth/clerk-flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start_sign_up', email, password })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to dispatch verification code.');
      }

      state.signUpId = data.signUpId;
      state.authToken = data.authToken;
      setAuthMode('VERIFY_OTP');
      infoAlert.innerText = `A 6-digit verification code has been dispatched to ${email}. Please check your inbox.`;
      infoAlert.style.display = 'block';
      otpInput.focus();
    } catch (err) {
      errorAlert.innerText = err.message;
      errorAlert.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      if (state.authMode === 'SIGN_UP') submitBtn.innerText = 'Send Verification Code';
    }
    return;
  }

  // 3. SIGN UP - STEP 2 (Verify OTP)
  if (state.authMode === 'VERIFY_OTP') {
    const code = otpInput.value.trim();
    if (!code || code.length < 4) {
      errorAlert.innerText = 'Please enter the 6-digit verification code.';
      errorAlert.style.display = 'block';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerText = 'Verifying...';

    try {
      const res = await fetch('/api/auth/clerk-flow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-clerk-auth-token': state.authToken || ''
        },
        body: JSON.stringify({
          action: 'verify_sign_up_code',
          signUpId: state.signUpId,
          code,
          email
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.token) {
        throw new Error(data.error || 'Verification failed: No valid session token returned.');
      }

      state.token = data.token;
      localStorage.setItem('legalhelp_token', data.token);
      localStorage.setItem('legalhelp_email', data.email || email);
      initDashboard();
    } catch (err) {
      errorAlert.innerText = err.message;
      errorAlert.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerText = 'Verify & Enter LegalHelp';
    }
  }
}

async function resendOtp(e) {
  if (e) e.preventDefault();
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  setAuthMode('SIGN_UP');
  document.getElementById('authEmail').value = email;
  document.getElementById('authPassword').value = password;
  showToast('Please submit to generate a new verification code.', 'info');
}

async function handleSignOut() {
  state.token = '';
  state.user = null;
  state.activeConversation = null;
  state.activeMessages = [];
  state.activeDocuments = [];
  state.pendingFile = null;
  localStorage.removeItem('legalhelp_token');
  localStorage.removeItem('legalhelp_email');
  showAuthScreen();
}

function showAuthScreen() {
  document.getElementById('authScreen').style.display = 'flex';
  document.getElementById('mainScreen').style.display = 'none';
  setAuthMode('SIGN_UP');
}

async function initDashboard() {
  document.getElementById('authScreen').style.display = 'none';
  const mainScreen = document.getElementById('mainScreen');
  mainScreen.style.display = 'flex';
  mainScreen.style.flexDirection = 'column';

  const email = localStorage.getItem('legalhelp_email') || (state.user ? state.user.email : 'User');
  document.getElementById('currentUserEmail').innerText = email;

  try {
    await fetchUserProfile();
    await Promise.all([
      fetchConversations(),
      fetchGlobalStatus()
    ]);
  } catch (err) {
    if (err.status === 401 || (err.message && err.message.includes('UNAUTHORIZED'))) {
      handleSignOut();
      showToast('Session expired. Please sign in again.', 'info');
    }
  }
}

// ---------------------------------------------------------------------------
// API Helpers
// ---------------------------------------------------------------------------
async function apiCall(endpoint, options = {}) {
  const currentEmail = localStorage.getItem('legalhelp_email') || '';
  const headers = {
    'Authorization': `Bearer ${state.token}`,
    ...(currentEmail ? { 'x-user-email': currentEmail } : {}),
    ...(options.headers || {})
  };

  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(endpoint, {
    ...options,
    headers
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errorMsg = data.error || `HTTP ${res.status} Error`;
    const err = new Error(errorMsg);
    err.status = res.status;
    err.code = data.code;
    err.details = data.details;
    if (res.status === 401) {
      handleSignOut();
    }
    throw err;
  }
  return data;
}

// ---------------------------------------------------------------------------
// User Profile & Lifetime Quota
// ---------------------------------------------------------------------------
async function fetchUserProfile() {
  try {
    const res = await apiCall('/api/auth/me');
    state.user = res.user;
    updateUserBadges();
  } catch (err) {
    if (err.status === 401) {
      handleSignOut();
    } else {
      showToast('Failed to load profile: ' + err.message, 'error');
    }
  }
}

function updateUserBadges() {
  if (!state.user) return;
  const lifetime = state.user.lifetimeConversationsCreated || 0;
  const max = state.user.maxConversations || 3;
  document.getElementById('userConvBadge').innerText = `${lifetime}/${max} Convs`;
  document.getElementById('convQuotaText').innerText = `${lifetime}/${max}`;

  if (lifetime >= max) {
    document.getElementById('newConvBtn').setAttribute('disabled', 'true');
    document.getElementById('newConvBtn').title = 'Lifetime conversation limit reached (3/3).';
  } else {
    document.getElementById('newConvBtn').removeAttribute('disabled');
  }
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------
async function fetchConversations() {
  try {
    const res = await apiCall('/api/conversations');
    state.conversations = res.conversations || [];
    renderConversationsList();

    if (state.conversations.length > 0 && !state.activeConversation) {
      selectConversation(state.conversations[0].id);
    } else if (state.conversations.length === 0) {
      clearActiveConversation();
    }
  } catch (err) {
    showToast('Failed to load conversations: ' + err.message, 'error');
  }
}

function renderConversationsList() {
  const container = document.getElementById('conversationsList');
  if (state.conversations.length === 0) {
    container.innerHTML = '<div class="empty-state">No conversations yet. Click "+ New" to begin.</div>';
    return;
  }

  container.innerHTML = state.conversations.map(c => `
    <div class="conv-item ${state.activeConversation && state.activeConversation.id === c.id ? 'active' : ''}" 
         onclick="selectConversation('${c.id}')">
      <div class="conv-item-title">${escapeHtml(c.title)}</div>
      <div class="conv-item-meta">
        <span>${c.queryCount || 0}/${c.maxQueries || 20} queries</span>
        <span>${c.lifetimeFilesUploaded || 0}/${c.maxFiles || 3} files</span>
      </div>
    </div>
  `).join('');
}

async function handleNewConversation() {
  try {
    const title = prompt('Enter a title for the new legal consultation:', 'Legal Document Review');
    if (!title || !title.trim()) return;

    const res = await apiCall('/api/conversations', {
      method: 'POST',
      body: JSON.stringify({ title: title.trim() })
    });

    showToast('Conversation created!', 'success');
    await fetchUserProfile();
    await fetchConversations();
    selectConversation(res.conversation.id);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function selectConversation(id) {
  try {
    const res = await apiCall(`/api/conversations/${id}`);
    state.activeConversation = res.conversation;
    state.activeMessages = res.messages || [];
    state.activeDocuments = res.documents || [];
    clearPendingAttachment();

    renderActiveConversation();
    renderConversationsList();
  } catch (err) {
    showToast('Failed to load conversation: ' + err.message, 'error');
  }
}

function clearActiveConversation() {
  state.activeConversation = null;
  state.activeMessages = [];
  state.activeDocuments = [];
  clearPendingAttachment();
  document.getElementById('chatHeader').style.display = 'none';
  document.getElementById('chatInputBar').style.display = 'none';
  document.getElementById('messagesContainer').innerHTML = `
    <div class="placeholder-chat">
      <div class="empty-icon">⚖️</div>
      <h3>Welcome to LegalHelp</h3>
      <p>Select a consultation from the sidebar, or click below to start a new legal inquiry.</p>
      <button class="btn btn-primary" onclick="handleNewConversation()" style="margin-top: 16px;">
        + Start New Consultation
      </button>
    </div>
  `;
}

function renderActiveConversation() {
  if (!state.activeConversation) return;

  const conv = state.activeConversation;
  document.getElementById('chatHeader').style.display = 'flex';
  document.getElementById('chatInputBar').style.display = 'block';

  document.getElementById('activeConvTitle').innerText = conv.title;
  const usageBadge = document.getElementById('convUsageBadge');
  if (usageBadge) {
    usageBadge.innerText = `${conv.queryCount || 0}/${conv.maxQueries || 20} Queries · ${conv.lifetimeFilesUploaded || 0}/${conv.maxFiles || 3} Uploads`;
  }

  const galleryCountEl = document.getElementById('galleryDocsCount');
  if (galleryCountEl) {
    galleryCountEl.innerText = state.activeDocuments.length;
  }

  renderMessages();
}

function openGalleryModal() {
  const modal = document.getElementById('galleryModal');
  const list = document.getElementById('galleryList');
  if (!modal || !list) return;

  if (state.activeDocuments.length === 0) {
    list.innerHTML = '<div class="empty-state">No documents or images have been uploaded to this consultation yet. Attach one with 📎 in the chat box!</div>';
  } else {
    list.innerHTML = state.activeDocuments.map(doc => {
      const isImg = (doc.fileType || '').toLowerCase().includes('image') || (doc.fileName || '').match(/\.(png|jpe?g|webp)$/i);
      const icon = isImg ? '🖼️' : '📄';
      const sizeKb = ((doc.fileSize || 0) / 1024).toFixed(1);
      const dateStr = doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : 'Uploaded';
      return `
        <div class="gallery-card" onclick="openDocModal('${doc.id}')">
          <div class="gallery-card-left">
            <span class="gallery-card-icon">${icon}</span>
            <div>
              <div class="gallery-card-name">${escapeHtml(doc.fileName)}</div>
              <div class="gallery-card-meta">${doc.fileType || 'Document'} • ${sizeKb} KB • ${dateStr}</div>
            </div>
          </div>
          <div class="gallery-card-right">
            <button class="btn btn-sm btn-outline" onclick="event.stopPropagation(); openDocModal('${doc.id}')">Inspect</button>
          </div>
        </div>
      `;
    }).join('');
  }

  modal.style.display = 'flex';
}

function closeGalleryModal() {
  const modal = document.getElementById('galleryModal');
  if (modal) modal.style.display = 'none';
}

async function handleRenameConversation() {
  if (!state.activeConversation) return;
  const newTitle = prompt('Rename consultation title:', state.activeConversation.title);
  if (!newTitle || !newTitle.trim()) return;

  try {
    const res = await apiCall(`/api/conversations/${state.activeConversation.id}`, {
      method: 'PUT',
      body: JSON.stringify({ title: newTitle.trim() })
    });
    state.activeConversation.title = res.conversation.title;
    document.getElementById('activeConvTitle').innerText = res.conversation.title;
    fetchConversations();
    showToast('Renamed successfully.', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleDeleteConversation() {
  if (!state.activeConversation) return;
  const ok = confirm('Delete this conversation? (Note: Lifetime conversation quota is NOT refunded upon deletion).');
  if (!ok) return;

  try {
    await apiCall(`/api/conversations/${state.activeConversation.id}`, {
      method: 'DELETE'
    });
    showToast('Conversation deleted.', 'info');
    state.activeConversation = null;
    await fetchConversations();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function handleFileSelected(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 10 * 1024 * 1024) {
    showToast('File exceeds 10 MB limit.', 'error');
    e.target.value = '';
    return;
  }

  const conv = state.activeConversation;
  if (conv && (conv.lifetimeFilesUploaded || 0) >= (conv.maxFiles || 3)) {
    showToast('Maximum 3 files allowed per conversation.', 'error');
    e.target.value = '';
    return;
  }

  state.pendingFile = file;
  document.getElementById('pendingAttachmentName').innerText = file.name;
  document.getElementById('pendingAttachmentSize').innerText = `${(file.size / 1024).toFixed(1)} KB`;
  document.getElementById('pendingAttachmentPreview').style.display = 'flex';
}

function clearPendingAttachment() {
  state.pendingFile = null;
  const preview = document.getElementById('pendingAttachmentPreview');
  if (preview) preview.style.display = 'none';
  const fileInput = document.getElementById('fileInput');
  if (fileInput) fileInput.value = '';
}

async function openDocModal(docId) {
  try {
    const res = await apiCall(`/api/documents/${docId}`);
    const doc = res.document;
    document.getElementById('docModalTitle').innerText = doc.fileName;
    document.getElementById('docModalType').innerText = doc.fileType;
    document.getElementById('docModalSize').innerText = `${(doc.fileSize / 1024).toFixed(1)} KB`;

    const token = state.token || localStorage.getItem('legalhelp_token') || '';
    const fileUrl = doc.rawUrl ? `${doc.rawUrl}&token=${encodeURIComponent(token)}` : doc.cloudinaryUrl;
    document.getElementById('docModalCloudLink').href = fileUrl;

    const imgEl = document.getElementById('docModalImg');
    const pdfEl = document.getElementById('docModalPdf');

    const isImage = (doc.fileType || '').toLowerCase().includes('image') || 
                    (doc.fileName || '').match(/\.(png|jpe?g|webp)$/i);

    if (isImage) {
      imgEl.src = fileUrl;
      imgEl.style.display = 'block';
      pdfEl.style.display = 'none';
      pdfEl.src = '';
    } else {
      pdfEl.src = fileUrl;
      pdfEl.style.display = 'block';
      imgEl.style.display = 'none';
      imgEl.src = '';
    }

    document.getElementById('docModal').style.display = 'flex';
  } catch (err) {
    showToast('Failed to load document: ' + err.message, 'error');
  }
}

function closeDocModal() {
  document.getElementById('docModal').style.display = 'none';
  const imgEl = document.getElementById('docModalImg');
  const pdfEl = document.getElementById('docModalPdf');
  if (imgEl) imgEl.src = '';
  if (pdfEl) pdfEl.src = '';
}

// ---------------------------------------------------------------------------
// Chat & AI Processing
// ---------------------------------------------------------------------------
function formatMessageContent(content) {
  if (!content) return '';
  let safe = escapeHtml(content);
  // Clean any remaining markdown artifacts
  safe = safe.replace(/^#{1,6}\s*(.+)$/gm, '<strong>$1</strong>');
  safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  return safe;
}

function renderMessages() {
  const container = document.getElementById('messagesContainer');
  if (state.activeMessages.length === 0) {
    container.innerHTML = `
      <div class="placeholder-chat">
        <div class="empty-icon">⚖️</div>
        <h3>Legal Consultation Ready</h3>
        <p>Ask a question about contracts, notices, or attach documents using 📎 in the input box.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.activeMessages.map(m => {
    let attachmentsHtml = '';
    if (m.attachments && m.attachments.length > 0) {
      attachmentsHtml = `
        <div class="msg-attachments">
          ${m.attachments.map(att => {
            const isImg = (att.fileType || '').toLowerCase().includes('image') || (att.fileName || '').match(/\.(png|jpe?g|webp)$/i);
            const icon = isImg ? '🖼️' : '📄';
            const sizeStr = att.fileSize ? `${((att.fileSize) / 1024).toFixed(0)} KB` : '';
            return `
              <div class="msg-attachment-chip" onclick="openDocModal('${att.id}')" title="Click to view file">
                <span class="chip-icon">${icon}</span>
                <span class="chip-name">${escapeHtml(att.fileName)}</span>
                ${sizeStr ? `<span class="chip-size">${sizeStr}</span>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      `;
    }
    return `
      <div class="msg-wrapper ${m.role}">
        <div class="msg-bubble">
          ${attachmentsHtml}
          <div class="msg-text">${formatMessageContent(m.content)}</div>
        </div>
        <div class="msg-time">${new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
      </div>
    `;
  }).join('');

  container.scrollTop = container.scrollHeight;
}

function handleCharCount(textarea) {
  const len = textarea.value.length;
  const countEl = document.getElementById('charCount');
  countEl.innerText = `${len} / 3000 chars`;
  if (len >= 3000) {
    countEl.classList.add('warn');
  } else {
    countEl.classList.remove('warn');
  }
}

function handleTextareaKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSendMessage(e);
  }
}

async function handleSendMessage(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('queryInput');
  const queryText = input.value.trim();
  const attachedFile = state.pendingFile;

  if (!queryText && !attachedFile) return;
  if (!state.activeConversation) return;

  const sendBtn = document.getElementById('sendBtn');
  const progressBar = document.getElementById('uploadProgress');
  sendBtn.setAttribute('disabled', 'true');
  sendBtn.innerText = 'Processing...';

  // Step 1: If there is an attached file, upload & analyze it first
  let newlyUploadedDoc = null;
  if (attachedFile) {
    progressBar.style.display = 'block';
    const formData = new FormData();
    formData.append('conversationId', state.activeConversation.id);
    formData.append('file', attachedFile);

    try {
      const uploadRes = await apiCall('/api/documents/upload', {
        method: 'POST',
        body: formData
      });
      newlyUploadedDoc = uploadRes.document;
      state.activeDocuments.push(newlyUploadedDoc);
      state.activeConversation.lifetimeFilesUploaded = uploadRes.usage.lifetimeFilesUploaded;
      clearPendingAttachment();
      showToast('Document uploaded & attached!', 'success');
    } catch (uploadErr) {
      progressBar.style.display = 'none';
      sendBtn.removeAttribute('disabled');
      sendBtn.innerText = 'Send';
      showToast(uploadErr.message, 'error');
      return;
    } finally {
      progressBar.style.display = 'none';
    }
  }

  const effectivePrompt = queryText || 'Please analyze the attached document and provide a comprehensive explanation of its clauses, terms, and legal implications.';
  const idempotencyKey = 'web_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);

  // Optimistically display user message with attachment
  const tempUserMsg = {
    id: 'temp_u_' + Date.now(),
    role: 'user',
    content: effectivePrompt,
    attachments: newlyUploadedDoc ? [newlyUploadedDoc] : [],
    createdAt: new Date().toISOString()
  };
  state.activeMessages.push(tempUserMsg);
  renderMessages();
  input.value = '';
  handleCharCount(input);

  try {
    const res = await apiCall('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        conversationId: state.activeConversation.id,
        queryText: effectivePrompt,
        idempotencyKey,
        documentIds: state.activeDocuments.map(d => d.id),
        attachedDocIds: newlyUploadedDoc ? [newlyUploadedDoc.id] : []
      })
    });

    // Update messages
    state.activeMessages = state.activeMessages.filter(m => m.id !== tempUserMsg.id);
    state.activeMessages.push(res.userMessage, res.modelMessage);

    // CRITICAL: Update both active conversation and sidebar item query count
    const updatedCount = res.usage ? res.usage.queryCount : (state.activeConversation.queryCount + 1);
    state.activeConversation.queryCount = updatedCount;
    const match = state.conversations.find(c => c.id === state.activeConversation.id);
    if (match) {
      match.queryCount = updatedCount;
    }

    renderActiveConversation();
    renderConversationsList();
  } catch (err) {
    state.activeMessages = state.activeMessages.filter(m => m.id !== tempUserMsg.id);
    renderMessages();
    showToast(err.message, 'error');
  } finally {
    sendBtn.removeAttribute('disabled');
    sendBtn.innerText = 'Send';
  }
}

// ---------------------------------------------------------------------------
// Global Quota & Circuit Breaker Status
// ---------------------------------------------------------------------------
async function fetchGlobalStatus() {
  try {
    const res = await apiCall('/api/usage/status');
    state.circuitBreaker = res.globalQuota.circuitBreaker || { state: 'CLOSED' };

    const dot = document.getElementById('circuitBreakerDot');
    const text = document.getElementById('circuitBreakerText');
    const stateName = state.circuitBreaker.state || 'CLOSED';

    dot.className = 'status-dot';
    if (stateName === 'OPEN') dot.classList.add('open');
    if (stateName === 'HALF_OPEN') dot.classList.add('half-open');
    text.innerText = `Circuit: ${stateName}`;

    document.getElementById('modalCircuitState').innerText = `State: ${stateName}`;
    document.getElementById('modalCircuitReason').innerText = state.circuitBreaker.tripReason || 'Operating within safe quotas.';
    document.getElementById('metricDailyReq').innerText = `${res.globalQuota.dailyRequests} / ${res.globalQuota.maxDailyRequests}`;
    document.getElementById('metricMinuteReq').innerText = `${res.globalQuota.minuteRequests} / ${res.globalQuota.maxMinuteRequests}`;
    document.getElementById('metricConcurrent').innerText = `${res.globalQuota.activeConcurrentRequests} / ${res.globalQuota.maxConcurrentRequests}`;
    document.getElementById('metricTokens').innerText = `${res.globalQuota.tokensToday.input} in / ${res.globalQuota.tokensToday.output} out`;
  } catch (err) {
    console.warn('Failed to fetch status:', err.message);
  }
}

function openQuotaModal() {
  fetchGlobalStatus();
  document.getElementById('quotaModal').style.display = 'flex';
}

function closeQuotaModal() {
  document.getElementById('quotaModal').style.display = 'none';
}

function refreshQuotaStatus() {
  fetchGlobalStatus();
  showToast('Quota status refreshed.', 'info');
}
