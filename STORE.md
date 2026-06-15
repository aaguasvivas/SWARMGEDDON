# SWARMGEDDON — Store Submission Checklist

Everything below is **manual work you (the human) must do** — it needs your
developer accounts, signing identities, and machine tooling. The app itself is
already wrapped (Capacitor) and the icons/splash are generated. Nothing here
requires changes to the game code.

> **Privacy, stated plainly:** SWARMGEDDON collects **no data**. No accounts, no
> analytics, no network calls. All state (scores, settings) lives in on-device
> storage. Declare "No data collected" on both stores.

---

## 0. One-time tooling install

| Need | Install |
| --- | --- |
| **CocoaPods** (iOS deps) | `sudo gem install cocoapods` (or `brew install cocoapods`) |
| **Xcode** | ✅ already present (Xcode 26.5) — open once to accept the license |
| **Android Studio + SDK** | https://developer.android.com/studio |
| **JDK 17** | `brew install openjdk@17` (the bundled JDK 12 is too old for modern Gradle) |
| **Android env** | export `ANDROID_HOME=~/Library/Android/sdk` (and add `platform-tools` to PATH) |

After installing CocoaPods, finish the iOS pod install that was skipped:

```bash
cd ios/App && pod install && cd ../..
```

---

## 1. Accounts

- [ ] **Apple Developer Program** — $99/yr — https://developer.apple.com/programs/
- [ ] **Google Play Developer** — $25 one-time — https://play.google.com/console/

---

## 2. Build the apps

The native shells load the exact same web build (`dist/`). Regenerate icons any
time the logo changes with `npm run assets:generate` (reads `assets/icon.svg` +
`assets/splash.svg`).

### iOS
```bash
npm run cap:ios        # builds web (capacitor mode), syncs, opens Xcode
```
In Xcode: select the **App** target → **Signing & Capabilities** → set your Team
and a unique Bundle Identifier (default `com.swarmgeddon.app`). Then
**Product → Archive** → distribute to **TestFlight / App Store**.

### Android
```bash
npm run cap:android    # builds web (capacitor mode), syncs, opens Android Studio
```
In Android Studio: **Build → Generate Signed Bundle / APK → Android App Bundle**.
Create/keep a keystore (store it safely — you need it for every future update).
Upload the resulting `.aab` to the Play Console.

> `appId` / `appName` live in [capacitor.config.ts](capacitor.config.ts).
> Change `appId` to your own reverse-domain before first submission.

---

## 3. Store listing assets

- [ ] **App name:** SWARMGEDDON
- [ ] **Subtitle / short description:** "Top-down twin-stick alien-hive survival shooter."
- [ ] **Screenshots:** capture from a device/simulator (App Store needs 6.7"+6.5" iPhone
      and 12.9" iPad; Play needs phone + 7"/10" tablet). Landscape gameplay shots.
- [ ] **App icon:** already generated into the native projects (1024 master from `assets/icon.svg`).
- [ ] **Feature graphic** (Play, 1024×500): make from the same art.

---

## 4. Ratings & compliance

- [ ] **Age rating:** ~**12+ / Teen** — stylized, non-realistic creature violence
      (alien gore), no blood-on-humans, no profanity, no gambling, no user content.
- [ ] **Privacy labels:** **No data collected.** No tracking, no third-party SDKs.
- [ ] **Export compliance (iOS):** uses no non-exempt encryption → answer "No".
- [ ] **Orientation:** landscape preferred, portrait supported (the game adapts to both).
- [ ] **No IAP / ads** in v1.

---

## 5. Web deploy (no account needed)

```bash
npm run build          # -> dist/  (static, installable PWA)
```
Drop `dist/` on any static host (Cloudflare Pages / Netlify / GitHub Pages).
On Cloudflare Pages: build command `npm run build`, output dir `dist`. The PWA is
installable and runs offline after first load.
