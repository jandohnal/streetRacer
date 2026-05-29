'use strict';

/**
 * @file constants.js
 * Centrální konfigurace hry — veškerá čísla a výčty jsou definována zde.
 * Nikde jinde v kódu se nepoužívají magic numbers.
 */

// ─── Rozměry herní plochy ────────────────────────────────────────────────────

const CANVAS = Object.freeze({
  WIDTH:  400,
  HEIGHT: 711,   // 400 × (16/9) ≈ 711
});

// ─── Silnice a pruhy ─────────────────────────────────────────────────────────

const ROAD = Object.freeze({
  LANE_COUNT:       6,
  SHOULDER_WIDTH:   18,   // px — krajnice vlevo/vpravo
  LANE_LINE_WIDTH:  2,    // px — přerušovaná čára pruhu
  LANE_LINE_DASH:   40,   // px — délka čárky
  LANE_LINE_GAP:    30,   // px — mezera čárky
  SHOULDER_LINE_WIDTH: 3, // px — plná krajnicová čára
  SURFACE_COLOR:    '#3a3a3a',
  SHOULDER_COLOR:   '#2a2a2a',
  LANE_LINE_COLOR:  '#ffffff',
  SHOULDER_LINE_COLOR: '#e8c842',
});

/** Šířka jednoho jízdního pruhu v pixelech (vypočítáno z CANVAS a ROAD) */
const LANE_WIDTH = (CANVAS.WIDTH - ROAD.SHOULDER_WIDTH * 2) / ROAD.LANE_COUNT;

/** X souřadnice středů jednotlivých pruhů (index 0 = nejlevější) */
const LANE_CENTERS = Object.freeze(
  Array.from({ length: ROAD.LANE_COUNT }, (_, i) =>
    ROAD.SHOULDER_WIDTH + i * LANE_WIDTH + LANE_WIDTH / 2
  )
);

// ─── Fyzika / rychlost ───────────────────────────────────────────────────────

const PHYSICS = Object.freeze({
  /** Počáteční rychlost při startu hry (px/s) */
  SPEED_INITIAL:      290,
  /** Minimální rychlost — odpovídá 20 km/h zobrazených hráči (px/s) */
  SPEED_MIN:           75,
  /** Maximální rychlost — odpovídá 320 km/h zobrazených hráči (px/s) */
  SPEED_MAX:         1200,
  /**
   * Exponenciální model akcelerace při držení ↑:
   *   dv/dt = (ACCEL_VMAX - v) / ACCEL_TAU
   * Kalibrováno: 0→100 km/h za 3.5s, 0→200 km/h za 10s.
   * ACCEL_VMAX = efektivní asymptotická rychlost modelu (px/s)
   * ACCEL_TAU  = časová konstanta (s)
   */
  ACCEL_VMAX:        1037,
  ACCEL_TAU:          7.8,
  /** Základní zpomalení při držení ↓ — první fáze brzdění (px/s²) */
  DECELERATION:       500,
  /**
   * Maximální zpomalení při plném brzdění — kvadratická fáze (px/s²).
   * Dosaženo po BRAKE_RAMPUP_TIME sekundách nepřetržitého brzdění.
   */
  DECELERATION_MAX:  1800,
  /**
   * Doba (s), po které začne brzdný účinek kvadraticky růst.
   * Do této doby se používá základní DECELERATION.
   */
  BRAKE_RAMPUP_START: 0.3,
  /**
   * Doba (s), za kterou brzdný účinek dosáhne DECELERATION_MAX.
   * (měřeno od BRAKE_RAMPUP_START)
   */
  BRAKE_RAMPUP_DURATION: 1.2,
  /** Přirozený odpor — pasivní pokles rychlosti bez vstupu (px/s²) */
  DRAG:                60,
  /**
   * Koeficient konverze px/s → km/h (vizuální).
   * Kalibrováno: SPEED_MAX (1200 px/s) = 320 km/h → 320/1200 ≈ 0.2667
   */
  PX_PER_S_TO_KMH:    0.2667,
  /**
   * Kolik herních px odpovídá 1 metru vzdálenosti.
   * Odvozeno z PX_PER_S_TO_KMH:
   *   1 px/s = PX_PER_S_TO_KMH km/h = PX_PER_S_TO_KMH × (1000/3600) m/s
   *   → 1 m = 1 / (PX_PER_S_TO_KMH × 1000/3600)  px/m ≈ 13.5 px/m
   */
  PX_PER_METER: 1 / (0.2667 * 1000 / 3600),
});

// ─── Hráčovo auto ────────────────────────────────────────────────────────────

const PLAYER = Object.freeze({
  WIDTH:       54,
  HEIGHT:      90,
  /** Y souřadnice středu auta (90 % výšky plátna) */
  Y_CENTER:    Math.round(CANVAS.HEIGHT * 0.88),
  START_LANE:  2,   // index pruhu (0–5), prostřední levý z dvojice 2/3
  COLOR_BODY:  '#27ae60',
  COLOR_ROOF:  '#1a7a42',
  COLOR_LIGHT_FRONT: '#ffffaa',
  COLOR_LIGHT_REAR:  '#cc0000',
  /** Hitbox je zmenšen na X % karoserie pro fair-play */
  HITBOX_FACTOR: 0.80,
});

