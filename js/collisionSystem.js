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

  /**
   * Vyřeší vzájemné kolize mezi VŠEMI auty na vozovce (traffic, police, racer).
   * Zabrání průniku libovolné dvojice vozidel:
   *  - Nájezd zezadu (menší překryv v ose Y) → zadní auto se posune zpět
   *    a zpomalí na rychlost předního.
   *  - Boční překryv (menší překryv v ose X) → auta se rozestoupí do stran.
   *
   * Volá se po pohybovém updatu všech vozidel, před kontrolou kolizí hráče.
   *
   * @param {Array<TrafficCar|PoliceCar|RacerCar>} vehicles - Všechna AI vozidla.
   */
  resolveVehicleSeparation(vehicles) {
    const RESTITUTION  = 0.25; // koeficient odrazu při nájezdu zezadu (0 = bez odrazu)
    const SIDE_PUSH    = 140;  // px/s — boční odrazová rychlost při bočním kontaktu

    for (let i = 0; i < vehicles.length; i++) {
      for (let j = i + 1; j < vehicles.length; j++) {
        const a = vehicles[i];
        const b = vehicles[j];
        const ha = a.getHitbox();
        const hb = b.getHitbox();
        if (!CollisionSystem._aabbOverlap(ha, hb)) continue;

        const aCx = ha.x + ha.width  / 2;
        const bCx = hb.x + hb.width  / 2;
        const aCy = ha.y + ha.height / 2;
        const bCy = hb.y + hb.height / 2;

        const overlapX = (ha.width  + hb.width)  / 2 - Math.abs(aCx - bCx);
        const overlapY = (ha.height + hb.height) / 2 - Math.abs(aCy - bCy);
        if (overlapX <= 0 || overlapY <= 0) continue;

        const ma = a.mass;
        const mb = b.mass;
        const total = ma + mb;

        if (overlapY <= overlapX) {
          // ── Nájezd zezadu (podélná osa) ──────────────────────────────────
          const rear  = a.cy > b.cy ? a : b;
          const front = a.cy > b.cy ? b : a;
          const mr = rear.mass;
          const mf = front.mass;
          const tot = mr + mf;

          // Poziční korekce dle hmotnosti — lehčí auto ustoupí víc
          rear.separate(0,   overlapY * (mf / tot));
          front.separate(0, -overlapY * (mr / tot));

          // Přenos hybnosti podél jízdy — zadní (rychlejší) postrčí přední vpřed
          const u1 = rear.speed;
          const u2 = front.speed;
          if (u1 > u2) {
            const e  = RESTITUTION;
            const v1 = (mr * u1 + mf * u2 - mf * e * (u1 - u2)) / tot;
            const v2 = (mr * u1 + mf * u2 + mr * e * (u1 - u2)) / tot;
            rear.setSpeed(v1);
            front.setSpeed(v2);
          }
        } else {
          // ── Boční překryv — rozestup + boční odraz ───────────────────────
          const dirA = aCx < bCx ? -1 : 1; // směr odsunutí auta A
          a.separate(dirA * overlapX * (mb / total), 0);
          b.separate(-dirA * overlapX * (ma / total), 0);

          // Boční impuls — vytlačení do strany (lehčí auto odlétne víc)
          a.applyLateralImpulse(dirA * SIDE_PUSH * (mb / total));
          b.applyLateralImpulse(-dirA * SIDE_PUSH * (ma / total));
        }
      }
    }
  },

  /**
   * Vyřeší fyzickou kolizi hráče s ostatními auty (NEukončuje hru).
   * Hráč má pevné Y (PLAYER.Y_CENTER), takže se separuje druhé auto, a rychlost
   * hráče se sníží:
   *  - Nájezd zezadu na pomalejší auto → hráč zpomalí na rychlost toho auta
   *    (+ lehký odraz) a auto se postrčí dopředu.
   *  - Boční kontakt → auto se vytlačí do strany + mírné zpomalení hráče.
   *
   * @param {PlayerCar} playerCar - Hráčovo auto.
   * @param {Array<TrafficCar|PoliceCar|RacerCar>} vehicles - Všechna AI auta.
   * @param {number} speed - Aktuální rychlost hráče (px/s).
   * @returns {number} Upravená rychlost hráče (px/s).
   */
  resolvePlayerVsVehicles(playerCar, vehicles, speed) {
    const REAR_BOUNCE = 0.92; // lehký odraz při nájezdu zezadu
    const SIDE_SLOW   = 0.97; // mírné zpomalení při bočním škrtnutí
    const SIDE_PUSH   = 160;  // px/s — boční odraz auta

    const ph  = playerCar.getHitbox();
    const pCx = ph.x + ph.width  / 2;
    const pCy = ph.y + ph.height / 2;

    let newSpeed = speed;

    for (const v of vehicles) {
      const vh = v.getHitbox();
      if (!CollisionSystem._aabbOverlap(ph, vh)) continue;

      const vCx = vh.x + vh.width  / 2;
      const vCy = vh.y + vh.height / 2;

      const overlapX = (ph.width  + vh.width)  / 2 - Math.abs(pCx - vCx);
      const overlapY = (ph.height + vh.height) / 2 - Math.abs(pCy - vCy);
      if (overlapX <= 0 || overlapY <= 0) continue;

      if (overlapY <= overlapX) {
        // Podélná osa — typicky hráč najíždí na pomalejší auto před sebou
        if (pCy > vCy) {
          // Auto je před hráčem → postrč ho dopředu, hráč zpomalí na jeho rychlost
          v.separate(0, -overlapY);
          newSpeed = Math.min(newSpeed, v.speed * REAR_BOUNCE);
        } else {
          // Auto je za hráčem (vzácné) → postrč ho zpět a zpomal na rychlost hráče
          v.separate(0, overlapY);
          v.capSpeed(newSpeed);
        }
      } else {
        // Boční kontakt → vytlač auto do strany, hráče mírně zpomal
        const dir = vCx >= pCx ? 1 : -1;
        v.separate(dir * overlapX, 0);
        v.applyLateralImpulse(dir * SIDE_PUSH);
        newSpeed *= SIDE_SLOW;
      }
    }

    return newSpeed;
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
