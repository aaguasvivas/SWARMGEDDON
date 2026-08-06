# SWARMGEDDON - Store Listing Kit

Copy-paste source for App Store Connect and Play Console. Same structure as
Anota and Capi. No em dashes anywhere in this file; store fields are user-facing.

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
- NOVA, the balanced vanguard with a magnet coil.
- EMBER, fast and fragile with overcharged damage.
- VESPER, slow and heavy, healing with every kill.

CLIMB, UNLOCK, PERFECT
- Level up mid-run and draft perks into wild builds.
- Earn new pilots and worlds by playing, not paying.
- Per-world records: best time and most kills, tracked separately.
- DAILY CHALLENGE: one seeded run per day, identical for every player on any
  device. Compare fairly.

HONEST BY DESIGN
- No ads. No account. No purchases. No data collected.
- Fully playable offline.
- 60fps arcade action tuned for phones.

The swarm is already coming. Hold the line.

**App Review notes:**
Single-player offline arcade game. No account, login, or demo credentials
needed; launch and play. No user-generated content, no chat, no purchases. The
Daily Challenge is a date-seeded deterministic run computed on device; it makes
no network calls. This build contains no analytics or tracking SDKs and
collects no data. Violence is stylized neon splatter against alien creatures;
no human characters are harmed.

## ES (es-MX localization)

**Nombre:** SWARMGEDDON

**Subtitulo:** Supervivencia twin-stick

**Texto promocional:**
Tres mundos. Tres pilotos. Una regla: resiste. Un reto diario nuevo cada dia,
la misma partida para todos. Sin anuncios, sin cuenta, funciona sin conexion.

**Descripcion:**
SWARMGEDDON es un shooter de supervivencia twin-stick con vista superior. El
enjambre no deja de venir. Tu no dejas de disparar.

PELEA EN TRES MUNDOS
Cada mundo es un lugar propio, con su propia cria, su ritmo y su jefe.
- PRADERA COLMENA: una membrana viva de panal y esporas. Enfrenta a la Colmena
  Acida y a LA REINA.
- PROFUNDIDADES VIOLETA: una fosa abisal aplastante iluminada por rayos de luz.
  Enfrenta a la Cria Psiquica y a LA MATRONA DEL VACIO.
- PARAMOS DE BRASA: basalto agrietado sobre magma que respira. Enfrenta a la
  Cria de Brasa y al TIRANO DE BRASA.

ELIGE TU PILOTO
- NOVA, la vanguardia equilibrada con bobina magnetica.
- EMBER, rapida y fragil con dano sobrecargado.
- VESPER, lenta y pesada, se cura con cada baja.

SUBE, DESBLOQUEA, PERFECCIONA
- Sube de nivel en plena partida y arma builds salvajes con perks.
- Gana pilotos y mundos nuevos jugando, no pagando.
- Records por mundo: mejor tiempo y mas bajas, por separado.
- RETO DIARIO: una partida con semilla unica por dia, identica para todos los
  jugadores en cualquier dispositivo. Compite en igualdad.

HONESTO POR DISENO
- Sin anuncios. Sin cuenta. Sin compras. No se recopilan datos.
- Totalmente jugable sin conexion.
- Accion arcade a 60fps afinada para telefonos.

El enjambre ya viene. Resiste.

## Shared values

- Bundle id / package: `dev.swarmgeddon.app`
- Category: Games > Arcade (secondary Action)
- Age rating target: 12+ / Everyone 10+ (stylized fantasy violence against
  alien creatures, frequent; no gore on humans, no gambling, no user content;
  answer the questionnaire honestly and accept what it computes)
- Devices: iPhone only for v1 (same call as Anota and Capi)
- Orientation: both supported; the game adapts. Screenshots read best in
  landscape.
- Privacy: "Data Not Collected" on both stores. True as long as the build was
  made WITHOUT `VITE_LEADERBOARD_URL` (the leaderboard client is dormant
  without it). If the leaderboard ships later, switch to the Capi-style
  labels: nickname + gameplay scores, "Data Not Linked to You", and update
  Play Data Safety to match.
- Encryption: `ITSAppUsesNonExemptEncryption` false is set in Info.plist, so no
  export compliance questions per build.
