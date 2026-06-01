'use strict';

/**
 * @file policeCar.js
 * Policejní auto — SVG grafika bílo-modrého vozu + pulzující radar kruh.
 *
 * Vizuál:
 *  - Karoserie rozdělena na bílou přední a modrou zadní polovinu (top-view).
 *  - Modrý světelný rám (lightbar) na střeše.
 *  - Radar: poloprůhledný světle modrý kruh s průměrem 2 × LANE_WIDTH,
 *    pulzuje v poloměru ±PULSE_AMPLITUDE při frekvenci PULSE_FREQUENCY.
 *
 * Chování:
 *  - Pohybuje se dolů rychlostí (roadSpeed × speedFactor) — stejný model jako TrafficCar.
 *  - Deaktivuje se po opuštění spodního okraje plátna.
 */

class PoliceCar {
  /**
   * @param {SVGElement} svg        - Kořenový SVG element.
   * @param {number}     laneIndex  - Index pruhu (0–5).
   * @param {number}     startY     - Počáteční Y střed (nad plátnem).
   * @param {number}     roadSpeed  - Aktuální rychlost silnice při spawnu (px/s).
   */
  constructor(svg, laneIndex, startY, roadSpeed) {
    /** @private */
    this._svg = svg;

    /** Index pruhu — veřejný pro spawn logiku */
    this.laneIndex = laneIndex;

    /** @private */
    this._cx = LANE_CENTERS[laneIndex];

    /** @private */
    this._cy = startY;

    /** @private — vlastní rychlost pohybu (px/s) */
    this._speed = this._calcSpeed(roadSpeed);

    /** @private — výchozí rychlost (strop pro obnovu po zpomalení kolizí) */
    this._baseSpeed = this._speed;

    /** @private — akumulovaný čas pro pulzaci (s) */
    this._pulseTime = 0;

    /** @private — boční rychlost z kolizních impulzů (px/s), tlumí se */
    this._vx = 0;

    /** @private — SVG skupina */
    this._group = null;

    /** @private — SVG element radaru (kruh) */
    this._radarCircle = null;

    /** Příznak aktivity */
    this.active = true;

    this._createElements();
  }

  // ─── Privátní — výpočty ─────────────────────────────────────────────────────

  /**
   * @private
   * @param {number} roadSpeed
   * @returns {number}
   */
  _calcSpeed(roadSpeed) {
    const { SPEED_FACTOR_MIN, SPEED_FACTOR_MAX } = POLICE;
    const factor = SPEED_FACTOR_MIN + Math.random() * (SPEED_FACTOR_MAX - SPEED_FACTOR_MIN);
    return roadSpeed * factor;
  }

  /**
   * Základní poloměr radaru = 2 × LANE_WIDTH (průměr = 4 pruhy).
   * @private
   * @returns {number}
   */
  _baseRadarRadius() {
    return LANE_WIDTH * 2;
  }

  // ─── Privátní — SVG ─────────────────────────────────────────────────────────

  /**
   * Vytvoří celou SVG skupinu policejního auta včetně radaru.
   * Radar se vykresluje PŘED karoserií (je za autem ve z-pořadí skupiny).
   * @private
   */
  _createElements() {
    const g = this._createElement('g');

    // ── Radar kruh (níže = vykreslí se pod karoserií) ─────────────────────
    const radar = this._createElement('circle');
    radar.setAttribute('cx', 0);
    radar.setAttribute('cy', 0);
    radar.setAttribute('r', this._baseRadarRadius());
    radar.setAttribute('fill', POLICE.RADAR_COLOR);
    radar.setAttribute('fill-opacity', POLICE.RADAR_OPACITY);
    radar.setAttribute('stroke', POLICE.RADAR_STROKE);
    radar.setAttribute('stroke-width', POLICE.RADAR_STROKE_WIDTH);
    this._radarCircle = radar;
    g.appendChild(radar);

    // ── Karoserie ─────────────────────────────────────────────────────────
    const hw = POLICE.WIDTH / 2;
    const hh = POLICE.HEIGHT / 2;

    // Zadní polovina — modrá (dolní z pohledu kamery = blíže hráči)
    const bodyRear = this._createRect(-hw, 0, POLICE.WIDTH, hh, POLICE.COLOR_BODY_BLUE, 3);
    // Přední polovina — bílá
    const bodyFront = this._createRect(-hw, -hh, POLICE.WIDTH, hh, POLICE.COLOR_BODY_WHITE, 3);

    // Lightbar — modrý pruh přes střechu (horizontálně)
    const barW = POLICE.WIDTH * 0.8;
    const barH = POLICE.HEIGHT * 0.12;
    const bar = this._createRect(-barW / 2, -barH / 2, barW, barH, POLICE.COLOR_LIGHT_BAR, 2);

    // Malá světla na lightbaru (2× červená, 2× modrá)
    const dotR = 3;
    const dotY = 0;
    this._addLightDot(g, -barW / 2 + 6, dotY, dotR, '#ff1a1a'); // červená L
    this._addLightDot(g, -barW / 2 + 14, dotY, dotR, '#1a8cff'); // modrá  L
    this._addLightDot(g, barW / 2 - 14, dotY, dotR, '#1a8cff'); // modrá  R
    this._addLightDot(g, barW / 2 - 6, dotY, dotR, '#ff1a1a'); // červená R

    // Přední světla
    const lightW = 7;
    const lightH = 3;
    const frontY = -hh + 4;
    g.appendChild(this._createRect(-hw + 3, frontY, lightW, lightH, '#ffffaa', 1));
    g.appendChild(this._createRect(hw - lightW - 3, frontY, lightW, lightH, '#ffffaa', 1));

    // Zadní světla
    const rearY = hh - lightH - 4;
    g.appendChild(this._createRect(-hw + 3, rearY, lightW, lightH, '#ff4444', 1));
    g.appendChild(this._createRect(hw - lightW - 3, rearY, lightW, lightH, '#ff4444', 1));

    // Nápis "POLICE" — malý text na kapotě
    const label = this._createElement('text');
    label.setAttribute('x', 0);
    label.setAttribute('y', -hh * 0.35);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', '7');
    label.setAttribute('font-weight', 'bold');
    label.setAttribute('font-family', 'Arial, sans-serif');
    label.setAttribute('fill', '#1a4fa0');
    label.setAttribute('letter-spacing', '0.5');
    label.textContent = 'POLICE';

    g.appendChild(bodyRear);
    g.appendChild(bodyFront);
    g.appendChild(bar);
    g.appendChild(label);

    this._group = g;
    this._svg.appendChild(g);
    this._applyTransform();
  }

