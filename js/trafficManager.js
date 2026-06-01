'use strict';

/**
 * @file trafficManager.js
 * Řídí spawn a životní cyklus dopravních vozidel.
 *
 * Spawn logika:
 *  - Interval spawnu se zkracuje s rostoucí rychlostí silnice.
 *  - Nové vozidlo se negeneruje do pruhu, kde je jiné vozidlo blízko horního okraje.
 *  - Typ vozidla je vybrán ze VEHICLE_SPAWN_POOL (váhovaný výběr).
 */

class TrafficManager {
  /**
   * @param {SVGElement} svg - Kořenový SVG element.
   */
  constructor(svg) {
    /** @private */
    this._svg = svg;

    /**
     * Aktivní vozidla na scéně.
     * @type {TrafficCar[]}
     */
    this._cars = [];

    /** @private — zbývající čas do dalšího spawnu (s) */
    this._spawnTimer = 0;
  }

  // ─── Privátní metody ────────────────────────────────────────────────────────

  /**
   * Vypočítá aktuální interval spawnu v sekundách na základě rychlosti.
   * @private
   * @param {number} speed - Aktuální rychlost silnice (px/s).
   * @returns {number}
   */
  _calcSpawnInterval(speed) {
    const speedDelta = (speed - PHYSICS.SPEED_INITIAL) / 100;
    const interval = SPAWN.INTERVAL_BASE - speedDelta * SPAWN.INTERVAL_STEP;
    return Math.max(SPAWN.INTERVAL_MIN, interval);
  }

  /**
   * Vybere náhodný typ vozidla ze spawn pool (váhovaný výběr).
   * @private
   * @returns {string} VehicleType
   */
  _pickVehicleType() {
    return VEHICLE_SPAWN_POOL[Math.floor(Math.random() * VEHICLE_SPAWN_POOL.length)];
  }

  /**
   * Vrátí seznam pruhů, které jsou volné pro spawn nového vozidla.
   * Pruh je obsazený, pokud v něm existuje vozidlo, jehož horní okraj
   * je stále v bezpečné zóně od horního okraje plátna.
   * @private
   * @param {number} vehicleHeight - Výška nového vozidla.
   * @returns {number[]} Pole indexů volných pruhů.
   */
  _getAvailableLanes(vehicleHeight) {
    const safeZone = vehicleHeight + SPAWN.SAFE_GAP;

    // Pro každý pruh zjistíme, zda není obsazený
    const occupiedLanes = new Set(
      this._cars.filter((car) => car.cy - car.height / 2 < safeZone).map((car) => car.laneIndex),
    );

    return Array.from({ length: ROAD.LANE_COUNT }, (_, i) => i).filter(
      (i) => !occupiedLanes.has(i),
    );
  }

  /**
   * Spawn nového vozidla, pokud jsou dostupné pruhy.
   * @private
   * @param {number} roadSpeed - Aktuální rychlost silnice.
   */
  _spawnVehicle(roadSpeed) {
    // Spawn více aut najednou do různých pruhů → hustý provoz, plné pruhy.
    const count = 1 + Math.floor(Math.random() * SPAWN.MAX_PER_SPAWN);

    for (let n = 0; n < count; n++) {
      const type = this._pickVehicleType();
      const def = VEHICLE_DEFS[type];
      const available = this._getAvailableLanes(def.height);

      if (available.length === 0) break;

      const laneIndex = available[Math.floor(Math.random() * available.length)];
      const startY = -(def.height / 2) - 5;

      const car = new TrafficCar(this._svg, type, laneIndex, startY, roadSpeed);
      this._cars.push(car);
    }
  }

  // ─── Veřejné metody ─────────────────────────────────────────────────────────

  /**
   * Aktualizuje spawn timer, pohybuje vozidly a odstraňuje neaktivní.
   * Volá se každý frame z herní smyčky.
   *
   * @param {number} dt        - Delta time (s).
   * @param {number} roadSpeed - Aktuální rychlost silnice (px/s).
   */
  update(dt, roadSpeed, player = null) {
    // Pohyb existujících vozidel
    for (const car of this._cars) {
      car.update(dt, roadSpeed);
    }

    // Přizpůsobení rychlosti — prevence prolínání vozidel ve stejném pruhu
    this._applyFollowLogic(dt, player);

    // Náhodné přejezdy pruhů
    this._updateLaneChanges(dt, player);

    // Odstranění neaktivních
    const inactive = this._cars.filter((c) => !c.active);
    for (const car of inactive) car.remove();
    this._cars = this._cars.filter((c) => c.active);

    // Spawn logika
    this._spawnTimer -= dt;
    if (this._spawnTimer <= 0) {
      const interval = this._calcSpawnInterval(roadSpeed);
      this._spawnTimer = interval;
      this._spawnVehicle(roadSpeed);
    }
  }

