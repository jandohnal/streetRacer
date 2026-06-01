'use strict';

/**
 * @file game.js
 * Hlavní orchestrátor hry.
 *
 * Odpovědnosti:
 *  - Inicializace SVG plátna a všech herních systémů.
 *  - Herní smyčka (requestAnimationFrame) s delta-time.
 *  - Řízení stavů: IDLE → RUNNING → GAME_OVER → RUNNING (restart).
 *  - Integrace: road, playerCar, trafficManager, policeManager, coinManager,
 *    collisionSystem, scoreSystem, hud.
 *  - Ovládání rychlosti hráčem (↑ akcelerace, ↓ brzdění).
 *  - Mobilní ovládání (touch tlačítka ◄ ► ▲ ▼).
 *  - BUSTED stav při vjezdu do policejního radaru nad rychlostní limit.
 */

/** @enum {string} */
const GameState = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
  GAME_OVER: 'game_over',
});

// ─── InputManager ────────────────────────────────────────────────────────────

/**
 * Sleduje stav stisknutých kláves a virtuálních tlačítek.
 * Poskytuje čistý boolean interface pro herní smyčku
 * (místo event-driven přístupu, který by vyžadoval buffering).
 */
class InputManager {
  constructor() {
    /** @private — množina aktuálně stisknutých klíčů */
    this._pressed = new Set();

    /** @private — zda je vstup povolen */
    this._enabled = false;

    this._boundKeyDown = this._onKeyDown.bind(this);
    this._boundKeyUp = this._onKeyUp.bind(this);

    document.addEventListener('keydown', this._boundKeyDown);
    document.addEventListener('keyup', this._boundKeyUp);
  }

  // ─── Privátní ──────────────────────────────────────────────────────────────

  /** @private */
  _onKeyDown(e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
    }
    this._pressed.add(e.key);
  }

  /** @private */
  _onKeyUp(e) {
    this._pressed.delete(e.key);
  }

  // ─── Veřejné ───────────────────────────────────────────────────────────────

  /** @param {boolean} enabled */
  setEnabled(enabled) {
    this._enabled = enabled;
    if (!enabled) this._pressed.clear();
  }

  /**
   * Simuluje stisknutí virtuální klávesy (mobilní tlačítka).
   * @param {string} key
   */
  press(key) {
    this._pressed.add(key);
  }

  /**
   * Simuluje uvolnění virtuální klávesy (mobilní tlačítka).
   * @param {string} key
   */
  release(key) {
    this._pressed.delete(key);
  }

  /** @returns {boolean} */
  isAccelerating() {
    return this._enabled && this._pressed.has('ArrowUp');
  }

  /** @returns {boolean} */
  isBraking() {
    return this._enabled && this._pressed.has('ArrowDown');
  }

  /** @returns {boolean} */
  isLeft() {
    return this._enabled && this._pressed.has('ArrowLeft');
  }

  /** @returns {boolean} */
  isRight() {
    return this._enabled && this._pressed.has('ArrowRight');
  }

  /** Odstraní event listenery. */
  destroy() {
    document.removeEventListener('keydown', this._boundKeyDown);
    document.removeEventListener('keyup', this._boundKeyUp);
  }
}

// ─── Game ─────────────────────────────────────────────────────────────────────

class Game {
  /**
   * Vytvoří instanci hry a zahájí načítání assetů.
   * Skutečná inicializace herních systémů proběhne v _init() po načtení spritu.
   */
  constructor() {
    /** @private */
    this._svg = document.getElementById('game-canvas');

    /** @private */
    this._state = GameState.IDLE;

    /** @private — aktuální rychlost silnice (px/s) */
    this._speed = PHYSICS.SPEED_INITIAL;

    /** @private — handle pro requestAnimationFrame */
    this._rafHandle = null;

    /** @private — časová značka posledního framu */
    this._lastTimestamp = null;

    /**
     * Akumulovaná doba nepřetržitého brzdění (s).
     * Resetuje se při uvolnění tlačítka ↓.
     * @private
     */
    this._brakeHeldTime = 0;

    // ─── Načtení PNG spritu, pak inicializace systémů ─────────────────────────
    this._initSvgViewBox();
    this._loadSpriteAndInit();
  }