// ─── Typy dopravních aut ─────────────────────────────────────────────────────

/** @enum {string} */
const VehicleType = Object.freeze({
  CAR:   'car',
  VAN:   'van',
  BUS:   'bus',
  TRUCK: 'truck',
});

/**
 * Definice každého typu vozidla.
 * speedFactor: násobitel základní rychlosti silnice (< 1 = pomalejší než hráč).
 * spawnWeight: relativní pravděpodobnost spawnu.
 */
const VEHICLE_DEFS = Object.freeze({
  [VehicleType.CAR]: {
    width:        38,
    height:       65,
    speedMin:     0.35,
    speedMax:     0.65,
    maxSpeedKmh:  130,
    spawnWeight:  50,
    colors: ['#e74c3c', '#3498db', '#ecf0f1', '#95a5a6', '#f39c12', '#8e44ad'],
    roofColor:    null,   // null = vypočítá se ztmavením těla
  },
  [VehicleType.VAN]: {
    width:        42,
    height:       90,
    speedMin:     0.30,
    speedMax:     0.55,
    maxSpeedKmh:  110,
    spawnWeight:  3,
    colors: ['#ecf0f1', '#f1c40f', '#95a5a6', '#e67e22'],
    roofColor:    null,
  },
  [VehicleType.BUS]: {
    width:        44,
    height:      130,
    speedMin:     0.25,
    speedMax:     0.45,
    maxSpeedKmh:  100,
    spawnWeight:  1,
    colors: ['#e67e22', '#f1c40f', '#27ae60'],
    roofColor:    null,
  },
  [VehicleType.TRUCK]: {
    width:        44,
    height:      150,
    speedMin:     0.20,
    speedMax:     0.40,
    maxSpeedKmh:  80,
    spawnWeight:  10,
    colors: ['#2c3e50', '#27ae60', '#7f8c8d', '#c0392b'],
    roofColor:   null,
  },
});

/** Pole typů vozidel, kde každý je zastoupen dle spawnWeight */
const VEHICLE_SPAWN_POOL = Object.freeze(
  Object.entries(VEHICLE_DEFS).flatMap(([type, def]) =>
    Array(def.spawnWeight).fill(type)
  )
);

// ─── Spawn ───────────────────────────────────────────────────────────────────

const SPAWN = Object.freeze({
  /** Základní interval spawnu v sekundách */
  INTERVAL_BASE:   0.6,
  /** Minimální interval spawnu (s) */
  INTERVAL_MIN:    0.25,
  /** O kolik se zkrátí interval na každých 100 px/s nad počáteční rychlost */
  INTERVAL_STEP:   0.1,
  /** Pravděpodobnost spawnu mince místo auta (0–1) */
  COIN_CHANCE:     0.18,
  /** Bezpečná Y vzdálenost pro nový spawn (aby se objekty nepřekrývaly) */
  SAFE_GAP:        12,
  /** Maximální počet aut spawnutých najednou v jednom cyklu (více pruhů) */
  MAX_PER_SPAWN:   3,
  /**
   * Násobitel výšky předního auta — pokud je mezera mezi auty menší než
   * (výška předního auta × FOLLOW_GAP_FACTOR), zadní přizpůsobí rychlost.
   */
  FOLLOW_GAP_FACTOR: 0.5,
});

// ─── Mince ───────────────────────────────────────────────────────────────────

const COIN = Object.freeze({
  RADIUS:       12,
  COLOR_FILL:   '#FFD700',
  COLOR_STROKE: '#cc9900',
  STROKE_WIDTH:  2,
  INNER_RADIUS:  7,
  INNER_COLOR:  '#ffec6e',
  SCORE_VALUE:   5,
});

// ─── Skóre ───────────────────────────────────────────────────────────────────

const SCORE = Object.freeze({
  COIN_BONUS: 5,
});

// ─── Závod (time-trial) ──────────────────────────────────────────────────────

const RACE = Object.freeze({
  /** Cílová vzdálenost závodu v metrech. */
  GOAL_METERS: 2000,
  /** Kolik sekund odečte každá sebraná mince z výsledného času. */
  COIN_TIME_BONUS: 5,
});

// ─── Policejní auto ──────────────────────────────────────────────────────────

