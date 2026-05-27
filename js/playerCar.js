'use strict';

/**
 * @file playerCar.js
 * Hráčovo vozidlo — PNG sprite v SVG <image>, plynulý animovaný pohyb mezi pruhy.
 *
 * Sprite je centrován na [0, 0] skupiny a škálován na PLAYER.WIDTH × PLAYER.HEIGHT.
 * Pokud sprite (HTMLImageElement) není předán, použije se fallback SVG karoserie.
 *
 * Vstup (L/R) je čten z InputManageru s detekcí nástupné hrany —
 * jedno stisknutí = jeden pruh, opakování při držení nenastane.
 *
 * Animace přejezdu pruhu:
 *  - Horizontální X interpolováno kubickou ease-in-out křivkou.
 *  - Karoserie se natáčí (rotate) dle okamžité rychlosti pohybu X.
 *  - Stiskem dalšího pruhu během animace se cíl plynule přepíše.
 *
 * Volá se: update(dt) každý frame z herní smyčky.
 */

class PlayerCar {
  /**
   * @param {SVGElement}        svg          - Kořenový SVG element hry.
   * @param {InputManager}      inputManager - Sdílený správce vstupu.
   * @param {HTMLImageElement}  [spriteImg]  - Předem načtený PNG sprite (volitelný).
   */
  constructor(svg, inputManager, spriteImg = null) {
    /** @private */
    this._svg = svg;

    /** @private */
    this._input = inputManager;

    /** @private — cílový index pruhu */
    this._laneIndex = PLAYER.START_LANE;

    /** @private — aktuální interpolovaná X pozice středu auta */
    this._currentX = LANE_CENTERS[PLAYER.START_LANE];

    /** @private — zdrojová X na začátku přejezdu */
    this._sourceX = LANE_CENTERS[PLAYER.START_LANE];

    /** @private — cílová X přejezdu */
    this._targetX = LANE_CENTERS[PLAYER.START_LANE];

    /** @private — normalizovaný čas animace [0, 1]; 1 = dokončeno */
    this._animProgress = 1;

    /** @private — aktuální náklon karoserie ve stupních */
    this._tiltDeg = 0;

    /** @private — SVG skupina */
    this._group = null;

    /** @private — předem načtený PNG sprite (nebo null) */
    this._spriteImg = spriteImg;

    /** @private — offscreen canvas pro alfa-pixel kolize */
    this._offscreenCanvas = null;
    this._offscreenCtx    = null;

    /** @private — příznak zablokovaného vstupu (po kolizi) */
    this._inputLocked = false;

    /**
     * Stav L/R v předchozím framu — pro detekci nástupné hrany (edge trigger).
     * @private
     */
    this._prevLeft  = false;
    this._prevRight = false;

    this._createElements();
  }

  // ─── Privátní — SVG ─────────────────────────────────────────────────────────

  /**
   * Vytvoří SVG skupinu s grafickým prvkem auta.
   * Pokud je k dispozici PNG sprite, použije <image> element.
   * Jinak nakreslí záložní SVG karoserii.
   * Všechny prvky jsou relativní ke středu skupiny [0, 0].
   * @private
   */
  _createElements() {
    const g = this._createElement('g');
    g.setAttribute('role', 'img');
    g.setAttribute('aria-label', 'Hráčovo auto');

    const hw = PLAYER.WIDTH  / 2;
    const hh = PLAYER.HEIGHT / 2;

    if (this._spriteImg) {
      // ── PNG sprite ─────────────────────────────────────────────────────────
      // Sprite je 1024×1024 s autem uprostřed — renderujeme větší plochu
      // aby auto vizuálně odpovídalo ostatním vozidlům.
      // Hitbox zůstává PLAYER.WIDTH × PLAYER.HEIGHT (nezměněn).
      const SPRITE_SCALE = 1.75;
      const sw = PLAYER.WIDTH  * SPRITE_SCALE;
      const sh = PLAYER.HEIGHT * SPRITE_SCALE;
      const img = this._createElement('image');
      img.setAttribute('x',      -sw / 2);
      img.setAttribute('y',      -sh / 2);
      img.setAttribute('width',  sw);
      img.setAttribute('height', sh);
      img.setAttribute('href',   this._spriteImg.src);
      img.setAttribute('image-rendering', 'auto');
      g.appendChild(img);

      // Připraví offscreen canvas pro alfa-pixel kolize
      this._initOffscreenCanvas();
    } else {
      // ── Fallback: SVG karoserie ────────────────────────────────────────────
      const body = this._createRect(
        -hw, -hh, PLAYER.WIDTH, PLAYER.HEIGHT,
        PLAYER.COLOR_BODY, 4
      );
      const roofW = PLAYER.WIDTH  * 0.60;
      const roofH = PLAYER.HEIGHT * 0.40;
      const roof  = this._createRect(
        -roofW / 2, -roofH / 2 - hh * 0.10,
        roofW, roofH,
        PLAYER.COLOR_ROOF, 3
      );
      const lightW = 8, lightH = 4;
      const frontY = -hh + 5;
      const rearY  =  hh - lightH - 5;
      g.appendChild(body);
      g.appendChild(roof);
      g.appendChild(this._createRect(-hw + 4,           frontY, lightW, lightH, PLAYER.COLOR_LIGHT_FRONT, 1));
      g.appendChild(this._createRect( hw - lightW - 4,  frontY, lightW, lightH, PLAYER.COLOR_LIGHT_FRONT, 1));
      g.appendChild(this._createRect(-hw + 4,           rearY,  lightW, lightH, PLAYER.COLOR_LIGHT_REAR,  1));
      g.appendChild(this._createRect( hw - lightW - 4,  rearY,  lightW, lightH, PLAYER.COLOR_LIGHT_REAR,  1));
    }

    this._group = g;
    this._svg.appendChild(g);
    this._applyTransform();
  }