  /**
   * Asynchronně načte PNG sprite hráčova auta, pak inicializuje herní systémy.
   * Pokud načtení selže, pokračuje s null (SVG fallback).
   * @private
   */
  _loadSpriteAndInit() {
    const img = new Image();
    img.onload = () => this._init(img);
    img.onerror = () => {
      console.warn('[Game] Sprite player-car.png se nepodařilo načíst — použit SVG fallback.');
      this._init(null);
    };
    img.src = 'assets/player-car.png';
  }

  /**
   * Inicializuje všechny herní systémy. Volá se po načtení spritu.
   * @private
   * @param {HTMLImageElement|null} spriteImg
   */
  _init(spriteImg) {
    this._inputManager = new InputManager();
    this._road = new Road(this._svg);

    // Skupina částic — nad silnicí, pod auty
    this._particleGroup = this._createParticleGroup();
    this._particleSystem = new ParticleSystem(this._particleGroup);

    this._playerCar = new PlayerCar(this._svg, this._inputManager, spriteImg);
    this._trafficManager = new TrafficManager(this._svg);
    this._policeManager = new PoliceManager(this._svg, this._trafficManager);
    this._coinManager = new CoinManager(this._svg, this._trafficManager);
    this._bonusManager = new BonusManager(this._svg, this._trafficManager);
    this._racerManager = new RacerManager(this._svg);
    this._scoreSystem = new ScoreSystem();
    this._leaderboard = new Leaderboard();
    this._hud = new Hud();

    // Hráčovo auto musí být vždy nad ostatními objekty
    this._svg.appendChild(this._playerCar.svgGroup);

    this._registerMobileControls();
    this._registerSwipeControls();

    // Zvukový engine — načítání na pozadí (neblokuje start obrazovku)
    this._audioEngine = new AudioEngine();
    this._audioEngine.load();

    // Výchozí stav: zvuk vypnutý
    this._muted = true;
    this._audioEngine.setMuted(true);

    // Tlačítko mute
    this._btnMute = document.getElementById('btn-mute');
    if (this._btnMute) {
      this._btnMute.addEventListener('click', () => this._toggleMute());
      this._btnMute.addEventListener(
        'touchstart',
        (e) => {
          e.preventDefault();
          this._toggleMute();
        },
        { passive: false },
      );
    }

    // Zobrazení úvodní obrazovky
    this._hud.showStart();
    this._hud.onStartClick(() => this._handleStartClick());
    this._hud.onCloseClick(() => this._handleCloseClick());
    this._hud.onSubmitScore((name) => this._handleSubmitScore(name));
    this._hud.onLeaderboardClick(() => this._handleLeaderboardClick());
  }

  // ─── Inicializace ────────────────────────────────────────────────────────────

  /**
   * Nastaví viewBox SVG na herní rozměry.
   * @private
   */
  _initSvgViewBox() {
    this._svg.setAttribute('viewBox', `0 0 ${CANVAS.WIDTH} ${CANVAS.HEIGHT}`);
    this._svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  }

  /**
   * Vytvoří SVG skupinu pro částice a vloží ji do SVG na správnou vrstvu.
   * Vrstva: nad silnicí (road), pod herními objekty.
   * @private
   * @returns {SVGGElement}
   */
  _createParticleGroup() {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('id', 'particles');
    this._svg.appendChild(g);
    return g;
  }

  /**
   * Registruje touch/mouse eventy na mobilní tlačítka (jen ▲▼).
   * @private
   */
  _registerMobileControls() {
    const bindings = [
      { id: 'btn-up', key: 'ArrowUp' },
      { id: 'btn-down', key: 'ArrowDown' },
    ];

    for (const { id, key } of bindings) {
      const btn = document.getElementById(id);
      if (!btn) continue;

      const onPress = (e) => {
        e.preventDefault();
        this._inputManager.press(key);
      };
      const onRelease = (e) => {
        e.preventDefault();
        this._inputManager.release(key);
      };

      btn.addEventListener('touchstart', onPress, { passive: false });
      btn.addEventListener('touchend', onRelease, { passive: false });
      btn.addEventListener('touchcancel', onRelease, { passive: false });

      // Fallback myš
      btn.addEventListener('mousedown', onPress);
      btn.addEventListener('mouseup', onRelease);
      btn.addEventListener('mouseleave', onRelease);
    }
  }

