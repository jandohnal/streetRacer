'use strict';

/**
 * @file road.js
 * Vykresluje a animuje silnici — podklad, krajnice a přerušované čáry pruhů.
 *
 * Animace čar: každý frame se offsetY zvyšuje o (speed × dt).
 * Jakmile offset překročí délku cyklu (dash + gap), resetuje se modulo cyklem,
 * čímž vzniká iluze nekonečné plynulé jízdy.
 */

class Road {
  /**
   * @param {SVGElement} svg - Kořenový SVG element hry.
   */
  constructor(svg) {
    /** @private */
    this._svg = svg;

    /**
     * Akumulovaný posun čar pruhů v pixelech (0 … LANE_ANIM.CYCLE).
     * @private
     */
    this._lineOffsetY = 0;

    /** @private — SVG skupina obsahující přerušované čáry pruhů */
    this._laneLineGroup = null;

    /** @private — pole SVG <line> elementů pro každou čáru pruhu */
    this._laneLines = [];

    this._createElements();
  }

  // ─── Privátní metody ────────────────────────────────────────────────────────

  /**
   * Jednorázově vytvoří všechny SVG elementy silnice a vloží je do SVG.
   * Elementy se vykreslují pod ostatními herními objekty (insertBefore first child).
   * @private
   */
  _createElements() {
    const svg = this._svg;

    // Podklad celé herní plochy
    const surface = this._createRect(0, 0, CANVAS.WIDTH, CANVAS.HEIGHT, ROAD.SURFACE_COLOR);

    // Krajnice vlevo
    const shoulderLeft = this._createRect(
      0,
      0,
      ROAD.SHOULDER_WIDTH,
      CANVAS.HEIGHT,
      ROAD.SHOULDER_COLOR,
    );

    // Krajnice vpravo
    const shoulderRight = this._createRect(
      CANVAS.WIDTH - ROAD.SHOULDER_WIDTH,
      0,
      ROAD.SHOULDER_WIDTH,
      CANVAS.HEIGHT,
      ROAD.SHOULDER_COLOR,
    );

    // Žlutá krajnicová čára vlevo
    const borderLeft = this._createLine(
      ROAD.SHOULDER_WIDTH,
      0,
      ROAD.SHOULDER_WIDTH,
      CANVAS.HEIGHT,
      ROAD.SHOULDER_LINE_COLOR,
      ROAD.SHOULDER_LINE_WIDTH,
    );

    // Žlutá krajnicová čára vpravo
    const borderRight = this._createLine(
      CANVAS.WIDTH - ROAD.SHOULDER_WIDTH,
      0,
      CANVAS.WIDTH - ROAD.SHOULDER_WIDTH,
      CANVAS.HEIGHT,
      ROAD.SHOULDER_LINE_COLOR,
      ROAD.SHOULDER_LINE_WIDTH,
    );

    // Skupina přerušovaných čar pruhů (animuje se translateY)
    this._laneLineGroup = this._createElement('g');

    // Vytvoříme (LANE_COUNT - 1) svislých přerušovaných čar
    // Každá čára musí sahat od (-CYCLE) do (HEIGHT + CYCLE), aby při posuvu nebyl vidět konec.
    const lineCount = ROAD.LANE_COUNT - 1;
    const totalHeight = CANVAS.HEIGHT + LANE_ANIM.CYCLE * 2;
    const startY = -LANE_ANIM.CYCLE;

    for (let i = 0; i < lineCount; i++) {
      const x = ROAD.SHOULDER_WIDTH + (i + 1) * LANE_WIDTH;
      const line = this._createLine(
        x,
        startY,
        x,
        startY + totalHeight,
        ROAD.LANE_LINE_COLOR,
        ROAD.LANE_LINE_WIDTH,
      );
      line.setAttribute('stroke-dasharray', `${ROAD.LANE_LINE_DASH} ${ROAD.LANE_LINE_GAP}`);
      this._laneLineGroup.appendChild(line);
      this._laneLines.push(line);
    }

    // Vložíme vrstvy ve správném pořadí (spodní → vrchní)
    svg.appendChild(surface);
    svg.appendChild(shoulderLeft);
    svg.appendChild(shoulderRight);
    svg.appendChild(borderLeft);
    svg.appendChild(borderRight);
    svg.appendChild(this._laneLineGroup);
  }

  /**
   * @private
   * @param {number} x
   * @param {number} y
   * @param {number} width
   * @param {number} height
   * @param {string} fill
   * @returns {SVGRectElement}
   */
  _createRect(x, y, width, height, fill) {
    const rect = this._createElement('rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', width);
    rect.setAttribute('height', height);
    rect.setAttribute('fill', fill);
    return rect;
  }

  /**
   * @private
   * @param {number} x1
   * @param {number} y1
   * @param {number} x2
   * @param {number} y2
   * @param {string} stroke
   * @param {number} strokeWidth
   * @returns {SVGLineElement}
   */
  _createLine(x1, y1, x2, y2, stroke, strokeWidth) {
    const line = this._createElement('line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('stroke', stroke);
    line.setAttribute('stroke-width', strokeWidth);
    return line;
  }

  /**
   * @private
   * @param {string} tag
   * @returns {SVGElement}
   */
  _createElement(tag) {
    return document.createElementNS('http://www.w3.org/2000/svg', tag);
  }

  // ─── Veřejné metody ─────────────────────────────────────────────────────────

  /**
   * Aktualizuje animaci silničních čar.
   * Volá se každý frame z herní smyčky.
   *
   * @param {number} dt    - Delta time v sekundách.
   * @param {number} speed - Aktuální rychlost posunu silnice (px/s).
   */
  update(dt, speed) {
    this._lineOffsetY = (this._lineOffsetY + speed * dt) % LANE_ANIM.CYCLE;
    this._laneLineGroup.setAttribute('transform', `translate(0, ${this._lineOffsetY})`);
  }

  /**
   * Resetuje animaci (použití při restartu hry).
   */
  reset() {
    this._lineOffsetY = 0;
    this._laneLineGroup.setAttribute('transform', 'translate(0, 0)');
  }
}
