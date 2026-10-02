# SWARMGEDDON - Store Listing Kit

Copy-paste source for App Store Connect and Play Console. Same structure as
Anota and Capi. No em dashes anywhere in this file; store fields are user-facing.

v2 copy (NEXT-LEVEL.md section 8.6), checked against the v2 client
(`src/net/leaderboard.ts`) and the v2 worker (`server/src/index.ts`) on
2026-10-02. The owner publishes it with the v2 release, together with
`public/privacy.html`.

## EN (primary, en-US)

**Name (30 max):** SWARMGEDDON

**Subtitle (30 max):** Twin-stick swarm survival

**Keywords (100 max, App Store only):**
`twin stick,shooter,swarm,survival,arcade,roguelite,alien,horde,neon,offline,boss,daily`

**Promotional text (170 max):**
Three worlds. Three pilots. One rule: hold the line. A new daily challenge every
day, same run for everyone. No ads, no account, works offline.

**Description:**
SWARMGEDDON is a top-down twin-stick survival shooter. The hive does not stop
coming. You do not stop shooting.

FIGHT THROUGH THREE WORLDS
Every world is its own place with its own brood, rhythm, and boss.
- HIVE MEADOW: a living membrane of honeycomb and spores. Face the Acid Hive
  and THE QUEEN.
- VIOLET DEPTHS: a crushing abyssal trench lit by god-rays. Face the Psychic
  Brood and THE VOID MATRON.
- EMBER WASTES: cracked basalt over breathing magma. Face the Ember Spawn and
  THE EMBER TYRANT.

CHOOSE YOUR PILOT
- NOVA, the balanced vanguard. She takes weapon pods instantly, and every
  emptied pickup gun makes her Sidearm stronger.
- EMBER, fast and fragile. Two dash charges, and every dash reloads her gun and
  boosts her damage.
- VESPER, slow and heavy. No medkits: kills heal her, and elites and bosses make
  her bigger.

CLIMB, UNLOCK, PERFECT
- Level up mid-run and draft perks into wild builds.
- 48 feats unlock pilots, worlds, weapons, perks and ship paints, all earned by
  playing.
- Per-world records: best time, kills, score and chain, tracked separately.
- DAILY CHALLENGE: one run per day with the same seed, world and pilot for every
  player on any device. Your first attempt is ranked. Practice as much as you
  like after it.

HONEST BY DESIGN
- No ads. No account. No purchases.
- Optional global leaderboard, off until you turn it on. When you opt in, your
  nickname, score, run stats, pilot, world and country appear on the public
  board.
- Fully playable offline.
- 60fps arcade action tuned for phones.

The swarm is already coming. Hold the line.

**App Review notes:**
Single-player arcade game. No account, login, or demo credentials needed;
launch and play. No chat, no purchases. The Daily Challenge is a date-seeded
deterministic run computed on device.
The optional global leaderboard is off by default. After the player opts in
with a nickname, the game submits the ranked Daily run once, and a Standard run
when it beats the score it posted that week. A submission carries the nickname,
a random install id, the run stats (score, time, kills, level and similar
counters), the pilot, ship paint, world and THREAT level, the game version and
the platform. The server stores the country code Cloudflare derives from the
connection and a salted hash of the IP address that changes daily, used for
rate limiting; it does not store the IP address. The server checks every
nickname against a blocklist. Settings > ACCOUNT > REMOVE MY SCORES deletes
every entry of the install. Everything else stays on the device. No analytics,
advertising or tracking SDKs. Violence is stylized neon splatter against alien
creatures; no human characters are harmed.

## ES (es-MX localization)

**Nombre:** SWARMGEDDON

**Subtítulo:** Supervivencia twin-stick

**Texto promocional:**
Tres mundos. Tres pilotos. Una regla: resiste. Un reto diario nuevo cada día,
la misma partida para todos. Sin anuncios, sin cuenta, funciona sin conexión.

**Descripción:**
SWARMGEDDON es un shooter de supervivencia twin-stick con vista superior. El
enjambre no deja de venir. Tú no dejas de disparar.

PELEA EN TRES MUNDOS
Cada mundo es un lugar propio, con su propia cría, su ritmo y su jefe.
- PRADERA COLMENA: una membrana viva de panal y esporas. Enfrenta a la Colmena
  Ácida y a LA REINA.
- PROFUNDIDADES VIOLETA: una fosa abisal aplastante iluminada por rayos de luz.
  Enfrenta a la Cría Psíquica y a LA MATRONA DEL VACÍO.
- PÁRAMOS DE BRASA: basalto agrietado sobre magma que respira. Enfrenta a la
  Cría de Brasa y al TIRANO DE BRASA.

ELIGE TU PILOTO
- NOVA, la vanguardia equilibrada. Toma las cápsulas de armas al instante, y
  cada arma recogida que vacía hace más fuerte su Sidearm.
