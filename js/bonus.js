'use strict';

/**
 * @file bonus.js
 * Bonusový předmět — vypadá jako mince, ale má jinou barvu a efekt.
 *
 * Typy bonusů:
 *   ANTI_RADAR — modrá mince, na 30 s vypne detekci policejního radaru.
 */

/** @enum {string} */
const BonusType = Object.freeze({
  ANTI_RADAR: 'anti_radar',
});

/** Vizuální konfigurace dle typu */
const BONUS_DEFS = Object.freeze({
  [BonusType.ANTI_RADAR]: {
    colorFill:   '#1a8cff',
    colorStroke: '#0055cc',
    innerColor:  '#66b8ff',
    symbol:      '★',
    symbolColor: '#003399',
    duration:    30,   // sekund aktivního efektu
  },
});

class Bonus {
  /**
   * @param {SVGElement} svg       - Kořenový SVG element.
   * @param {number}     laneIndex - Index pruhu (0–5).
   * @param {number}     startY    - Počáteční Y střed (nad plátnem).
   * @param {string}     type      - Typ bonusu (BonusType).
   */
  constructor(svg, laneIndex, startY, type) {
    /** @private */
    this._svg = svg;

    /** @private */
    this._cx = LANE_CENTERS[laneIndex];

    /** @private */
    this._cy = startY;

    /** Typ bonusu */
    this.type = type;

    /** @private */
    this._def = BONUS_DEFS[type];

    /** @private — akumulovaný čas pro pulzaci lesku */
    this._pulseTime = 0;

    /** @private — SVG skupina */
    this._group = null;

    /** @private — vnitřní lesk (animujeme opacitu) */
    this._innerCircle = null;

    /** Příznak aktivního předmětu */
    this.active = true;

    /** Příznak sebrání */
    this.collected = false;

    this._createElements();
  }

  // ─── Privátní ────────────────────────────────────────────────────────────────

  /** @private */
  _createElements() {
    const g   = this._createElement('g');
    const def = this._def;

    // Vnější záře (glow) — větší poloprůhledný kruh
    const glow = this._createElement('circle');
    glow.setAttribute('cx', 0);
    glow.setAttribute('cy', 0);
    glow.setAttribute('r', COIN.RADIUS + 5);
    glow.setAttribute('fill', def.colorFill);
    glow.setAttribute('opacity', '0.25');
    g.appendChild(glow);

    // Vnější kruh
    const outer = this._createElement('circle');
    outer.setAttribute('cx', 0);
    outer.setAttribute('cy', 0);
    outer.setAttribute('r', COIN.RADIUS);
    outer.setAttribute('fill', def.colorFill);
    outer.setAttribute('stroke', def.colorStroke);
    outer.setAttribute('stroke-width', COIN.STROKE_WIDTH);
    g.appendChild(outer);

    // Vnitřní kruh (lesk)
    const inner = this._createElement('circle');
    inner.setAttribute('cx', -2);
    inner.setAttribute('cy', -2);
    inner.setAttribute('r', COIN.INNER_RADIUS);
    inner.setAttribute('fill', def.innerColor);
    inner.setAttribute('opacity', '0.7');
    this._innerCircle = inner;
    g.appendChild(inner);

    // Symbol
    const symbol = this._createElement('text');
    symbol.setAttribute('x', 0);
    symbol.setAttribute('y', 4);
    symbol.setAttribute('text-anchor', 'middle');
    symbol.setAttribute('font-size', '10');
    symbol.setAttribute('font-weight', 'bold');
    symbol.setAttribute('fill', def.symbolColor);
    symbol.textContent = def.symbol;
    g.appendChild(symbol);

    this._group = g;
    this._svg.appendChild(g);
    this._applyTransform();
  }

  /** @private */
  _createElement(tag) {
    return document.createElementNS('http://www.w3.org/2000/svg', tag);
  }

  /** @private */
  _applyTransform() {
    this._group.setAttribute('transform', `translate(${this._cx}, ${this._cy})`);
  }

  // ─── Veřejné metody ─────────────────────────────────────────────────────────

  /**
   * Aktualizuje pozici a pulzaci.
   * @param {number} dt
   * @param {number} roadSpeed
   */
  update(dt, roadSpeed) {
    this._cy += roadSpeed * dt;
    this._applyTransform();

    // Pulzace lesku
    this._pulseTime += dt;
    const pulse = 0.5 + 0.5 * Math.sin(this._pulseTime * 4);
    this._innerCircle.setAttribute('opacity', (0.4 + pulse * 0.5).toFixed(2));

    if (this._cy - COIN.RADIUS > CANVAS.HEIGHT + 10) {
      this.active = false;
    }
  }

  /**
   * Označí bonus jako sebraný a odstraní ho ze scény.
   */
  collect() {
    this.collected = true;
    this.active    = false;
    this.remove();
  }

  /**
   * Vrátí střed pro kruhovou kolizní detekci.
   * @returns {{ cx: number, cy: number, r: number }}
   */
  getHitCircle() {
    return { cx: this._cx, cy: this._cy, r: COIN.RADIUS };
  }

  /** Vrátí dobu trvání efektu tohoto bonusu (s). */
  get duration() {
    return this._def.duration;
  }

  /** Odstraní SVG skupinu z dokumentu. */
  remove() {
    if (this._group && this._group.parentNode) {
      this._group.parentNode.removeChild(this._group);
    }
  }
}
