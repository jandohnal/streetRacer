'use strict';

/**
 * @file racerManager.js
 * Řídí spawn a životní cyklus závodních soupeřů.
 *
 * Pravidla:
 *  - Maximálně 2 race-auta najednou.
 *  - Interval spawnu 20–40 s.
 *  - Spawne se jen pokud hráč jede nad 130 km/h.
 *  - Spawne se dole na obrazovce (za hráčem nebo na úrovni hráče).
 */

class RacerManager {
  /**
   * @param {SVGElement} svg
   */
  constructor(svg) {
    /** @private */
    this._svg = svg;

    /** @type {RacerCar[]} */
    this._racers = [];

    /** @private */
    this._spawnTimer = this._nextInterval();
  }

  // ─── Privátní ────────────────────────────────────────────────────────────────

  /** @private */
  _nextInterval() {
    return 20 + Math.random() * 20; // 20–40 s
  }

  /** @private */
  _spawnRacer() {
    // Vyber náhodný pruh
    const laneIndex = Math.floor(Math.random() * ROAD.LANE_COUNT);
    // Spawne se těsně pod dolním okrajem obrazovky
    const startY = CANVAS.HEIGHT + 40;
    const racer  = new RacerCar(this._svg, laneIndex, startY);
    this._racers.push(racer);
  }

  // ─── Veřejné metody ─────────────────────────────────────────────────────────

  /**
   * @param {number}       dt
   * @param {number}       roadSpeed    - Aktuální rychlost silnice (px/s).
   * @param {TrafficCar[]} trafficCars  - Pro logiku vyhýbání.
   */
  update(dt, roadSpeed, trafficCars) {
    const playerKmh = roadSpeed * PHYSICS.PX_PER_S_TO_KMH;

    // Update existujících racerů
    for (const r of this._racers) {
      r.update(dt, roadSpeed, trafficCars);
    }

    // Odstranění neaktivních
    const inactive = this._racers.filter(r => !r.active);
    for (const r of inactive) r.remove();
    this._racers = this._racers.filter(r => r.active);

    // Spawn logika — jen pokud hráč jede rychle a máme místo
    if (playerKmh > 130 && this._racers.length < 2) {
      this._spawnTimer -= dt;
      if (this._spawnTimer <= 0) {
        this._spawnTimer = this._nextInterval();
        this._spawnRacer();
      }
    } else if (this._racers.length >= 2) {
      // Počkáme dokud se jeden nevypne
      this._spawnTimer = this._nextInterval();
    }
  }

  /**
   * Vrátí všechny aktivní racery (pro kolizní detekci).
   * @returns {RacerCar[]}
   */
  getRacers() {
    return this._racers;
  }

  /** Resetuje správce. */
  reset() {
    for (const r of this._racers) r.remove();
    this._racers     = [];
    this._spawnTimer = this._nextInterval();
  }
}
