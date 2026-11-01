# LegalHelp ⚖️



> **AI-Powered Citizen Legal & Administrative Document Navigator**

## 🛠️ Tech Stack

**Frontend & Mobile**

![Android](https://img.shields.io/badge/Android-3DDC84?style=for-the-badge&logo=android&logoColor=white)
![Kotlin](https://img.shields.io/badge/Kotlin-7F52FF?style=for-the-badge&logo=kotlin&logoColor=white)
![Jetpack Compose](https://img.shields.io/badge/Jetpack_Compose-4285F4?style=for-the-badge&logo=jetpackcompose&logoColor=white)

**Backend & Database**

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![MongoDB Atlas](https://img.shields.io/badge/MongoDB_Atlas-47A248?style=for-the-badge&logo=mongodb&logoColor=white)

**AI, Authentication & Storage**

![Google Gemini](https://img.shields.io/badge/Google_Gemini-8E75C2?style=for-the-badge&logo=googlegemini&logoColor=white)
![Clerk](https://img.shields.io/badge/Clerk-6C47FF?style=for-the-badge&logo=clerk&logoColor=white)
![Cloudinary](https://img.shields.io/badge/Cloudinary-3448C5?style=for-the-badge&logo=cloudinary&logoColor=white)

---

## 🚀 Quick Access
📱 **Android App** : [Download Latest APK (GitHub Releases)](https://github.com/KidOfCoding/Legal-Help/releases/latest) 

🌐 **Website** : <https://legal-help-web-theta.vercel.app>

---

## 📌 Overview

**LegalHelp** bridges the justice gap for everyday citizens navigating opaque bureaucracies, official rejections, and legal notices. Common citizens frequently encounter intimidating administrative paperwork—ranging from inflated utility bills and arbitrary tenancy termination notices to caste/residency certificate rejections and consumer warranty denials.

LegalHelp allows users to take a photo or upload a PDF of their paperwork. Using native multimodal processing via **Google Gemini**, the platform provides:

* **Plain-Language Clarification:** Demystifies archaic legal jargon into simple, actionable summaries.
* **Statutory Rights Identification:** Identifies relevant acts, legal entitlements, and civil protections.
* **Procedural Roadmaps:** Provides step-by-step guidance on where, how, and when to appeal.
* **Automated Grievance & RTI Drafting:** Auto-generates formal grievance petitions and Right to Information (RTI) drafts ready to submit to relevant authorities.

---

## 🏗️ Architecture & Data Flow

```text
       ┌────────────────────────┐         ┌────────────────────────┐
       │   Android Client       │         │   Web Client (SPA)     │
       │ (Kotlin / Compose)     │         │ (Vanilla JS / CSS3)    │
       │ [MemoryCacheManager]   │         │ [Clerk.js SDK]         │
       └───────────┬────────────┘         └───────────┬────────────┘
                   │                                  │
                   │ HTTPS / REST (Multipart & JSON)  │
                   ▼                                  ▼
      ┌─────────────────────────────────────────────────────────────┐
      │              Vercel Serverless API (Node.js)                │
      │   - Auth Verification & 30-Day Session Minting (Clerk)      │
      │   - Direct Document Ingestion & Context Routing             │
      └──────────────┬──────────────────────────────┬───────────────┘
                     │                              │
         Asset Upload│                   State Sync │
                     ▼                              ▼
      ┌──────────────────────────────┐  ┌───────────────────────────┐
      │   Cloudinary Media Host      │  │   MongoDB Atlas Cloud     │
      │   - Raw PDF storage          │  │   - Database: legalease_db│
      │   - Document photo hosting   │  │   - Multi-Turn Threads    │
      └──────────────┬───────────────┘  └───────────┬───────────────┘
                     │                              │
                     └──────────────┬───────────────┘
                                    │
                                    ▼
      ┌─────────────────────────────────────────────────────────────┐
      │            Google Gemini Multimodal Engine                  │
      │        (`gemini-2.5-flash` / `gemini-2.5-flash-lite`)       │
      │   - Direct inlineData Base64 Ingestion (No 3rd-party OCR)   │
      │   - Statutory Analysis & Grievance Generation Engine        │
      └─────────────────────────────┬───────────────────────────────┘
                                    │
                                    ▼
      ┌─────────────────────────────────────────────────────────────┐
      │       Structured Citizen Remedies & Draft Grievances        │
      │ (Returned to Client with 0ms Re-render Cached Latency)      │
      └─────────────────────────────────────────────────────────────┘

```

---

## 🚀 Core Features

* **Multimodal Document Ingestion:** Direct base64 `inlineData` transmission to Google Gemini eliminates fragile external OCR dependencies, reliably parsing scanned documents, handwritten signatures, stamps, and low-resolution camera uploads.
* **Context-Preserved Multi-Turn Memory:** Multi-turn conversational memory allows follow-up questions directly grounded in previously uploaded documents.
* **Citizen Legal Simplification:** Automatically cleanses heavy markdown artifacts and delivers structured, concise bullet points and procedural workflows.
* **Liability & Deadline Detection:** Automatically surfaces statutory limitation periods, appeal windows, and reply deadlines from notice headers.
* **Automated Grievance & RTI Drafting:** Generates formal grievance redressal letters, RTI applications, and legal replies formatted to municipal and administrative standards.
* **Zero-Latency Two-Tier Caching:** Combines an in-memory `MemoryCacheManager` with a 50 MB OkHttp disk cache for instantaneous (0ms) screen transitions and offline reliability.

---

## 🔐 Environment Variables

Create a `.env` file inside the `web/` directory:

| Variable Name | Required | Description | Where to Obtain |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | **Yes** | API key for Gemini Multimodal API | [Google AI Studio](https://aistudio.google.com/) |
| `CLERK_PUBLISHABLE_KEY` | **Yes** | Clerk Frontend Publishable Key (`pk_...`) | [Clerk Dashboard](https://dashboard.clerk.com/) |
| `CLERK_SECRET_KEY` | **Yes** | Clerk Backend Secret Key (`sk_...`) | [Clerk Dashboard](https://dashboard.clerk.com/) |
| `MONGODB_URI` | **Yes** | MongoDB Atlas connection string (`mongodb+srv://...`) | [MongoDB Atlas](https://www.mongodb.com/atlas) |
| `CLOUDINARY_CLOUD_NAME` | **Yes** | Cloudinary Cloud Name | [Cloudinary Console](https://cloudinary.com/console) |
| `CLOUDINARY_API_KEY` | **Yes** | Cloudinary API Key | [Cloudinary Console](https://cloudinary.com/console) |
| `CLOUDINARY_API_SECRET` | **Yes** | Cloudinary API Secret | [Cloudinary Console](https://cloudinary.com/console) |

---

## 🛠️ Local Setup & Development

### 1. Backend & Web Client

1. Install dependencies:
```bash
cd web
npm install

```


2. Populate `.env` with your API keys.
3. Start the dev server:
```bash
npm run dev

```


4. Access the web dashboard at `http://localhost:3000`.

---

### 2. Android Client Setup

1. Open `android/` and verify `local.properties` contains your Android SDK path:
```properties
sdk.dir=C\:\\Users\\<Username>\\AppData\\Local\\Android\\Sdk

```


2. If testing against a local backend on your phone over USB:
```bash
adb reverse tcp:3000 tcp:3000

```


3. Compile and install directly to your device:
```bash
# Windows PowerShell
.\gradlew.bat installDebug

# macOS / Linux
./gradlew installDebug

```



---

## 📡 Primary API Endpoints

Base URL: `/api`

| Endpoint | Method | Payload / Format | Purpose |
| --- | --- | --- | --- |
| `/auth/clerk-flow` | `POST` | `{"action", "email", "password", "code"}` | Headless Clerk authentication with OTP dispatch and verification. |
| `/conversations` | `GET` / `POST` | JSON (`{"title"}`) | Lists all chat threads or initializes a new consultation. |
| `/documents/upload` | `POST` | `multipart/form-data` (`file`, `conversationId`) | Uploads image or PDF to Cloudinary and saves metadata to MongoDB. |
| `/chat` | `POST` | `{"conversationId", "message", "attachments"}` | Ingests document data and prompt to stream Gemini legal reasoning and grievance drafts. |

---

## ⚖️ Statutory Legal Disclaimer

> **IMPORTANT NOTICE:**
> **LegalHelp is an automated civic technology and administrative document navigation tool, NOT a law firm, attorney, or certified legal practitioner.**
> The information, statutory citations, roadmaps, and drafts provided by LegalHelp are for **educational and informational purposes only** and do not constitute formal legal advice, representation, or an attorney-client relationship. Laws and administrative regulations vary significantly across jurisdictions and change frequently. Users must review all generated letters, grievance drafts, and legal assessments with a qualified advocate, legal aid counsel, or competent administrative officer before initiating formal proceedings or signing documents.