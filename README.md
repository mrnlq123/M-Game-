# WORLD ARENA

A global 3D multiplayer online battle arena platform featuring:
1. **Live Interactive Web Platform & Authoritative Server** (`server.ts`, `src/`):
   - Full-screen Three.js 3D arena engine with PBR `RoomEnvironment`, procedural textures, composite 8-part Arena Runner models, 4 futuristic maps (`Neon City Arena`, `Floating Sky Island`, `Desert Energy Arena`, `Ice Crystal Arena`), third-person camera, virtual joystick & touch controls, and offline Practice Mode AI.
   - Authoritative 20Hz Express + WebSocket server (`server.ts`) validating movement bounds, obstacle collisions, fire rate cooldowns, energy-tag hit detection, objective captures, reconnection tokens, and profanity-filtered chat.
   - Real WebRTC peer-to-peer voice chat (`src/services/webrtcVoice.ts`) with microphone permission handling, mute/unmute, speaker volume, Push-to-Talk, and automatic disconnect on match exit.
   - Firebase Authentication (Google Sign-In) & Cloud Firestore (`users`, `profiles`, `friends`, `rooms`, `matchmaking`, `matches`, `match_results`, `leaderboards`, `reports`, `announcements`, `game_config`) secured by hardened `firestore.rules`.
   - Separate verified Admin Operations Console (`src/components/AdminDashboardModal.tsx`).

2. **Native Android Kotlin + Jetpack Compose + Google Filament Project** (`android-project/`):
   - Package: `com.worldarena.game` · App Name: `WORLD ARENA`
   - Built with Kotlin, Jetpack Compose Material 3, Google Filament 3D (`FilamentArenaView.kt`), OkHttp WebSockets (`GameWebSocketClient.kt`), `stream-webrtc-android` (`WebRtcVoiceManager.kt`), Google Sign-In, and Firebase Auth/Firestore (`FirebaseRepository.kt`) targeting Firestore database `ai-studio-36007029-10bd-41bf-a4f0-28fcb051f9fd`.

---

## Automatic Android APK Build via GitHub Actions (No Computer or Android Studio Needed)

The workflow `.github/workflows/android-apk.yml` (**Android APK Build**) automatically builds `android-project/app/build/outputs/apk/debug/app-debug.apk` on GitHub's Ubuntu runners using Java 17, Android SDK 35, and Gradle 8.9.

### 1. Upload the Project to GitHub
1. Create a new repository on [github.com](https://github.com) (using your phone browser or desktop).
2. Upload all project files—making sure both `android-project/` and `.github/workflows/android-apk.yml` are included in the repository root.
   - *(Optional for online Google Sign-In in the Android APK):* Download `google-services.json` from the Firebase Console for package `com.worldarena.game` and place it at `android-project/app/google-services.json` before pushing. Offline Practice Mode works even without `google-services.json`.

### 2. Open the Actions Tab
1. Open your GitHub repository in Chrome or your phone browser.
2. Tap the **Actions** tab at the top of the repository page (tap **Enable workflows** if prompted on a new repo).

### 3. Run the Android APK Build Workflow
1. Pushing code to GitHub triggers **Android APK Build** automatically.
2. To start a build manually from your phone anytime:
   - Tap **Android APK Build** in the workflow list.
   - Tap the **Run workflow** dropdown button, keep your branch selected, and tap **Run workflow**.

### 4. Monitor Build Progress
1. Tap the running workflow entry (for example, `Build WORLD ARENA Debug APK`).
2. Watch each step complete in real time (`Set up Java 17` -> `Set up Android SDK` -> `Build Android Debug APK` -> `Verify Debug APK Exists` -> `Upload Debug APK Artifact`).
3. If any step fails, open the step logs directly or download the `WORLD-ARENA-BUILD-LOGS` artifact for full Gradle diagnostics.

### 5. Download and Install the APK on Your Android Phone
1. Once the workflow shows a green checkmark, scroll to the **Artifacts** section at the bottom of the workflow summary page.
2. Tap **WORLD-ARENA-DEBUG-APK** to download the `.zip` archive to your phone.
3. Open your phone's **Files** app, extract the downloaded `.zip`, and tap `app-debug.apk` (allow **Install unknown apps** for your browser/Files app if prompted) to install **WORLD ARENA**.

---

## Optional Local Signed `.aab` Build (Google Play Console)
To compile a signed release Android App Bundle locally when using Android Studio / JDK 17:
```bash
keytool -genkey -v -keystore release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias worldarena
export ANDROID_KEYSTORE_PATH="$(pwd)/release.jks"
export ANDROID_KEYSTORE_PASS="YOUR_STORE_PASSWORD"
export ANDROID_KEY_ALIAS="worldarena"
export ANDROID_KEY_PASS="YOUR_KEY_PASSWORD"
cd android-project
./gradlew bundleRelease
```
Output AAB: `android-project/app/build/outputs/bundle/release/app-release.aab`
