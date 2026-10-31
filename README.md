# LegalHelp — AI-Powered Legal Assistance Monorepo

LegalHelp is an AI-powered legal assistance platform designed for low-resource environments and serverless cloud deployment. It enables users to upload legal documents (PDFs, images), ask legal questions with strict disclaimers, track lifetime consultation quotas, and inspect real-time system quota health.

This repository is organized as a clean monorepo separating the native Android application, the centralized serverless backend & lightweight web client, and technical documentation.

---

## 📁 Repository Structure

```text
LegalHelp/
├── android/            # Complete Native Android Application (Gradle CLI + ADB)
│   ├── app/            # Jetpack Compose UI, ViewModels, Theme
│   ├── data/           # Retrofit API client, DTOs, Auth Interceptor, Repositories
│   ├── domain/         # Domain models, Use Cases, Repository interfaces
│   ├── buildSrc/       # Gradle dependency management
│   ├── gradle/         # Gradle Wrapper files
│   ├── build.gradle.kts
│   ├── settings.gradle.kts
│   ├── gradle.properties
│   ├── local.properties
│   ├── gradlew
│   └── gradlew.bat
│
├── web/                # Shared Backend APIs & Lightweight Web Frontend
│   ├── api/            # Vercel Serverless Functions (REST endpoints)
│   │   ├── auth/me.js
│   │   ├── conversations/index.js
│   │   ├── conversations/[id].js
│   │   ├── documents/upload.js
│   │   ├── documents/[id].js
│   │   ├── usage/status.js
│   │   └── chat.js
│   ├── lib/            # Shared business logic & cloud SDK wrappers
│   │   ├── atomic-usage.js    # Concurrency-safe quota reservation engine
│   │   ├── quota-manager.js   # Global Gemini quota tracker & 3-state circuit breaker
│   │   ├── gemini.js          # Google Gemini 1.5 Flash client + disclaimers
│   │   ├── clerk.js           # Clerk ID & Session token verification
│   │   ├── mongodb.js         # MongoDB connection pooling & index manager
│   │   ├── memory-db.js       # Embedded fallback database for local/offline runs
│   │   ├── cloudinary.js      # Document storage wrapper
│   │   ├── ocr.js             # PDF text extraction & OCR parser
│   │   └── config.js          # Unified environment loader
│   ├── public/         # Minimal Web Frontend Dashboard
│   │   ├── index.html
│   │   ├── style.css
│   │   └── app.js
│   ├── test/           # Comprehensive backend & concurrency test suite
│   │   └── backend-test.js
│   ├── dev-server.js   # Local Node.js development server
│   ├── package.json    # Backend dependencies & npm scripts
│   ├── package-lock.json
│   ├── vercel.json     # Vercel serverless rewrite rules
│   └── .env.example    # Environment variable template
│
├── docs/               # Architecture and Technical Documentation
│   ├── ARCHITECTURE.md
│   ├── QUOTA_AND_CIRCUIT_BREAKER.md
│   └── API_REFERENCE.md
│
├── README.md           # Monorepo overview and developer guides
├── .gitignore          # Multi-project ignore patterns (Android + Node)
└── .vercelignore       # Excludes Android & docs from Vercel deployments
```

---

## 🛠️ Development Workflows

### 1. Web Frontend & Shared Backend (`web/`)

The backend is built for Vercel Serverless Functions. A local zero-dependency development server (`dev-server.js`) mirrors Vercel's routing and serves the static web client from `public/`.

#### Prerequisites
- Node.js 18+ (tested on Node v24.21.0)
- npm 9+

#### Setup & Local Development
```powershell
# 1. Navigate to the web workspace
cd web

# 2. Install dependencies
npm install

# 3. Create your local environment configuration
Copy-Item .env.example .env
# Edit .env with your credentials (MongoDB Atlas, Gemini API, Clerk, Cloudinary)

# 4. Run the automated test suite (verifies atomic quotas & circuit breaker)
npm test

# 5. Start the local development server (binds to 0.0.0.0:3000)
npm run dev
```