  /**
   * Náhodně iniciuje přejezd pruhu u vhodných aut.
   * Auto může přejet pouze pokud:
   *  - Momentálně nepřejíždí.
   *  - Je viditelné na plátně (cy > 0).
   *  - Cílový pruh existuje (0–LANE_COUNT-1).
   *  - Cílový pruh není obsazen jiným autem v blízkém Y rozsahu.
   * @private
   * @param {number} dt
   */
  _updateLaneChanges(dt, player = null) {
    // Pravděpodobnost pokusu o přejezd na auto za sekundu
    const CHANCE_PER_SEC = 0.18;

    for (const car of this._cars) {
      if (car.isChangingLane) continue;
      // Auto musí být na obrazovce
      if (car.cy < 0 || car.cy > CANVAS.HEIGHT) continue;

      // Náhodný pokus
      if (Math.random() > CHANCE_PER_SEC * dt) continue;

      // Vyber náhodný směr (vlevo nebo vpravo)
      const dir = Math.random() < 0.5 ? -1 : 1;
      const targetLane = car.laneIndex + dir;

      // Zkontroluj hranice silnice
      if (targetLane < 0 || targetLane >= ROAD.LANE_COUNT) continue;

      // Zkontroluj, zda cílový pruh není obsazen v blízkém Y rozsahu
      if (!this._isLaneClearForChange(car, targetLane, player)) continue;

      car.startLaneChange(targetLane);
    }
  }

  /**
   * Zkontroluje, zda pruh je volný pro přejezd daného auta.
   * Bere v potaz ostatní auta i hráče (hráč v okruhu 2× délky auta blokuje přejezd).
   * @private
   * @param {TrafficCar} car
   * @param {number} targetLane
   * @param {PlayerCar} [player]
   * @returns {boolean}
   */
  _isLaneClearForChange(car, targetLane, player = null) {
    const safeGap = car.height * 1.2;
    for (const other of this._cars) {
      if (other === car) continue;
      if (other.laneIndex !== targetLane) continue;
      if (Math.abs(other.cy - car.cy) < safeGap) return false;
    }
    // Žádný přejezd, pokud je hráč v okruhu 2× délky auta (radius)
    if (player) {
      const dx = LANE_CENTERS[player.laneIndex] - car.cx;
      const dy = PLAYER.Y_CENTER - car.cy;
      if (Math.hypot(dx, dy) < car.height * 2) return false;
    }
    return true;
  }

  /**
   * Pro každý pruh seřadí vozidla dle Y (vzestupně = nejdál nahoře první)
   * a zkontroluje sousední páry. Pokud zadní auto dojelo přední na vzdálenost
   * menší než (výška předního × FOLLOW_GAP_FACTOR), přizpůsobí svou rychlost.
   *
   * Souřadnicový systém: větší Y = níže na obrazovce = blíže hráči.
   * „Přední" auto (leader) má MENŠÍ Y (je výše na obrazovce, tedy před zadním).
   * „Zadní" auto (follower) má VĚTŠÍ Y.
   *
   * Mezera = spodní okraj leadera − horní okraj followera.
   * Spodní okraj leadera = leader.cy + leader.height/2.
   * Horní okraj followera = follower.cy − follower.height/2.
   * Mezera záporná znamená průnik → okamžité přizpůsobení.
   *
   * @private
   */
  _applyFollowLogic(dt, player = null) {
    const OVERTAKE_DELAY = 2.0; // s — jak dlouho čeká CAR před předjetím

    for (let lane = 0; lane < ROAD.LANE_COUNT; lane++) {
      const inLane = this._cars.filter((c) => c.laneIndex === lane).sort((a, b) => a.cy - b.cy);

      for (let i = 0; i < inLane.length - 1; i++) {
        const leader = inLane[i];
        const follower = inLane[i + 1];

        const leaderBottom = leader.cy + leader.height / 2;
        const followerTop = follower.cy - follower.height / 2;
        const gap = followerTop - leaderBottom;
        const triggerDist = leader.height * SPAWN.FOLLOW_GAP_FACTOR;

        if (gap < triggerDist && follower.speed > leader.speed) {
          follower.matchSpeed(leader.speed, dt);

          // CAR se po OVERTAKE_DELAY pokusí předjet
          if (
            follower.type === VehicleType.CAR &&
            follower.blockedTimer >= OVERTAKE_DELAY &&
            !follower.isChangingLane
          ) {
            this._tryOvertake(follower, player);
          }
        } else if (gap >= triggerDist * 1.5) {
          follower.resumeSpeed();
        }
      }
    }
  }

  /**
   * Pokusí se najít volný sousední pruh a zahájit přejezd.
   * @private
   * @param {TrafficCar} car
   */
  _tryOvertake(car, player = null) {
    const leftOk =
      car.laneIndex - 1 >= 0 && this._isLaneClearForChange(car, car.laneIndex - 1, player);
    const rightOk =
      car.laneIndex + 1 < ROAD.LANE_COUNT &&
      this._isLaneClearForChange(car, car.laneIndex + 1, player);

    let targetLane = -1;
    if (leftOk && rightOk) {
      targetLane = Math.random() < 0.5 ? car.laneIndex - 1 : car.laneIndex + 1;
    } else if (leftOk) {
      targetLane = car.laneIndex - 1;
    } else if (rightOk) {
      targetLane = car.laneIndex + 1;
    }

    if (targetLane !== -1) {
      car.startLaneChange(targetLane);
      car.resetBlockedTimer();
    } else {
      // Oba pruhy obsazeny — resetuj timer a zkus znovu za 2s
      car.resetBlockedTimer();
    }
  }

  /**
   * Vrátí všechna aktivní vozidla (pro kolizní detekci).
   * @returns {TrafficCar[]}
   */
  getCars() {
    return this._cars;
  }

  /**
   * Resetuje správce — odstraní všechna vozidla ze scény.
   */
  reset() {
    for (const car of this._cars) car.remove();
    this._cars = [];
    this._spawnTimer = SPAWN.INTERVAL_BASE;
  }
}
