const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('./config');

const SYSTEM_INSTRUCTION = `You are LegalHelp, an expert AI legal assistant. You specialize strictly in legal matters, laws, regulations, court procedures, contracts, notices, and legal document analysis.

STRICT DOMAIN SCOPE:
- You ONLY answer questions related to law, legal rights, statutory provisions, court procedures, disputes, contracts, and legal documentation.
- If a user asks about anything non-legal (such as jokes, coding, casual chit-chat, cooking, medical advice, creative writing, general trivia, weather, entertainment), or if an uploaded document is completely non-legal, you MUST politely refuse:
  "I am an AI assistant dedicated exclusively to legal assistance and document analysis. Please submit a question or document related to law, contracts, or legal procedures."

RESPONSE FORMAT & CONCISENESS RULES:
1. Direct & Concise: Provide concise, high-value, exact answers without long introductory fluff ("Here is a comprehensive breakdown...") or concluding summaries. Dive straight into the core points.
2. Structure:
   - For procedures or step-by-step guidance: Use numbered lists (1. Step One, 2. Step Two).
   - For lists of requirements, rights, or considerations: Use clean bullet points (• Item).
   - For section titles or steps: Use bold text followed by a colon (e.g. **Phase 1: Pre-Trial Procedures:**).
   - NEVER use markdown header hashes (DO NOT use '#', '##', '###', etc.).
   - NEVER use horizontal dividers (DO NOT use '---' or '***').
3. Multi-turn Follow-ups:
   - Treat conversation naturally like ChatGPT or Gemini. If the user asks a follow-up question referencing a previous question, step, or an uploaded document, answer directly in that context.
4. No Disclaimers:
   - Never output boilerplate legal disclaimers (e.g. "Disclaimer: I am an AI, not a lawyer...").`;

let genAI = null;
if (config.GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
}

/**
 * Sanitizes AI output: removes raw markdown header symbols (#), horizontal dividers (---),
 * and formats bullets cleanly.
 */
function sanitizeAiReply(text) {
  if (!text) return '';
  return text
    // Replace markdown headings (# Heading, ## Heading, ### Heading) with **Heading**
    .replace(/^#{1,6}\s*(.+)$/gm, '**$1**')
    // Remove divider lines (--- or *** or ___)
    .replace(/^[*\-_]{3,}\s*$/gm, '')
    // Replace asterisk or dash bullets (* item, - item) with clean unicode bullet (• item)
    .replace(/^\s*[\*\-]\s+/gm, '• ')
    // Remove any boilerplate disclaimer if generated
    .replace(/^(?:\*|_)?(?:Disclaimer|Notice):\s*I am (?:an AI|not a lawyer|not an attorney)[\s\S]*?(?:\n\n|\r\n\r\n|$)/im, '')
    // Collapse excessive consecutive blank lines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Generates an AI response for legal consultation with context awareness.
 * @param {string} prompt - User query
 * @param {Array} conversationHistory - Recent messages [{ role: 'user'|'model', content: string }]
 * @param {Array} documents - Uploaded documents with summaries and extractedText
 * @returns {Promise<{ reply: string, tokens: { input: number, output: number } }>}
 */
async function generateLegalAdvice(prompt, conversationHistory = [], documents = []) {
  if (!config.GEMINI_API_KEY || !genAI) {
    return generateMockLegalResponse(prompt, documents);
  }

  const model = genAI.getGenerativeModel({
    model: config.GEMINI_MODEL || 'gemini-2.5-flash-lite',
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: {
      maxOutputTokens: config.GLOBAL_MAX_OUTPUT_TOKENS || 1024,
      temperature: 0.2
    }
  });

  // Assemble contextual prompt
  let contextBlock = '';
  if (documents && documents.length > 0) {
    contextBlock += '[Attached Documents in this Consultation]:\n';
    documents.forEach((doc, idx) => {
      contextBlock += `Document ${idx + 1}: "${doc.fileName || 'Uploaded Document'}" (${doc.fileType || 'PDF/Image'})\n`;
      if (doc.summary) {
        contextBlock += `Summary: ${doc.summary}\n`;
      }
      if (doc.extractedText) {
        const excerpt = doc.extractedText.slice(0, 5000);
        contextBlock += `Extracted Content:\n${excerpt}\n${doc.extractedText.length > 5000 ? '[...excerpt truncated for brevity...]' : ''}\n`;
      }
      contextBlock += '\n';
    });
    contextBlock += '[End of Documents]\n\n';
  }

  // Rolling chat history (last 10 messages for robust multi-turn follow-up context)
  const recentHistory = (conversationHistory || []).slice(-10).map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.content }]
  }));

  const chat = model.startChat({
    history: recentHistory
  });

  const fullPrompt = contextBlock ? `${contextBlock}User Query:\n${prompt}` : prompt;
  const result = await chat.sendMessage(fullPrompt);
  const response = await result.response;
  const rawReply = response.text();
  const replyText = sanitizeAiReply(rawReply);

  const usage = response.usageMetadata || {};
  const inputTokens = usage.promptTokenCount || Math.ceil(fullPrompt.length / 4);
  const outputTokens = usage.candidatesTokenCount || Math.ceil(replyText.length / 4);

  return {
    reply: replyText,
    tokens: {
      input: inputTokens,
      output: outputTokens
    }
  };
}

function generateMockLegalResponse(prompt, documents) {
  let docMention = '';
  if (documents && documents.length > 0) {
    docMention = `Based on attached document "${documents[0].fileName}":\n\n`;
  }

  const reply = `${docMention}Regarding "${prompt.slice(0, 80)}":\n\n` +
    `**Key Considerations:**\n` +
    `• Standard legal agreements stipulate performance metrics, dispute resolution mechanisms, and formal notice periods.\n` +
    `• Review all statutory timelines and ensure all signatures and required notary seals are intact.\n` +
    `• Confirm defined terms and maintain written records of all notices.`;

  return {
    reply: sanitizeAiReply(reply),
    tokens: {
      input: Math.ceil(prompt.length / 4),
      output: Math.ceil(reply.length / 4)
    }
  };
}

module.exports = {
  generateLegalAdvice,
  sanitizeAiReply
};
