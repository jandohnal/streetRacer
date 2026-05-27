'use strict';

/**
 * @file bonusManager.js
 * Řídí spawn a životní cyklus bonusových předmětů.
 *
 * Bonusy se generují vzácně a nezávisle na mincích — vlastní spawn timer.
 * Každý bonus se spawne do náhodného pruhu, který není obsazen autem.
 */

class BonusManager {
  /**
   * @param {SVGElement}     svg            - Kořenový SVG element.
   * @param {TrafficManager} trafficManager - Reference pro kontrolu pruhů.
   */
  constructor(svg, trafficManager) {
    /** @private */
    this._svg = svg;

    /** @private */
    this._trafficManager = trafficManager;

    /**
     * Aktivní bonusy na scéně.
     * @type {Bonus[]}
     */
    this._bonuses = [];

    /** @private — spawn timer (s) */
    this._spawnTimer = this._initialDelay();
  }

  // ─── Privátní ────────────────────────────────────────────────────────────────

  /** @private */
  _initialDelay() {
    return 5 + Math.random() * 5;   // 5–10 s od startu
  }

  /** @private */
  _calcSpawnInterval() {
    // Bonus každých 15–20 sekund
    return 15 + Math.random() * 5;
  }

  /** @private */
  _getAvailableLanes() {
    const safeZone = COIN.RADIUS * 2 + SPAWN.SAFE_GAP;
    const cars     = this._trafficManager.getCars();

    const occupiedLanes = new Set(
      cars
        .filter(car => car.cy - car.height / 2 < safeZone + 60)
        .map(car => car.laneIndex)
        .filter(i => i !== -1)
    );

    return Array.from({ length: ROAD.LANE_COUNT }, (_, i) => i)
      .filter(i => !occupiedLanes.has(i));
  }

  /** @private */
  _spawnBonus() {
    const available = this._getAvailableLanes();
    if (available.length === 0) return;

    const laneIndex = available[Math.floor(Math.random() * available.length)];
    const startY    = -(COIN.RADIUS) - 5;

    // Prozatím pouze ANTI_RADAR — rozšiřitelné na více typů
    const bonus = new Bonus(this._svg, laneIndex, startY, BonusType.ANTI_RADAR);
    this._bonuses.push(bonus);
  }

  // ─── Veřejné metody ─────────────────────────────────────────────────────────

  /**
   * Aktualizuje bonusy každý frame.
   * @param {number} dt
   * @param {number} roadSpeed
   */
  update(dt, roadSpeed) {
    for (const bonus of this._bonuses) {
      bonus.update(dt, roadSpeed);
    }

    this._bonuses = this._bonuses.filter(b => b.active);

    this._spawnTimer -= dt;
    if (this._spawnTimer <= 0) {
      this._spawnTimer = this._calcSpawnInterval();
      this._spawnBonus();
    }
  }

  /**
   * Vrátí všechny aktivní bonusy (pro kolizní detekci).
   * @returns {Bonus[]}
   */
  getBonuses() {
    return this._bonuses;
  }

  /** Resetuje správce bonusů. */
  reset() {
    for (const bonus of this._bonuses) bonus.remove();
    this._bonuses      = [];
    this._spawnTimer   = this._initialDelay();
  }
}
