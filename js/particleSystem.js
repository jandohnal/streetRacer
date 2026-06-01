'use strict';

/**
 * @file particleSystem.js
 * Správce všech částicových efektů ve hře.
 *
 * Zodpovědnosti:
 *  - Udržuje pool aktivních částic.
 *  - Hard cap MAX_PARTICLES — při překročení se deaktivují nejstarší částice.
 *  - Poskytuje spawn API pro jednotlivé efekty.
 *  - Volá update() a čistí neaktivní částice každý frame.
 *
 * Efekty:
 *  - spawnBrakeSmoke(x, y)  — kouř z brzd (při držení ↓)
 *  - spawnCoinBurst(x, y)   — záblesk při sebrání mince (burst + ripple)
 */

class ParticleSystem {
  /**
   * @param {SVGElement} particleGroup - SVG <g> skupina vyhrazená pro částice.
   */
  constructor(particleGroup) {
    /** @private */
    this._group = particleGroup;

    /**
     * Pool aktivních částic.
     * @private
     * @type {Particle[]}
     */
    this._particles = [];

    /**
     * Akumulátor pro smoke — generujeme částice kontinuálně, ne každý frame.
     * @private
     */
    this._smokeAccumulator = 0;
  }

  /** Maximální počet živých částic najednou. */
  static get MAX_PARTICLES() {
    return 120;
  }

  // ─── Privátní ────────────────────────────────────────────────────────────────

  /**
   * Přidá novou částici do poolu.
   * Pokud je dosažen hard cap, odstraní nejstarší (první v poli) částici.
   * @private
   * @param {object} config - Konfigurace předaná do konstruktoru Particle.
   */
  _addParticle(config) {
    if (this._particles.length >= ParticleSystem.MAX_PARTICLES) {
      const oldest = this._particles.shift();
      oldest.remove();
    }
    this._particles.push(new Particle(this._group, config));
  }

  /**
   * Vrátí náhodné číslo v rozsahu [min, max].
   * @private
   */
  _rand(min, max) {
    return min + Math.random() * (max - min);
  }

  // ─── Spawn API ───────────────────────────────────────────────────────────────

  /**
   * Generuje kouřové částice z kol při brzdění.
   * Volat kontinuálně každý frame, dokud hráč brzdí.
   * Interní akumulátor zajišťuje frame-rate nezávislý spawn.
   *
   * Vizuál: světle šedé poloprůhledné kruhy vylétají dozadu a do stran,
   * postupně se zvětšují a mizí.
   *
   * @param {number} x  - X střed zadní osy hráčova auta (světové souřadnice).
   * @param {number} y  - Y střed zadní osy.
   * @param {number} dt - Delta time (s) — pro frame-rate nezávislý spawn rate.
   */
  spawnBrakeSmoke(x, y, dt) {
    /** Počet částic za sekundu z jednoho kola */
    const RATE = 28;

    this._smokeAccumulator += RATE * dt;

    while (this._smokeAccumulator >= 1) {
      this._smokeAccumulator -= 1;

      // Dvě kola — levé a pravé, odsazení od středu auta
      const wheelOffsets = [-PLAYER.WIDTH * 0.38, PLAYER.WIDTH * 0.38];

      for (const offsetX of wheelOffsets) {
        const angle = this._rand(Math.PI * 0.55, Math.PI * 0.95); // dozadu + do stran
        const speed = this._rand(18, 55);
        const scatter = this._rand(-0.4, 0.4); // laterální rozptyl

        this._addParticle({
          x: x + offsetX + this._rand(-3, 3),
          y: y + this._rand(-2, 4),
          vx: Math.cos(angle + scatter) * speed,
          vy: Math.sin(angle) * speed,
          lifetime: this._rand(0.38, 0.68),
          radius: this._rand(3, 5),
          radiusEnd: this._rand(8, 14),
          color: this._rand(0, 1) > 0.5 ? '#cccccc' : '#aaaaaa',
          opacity: this._rand(0.45, 0.65),
          opacityEnd: 0,
          shape: ParticleShape.CIRCLE,
        });
      }
    }
  }

  /**
   * Jednorázový záblesk při sebrání mince.
   * Kombinace:
   *  A) 8 zlatých kruhů vylétá od středu mince (hvězdice)
   *  B) 2 rozšiřující se průhledné kruhy (ripple)
   *
   * @param {number} x - X střed mince.
   * @param {number} y - Y střed mince.
   */
  spawnCoinBurst(x, y) {
    const BURST_COUNT = 8;

    // A) Burst — zlaté kuličky ve hvězdicovém vzoru
    for (let i = 0; i < BURST_COUNT; i++) {
      const angle = (i / BURST_COUNT) * Math.PI * 2;
      const speed = this._rand(55, 110);
      // Mírný rozptyl od přesného úhlu
      const jitter = this._rand(-0.25, 0.25);

      this._addParticle({
        x: x,
        y: y,
        vx: Math.cos(angle + jitter) * speed,
        vy: Math.sin(angle + jitter) * speed,
        lifetime: this._rand(0.28, 0.45),
        radius: this._rand(3.5, 5.5),
        radiusEnd: 0,
        color: this._rand(0, 1) > 0.4 ? '#FFD700' : '#ffec6e',
        opacity: 1,
        opacityEnd: 0,
        shape: ParticleShape.CIRCLE,
      });
    }

    // B) Ripple — dva rozšiřující se kruhy (ring)
    const rippleTimes = [0, 0.06]; // druhý s malým zpožděním (simulujeme offsetem lifetime)
    for (const offset of rippleTimes) {
      this._addParticle({
        x: x,
        y: y,
        vx: 0,
        vy: 0,
        lifetime: 0.4 - offset,
        radius: COIN.RADIUS * 0.8,
        radiusEnd: COIN.RADIUS * 3.2,
        color: '#FFD700',
        opacity: 0.7,
        opacityEnd: 0,
        shape: ParticleShape.RING,
      });
    }
  }

  // ─── Update / cleanup ────────────────────────────────────────────────────────

  /**
   * Aktualizuje všechny aktivní částice a odstraňuje mrtvé.
   * Volat každý frame z herní smyčky.
   * @param {number} dt - Delta time (s).
   */
  update(dt) {
    for (const p of this._particles) {
      p.update(dt);
    }

    const dead = this._particles.filter((p) => !p.active);
    for (const p of dead) p.remove();
    this._particles = this._particles.filter((p) => p.active);
  }

  /**
   * Resetuje systém — odstraní všechny částice (při restartu hry).
   */
  reset() {
    for (const p of this._particles) p.remove();
    this._particles = [];
    this._smokeAccumulator = 0;
  }
}