The web dashboard is now accessible at `http://localhost:3000`.

---

### 2. Android Application (`android/`)

The Android application is optimized for lightweight development using the Gradle CLI and ADB on physical devices or emulators, without requiring heavy IDE overhead.

#### Prerequisites
- Android SDK & Command-Line Tools (`C:\Android`)
- Java JDK 17 LTS
- Physical Android device connected via USB with USB Debugging enabled (or AVD)

#### Setup & CLI Workflow
```powershell
# 1. Navigate to the android workspace
cd android

# 2. Verify connected device via ADB
adb devices

# 3. (Optional) Forward port 3000 if testing against localhost
adb reverse tcp:3000 tcp:3000

# 4. Build the debug APK using Gradle CLI
.\gradlew.bat assembleDebug

# 5. Install the APK on the connected device
.\gradlew.bat installDebug

# 6. Launch the LegalHelp application via ADB
adb shell am start -n com.minimal.template/.presentation.ui.MainActivity

# 7. View live application logs filtered by app tag
adb logcat -s LegalHelp OkHttp Retrofit AndroidRuntime
```

#### Pointing Android to Local or Production Backend
In `android/data/src/main/java/com/minimal/template/data/di/NetworkModule.kt`:
```kotlin
// For local testing on Wi-Fi:
const val BASE_URL = "http://192.168.1.14:3000/"

// For local testing via adb reverse:
// const val BASE_URL = "http://127.0.0.1:3000/"

// For production deployment on Vercel:
// const val BASE_URL = "https://your-legalhelp-deployment.vercel.app/"
```

---

## 🚀 Vercel Deployment Guide

To deploy the centralized backend and web client to Vercel:

### Setting Root Directory to `web`
1. Push this repository to GitHub / GitLab / Bitbucket.
2. In the [Vercel Dashboard](https://vercel.com/dashboard):
   - Click **Add New Project** and import the repository.
   - In **Project Settings** > **Build & Development Settings**:
     - Set **Root Directory** to `web`.
     - Leave Build Command and Output Directory as default (Vercel automatically detects the serverless functions in `api/` and static assets in `public/`).
3. In **Project Settings** > **Environment Variables**, add the variables defined in `web/.env.example`:
   - `GEMINI_API_KEY`
   - `MONGODB_URI`
   - `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
   - Free-tier limits: `FREE_MAX_CONVERSATIONS`, `FREE_MAX_QUERIES_PER_CONVERSATION`, etc.
   - Global quota limits: `GLOBAL_MAX_REQUESTS_PER_DAY`, `GLOBAL_MAX_REQUESTS_PER_MINUTE`, etc.
4. Click **Deploy**.

> **Note:** The root `.vercelignore` file explicitly excludes `android/` and `docs/`, guaranteeing that Vercel never attempts to analyze or build the Android project.

---

## 🔒 Security & Architecture Guarantees

- **Single Shared API:** Both the Android app and the Web client interact with the exact same endpoints (`/api/auth/me`, `/api/conversations`, `/api/chat`, `/api/documents/upload`, `/api/usage/status`).
- **No Client Secrets:** Gemini, MongoDB, Cloudinary, and Clerk Secret Key exist solely within `web/` serverless functions.
- **Atomic Concurrency Protection:** Quota enforcement uses single-stage conditional MongoDB mutations (`$inc` guarded by `$lt`), preventing race conditions from simultaneous requests.
- **Global Circuit Breaker:** Protects upstream Gemini API limits with automatic 3-state circuit tripping (`CLOSED` -> `OPEN` -> `HALF_OPEN`) and request cooldowns.
- **Educational Legal Disclaimer:** Every AI response includes clear, mandatory disclaimers establishing that LegalHelp provides informational legal analysis, not formal attorney representation.