  /**
   * Registruje swipe gesta na SVG canvasu pro přejezd pruhu (L/R).
   * Swipe se detekuje při touchend: horizontální delta > threshold
   * a větší než vertikální delta (aby se swipe nepletl s akcelerací).
   * Výsledkem je jednorázový press+release ArrowLeft/Right.
   * @private
   */
  _registerSwipeControls() {
    const SWIPE_THRESHOLD = 25; // px — minimální horizontální delta
    let startX = 0;
    let startY = 0;

    this._svg.addEventListener(
      'touchstart',
      (e) => {
        // Ignoruj dotyky na tlačítkách (controls panel)
        if (e.target.closest && e.target.closest('#controls')) return;
        const t = e.changedTouches[0];
        startX = t.clientX;
        startY = t.clientY;
      },
      { passive: true },
    );

    this._svg.addEventListener(
      'touchend',
      (e) => {
        if (this._state !== GameState.RUNNING) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;

        if (Math.abs(dx) < SWIPE_THRESHOLD) return;
        if (Math.abs(dx) <= Math.abs(dy)) return; // spíše vertikální gesto

        const key = dx > 0 ? 'ArrowRight' : 'ArrowLeft';
        this._inputManager.press(key);
        // Okamžité uvolnění — edge trigger v playerCar zpracuje jako jedno přeskočení pruhu
        requestAnimationFrame(() => this._inputManager.release(key));
      },
      { passive: true },
    );
  }

  // ─── Stavový stroj ───────────────────────────────────────────────────────────

  /** @private */
  _handleStartClick() {
    if (this._state === GameState.IDLE || this._state === GameState.GAME_OVER) {
      // start() je async (AudioContext.resume + decodeAudioData) —
      // hru spustíme ihned, zvuk nastartuje souběžně
      this._audioEngine
        .start()
        .catch((err) => console.warn('[Game] AudioEngine start failed:', err));
      this._startGame();
    }
  }

  /**
   * Zavře game-over overlay a vrátí hráče na úvodní obrazovku.
   * @private
   */
  _handleCloseClick() {
    if (this._state !== GameState.GAME_OVER) return;
    this._state = GameState.IDLE;
    this._hud.showStart();
  }

  /**
   * Uloží skóre do Firestore.
   * @private
   * @param {string} name
   */
  async _handleSubmitScore(name) {
    this._hud.setScoreSaveStatus('loading');
    const ok = await this._leaderboard.saveScore(
      name,
      this._scoreSystem.finalSeconds,
      this._scoreSystem.coinCount,
    );
    this._hud.setScoreSaveStatus(ok ? 'ok' : 'err');
  }

  /**
   * Načte a zobrazí leaderboard.
   * @private
   */
  async _handleLeaderboardClick() {
    this._hud.showLeaderboard([]); // okamžitě otevři s prázdným stavem
    const entries = await this._leaderboard.getTopScores();
    this._hud.showLeaderboard(entries);
  }

  /**
   * Přepne stav ztlumení zvuku.
   * @private
   */
  _toggleMute() {
    this._muted = !this._muted;
    this._audioEngine.setMuted(this._muted);
    if (this._btnMute) {
      this._btnMute.classList.toggle('muted', this._muted);
      this._btnMute.setAttribute('aria-label', this._muted ? 'Zapnout zvuk' : 'Vypnout zvuk');
    }
  }

  /**
   * Spustí (nebo restartuje) hru.
   * @private
   */
  _startGame() {
    this._state = GameState.RUNNING;
    this._speed = PHYSICS.SPEED_INITIAL;
    this._lastTimestamp = null;

    /** @private — zbývající čas anti-radar bonusu (s), 0 = neaktivní */
    this._antiRadarTimer = 0;

    // Reset všech systémů
    this._road.reset();
    this._playerCar.reset();
    this._trafficManager.reset();
    this._policeManager.reset();
    this._coinManager.reset();
    this._bonusManager.reset();
    this._racerManager.reset();
    this._scoreSystem.reset();
    this._particleSystem.reset();
    this._brakeHeldTime = 0;
    this._antiRadarTimer = 0;

    this._inputManager.setEnabled(true);

    this._hud.hideOverlay();
    this._hud.update(0, 0, this._speed);

    // Spustíme herní smyčku
    this._rafHandle = requestAnimationFrame((ts) => this._gameLoop(ts));
  }

