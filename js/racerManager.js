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
    return 4 + Math.random() * 3.5; // 4–7.5 s
  }

  /** @private */
  _spawnRacer(roadSpeed, startY = -65) {
    const laneIndex = Math.floor(Math.random() * ROAD.LANE_COUNT);
    const racer = new RacerCar(this._svg, laneIndex, startY, roadSpeed);
    this._racers.push(racer);
  }

  // ─── Veřejné metody ─────────────────────────────────────────────────────────

  /**
   * @param {number}       dt
   * @param {number}       roadSpeed    - Aktuální rychlost silnice (px/s).
   * @param {TrafficCar[]} trafficCars  - Pro logiku vyhýbání.
   * @param {PlayerCar}    [player]     - Hráč (pro vyhýbání a kolize).
   * @param {PoliceCar[]}  [policeCars] - Policejní auta (pro vyhýbání radaru).
   */
  update(dt, roadSpeed, trafficCars, player, policeCars = []) {
    const playerKmh = roadSpeed * PHYSICS.PX_PER_S_TO_KMH;

    // Update existujících racerů
    for (const r of this._racers) {
      r.update(dt, roadSpeed, trafficCars, player, policeCars);
    }

    // Odstranění neaktivních
    const inactive = this._racers.filter((r) => !r.active);
    for (const r of inactive) r.remove();
    this._racers = this._racers.filter((r) => r.active);

    // Spawn logika — jen pokud hráč jede rychle a máme místo (max 1 racer)
    if (playerKmh > 130 && this._racers.length < 1) {
      this._spawnTimer -= dt;
      if (this._spawnTimer <= 0) {
        this._spawnTimer = this._nextInterval();
        this._spawnRacer(roadSpeed);
      }
    }
  }

  /**
   * Vrátí všechny aktivní racery (pro kolizní detekci).
   * @returns {RacerCar[]}
   */
  getRacers() {
    return this._racers;
  }

  /**
   * Resetuje správce a ihned spawnuje úvodního racera před hráčem.
   * @param {number} roadSpeed - Počáteční rychlost silnice (px/s).
   */
  reset(roadSpeed = PHYSICS.SPEED_INITIAL) {
    for (const r of this._racers) r.remove();
    this._racers = [];
    this._spawnTimer = this._nextInterval();
    // Úvodní racer uprostřed plochy před hráčem
    this._spawnRacer(roadSpeed, CANVAS.HEIGHT * 0.5);
  }
}
