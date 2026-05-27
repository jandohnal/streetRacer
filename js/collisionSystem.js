'use strict';

/**
 * @file collisionSystem.js
 * Detekce kolizí:
 *  - Hráč vs. dopravní auto    → AABB první fáze, pak pixel-perfect alfa test rohů
 *  - Hráč vs. mince            → kruh–kruh (vzdálenost středů)
 *  - Hráč vs. policejní radar  → střed hráče vs. kruh radaru + rychlostní limit
 */

const CollisionSystem = Object.freeze({

  /**
   * Zkontroluje, zda hráčovo auto koliduje s jakýmkoliv dopravním vozidlem.
   *
   * Postup:
   *  1. Hrubý AABB test — rychlé vyloučení objektů mimo dosah.
   *  2. Pixel-perfect alfa test — ověří 4 rohy protivníkova hitboxu
   *     oproti alfa kanálu PNG spritu hráče.
   *     Pokud sprite není dostupný (SVG fallback), AABB výsledek platí přímo.
   *
   * @param {PlayerCar}    playerCar - Hráčovo auto.
   * @param {TrafficCar[]} cars      - Pole aktivních vozidel.
   * @returns {TrafficCar|null} První kolidující vozidlo, nebo null.
   */
  checkPlayerVsTraffic(playerCar, cars) {
    const player = playerCar.getHitbox();
    for (const car of cars) {
      const other = car.getHitbox();
      if (!CollisionSystem._aabbOverlap(player, other)) continue;

      // Pixel-perfect test: zkontrolujeme 4 rohy hitboxu protivníka
      if (CollisionSystem._alphaOverlap(playerCar, other)) return car;
    }
    return null;
  },

  /**
   * Zkontroluje, která mince byla hráčem sebrána.
   * Sebrané mince označí jako collected.
   *
   * @param {PlayerCar} playerCar - Hráčovo auto.
   * @param {Coin[]}    coins     - Pole aktivních mincí.
   * @returns {{ count: number, positions: Array<{x:number, y:number}> }}
   *   Počet sebraných mincí a jejich světové pozice (pro particle efekty).
   */
  checkPlayerVsCoins(playerCar, coins) {
    const player = playerCar.getHitbox();
    const pcx    = player.x + player.width  / 2;
    const pcy    = player.y + player.height / 2;
    const pr     = Math.min(player.width, player.height) / 2;

    let count     = 0;
    const positions = [];

    for (const coin of coins) {
      if (!coin.active) continue;
      const { cx, cy, r } = coin.getHitCircle();
      if (Math.hypot(cx - pcx, cy - pcy) < pr + r) {
        positions.push({ x: cx, y: cy });
        coin.collect();
        count++;
      }
    }
    return { count, positions };
  },

  /**
   * Zkontroluje, který bonus byl hráčem sebrán.
   * Sebrané bonusy označí jako collected.
   *
   * @param {PlayerCar} playerCar - Hráčovo auto.
   * @param {Bonus[]}   bonuses   - Pole aktivních bonusů.
   * @returns {{ collected: Bonus[] }} Sebrané bonusy.
   */
  checkPlayerVsBonuses(playerCar, bonuses) {
    const player = playerCar.getHitbox();
    const pcx    = player.x + player.width  / 2;
    const pcy    = player.y + player.height / 2;
    const pr     = Math.min(player.width, player.height) / 2;

    const collected = [];
    for (const bonus of bonuses) {
      if (!bonus.active) continue;
      const { cx, cy, r } = bonus.getHitCircle();
      if (Math.hypot(cx - pcx, cy - pcy) < pr + r) {
        bonus.collect();
        collected.push(bonus);
      }
    }
    return { collected };
  },

  /**
   * Zkontroluje, zda hráč vstoupil do radaru policejního auta při překročení
   * rychlostního limitu.
   *
   * @param {PlayerCar}  playerCar    - Hráčovo auto.
   * @param {PoliceCar[]} policeCars  - Pole aktivních policejních aut.
   * @param {number}      speedPxPerS - Aktuální rychlost hráče (px/s).
   * @returns {PoliceCar|null} Policejní auto, které hráče chytilo, nebo null.
   */
  checkPlayerVsPoliceRadar(playerCar, policeCars, speedPxPerS) {
    const speedKmh = speedPxPerS * PHYSICS.PX_PER_S_TO_KMH;
    if (speedKmh <= POLICE.SPEED_LIMIT_KMH) return null;

    const player = playerCar.getHitbox();
    const pcx    = player.x + player.width  / 2;
    const pcy    = player.y + player.height / 2;

    for (const car of policeCars) {
      const { cx, cy, r } = car.getRadarCircle();
      if (Math.hypot(cx - pcx, cy - pcy) < r) {
        return car;
      }
    }
    return null;
  },

  // ─── Privátní pomocné funkce ─────────────────────────────────────────────────

  /**
   * AABB překryv dvou obdélníků.
   * @private
   */
  _aabbOverlap(a, b) {
    return (
      a.x < b.x + b.width  &&
      a.x + a.width  > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  },

  /**
   * Pixel-perfect alfa test: ověří reprezentativní body hitboxu `other`
   * vůči alfa kanálu PNG spritu hráče.
   *
   * Testované body: 4 rohy + střed — 5 bodů celkem.
   * Pokud alespoň jeden bod leží na neprůhledném pixelu, hlásíme kolizi.
   *
   * Pokud PlayerCar nemá metodu isOpaqueAt (SVG fallback), vrátíme true přímo.
   *
   * @private
   * @param {PlayerCar} playerCar
   * @param {{ x:number, y:number, width:number, height:number }} other
   * @returns {boolean}
   */
  _alphaOverlap(playerCar, other) {
    if (typeof playerCar.isOpaqueAt !== 'function') return true;

    const { x, y, width: w, height: h } = other;
    const testPoints = [
      { wx: x + 1,         wy: y + 1 },
      { wx: x + w - 1,     wy: y + 1 },
      { wx: x + 1,         wy: y + h - 1 },
      { wx: x + w - 1,     wy: y + h - 1 },
      { wx: x + w / 2,     wy: y + h / 2 },
    ];

    return testPoints.some(({ wx, wy }) => playerCar.isOpaqueAt(wx, wy));
  },

});