  /**
   * Inicializuje offscreen canvas s vykresleným spritem.
   * Používá se pro pixel-perfect alfa detekci kolizí.
   * @private
   */
  _initOffscreenCanvas() {
    const w = this._spriteImg.naturalWidth  || PLAYER.WIDTH;
    const h = this._spriteImg.naturalHeight || PLAYER.HEIGHT;

    this._offscreenCanvas        = document.createElement('canvas');
    this._offscreenCanvas.width  = w;
    this._offscreenCanvas.height = h;
    this._offscreenCtx           = this._offscreenCanvas.getContext('2d');
    this._offscreenCtx.drawImage(this._spriteImg, 0, 0, w, h);
  }

  /** @private */
  _createElement(tag) {
    return document.createElementNS('http://www.w3.org/2000/svg', tag);
  }

  /**
   * @private
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {string} fill
   * @param {number} [rx=0]
   * @returns {SVGRectElement}
   */
  _createRect(x, y, w, h, fill, rx = 0) {
    const rect = this._createElement('rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', w);
    rect.setAttribute('height', h);
    rect.setAttribute('fill', fill);
    if (rx > 0) rect.setAttribute('rx', rx);
    return rect;
  }

  /**
   * Aplikuje translate + rotate transform na SVG skupinu.
   * Rotace je kolem středu auta (origin skupiny je [0,0]).
   * @private
   */
  _applyTransform() {
    this._group.setAttribute(
      'transform',
      `translate(${this._currentX}, ${PLAYER.Y_CENTER}) rotate(${this._tiltDeg.toFixed(2)})`
    );
  }

  // ─── Privátní — easing ───────────────────────────────────────────────────────

  /**
   * Symetrická ease-in-out křivka (power easing).
   * t ∈ [0,1] → [0,1]
   * @private
   * @param {number} t
   * @returns {number}
   */
  _easeInOut(t) {
    const p = PLAYER_ANIM.EASE_POWER;
    return t < 0.5
      ? 0.5 * Math.pow(2 * t, p)
      : 1   - 0.5 * Math.pow(2 - 2 * t, p);
  }

  /**
   * Numerická derivace ease-in-out (centrální diference) —
   * vyjadřuje okamžitou "rychlost" pohybu pro výpočet náklonu.
   * @private
   * @param {number} t
   * @returns {number}
   */
  _easeInOutDerivative(t) {
    const h  = 0.001;
    const t1 = Math.min(t + h, 1);
    const t0 = Math.max(t - h, 0);
    return (this._easeInOut(t1) - this._easeInOut(t0)) / (t1 - t0);
  }

  // ─── Privátní — pohyb ────────────────────────────────────────────────────────

  /**
   * Spustí přejezd o jeden pruh.
   * Pokud animace probíhá, aktuální X se stane novým zdrojem — bez trhnutí.
   * @private
   * @param {number} delta - −1 doleva, +1 doprava.
   */
  _moveLane(delta) {
    const next = this._laneIndex + delta;
    if (next < 0 || next >= ROAD.LANE_COUNT) return;

    this._laneIndex    = next;
    this._sourceX      = this._currentX;
    this._targetX      = LANE_CENTERS[next];
    this._animProgress = 0;
  }

  // ─── Veřejné metody ─────────────────────────────────────────────────────────

