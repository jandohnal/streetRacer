'use strict';

/**
 * @file finishLine.js
 * Cílová šachovnicová čára — zobrazí se na silnici těsně před dojetím 2000 m.
 *
 * Pozice cílové čáry v SVG souřadnicích:
 *   y = CANVAS.HEIGHT/2 − (GOAL_METERS × PX_PER_METER − _scrolledPx)
 *
 * Dokud hráč neurazí dostatek metrů, je y záporné (mimo obrazovku nahoře).
 * Jakmile y překročí −HEIGHT_PX, čára vstoupí do obrazovky a scrolluje dolů.
 */

class FinishLine {
  /**
   * @param {SVGElement} svg       - Kořenový SVG element hry.
   * @param {SVGElement} insertRef - Element, před který se vloží (zajistí správnou vrstvu).
   */
  constructor(svg, insertRef) {
    /** @private */
    this._svg = svg;

    /** @private — akumulovaný posun silnice v px (shodný s road.js) */
    this._scrolledPx = 0;

    /** @private — SVG skupina cílové čáry */
    this._group = this._createElement('g');
    this._group.setAttribute('visibility', 'hidden');

    this._buildCheckered();

    svg.insertBefore(this._group, insertRef);
  }

  // ─── Privátní ────────────────────────────────────────────────────────────────

  /**
   * Vytvoří šachovnicový vzor přes celou šířku vozovky.
   * 2 řady čtverců, střídavě bílá/černá.
   * @private
   */
  _buildCheckered() {
    const roadLeft = ROAD.SHOULDER_WIDTH;
    const roadWidth = CANVAS.WIDTH - ROAD.SHOULDER_WIDTH * 2;
    const squareW = Math.round(roadWidth / 9); // 9 sloupců
    const squareH = 10; // výška jednoho řádku px
    const totalH = squareH * 2;

    // Bílý podklad (pro okraje kde se čtverce přesně nevejdou)
    const bg = this._createRect(roadLeft, -totalH / 2, roadWidth, totalH, '#ffffff');
    this._group.appendChild(bg);

    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 9; col++) {
        const isBlack = (row + col) % 2 === 0;
        if (!isBlack) {
          continue; // bílé čtverce = podklad, přeskočíme
        }
        const rect = this._createRect(
          roadLeft + col * squareW,
          -totalH / 2 + row * squareH,
          squareW,
          squareH,
          '#000000',
        );
        this._group.appendChild(rect);
      }
    }

    // Tenká žlutá linka vlevo a vpravo (návaznost na krajnici)
    this._group.appendChild(
      this._createRect(roadLeft - 2, -totalH / 2, 2, totalH, ROAD.SHOULDER_LINE_COLOR),
    );
    this._group.appendChild(
      this._createRect(
        CANVAS.WIDTH - ROAD.SHOULDER_WIDTH,
        -totalH / 2,
        2,
        totalH,
        ROAD.SHOULDER_LINE_COLOR,
      ),
    );
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
   * @param {string} tag
   * @returns {SVGElement}
   */
  _createElement(tag) {
    return document.createElementNS('http://www.w3.org/2000/svg', tag);
  }

  // ─── Veřejné ────────────────────────────────────────────────────────────────

  /**
   * Aktualizuje pozici cílové čáry.
   * @param {number} dt    - Delta time (s).
   * @param {number} speed - Rychlost silnice (px/s).
   */
  update(dt, speed) {
    this._scrolledPx += speed * dt;

    const goalPx = RACE.GOAL_METERS * PHYSICS.PX_PER_METER;
    // Čára je na pozici hráče (PLAYER.Y_CENTER) přesně při dosažení cíle,
    // pak pokračuje dolů — hráč ji musí fyzicky projet.
    const y = PLAYER.Y_CENTER - (goalPx - this._scrolledPx);

    if (y < -20 || y > CANVAS.HEIGHT + 20) {
      this._group.setAttribute('visibility', 'hidden');
    } else {
      this._group.setAttribute('visibility', 'visible');
      this._group.setAttribute('transform', `translate(0, ${y})`);
    }
  }

  /**
   * Vrátí true pokud cílová čára již prošla za hráče (auto projelo cílem).
   * @returns {boolean}
   */
  hasPassed() {
    const goalPx = RACE.GOAL_METERS * PHYSICS.PX_PER_METER;
    const y = PLAYER.Y_CENTER - (goalPx - this._scrolledPx);
    // Čára prošla, jakmile je pod spodním okrajem auta hráče
    return y > PLAYER.Y_CENTER + PLAYER.HEIGHT / 2;
  }

  /**
   * Resetuje pozici cílové čáry (restart hry).
   */
  reset() {
    this._scrolledPx = 0;
    this._group.setAttribute('visibility', 'hidden');
    this._group.setAttribute('transform', 'translate(0, 0)');
  }
}