const POLICE = Object.freeze({
  /** Rozměry karoserie — stejná třída jako osobní auto */
  WIDTH:  38,
  HEIGHT: 65,

  /** Rychlostní faktor — policie jede pomaleji než hráč */
  SPEED_FACTOR_MIN: 0.30,
  SPEED_FACTOR_MAX: 0.55,

  /** Spawn váha v celkovém traffic poolu */
  SPAWN_WEIGHT: 1,

  /** Barvy karoserie (bílo-modrá kombinace) */
  COLOR_BODY_WHITE: '#f0f0f0',
  COLOR_BODY_BLUE:  '#1a4fa0',
  COLOR_ROOF:       '#0d2d5e',
  COLOR_LIGHT_BAR:  '#1565c0',

  /**
   * Poloměr "radaru" — zóna zachycení kolem policejního auta.
   * Krytí 2 pruhů na každou stranu → průměr = 4 × LANE_WIDTH → r = 2 × LANE_WIDTH.
   * Hodnota se dopočítává dynamicky v policeCar.js z LANE_WIDTH.
   */
  RADAR_OPACITY:      0.45,
  RADAR_COLOR:        '#5bb8ff',
  RADAR_STROKE:       '#2196f3',
  RADAR_STROKE_WIDTH:  1.5,

  /**
   * Rychlostní limit pro chycení v km/h.
   * Hráč je BUSTED pouze pokud vstoupí do radaru při rychlosti > tohoto limitu.
   */
  SPEED_LIMIT_KMH: 100,

  /** Amplituda pulzování poloměru radaru (px) */
  PULSE_AMPLITUDE: 6,
  /** Frekvence pulzování (Hz) */
  PULSE_FREQUENCY: 1.2,
});

// ─── Animace hráčova auta ────────────────────────────────────────────────────

const PLAYER_ANIM = Object.freeze({
  /**
   * Doba přejezdu jednoho pruhu v sekundách.
   * Pocit reálného auta: krátký ale plynulý přejezd.
   */
  LANE_CHANGE_DURATION: 0.28,

  /**
   * Maximální úhel natočení karoserie ve stupních při přejezdu.
   * Simuluje náklon / zatočení volantu.
   */
  MAX_TILT_DEG: 14,

  /**
   * Exponent easing křivky (ease-in-out).
   * 2 = kvadratická, 3 = kubická (výraznější nástup/dojezd).
   */
  EASE_POWER: 3,
});

// ─── Animace pruhu (dashed lines) ────────────────────────────────────────────

const LANE_ANIM = Object.freeze({
  /** Celková délka jednoho dash+gap cyklu */
  CYCLE: ROAD.LANE_LINE_DASH + ROAD.LANE_LINE_GAP,
});

// ─── Audio — zvukový engine motoru ───────────────────────────────────────────

const AUDIO = Object.freeze({
  /**
   * Definice 5 rychlostních stupňů.
   * speedLow/speedHigh — rozsah v px/s (odvozeno z km/h přes PX_PER_S_TO_KMH).
   * rateStart/rateEnd  — playbackRate na začátku/konci stupně.
   *
   * Vzorky jsou nahrány při: low=1000 RPM, mid=4000 RPM, high=8000 RPM.
   * playbackRate = cílové_RPM / referenční_RPM_vzorku.
   * Každý stupeň se pohybuje v úzkém rozsahu ±20 % kolem referenčního bodu
   * aby nedocházelo k výraznému zkreslení zvuku.
   *
   *  Stupeň | km/h    | px/s      | Dominantní vrstva
   *  -------+---------+-----------+------------------
   *    1    |   0–75  |   0– 281  | low  (1000 RPM)
   *    2    |  75–120 | 281– 450  | low → mid
   *    3    | 120–170 | 450– 638  | mid  (4000 RPM)
   *    4    | 170–220 | 638– 825  | mid → high
   *    5    | 220–320 | 825–1200  | high (8000 RPM)
   */
  GEAR_DEFS: Object.freeze([
    { speedLow:   0, speedHigh:  281, rateStart: 0.80, rateEnd: 1.10 },
    { speedLow: 281, speedHigh:  450, rateStart: 0.85, rateEnd: 1.05 },
    { speedLow: 450, speedHigh:  638, rateStart: 0.82, rateEnd: 1.05 },
    { speedLow: 638, speedHigh:  825, rateStart: 0.83, rateEnd: 1.05 },
    { speedLow: 825, speedHigh: 1200, rateStart: 0.85, rateEnd: 1.05 },
  ]),

  /** Počet stupňů (odvozeno z GEAR_DEFS.length — pro čitelnost) */
  GEAR_COUNT: 5,

  /**
   * Lerp faktor RPM při akceleraci (vyšší = rychlejší nárůst otáček).
   * Hodnota za sekundu: nová = stará + (cíl - stará) * (1 - exp(-LERP * dt))
   */
  RPM_LERP_ACCEL: 4.0,

  /**
   * Lerp faktor RPM při deceleraci — rychlejší pokles pro engine braking charakter.
   */
  RPM_LERP_DECEL: 7.0,

  /**
   * Korekce playbackRate při engine braking (přičítá se k vypočtenému rate).
   * Záporná hodnota = lehce nižší tón při puštění plynu.
   */
  DECEL_PITCH_OFFSET: -0.06,

  /** Hlasitost master gain (engine vrstvy low/mid/high) */
  MASTER_VOLUME:      0.8,

  /** Hlasitost blowoff one-shotu */
  BLOWOFF_VOLUME:     0.65,

  /** Hlasitost turbo one-shotu (momentálně nevyužito) */
  TURBO_VOLUME:       0.45,

  /** Minimální doba držení plynu (s) pro spuštění blowoff */
  TURBO_THROTTLE_MIN: 1.0,

  /** Délka fade-out při zastavení enginu (s) */
  FADE_OUT_TIME:      0.4,
});