  /**
   * Aktualizuje vstup a animaci přejezdu každý frame.
   *
   * Vstup L/R: reaguje pouze na nástupnou hranu (false→true),
   * takže držení klávesy neopakuje přejezd.
   *
   * @param {number} dt - Delta time v sekundách.
   */
  update(dt) {
    // ── Vstup L/R (edge trigger) ────────────────────────────────────────────
    if (!this._inputLocked) {
      const leftNow  = this._input.isLeft();
      const rightNow = this._input.isRight();

      if (leftNow  && !this._prevLeft)  this._moveLane(-1);
      if (rightNow && !this._prevRight) this._moveLane(+1);

      this._prevLeft  = leftNow;
      this._prevRight = rightNow;
    }

    // ── Animace přejezdu ────────────────────────────────────────────────────
    const duration = PLAYER_ANIM.LANE_CHANGE_DURATION;

    if (this._animProgress < 1) {
      this._animProgress = Math.min(this._animProgress + dt / duration, 1);

      const eased     = this._easeInOut(this._animProgress);
      const totalDist = this._targetX - this._sourceX;

      this._currentX = this._sourceX + totalDist * eased;

      // Náklon úměrný okamžité rychlosti pohybu X
      const derivative  = this._easeInOutDerivative(this._animProgress);
      const normalizedV = (derivative * totalDist) / LANE_WIDTH;
      this._tiltDeg     = normalizedV * PLAYER_ANIM.MAX_TILT_DEG;

    } else {
      // Snap na přesný střed pruhu + srovnání
      this._currentX = LANE_CENTERS[this._laneIndex];
      this._tiltDeg  = 0;
    }

    this._applyTransform();
  }

  /**
   * Okamžitý přejezd doleva — API pro mobilní tlačítka.
   */
  moveLeft() {
    if (!this._inputLocked) this._moveLane(-1);
  }

  /**
   * Okamžitý přejezd doprava — API pro mobilní tlačítka.
   */
  moveRight() {
    if (!this._inputLocked) this._moveLane(1);
  }

  /**
   * Zamkne vstup (při game over).
   */
  lockInput() {
    this._inputLocked = true;
    this._prevLeft    = false;
    this._prevRight   = false;
  }

  /**
   * Odemkne vstup (při restartu).
   */
  unlockInput() {
    this._inputLocked = false;
  }

  /**
   * Resetuje auto do počátečního stavu.
   */
  reset() {
    this._laneIndex    = PLAYER.START_LANE;
    this._currentX     = LANE_CENTERS[PLAYER.START_LANE];
    this._sourceX      = this._currentX;
    this._targetX      = this._currentX;
    this._animProgress = 1;
    this._tiltDeg      = 0;
    this._inputLocked  = false;
    this._prevLeft     = false;
    this._prevRight    = false;
    this._applyTransform();
  }

  /**
   * Vrátí AABB hitbox ve světových souřadnicích.
   * Používá aktuální interpolovanou X (ne cílový pruh).
   * Rozměry zmenšeny o HITBOX_FACTOR pro fair-play.
   *
   * @returns {{ x: number, y: number, width: number, height: number }}
   */
  getHitbox() {
    const hw = (PLAYER.WIDTH  * PLAYER.HITBOX_FACTOR) / 2;
    const hh = (PLAYER.HEIGHT * PLAYER.HITBOX_FACTOR) / 2;
    return {
      x:      this._currentX - hw,
      y:      PLAYER.Y_CENTER - hh,
      width:  hw * 2,
      height: hh * 2,
    };
  }

  /**
   * Pixel-perfect alfa test: vrátí true, pokud bod (wx, wy) ve světových
   * souřadnicích leží na neprůhledném pixelu spritu (alfa > 0).
   * Pokud sprite není k dispozici, vždy vrátí true (fallback = AABB).
   *
   * @param {number} wx - Světová X souřadnice.
   * @param {number} wy - Světová Y souřadnice.
   * @returns {boolean}
   */
  isOpaqueAt(wx, wy) {
    if (!this._offscreenCtx) return true;

    const sprW = this._offscreenCanvas.width;
    const sprH = this._offscreenCanvas.height;

    // Převod ze světových souřadnic na souřadnice spritu
    const localX = wx - (this._currentX - PLAYER.WIDTH  / 2);
    const localY = wy - (PLAYER.Y_CENTER - PLAYER.HEIGHT / 2);

    const px = Math.round((localX / PLAYER.WIDTH)  * sprW);
    const py = Math.round((localY / PLAYER.HEIGHT) * sprH);

    if (px < 0 || py < 0 || px >= sprW || py >= sprH) return false;

    try {
      const data = this._offscreenCtx.getImageData(px, py, 1, 1).data;
      return data[3] > 10;   // alfa práh — ignorujeme téměř průhledné okraje
    } catch (_) {
      return true;           // bezpečný fallback při SecurityError (cross-origin)
    }
  }

  /** Vrátí SVG skupinu (pro z-order management). */
  get svgGroup() {
    return this._group;
  }
}
