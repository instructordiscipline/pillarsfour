# PILLARS Life Grid — Pure Client-Side PWA + One-APK Wrapper

This version is **pure client-side**:
- Runs entirely in the browser (PWA)
- Stores data on-device using **IndexedDB**
- Works offline via Service Worker
- Generates the Lifetime PNG locally in the browser (Canvas)

It also includes a **Capacitor wrapper** to build a single Android APK.

---

## Run as a PWA (desktop or Android browser)

### Local testing on a computer
Service Workers require HTTPS or localhost. This works:

1) Install Node.js (LTS recommended)
2) From this folder:
   ```bash
   npm install
   npm run serve
   ```
3) Open:
   http://127.0.0.1:5173

### Install on Android as a PWA (clean “app” feel)
1) Host the `www/` folder on **HTTPS** (company domain / cloud hosting)
2) Open the site in Chrome on Android
3) Menu → **Install app** (or Add to Home screen)
4) Launch from the new icon (full-screen, no browser chrome)

---

## Build a single Android APK (one-and-done install)

### Requirements
- Node.js (LTS)
- Android Studio (installs SDK + build tools)
- Java 17 recommended (Android Studio bundles a JDK)

### Steps
1) Install dependencies:
   ```bash
   npm install
   ```

2) Create Android project (first time only):
   ```bash
   npm run cap:add:android
   ```

3) Sync web assets into Android:
   ```bash
   npm run cap:sync
   ```

4) Build debug APK:
   ```bash
   npm run android:debug
   ```

Your APK will be at:
`android/app/build/outputs/apk/debug/app-debug.apk`

Install it on a phone:
- copy the file to the phone
- open it (allow “Install unknown apps” when prompted)

---

## Release APK (signed)
For public distribution, you must sign a release build.

1) Open `android/` in Android Studio
2) **Build → Generate Signed Bundle / APK**
3) Create / choose a keystore, then build a signed APK/AAB



---

## Phone-only: build the APK in the cloud (no Android Studio / Node)

1) Create a GitHub repository and upload the contents of this zip.
2) In GitHub, go to **Actions** and enable workflows.
3) Go to **Actions → “Build Android APK (offline)” → Run workflow**.
4) When it finishes, download the APK from:
   - **Artifacts** (Actions run page), or
   - **Releases** (if you create a tag like `v1` and push it).

The APK produced is a **fully offline** build because the web assets are bundled in the app and Capacitor serves those bundled files when no `server.url` is set.


Updated features: Month default view, mobile PNG save, backup/restore, pre-start greying, year fit, clipboard rename, unsaved clipboard export.


Fix in this build: service worker disabled in APK shell to prevent blank-screen cache issues after app updates.


Fix in this build: corrected a JavaScript string bug that could prevent the app content from rendering.


Latest updates:
- App renamed to Life Grid
- New 3x3 grid icon generated for web + Android build pipeline
- Save PNG now uses current view
- Save Export File added for day text export
- Android back button now requires double-tap to exit on Dashboard


Android-native patch:
- Uses Capacitor App plugin for back button handling
- Uses Filesystem + Share for PNG and backup export on Android


This package is flattened correctly for direct repo upload. Upload the FILES/FOLDERS in this package to the repo root, not a parent wrapper folder.
