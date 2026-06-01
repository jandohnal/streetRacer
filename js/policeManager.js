'use strict';

/**
 * @file policeManager.js
 * Řídí spawn a životní cyklus policejních aut.
 *
 * Policejní auta se generují nezávisle na běžném provozu — vlastní spawn timer
 * s delším intervalem, aby nebylo příliš mnoho policistů najednou.
 * Maximální počet aktivních policejních aut je omezen konstantou MAX_ACTIVE.
 */

class PoliceManager {
  /**
   * @param {SVGElement}     svg            - Kořenový SVG element.
   * @param {TrafficManager} trafficManager - Ref. pro kontrolu volných pruhů.
   */
  constructor(svg, trafficManager) {
    /** @private */
    this._svg = svg;

    /** @private */
    this._trafficManager = trafficManager;

    /**
     * Aktivní policejní auta.
     * @type {PoliceCar[]}
     */
    this._cars = [];

    /** @private */
    this._spawnTimer = this._initialDelay();
  }

  // ─── Privátní ────────────────────────────────────────────────────────────────

  /** @private */
  _initialDelay() {
    // Policie přijede poprvé za 8–14 sekund od startu
    return 8 + Math.random() * 6;
  }

  /**
   * Interval mezi spawny policejních aut — nezávisí na rychlosti.
   * @private
   * @returns {number} sekundy
   */
  _calcSpawnInterval() {
    return 12 + Math.random() * 8; // 12–20 s
  }

  /** Maximální počet aktivních policejních aut najednou. */
  static get MAX_ACTIVE() {
    return 2;
  }

  /**
   * Vrátí pruhy volné od dopravního provozu blízko spawnu.
   * @private
   * @returns {number[]}
   */
  _getAvailableLanes() {
    const safeZone = POLICE.HEIGHT + SPAWN.SAFE_GAP;

    // Pruhy obsazené běžnými auty
    const trafficOccupied = new Set(
      this._trafficManager
        .getCars()
        .filter((car) => car.cy - car.height / 2 < safeZone + 40)
        .map((car) => car.laneIndex),
    );

    // Pruhy obsazené jinými policisty
    const policeOccupied = new Set(
      this._cars
        .filter((car) => car.cy - POLICE.HEIGHT / 2 < safeZone + 40)
        .map((car) => car.laneIndex),
    );

    return Array.from({ length: ROAD.LANE_COUNT }, (_, i) => i).filter(
      (i) => !trafficOccupied.has(i) && !policeOccupied.has(i),
    );
  }

  /** @private */
  _spawnCar(roadSpeed) {
    if (this._cars.length >= PoliceManager.MAX_ACTIVE) return;

    const available = this._getAvailableLanes();
    if (available.length === 0) return;

    const laneIndex = available[Math.floor(Math.random() * available.length)];
    const startY = -(POLICE.HEIGHT / 2) - 5;

    const car = new PoliceCar(this._svg, laneIndex, startY, roadSpeed);
    this._cars.push(car);
  }

  // ─── Veřejné metody ─────────────────────────────────────────────────────────

  /**
   * Aktualizuje každý frame.
   * @param {number} dt        - Delta time (s).
   * @param {number} roadSpeed - Aktuální rychlost silnice (px/s).
   */
  update(dt, roadSpeed) {
    for (const car of this._cars) {
      car.update(dt, roadSpeed);
    }

    const inactive = this._cars.filter((c) => !c.active);
    for (const car of inactive) car.remove();
    this._cars = this._cars.filter((c) => c.active);

    this._spawnTimer -= dt;
    if (this._spawnTimer <= 0) {
      this._spawnTimer = this._calcSpawnInterval();
      this._spawnCar(roadSpeed);
    }
  }

  /**
   * Vrátí všechna aktivní policejní auta (pro kolizní detekci).
   * @returns {PoliceCar[]}
   */
  getCars() {
    return this._cars;
  }

  /** Resetuje správce. */
  reset() {
    for (const car of this._cars) car.remove();
    this._cars = [];
    this._spawnTimer = this._initialDelay();
  }
}
