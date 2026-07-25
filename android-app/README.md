# HERO Sidekick — Android App

Native Android app wrapping the ERTH Sidekick webapp (https://erthsidekick.xyz)
with Firebase Cloud Messaging (FCM) push notifications.

- **Package:** `com.erth.sidekick`
- **App name:** HERO Sidekick
- **Min SDK:** 24 (Android 7.0+)
- **Target SDK:** 34 (Android 14)
- **Architecture:** WebView shell + FCM push + foreground-service polling fallback

---

## What it does

1. Loads the live webapp in a full-screen WebView (cookies persist across launches).
2. Receives push notifications via FCM for:
   - **SOS requests** (pushed to Support/Admin)
   - **New orders assigned / reassigned** (pushed to the target Hero)
   - **System notifications** (amber alerts, mirrored as pushes)
   - **Chat mentions** (pushed to mentioned users)
3. If FCM is not configured, a foreground service polls `/api/notifications`
   every 60s and posts local notifications (fallback).
4. Handles file uploads (`<input type=file>`) and pull-to-refresh.

---

## Build artifacts

After a successful build:

- Debug APK (for testing on your phone):
  `app/build/outputs/apk/debug/app-debug.apk`
- Unsigned release AAB:
  `app/build/outputs/bundle/release/app-release.aab`

---

## Prerequisites to build

Install the toolchain (already set up on this machine; recreate on another):

1. **JDK 17** — Temurin 17, extracted to
   `C:\Users\Tars\AppData\Local\Temp\kilo\android-tools\jdk17\jdk-17.0.19+10`
2. **Android SDK** — to
   `C:\Users\Tars\AppData\Local\Temp\kilo\android-tools\sdk`
   with: platform-tools, platforms;android-34, build-tools;34.0.0
3. **Gradle 8.9** — bundled via the wrapper (`gradlew.bat`), no separate install needed.

Environment variables (sourced via `android-tools\android-env.ps1`):

```
JAVA_HOME  = ...\jdk17\jdk-17.0.19+10
ANDROID_HOME = ...\sdk
PATH += %JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\cmdline-tools\latest\bin
```

---

## Build commands

From `D:\sidekickv3\android-app`:

```powershell
# Source the env (PowerShell)
. "C:\Users\Tars\AppData\Local\Temp\kilo\android-tools\android-env.ps1"

# Debug APK (installs on any device, debug-signed)
.\gradlew.bat assembleDebug

# Unsigned release AAB (sign in the controlled release pipeline)
.\gradlew.bat bundleRelease
```

First run downloads AGP + Kotlin + AndroidX (~200MB) and takes a few minutes.

---

## Enabling Firebase Cloud Messaging (FCM)

The app **builds and runs without Firebase** (uses the polling fallback).
To enable real push notifications, do this once:

### 1. Create a Firebase project

1. Go to https://console.firebase.google.com → **Add project**.
2. Name it e.g. `ERTH Sidekick`. No Google Analytics needed.
3. Project settings → **Cloud Messaging** → confirm it's enabled (legacy API).

### 2. Register the Android app

1. In the Firebase console, click the Android icon to add an app.
2. **Android package name:** `com.erth.sidekick` (must match exactly).
3. App nickname: `HERO Sidekick`, SHA-1 can be left blank for now.
4. Download **`google-services.json`**.

### 3. Drop it into the project

Place `google-services.json` at:

```
D:\sidekickv3\android-app\app\google-services.json
```

The build is feature-flagged: with this file present, Gradle automatically
applies the Google Services plugin, compiles the FCM service, and pulls in
Firebase Messaging. Rebuild:

```powershell
.\gradlew.bat assembleDebug
```

### 4. Get the FCM Server key (for the server to send pushes)

1. Firebase console → Project settings → **Cloud Messaging** tab.
2. Under "Server key" (legacy) copy the key. (If only the v1 OAuth path is shown,
   use the "Cloud Messaging API (Legacy)" card — click the 3-dot menu → enable.)

### 5. Set the server key on your app

Run this SQL on the production database (or via the admin Settings UI if you add
an FCM key field):

```sql
-- Replace <ADMIN_USER_ID> with the first admin's user.id (cuid)
INSERT INTO Setting (id, userId, key, value)
VALUES (
  lower(hex(randomblob(12))),
  '<ADMIN_USER_ID>',
  'ai_fcm_legacy_key',
  '<PASTE FCM SERVER KEY HERE>'
);
```

Or query for the admin id first:

```sql
SELECT id, username FROM "User" WHERE role='ADMIN' ORDER BY "createdAt" LIMIT 1;
```

Once the key is set, the server endpoints (`/api/sos`, `/api/orders/reassign`,
`/api/notifications`, `/api/chat`) will start sending FCM pushes. Until then, push
calls silently no-op and the Android app's polling fallback covers notifications.

---

## Publishing to the Google Play Store

### One-time: create a Play Console account

1. Go to https://play.google.com/console/signup
2. Sign in with a Google account, pay the **$25 USD one-time** registration fee.
3. Complete identity verification (may take a few days).

### Create the app listing

1. Play Console → **Create app**.
2. App name: `HERO Sidekick`. Default language: English. App/Game: **App**, Free.
3. Accept declarations → Create.

### Upload the AAB

1. Play Console → your app → **Production** → **Create new release**.
2. Upload `app-release.aab` (from `app/build/outputs/bundle/release/`).
3. Add release notes → **Save** → **Review release** → **Start rollout**.

   First release goes to "Internal testing" is recommended — upload there first,
   test on your device via the generated install link, then promote to Production.

### Fill the store listing (required before review)

Play Console → **Grow** → **Store presence** → **Main store listing**:

- **App name:** HERO Sidekick
- **Short description (80 chars):** ERTH e-waste pickup scheduling for HERO drivers
- **Full description (4000 chars):** Describe what the app does — schedule pickups,
  get notifications for new orders, SOS requests, and chat mentions, all wrapped
  around the ERTH Sidekick web platform.
- **App icon:** 512×512 PNG (generate from `public/logo.svg` — see below).
- **Phone screenshot:** 1080×1920 PNG (take from the running webapp).
- **Feature graphic:** 1024×500 PNG (optional).
- **Privacy policy URL:** required — host a simple privacy policy page.

### Content rating & data safety

- **App content → Privacy policy:** add a URL.
- **App content → Ads:** declare "No".
- **Data safety:** declare that the app collects email/account (login) and that
  data is encrypted in transit (HTTPS). No data is sold/shared.

### Generate a 512×512 store icon

```powershell
cd D:\sidekickv3
# Reuse the icon generator; produce a 512px square PNG:
node -e "const sharp=require('sharp');const s=512,p=s*0.18,i=s-p*2;const svg=`<svg xmlns='http://www.w3.org/2000/svg' width='512' height='512'><rect width='512' height='512' fill='#2D2D2D'/><g transform='translate(${p},${p}) scale(${i/30})'><path fill='#FFFFFF' d='M15.47,7.1l-1.3,1.85c-0.2,0.29-0.54,0.47-0.9,0.47h-7.1V7.09C6.16,7.1,15.47,7.1,15.47,7.1z'/><path fill='#FFFFFF' d='M24.3,7.1 13.14,22.91 5.7,22.91 16.86,7.1z'/><path fill='#FFFFFF' d='M14.53,22.91l1.31,-1.86c0.2,-0.29,0.54,-0.47,0.9,-0.47h7.09v2.33z'/></g></svg>`;sharp(Buffer.from(svg),{density:300}).png().toFile('android-app/store-icon-512.png').then(()=>console.log('wrote store-icon-512.png'))"
```

---

## Project structure

```
android-app/
├── build.gradle.kts              # root build
├── settings.gradle.kts
├── gradle.properties
├── gradlew.bat                   # Windows wrapper
├── gradle/wrapper/                # wrapper jar + props
├── app/
│   ├── build.gradle.kts           # app module + conditional Firebase
│   ├── proguard-rules.pro
│   ├── google-services.json       # PLACE HERE when enabling FCM (gitignored)
│   └── src/
│       ├── main/
│       │   ├── AndroidManifest.xml
│       │   ├── java/com/erth/sidekick/
│       │   │   ├── SidekickApp.kt          # Application; creates notif channels
│       │   │   ├── MainActivity.kt        # WebView host + JS bridge
│       │   │   ├── NotificationPollService.kt  # foreground poll fallback
│       │   │   ├── SidekickFirebaseMessagingService.kt  # FCM (firebase sourceSet)
│       │   │   ├── FcmRegistrar.kt         # token storage + server registration
│       │   │   ├── NotifPoster.kt          # posts notifications to channels
│       │   │   ├── BootReceiver.kt         # restart poll after reboot
│       │   │   └── Constants.kt
│       │   └── res/
│       │       ├── values/{strings,colors,themes}.xml
│       │       ├── xml/network_security_config.xml
│       │       ├── drawable/ic_launcher_foreground.xml
│       │       ├── mipmap-anydpi-v26/ic_launcher{,_round}.xml
│       │       └── mipmap-*/ic_launcher{,_round}.png  (generated)
│       └── firebase/java/.../SidekickFirebaseMessagingService.kt
│           # Only compiled when google-services.json is present.
```

Server-side push wiring (in the webapp, already deployed):

- `src/lib/fcm.ts` — FCM sender + helpers
- `src/app/api/devices/register/route.ts` — token registration endpoint
- Push triggers added to: `/api/sos`, `/api/orders/reassign`,
  `/api/notifications`, `/api/chat`

---

## .gitignore (add these to android-app/.gitignore)

```
*.keystore
*.jks
**/keystore.properties
**/signing.properties
app/google-services.json
.gradle/
build/
local.properties
*.iml
.idea/
gen-icons.js
```

---

## Testing on a physical device

1. Enable USB debugging on your Android phone (Settings → Developer options).
2. Connect via USB, run:
   ```powershell
   adb install -r app/build/outputs/apk/debug/app-debug.apk
   ```
3. Open HERO Sidekick, log in, grant notification permission.
4. (Without FCM configured) the foreground service polls every 60s — raise an
   SOS or have admin assign you an order to see a notification.

---

## Troubleshooting

- **Build fails: "No matching toolchains"** — ensure JDK 17 is on JAVA_HOME.
- **App opens blank** — check `https://erthsidekick.xyz` loads in the phone
  browser; the WebView needs internet permission (already declared).
- **No push notifications** — confirm FCM is enabled
  (`app/google-services.json` present + server `ai_fcm_legacy_key` set). Without
  these, the polling fallback handles notifications (check the foreground-service
  notification is visible in the status bar).
- **"Failed to find Server Action" after webapp rebuild** — old WebView cache;
  pull-to-refresh or clear the app's data.
