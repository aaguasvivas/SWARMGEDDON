# SWARMGEDDON - Release Runbook

Line-by-line path to the App Store and Play Store, in the same shape as the
Anota and Capi runbooks. Capacitor edition: there is no EAS here; iOS ships via
Xcode Archive and Android via a signed .aab from Android Studio or Gradle.

## Status / prerequisites
- Apple Developer Program: ACTIVE (Anota and Capi shipped with it). No
  enrollment wait.
- Google Play Console: confirm account standing. On a personal account a new
  app needs a closed test with 12+ testers for 14 consecutive days before
  production. Recruit testers early; the clock starts when they are in.
- Xcode present. CocoaPods present (`/usr/local/bin/pod`). If `pod install`
  was never run: `cd ios/App && pod install`.
- Node 22 for builds: `source ~/.nvm/nvm.sh && nvm use 22` (default node on
  this machine is 18; Vite and wrangler want 20+).
- The web build is the game; native shells only wrap `dist/`.

## Assets and values (copy from here)
- Bundle id / package: `dev.swarmgeddon.app` (already set in
  capacitor.config.ts, the Xcode project, and the Android project)
- Privacy policy URL: https://swarmgeddon.adelsonaguasvivas.workers.dev/privacy
- Marketing URL: https://swarmgeddon.adelsonaguasvivas.workers.dev
- Support URL: https://swarmgeddon.adelsonaguasvivas.workers.dev (contact email
  on the privacy page)
- Listing copy (EN + ES): docs/store-listing.md
- Screenshots: 6.7 inch (1290x2796) for App Store; phone + tablet sizes for
  Play. Stage them from the simulator: one per world mid-combat (hive, depths,
  wastes), one boss fight with the boss bar, one perk draft, the menu with a
  per-world record showing. Landscape reads best.
- Privacy answers (v1 ships WITH the leaderboard): "Data Not Linked to You"
  with Name (nickname) + User Content (gameplay scores) on the App Store; Play
  Data Safety = App activity + Name, not linked, not shared, not sold. The
  privacy page must be updated to describe the leaderboard BEFORE the store
  build is uploaded (see the Leaderboard section).
- Age rating: answer for stylized, frequent fantasy violence against aliens;
  expect 12+ / E10+. Category: Games > Arcade. Devices: iPhone only.
- Encryption: `ITSAppUsesNonExemptEncryption` false already in Info.plist.

## Leaderboard (BEFORE the store build; owner decision 2026-08-06)
The v1 store build ships with the global leaderboard live. Order matters: the
server must exist and the privacy page must be updated before the app build
that goes to review is made.

Owner (one-time accounts step, ~10 min):
```bash
cd ~/Desktop/personal/SWARMGEDDON/server && npm install
npx wrangler login
npx wrangler d1 create swarmgeddon
```
Paste the database id it prints into server/wrangler.toml, then tell Claude.

Claude (after the id is in): run migrations, deploy the Worker, set
`VITE_LEADERBOARD_URL` for the web + capacitor builds, update
public/privacy.html to describe the leaderboard (nickname + score, deletable
on request), redeploy the site, verify submit + rank end to end with
scripts/attack.mjs, and confirm LEADERS appears in the menu.

## iOS
```bash
cd ~/Desktop/personal/SWARMGEDDON && source ~/.nvm/nvm.sh && nvm use 22
npm run cap:ios     # builds web in capacitor mode, syncs, opens Xcode
```
In Xcode:
1. Select the App target > Signing & Capabilities > Team = your Apple ID team.
   Bundle id is already `dev.swarmgeddon.app`; leave "Automatically manage
   signing" on and Xcode creates the certs.
2. Select "Any iOS Device (arm64)" as the destination, then Product > Archive.
3. In the Organizer window: Distribute App > App Store Connect > Upload.

Then in App Store Connect (appstoreconnect.apple.com):
1. Create the app record: name "SWARMGEDDON", bundle id `dev.swarmgeddon.app`,
   SKU `swarmgeddon`.
2. Paste name, subtitle, keywords, promotional text, and description from
   docs/store-listing.md. Add the Spanish (es-MX) localization with the ES copy.
3. Upload the 6.7 inch screenshots.
4. App Privacy: "Data Not Collected". Paste the privacy URL.
5. Age rating questionnaire (expect 12+/E10+), category Games > Arcade,
   availability iPhone only.
6. App Review notes: paste the review note from docs/store-listing.md (offline
   single player, no account, no credentials, date-seeded daily, no data).
7. Install the build from TestFlight on a real phone. Play all three worlds
   once each: title card shows, HUD safe areas clear the notch, touch sticks
   respond, records save across launches, audio works with the mute switch.
8. Add for Review and Submit. Review is usually 1 to 3 days.

## Android (Google)
Start recruiting 12+ testers in parallel if the closed-test rule applies.
```bash
cd ~/Desktop/personal/SWARMGEDDON && source ~/.nvm/nvm.sh && nvm use 22
npm run cap:android   # builds web, syncs, opens Android Studio
```
In Android Studio: Build > Generate Signed Bundle / APK > Android App Bundle.
Create the upload keystore ONCE and back it up somewhere safe (losing it means
losing the ability to update the app).

In Play Console (play.google.com/console):
1. Create the app: "SWARMGEDDON", package `dev.swarmgeddon.app`.
2. Upload the .aab BY HAND to a Closed testing track (Google requires the
   first upload to be manual).
3. Add the 12+ testers, publish the closed test, keep it live 14 consecutive
   days.
4. Data safety: no data collected, nothing shared. Paste the privacy URL.
   Content rating: fantasy violence questionnaire, no gambling, no user
   interaction.
5. Add listing copy (EN + ES) and screenshots (plus the 1024x500 feature
   graphic, generated from the icon art).
6. After 14 days, apply for production access and promote.

## Icons / splash
Already generated into both native projects from assets/icon.svg and
assets/splash.svg. Regenerate any time with `npm run assets:generate`.

## Open items
1. DONE: App Store screenshots live in store-assets/screenshots/ (2796x1290,
   six shots: three worlds, THE QUEEN boss fight, perk draft, menu with a
   per-world record). Regenerate any time with scripts/store-shots.mjs (same
   setup as measure.mjs: puppeteer-core + dev server on 5176).
2. DONE: native shell smoke test passed on the iOS simulator (boot, menu, run,
   touch, game over, per-world records). Boot has a one-retry guard for
   transient WebGL context failures on cold webviews.
3. Leaderboard accounts step (owner), then Claude wires + reprivacies. See the
   Leaderboard section above.
4. TestFlight pass on a real phone: only the owner.
5. Google Play account standing + tester recruitment: only the owner.
6. First Archive + upload needs the owner logged into Xcode with the Apple ID.

## After launch (not now)
- Ask-for-review prompt after a few finished runs.
- Cross-promo with Anota and Capi: a quiet link, nothing loud.
- Cosmetic IAP on the existing unlock metadata (premium skus already modeled).