  /**
   * Ukončí hru a zobrazí výsledky.
   * @private
   * @param {boolean} [busted=false]   - true = chycen policií.
   * @param {boolean} [finished=false] - true = dojel cílovou vzdálenost.
   */
  _endGame(busted = false, finished = false) {
    this._state = GameState.GAME_OVER;
    this._inputManager.setEnabled(false);
    this._playerCar.lockInput();
    cancelAnimationFrame(this._rafHandle);
    this._audioEngine.stop();

    const bustedSpeedKmh = busted ? Math.round(this._speed * PHYSICS.PX_PER_S_TO_KMH) : 0;

    this._hud.showGameOver(
      this._scoreSystem.finalSeconds,
      this._scoreSystem.distanceMeters,
      this._scoreSystem.coinCount,
      busted,
      bustedSpeedKmh,
      finished,
    );
  }

  // ─── Herní smyčka ────────────────────────────────────────────────────────────

  /**
   * Hlavní herní smyčka volaná přes requestAnimationFrame.
   * @private
   * @param {DOMHighResTimeStamp} timestamp
   */
  _gameLoop(timestamp) {
    if (this._state !== GameState.RUNNING) return;

    // Delta time — omezíme na max 100 ms (např. po přepnutí záložky)
    const dt = Math.min((timestamp - (this._lastTimestamp ?? timestamp)) / 1000, 0.1);
    this._lastTimestamp = timestamp;

    this._update(dt);

    this._rafHandle = requestAnimationFrame((ts) => this._gameLoop(ts));
  }

  /**
   * Aktualizuje veškerou herní logiku pro jeden frame.
   * @private
   * @param {number} dt - Delta time v sekundách.
   */
  _update(dt) {
    // 1. Rychlost — řízena hráčem
    this._updateSpeed(dt);

    // 2. Pohyb silnice + animace hráče
    this._road.update(dt, this._speed);
    this._playerCar.update(dt);

    // 3. Skóre — vzdálenost + čas závodu
    this._scoreSystem.addDistance(dt, this._speed);
    this._scoreSystem.addTime(dt);

    // 4. Dopravní auta
    this._trafficManager.update(dt, this._speed, this._playerCar);

    // 5. Policejní auta
    this._policeManager.update(dt, this._speed);

    // 6. Mince
    this._coinManager.update(dt, this._speed);

    // 6b. Bonusy
    this._bonusManager.update(dt, this._speed);

    // 6c. Závodní soupeři
    this._racerManager.update(
      dt,
      this._speed,
      this._trafficManager.getCars(),
      this._playerCar,
      this._policeManager.getCars(),
    );

    // 6d. Vzájemné kolize všech aut (traffic, police, racer) — zabrání průniku
    CollisionSystem.resolveVehicleSeparation([
      ...this._trafficManager.getCars(),
      ...this._policeManager.getCars(),
      ...this._racerManager.getRacers(),
    ]);

    // 7. Kolize — mince
    const coinResult = CollisionSystem.checkPlayerVsCoins(
      this._playerCar,
      this._coinManager.getCoins(),
    );
    if (coinResult.count > 0) {
      this._scoreSystem.addCoins(coinResult.count);
      for (const pos of coinResult.positions) {
        this._particleSystem.spawnCoinBurst(pos.x, pos.y);
      }
    }

    // 7b. Kolize — bonusy
    const bonusResult = CollisionSystem.checkPlayerVsBonuses(
      this._playerCar,
      this._bonusManager.getBonuses(),
    );
    for (const bonus of bonusResult.collected) {
      if (bonus.type === BonusType.ANTI_RADAR) {
        this._antiRadarTimer = bonus.duration;
        this._particleSystem.spawnCoinBurst(
          ...(() => {
            const h = this._playerCar.getHitbox();
            return [h.x + h.width / 2, h.y + h.height / 2];
          })(),
        );
      }
    }

    // 7c. Anti-radar odpočet
    if (this._antiRadarTimer > 0) {
      this._antiRadarTimer = Math.max(0, this._antiRadarTimer - dt);
    }

    // 8. Fyzická kolize hráče s auty — neukončuje hru, jen zpomalí hráče
    this._speed = CollisionSystem.resolvePlayerVsVehicles(
      this._playerCar,
      [
        ...this._trafficManager.getCars(),
        ...this._policeManager.getCars(),
        ...this._racerManager.getRacers(),
      ],
      this._speed,
    );

    // 9. Cíl závodu — dojetí cílové vzdálenosti
    if (this._scoreSystem.distanceMeters >= RACE.GOAL_METERS) {
      this._endGame(false, true);
      return;
    }

    // 10. Kolize — radar policejního auta při vysoké rychlosti (busted)
    // Anti-radar bonus potlačuje detekci radaru
    const busted =
      this._antiRadarTimer <= 0
        ? CollisionSystem.checkPlayerVsPoliceRadar(
            this._playerCar,
            this._policeManager.getCars(),
            this._speed,
          )
        : null;
    if (busted !== null) {
      this._endGame(true);
      return;
    }

    // 11. Částicové efekty — kouř z brzd
    if (this._inputManager.isBraking()) {
      this._spawnBrakeSmokeEffect(dt);
    }

    // 12. Částice — update
    this._particleSystem.update(dt);

    // 13. HUD refresh
    this._hud.update(
      this._scoreSystem.elapsedSeconds,
      this._scoreSystem.distanceMeters,
      this._speed,
    );
    this._hud.updateAntiRadar(this._antiRadarTimer);

    // 14. Zvukový engine
    this._audioEngine.update(this._speed, this._inputManager.isAccelerating(), dt);
  }

