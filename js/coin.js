'use strict';

/**
 * @file coin.js
 * Jedna zlatá mince — SVG grafika, pohyb a hitbox.
 */

class Coin {
  /**
   * @param {SVGElement} svg       - Kořenový SVG element.
   * @param {number}     laneIndex - Index pruhu (0–5).
   * @param {number}     startY    - Počáteční Y střed (nad plátnem).
   */
  constructor(svg, laneIndex, startY) {
    /** @private */
    this._svg = svg;

    /** @private */
    this._cx = LANE_CENTERS[laneIndex];

    /** @private */
    this._cy = startY;

    /** @private — SVG skupina */
    this._group = null;

    /** Příznak aktivní mince. */
    this.active = true;

    /** Příznak sebrání (collision). */
    this.collected = false;

    this._createElements();
  }

  // ─── Privátní ────────────────────────────────────────────────────────────────

  /** @private */
  _createElements() {
    const g = this._createElement('g');

    // Vnější kruh
    const outer = this._createElement('circle');
    outer.setAttribute('cx', 0);
    outer.setAttribute('cy', 0);
    outer.setAttribute('r', COIN.RADIUS);
    outer.setAttribute('fill', COIN.COLOR_FILL);
    outer.setAttribute('stroke', COIN.COLOR_STROKE);
    outer.setAttribute('stroke-width', COIN.STROKE_WIDTH);

    // Vnitřní kruh (lesk)
    const inner = this._createElement('circle');
    inner.setAttribute('cx', -2);
    inner.setAttribute('cy', -2);
    inner.setAttribute('r', COIN.INNER_RADIUS);
    inner.setAttribute('fill', COIN.INNER_COLOR);
    inner.setAttribute('opacity', '0.6');

    // Symbol $ (volitelný dekorativní prvek)
    const symbol = this._createElement('text');
    symbol.setAttribute('x', 0);
    symbol.setAttribute('y', 4);
    symbol.setAttribute('text-anchor', 'middle');
    symbol.setAttribute('font-size', '10');
    symbol.setAttribute('font-weight', 'bold');
    symbol.setAttribute('fill', '#996600');
    symbol.textContent = '$';

    g.appendChild(outer);
    g.appendChild(inner);
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
   * Aktualizuje pozici mince (pohyb dolů s rychlostí silnice).
   * @param {number} dt        - Delta time (s).
   * @param {number} roadSpeed - Aktuální rychlost silnice (px/s).
   */
  update(dt, roadSpeed) {
    this._cy += roadSpeed * dt;
    this._applyTransform();

    if (this._cy - COIN.RADIUS > CANVAS.HEIGHT + 10) {
      this.active = false;
    }
  }

  /**
   * Označí minci jako sebranou a odstraní ji ze scény.
   */
  collect() {
    this.collected = true;
    this.active = false;
    this.remove();
  }

  /**
   * Vrátí střed mince pro kruhovou kolizní detekci.
   * @returns {{ cx: number, cy: number, r: number }}
   */
  getHitCircle() {
    return {
      cx: this._cx,
      cy: this._cy,
      r: COIN.RADIUS,
    };
  }

  /**
   * Odstraní SVG skupinu z dokumentu.
   */
  remove() {
    if (this._group && this._group.parentNode) {
      this._group.parentNode.removeChild(this._group);
    }
  }
}