- EMBER, rápida y frágil. Dos cargas de DASH, y cada DASH recarga su arma y
  aumenta su daño.
- VESPER, lenta y pesada. Sin botiquines: las bajas la curan, y los élites y
  los jefes la hacen más grande.

SUBE, DESBLOQUEA, PERFECCIONA
- Sube de nivel en plena partida y arma builds salvajes con perks.
- 48 logros desbloquean pilotos, mundos, armas, perks y pinturas para tu nave,
  todo ganado jugando.
- Récords por mundo: mejor tiempo, bajas, puntaje y cadena, por separado.
- RETO DIARIO: una partida al día con la misma semilla, mundo y piloto para
  todos, en cualquier dispositivo. Tu primer intento cuenta para el ranking.
  Después practica cuanto quieras.

HONESTO POR DISEÑO
- Sin anuncios. Sin cuenta. Sin compras.
- Tabla global opcional, apagada hasta que la actives. Si la activas, tu apodo,
  puntaje, estadísticas de la partida, piloto, mundo y país aparecen en la
  tabla pública.
- Totalmente jugable sin conexión.
- Acción arcade a 60fps afinada para teléfonos.

El enjambre ya viene. Resiste.

## Shared values

- Bundle id / package: `dev.swarmgeddon.app`
- Category: Games > Arcade (secondary Action)
- Age rating target: 12+ / Everyone 10+ (stylized fantasy violence against
  alien creatures, frequent; no gore on humans, no gambling; the only user
  content is the optional leaderboard nickname, filtered by the server's
  blocklist; answer the questionnaire honestly and accept what it computes)
- Devices: iPhone only for v1 (same call as Anota and Capi)
- Orientation: both supported; the game adapts. Screenshots read best in
  landscape.
- Encryption: `ITSAppUsesNonExemptEncryption` false is set in Info.plist, so no
  export compliance questions per build.

## Privacy answers (v2, owner re-checks before submitting)

What the v2 build sends, so each answer can be checked against it:
- Nothing until the player opts in (recap card, leaderboard JOIN, or Settings >
  ACCOUNT > POST SCORES). A fresh install and a v1 save both start with
  posting off.
- After opt-in, one POST per qualifying run (the ranked Daily once; a Standard
  run that beats that week's posted score; never practice runs, runs under
  10 s, or runs that scored nothing): nickname, random install id (16 random
  bytes made on the device at opt-in), game version, mode, day, world, pilot,
  ship paint, THREAT, seed, time, kills, level, XP sum, kill points, bosses,
  best chain, hits, close calls (checked, not stored), cleared and clear time,
  platform (web, ios or android).
- The worker adds the country code (`request.cf.country`) and
  `ip_hash` = the first 16 hex characters of HMAC-SHA256(IP_SALT, ip + '|' +
  UTC day). It never stores the IP address. Responses never return the install
  id or the IP hash.
- The leaderboard screen GETs the public board; for an opted-in player the
  request carries the install id so the board can show the player's rank. The
  worker stores nothing for a GET.
- REMOVE MY SCORES (Settings > ACCOUNT, with a confirm step) deletes every row
  of the install id, then turns posting off. Retention (a prune on 1% of
  posts): Daily rows older than 45 days go; Standard rows older than last week
  go unless they are in a world's all-time top 2000.
- No analytics, ads, crash reporting or tracking SDKs. The native plugins are
  Capacitor App, Haptics, Preferences, Splash Screen and Status Bar.

App Store (App Privacy), all "Not Linked to You", purpose App Functionality,
no tracking. Re-check each:
1. User ID: the nickname is a screen name, and the random install id is an
   assigned id. Section 8.6 lists User ID.
2. Name: v1 and section 8.6 declared the nickname as Name. Apple's Name means a
   first or last name; keep it or move the nickname to User ID only.
3. Gameplay Content (User Content): the run stats, pilot, world, paint and
   THREAT.
4. Coarse Location: the worker stores a country code derived from the IP
   address. Decide whether Apple's Coarse Location applies; if it does,
   declare it Not Linked, App Functionality.
5. Device ID: only if the install id is read as a device-level id rather than
   a User ID.

Play Console (Data safety), collected, not shared, not sold, encrypted in
transit, optional (the player chooses), users can request deletion (REMOVE MY
SCORES in the app). Re-check each:
1. Personal info > Name (Google's definition includes a nickname).
2. App activity > Other actions (gameplay).
3. Device or other IDs (the random install id).
4. Location > Approximate location, if the stored country code counts.

The v1 answers ("Data Not Linked to You" with Name and gameplay scores) are a
subset of these. A v2 build cannot declare "Data Not Collected": production
builds post to the committed worker URL in `src/net/leaderboard.ts`.

Publish the new privacy page when the v2 worker goes live (server/README.md):
from that deploy the v1 routes return 410, so v1 clients stop posting too.