  /**
   * Spawnuje kouř z obou zadních kol hráčova auta.
   * @private
   * @param {number} dt
   */
  _spawnBrakeSmokeEffect(dt) {
    const hitbox = this._playerCar.getHitbox();
    const x = hitbox.x + hitbox.width / 2;
    const y = hitbox.y + hitbox.height;
    this._particleSystem.spawnBrakeSmoke(x, y, dt);
  }

  /**
   * Aktualizuje rychlost silnice na základě vstupu hráče.
   *
   * Brzdění — tři fáze:
   *  1. t < BRAKE_RAMPUP_START       → konstantní DECELERATION
   *  2. t ∈ [START, START+DURATION]  → kvadraticky roste od DECELERATION
   *                                     na DECELERATION_MAX
   *  3. t > START+DURATION           → konstantní DECELERATION_MAX
   *
   * Kvadratický průběh: f(t) = base + (max - base) × ((t - start) / duration)²
   *
   * @private
   * @param {number} dt - Delta time (s).
   */
  _updateSpeed(dt) {
    if (this._inputManager.isAccelerating()) {
      this._brakeHeldTime = 0;
      // Exponenciální model: dv/dt = (ACCEL_VMAX - v) / ACCEL_TAU
      // Kalibrováno: 0→100 km/h za 3.5s, 0→200 km/h za 10s
      this._speed += ((PHYSICS.ACCEL_VMAX - this._speed) / PHYSICS.ACCEL_TAU) * dt;
    } else if (this._inputManager.isBraking()) {
      this._brakeHeldTime += dt;

      const decel = this._calcBrakeDeceleration(this._brakeHeldTime);
      this._speed -= decel * dt;
    } else {
      // Uvolnění brzdy — reset akumulátoru
      this._brakeHeldTime = 0;
      this._speed -= PHYSICS.DRAG * dt;
    }

    this._speed = Math.max(PHYSICS.SPEED_MIN, Math.min(this._speed, PHYSICS.SPEED_MAX));
  }

  /**
   * Vypočítá aktuální brzdný účinek (px/s²) na základě doby držení brzdy.
   *
   * @private
   * @param {number} heldTime - Jak dlouho je brzda držena (s).
   * @returns {number} Brzdná síla v px/s².
   */
  _calcBrakeDeceleration(heldTime) {
    const { DECELERATION, DECELERATION_MAX, BRAKE_RAMPUP_START, BRAKE_RAMPUP_DURATION } = PHYSICS;

    if (heldTime <= BRAKE_RAMPUP_START) {
      return DECELERATION;
    }

    // Normalizovaný čas v rampup fázi [0, 1]
    const t = Math.min((heldTime - BRAKE_RAMPUP_START) / BRAKE_RAMPUP_DURATION, 1);

    // Kvadratický nárůst: pomalý start, rychlý konec
    return DECELERATION + (DECELERATION_MAX - DECELERATION) * (t * t);
  }
}

// ─── Spuštění ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  new Game();
});