  /** @private */
  _createElement(tag) {
    return document.createElementNS('http://www.w3.org/2000/svg', tag);
  }

  /** @private */
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
   * Přidá malý kruhový světelný bod na lightbar.
   * @private
   */
  _addLightDot(parent, cx, cy, r, fill) {
    const dot = this._createElement('circle');
    dot.setAttribute('cx', cx);
    dot.setAttribute('cy', cy);
    dot.setAttribute('r', r);
    dot.setAttribute('fill', fill);
    parent.appendChild(dot);
  }

  /** @private */
  _applyTransform() {
    this._group.setAttribute('transform', `translate(${this._cx}, ${this._cy})`);
  }

  // ─── Veřejné metody ─────────────────────────────────────────────────────────

  /**
   * Aktualizuje pozici a pulzaci radaru každý frame.
   * @param {number} dt        - Delta time (s).
   * @param {number} roadSpeed - Aktuální rychlost silnice (px/s).
   */
  update(dt, roadSpeed) {
    // Obnova rychlosti zpět k výchozí (po zpomalení kvůli kolizi)
    if (this._speed < this._baseSpeed) {
      this._speed = Math.min(this._baseSpeed, this._speed + 60 * dt);
    }

    // Pohyb dolů
    const relativeSpeed = roadSpeed - this._speed;
    this._cy += relativeSpeed * dt;

    // Boční impuls z kolizí + plynulý návrat do středu pruhu
    this._cx += this._vx * dt;
    this._vx *= Math.exp(-6 * dt);
    const laneCx = LANE_CENTERS[this.laneIndex];
    this._cx += (laneCx - this._cx) * Math.min(1, 2.5 * dt);

    this._applyTransform();

    // Pulzace radaru
    this._pulseTime += dt;
    const pulse = Math.sin(this._pulseTime * POLICE.PULSE_FREQUENCY * 2 * Math.PI);
    const r = this._baseRadarRadius() + pulse * POLICE.PULSE_AMPLITUDE;
    this._radarCircle.setAttribute('r', r.toFixed(1));

    // Deaktivace po opuštění plátna
    if (this._cy - POLICE.HEIGHT / 2 > CANVAS.HEIGHT + 20) {
      this.active = false;
    }
  }

  /**
   * Vrátí střed a poloměr radaru pro kolizní detekci.
   * @returns {{ cx: number, cy: number, r: number }}
   */
  getRadarCircle() {
    const pulse = Math.sin(this._pulseTime * POLICE.PULSE_FREQUENCY * 2 * Math.PI);
    return {
      cx: this._cx,
      cy: this._cy,
      r: this._baseRadarRadius() + pulse * POLICE.PULSE_AMPLITUDE,
    };
  }

  /**
   * Vrátí AABB hitbox karoserie (pro vizuální kolizi — crash).
   * @returns {{ x: number, y: number, width: number, height: number }}
   */
  getHitbox() {
    const hw = POLICE.WIDTH / 2;
    const hh = POLICE.HEIGHT / 2;
    return {
      x: this._cx - hw,
      y: this._cy - hh,
      width: POLICE.WIDTH,
      height: POLICE.HEIGHT,
    };
  }

  /** Aktuální Y střed (pro spawn kontrolu). */
  get cy() {
    return this._cy;
  }

  /** Aktuální X střed. */
  get cx() {
    return this._cx;
  }

  /** Aktuální rychlost (px/s). */
  get speed() {
    return this._speed;
  }

  /** Výška karoserie (pro spawn kontrolu). */
  get height() {
    return POLICE.HEIGHT;
  }

  /** @returns {number} hmotnost úměrná ploše (pro kolizní impulzy) */
  get mass() {
    return POLICE.WIDTH * POLICE.HEIGHT;
  }

  /**
   * Přímo nastaví aktuální rychlost (kolizní přenos hybnosti).
   * @param {number} v
   */
  setSpeed(v) {
    this._speed = Math.max(0, v);
  }

  /**
   * Přidá boční rychlost (kolizní odraz do strany).
   * @param {number} dvx
   */
  applyLateralImpulse(dvx) {
    this._vx += dvx;
  }

  /**
   * Posune vozidlo o daný offset (separace kolizí).
   * @param {number} dx
   * @param {number} dy
   */
  separate(dx, dy) {
    this._cx += dx;
    this._cy += dy;
    this._applyTransform();
  }

  /**
   * Omezí aktuální rychlost shora (separace — nájezd na pomalejší vozidlo).
   * @param {number} maxSpeed
   */
  capSpeed(maxSpeed) {
    if (this._speed > maxSpeed) this._speed = maxSpeed;
  }

  /** Odstraní SVG skupinu z dokumentu. */
  remove() {
    if (this._group && this._group.parentNode) {
      this._group.parentNode.removeChild(this._group);
    }
  }
}
