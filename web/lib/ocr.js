const pdfParse = require('pdf-parse');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('./config');

let genAI = null;
if (config.GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
}

/**
 * Extracts text and generates a summary from PDF or image documents using PDF-parse and Gemini Multimodal.
 * @param {Buffer} buffer - File buffer
 * @param {string} mimeType - e.g. application/pdf, image/jpeg, image/png
 * @param {string} fileName - Original file name
 * @returns {Promise<{ extractedText: string, summary: string }>}
 */
async function processDocument(buffer, mimeType, fileName) {
  let extractedText = '';
  let summary = '';

  const cleanMime = (mimeType || '').toLowerCase();
  const isPdf = cleanMime.includes('pdf') || fileName.toLowerCase().endsWith('.pdf');

  // 1. Direct PDF Text Parsing
  if (isPdf) {
    try {
      const data = await pdfParse(buffer);
      if (data && data.text && data.text.trim().length > 30) {
        extractedText = data.text.trim();
      }
    } catch (pdfErr) {
      console.warn('[PDF-Parse] Direct text extraction failed, falling back to Gemini Vision OCR:', pdfErr.message);
    }
  }

  // 2. Gemini Multimodal Vision / OCR (for Images and Scanned PDFs)
  if (!extractedText && genAI) {
    try {
      const visionModel = genAI.getGenerativeModel({
        model: config.GEMINI_MODEL || 'gemini-3.5-flash-lite',
        generationConfig: { maxOutputTokens: 3000 }
      });

      const actualMime = isPdf ? 'application/pdf' : (cleanMime.includes('png') ? 'image/png' : 'image/jpeg');
      const imagePart = {
        inlineData: {
          data: buffer.toString('base64'),
          mimeType: actualMime
        }
      };

      const prompt = `You are an expert legal document OCR and analysis engine.
Transcribe and extract ALL visible text, headings, clauses, signature lines, parties, and notations from this document image/file accurately.
Organize the extracted content cleanly under clear markdown headings.
At the end, provide a concise summary of the document's legal purpose and key obligations.`;

      const result = await visionModel.generateContent([prompt, imagePart]);
      const ocrResponse = (await result.response).text();

      if (ocrResponse && ocrResponse.trim()) {
        extractedText = ocrResponse.trim();
      }
    } catch (visionErr) {
      console.error('[Gemini Vision OCR] Extraction error:', visionErr.message);
    }
  }

  // 3. Fallback text if still empty
  if (!extractedText) {
    extractedText = `Document: ${fileName} (${cleanMime}). Uploaded successfully.`;
  }

  // 4. Generate structured summary
  if (extractedText.includes('### Document Summary') || extractedText.includes('Summary:')) {
    const summaryMatch = extractedText.match(/(?:###\s*Document Summary|Summary:)\s*([\s\S]+)$/i);
    if (summaryMatch && summaryMatch[1]) {
      summary = summaryMatch[1].trim().slice(0, 350);
    }
  }
  if (!summary) {
    summary = extractedText.length > 300
      ? extractedText.slice(0, 250).replace(/\s+/g, ' ') + '...'
      : extractedText.replace(/\s+/g, ' ');
  }

  return {
    extractedText,
    summary
  };
}

module.exports = {
  processDocument
};
