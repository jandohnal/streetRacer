'use strict';

/**
 * @file particle.js
 * Jedna vizuální částice — SVG element, kinematika, životnost.
 *
 * Částice je vždy součástí předané SVG skupiny (ne kořenového SVG).
 * Pohybuje se vlastní rychlostí nezávisle na rychlosti silnice.
 *
 * Životní cyklus:
 *   spawn → update každý frame (pohyb + fade) → active = false → remove()
 */

/** @enum {string} */
const ParticleShape = Object.freeze({
  CIRCLE: 'circle',
  RING: 'ring', // kruh bez výplně (jen stroke) — ripple efekt
});

class Particle {
  /**
   * @param {SVGElement} group     - SVG <g> skupina pro částice.
   * @param {object}     config    - Konfigurace částice.
   * @param {number}     config.x          - Počáteční X (světové souřadnice).
   * @param {number}     config.y          - Počáteční Y.
   * @param {number}     config.vx         - Rychlost X (px/s).
   * @param {number}     config.vy         - Rychlost Y (px/s).
   * @param {number}     config.lifetime   - Celková životnost (s).
   * @param {number}     config.radius     - Počáteční poloměr (px).
   * @param {number}     config.radiusEnd  - Koncový poloměr (px).
   * @param {string}     config.color      - Barva výplně / stroke.
   * @param {number}     config.opacity    - Počáteční průhlednost (0–1).
   * @param {number}     config.opacityEnd - Koncová průhlednost.
   * @param {ParticleShape} [config.shape] - Tvar (výchozí CIRCLE).
   */
  constructor(group, config) {
    /** @private */
    this._group = group;

    this._x = config.x;
    this._y = config.y;
    this._vx = config.vx;
    this._vy = config.vy;
    this._lifetime = config.lifetime;
    this._elapsed = 0;
    this._radius = config.radius;
    this._radiusEnd = config.radiusEnd ?? config.radius;
    this._color = config.color;
    this._opacity = config.opacity ?? 1;
    this._opacityEnd = config.opacityEnd ?? 0;
    this._shape = config.shape ?? ParticleShape.CIRCLE;

    /** @type {boolean} */
    this.active = true;

    /** @private */
    this._el = this._createElement();
    group.appendChild(this._el);
    this._applyState(0);
  }

  // ─── Privátní ────────────────────────────────────────────────────────────────

  /** @private */
  _createElement() {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    if (this._shape === ParticleShape.RING) {
      el.setAttribute('fill', 'none');
      el.setAttribute('stroke', this._color);
      el.setAttribute('stroke-width', '1.5');
    } else {
      el.setAttribute('fill', this._color);
    }
    return el;
  }

  /**
   * Aplikuje interpolovaný stav na SVG element.
   * @private
   * @param {number} t - Normalizovaný čas [0, 1].
   */
  _applyState(t) {
    const r = this._radius + (this._radiusEnd - this._radius) * t;
    const opacity = this._opacity + (this._opacityEnd - this._opacity) * t;

    this._el.setAttribute('cx', this._x.toFixed(1));
    this._el.setAttribute('cy', this._y.toFixed(1));
    this._el.setAttribute('r', Math.max(0, r).toFixed(1));
    this._el.setAttribute('opacity', Math.max(0, opacity).toFixed(3));
  }

  // ─── Veřejné ─────────────────────────────────────────────────────────────────

  /**
   * Aktualizuje pozici a stav každý frame.
   * @param {number} dt - Delta time (s).
   */
  update(dt) {
    this._elapsed += dt;
    if (this._elapsed >= this._lifetime) {
      this.active = false;
      return;
    }

    // Kinematika
    this._x += this._vx * dt;
    this._y += this._vy * dt;

    const t = this._elapsed / this._lifetime;
    this._applyState(t);
  }

  /** Odstraní SVG element ze skupiny. */
  remove() {
    if (this._el.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }
  }
}
