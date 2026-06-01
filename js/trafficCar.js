'use strict';

/**
 * @file trafficCar.js
 * Jedno dopravní vozidlo — SVG grafika, pohyb dolů po obrazovce, hitbox.
 *
 * Každé auto je kresleno relativně k vlastnímu středu [0,0].
 * Pohyb je řízen pozicí středu Y (cy), která se aktualizuje každý frame.
 *
 * Přejezd pruhu:
 *   Fáze SIGNAL  (0.5 s) — bliká zadní světlo ve směru přejezdu.
 *   Fáze MOVING  (0.4 s) — plynule interpoluje _cx ze starého na nový pruh.
 *   Po dokončení je laneIndex a _cx aktualizovány.
 */

/** @enum {string} */
const LaneChangeState = Object.freeze({
  IDLE: 'idle',
  SIGNAL: 'signal',
  MOVING: 'moving',
});

class TrafficCar {
  /**
   * @param {SVGElement} svg        - Kořenový SVG element.
   * @param {string}     type       - Typ vozidla (VehicleType).
   * @param {number}     laneIndex  - Index pruhu (0–5).
   * @param {number}     startY     - Počáteční Y střed vozidla (mimo obrazovku nahoře).
   * @param {number}     roadSpeed  - Aktuální rychlost silnice px/s (při spawnu).
   */
  constructor(svg, type, laneIndex, startY, roadSpeed) {
    /** @private */
    this._svg = svg;

    /** @type {string} */
    this.type = type;

    /** @private */
    this._def = VEHICLE_DEFS[type];

    /** Index pruhu (0–5), veřejný pro spawn logiku. */
    this.laneIndex = laneIndex;

    /** @private — X střed (interpoluje se při přejezdu) */
    this._cx = LANE_CENTERS[laneIndex];

    /** @private — Y střed (pohybuje se dolů) */
    this._cy = startY;

    /** @private — absolutní strop rychlosti pro tento typ vozidla (px/s) */
    this._ownMaxSpeed = this._def.maxSpeedKmh / PHYSICS.PX_PER_S_TO_KMH;

    /** @private — vlastní rychlost pohybu dolů v px/s */
    this._speed = this._calcSpeed(roadSpeed);

    /** @private — cílová rychlost; vždy směřuje k _ownMaxSpeed pokud není blokováno */
    this._targetSpeed = this._ownMaxSpeed;

    /** @private — jak dlouho je auto blokováno pomalejším vozidlem (s) */
    this._blockedTimer = 0;

    /** @private — boční rychlost z kolizních impulzů (px/s), tlumí se */
    this._vx = 0;

    /** @private — SVG skupina */
    this._group = null;

    /** @private — SVG element zadního levého světla */
    this._rearLightLeft = null;
    /** @private — SVG element zadního pravého světla */
    this._rearLightRight = null;

    /** Příznak, zda je vozidlo aktivní (false = má být odstraněno). */
    this.active = true;

    // ─── Lane-change stav ───────────────────────────────────────────────────

    /** @private */
    this._lcState = LaneChangeState.IDLE;
    /** @private — cílový index pruhu */
    this._lcTargetLane = -1;
    /** @private — směr přejezdu: -1 = vlevo, +1 = vpravo */
    this._lcDir = 0;
    /** @private — akumulovaný čas aktuální fáze */
    this._lcTimer = 0;
    /** @private — X střed na začátku pohybu */
    this._lcFromX = 0;
    /** @private — X střed cíle pohybu */
    this._lcToX = 0;

    /** @private — čas bliknutí blinkru (akumulátor) */
    this._blinkTimer = 0;
    /** @private — true = blinkr svítí */
    this._blinkOn = false;

    this._createElements();
  }

  // ─── Privátní — výpočty ─────────────────────────────────────────────────────

  /** @private */
  _calcSpeed(roadSpeed) {
    const { speedMin, speedMax, maxSpeedKmh } = this._def;
    const factor = speedMin + Math.random() * (speedMax - speedMin);
    const raw = roadSpeed * factor;
    const maxPx = maxSpeedKmh / PHYSICS.PX_PER_S_TO_KMH;
    return Math.min(raw, maxPx);
  }

  // ─── Privátní — SVG ─────────────────────────────────────────────────────────

  /** @private */
  _createElements() {
    const g = this._createElement('g');
    const def = this._def;
    const hw = def.width / 2;
    const hh = def.height / 2;
    const color = def.colors[Math.floor(Math.random() * def.colors.length)];
    const roofColor = this._darkenColor(color, 0.7);

    // Karoserie
    const body = this._createRect(-hw, -hh, def.width, def.height, color, 3);
    g.appendChild(body);

    // Střecha (závisí na typu)
    this._addRoof(g, hw, hh, roofColor);

    // Světla přední a zadní
    this._addLights(g, hw, hh);

    this._group = g;
    this._svg.appendChild(g);
    this._applyTransform();
  }

  /** @private */
  _addRoof(g, hw, hh, roofColor) {
    const def = this._def;

    switch (this.type) {
      case VehicleType.CAR: {
        const rw = def.width * 0.65;
        const rh = def.height * 0.38;
        g.appendChild(this._createRect(-rw / 2, -hh + def.height * 0.22, rw, rh, roofColor, 3));
        break;
      }
      case VehicleType.VAN: {
        const rw = def.width * 0.88;
        const rh = def.height * 0.55;
        g.appendChild(this._createRect(-rw / 2, -hh + def.height * 0.04, rw, rh, roofColor, 2));
        break;
      }
      case VehicleType.BUS: {
        const rw = def.width * 0.92;
        const rh = def.height * 0.82;
        g.appendChild(this._createRect(-rw / 2, -hh + def.height * 0.05, rw, rh, roofColor, 1));
        this._addBusWindows(g, hw, hh);
        break;
      }
      case VehicleType.TRUCK: {
        const cabH = def.height * 0.3;
        const cabW = def.width * 0.9;
        g.appendChild(this._createRect(-cabW / 2, -hh + 4, cabW, cabH, roofColor, 2));
        const cargoH = def.height * 0.55;
        const cargoColor = this._darkenColor(roofColor, 0.85);
        g.appendChild(
          this._createRect(-hw + 2, -hh + cabH + 8, def.width - 4, cargoH, cargoColor, 1),
        );
        break;
      }
      default:
        break;
    }
  }

  /** @private */
  _addBusWindows(g, hw, hh) {
    const winW = 8;
    const winH = 12;
    const winColor = '#a8d8f0';
    const rows = 3;
    const startY = -hh + 14;
    const gapY = 22;

    for (let row = 0; row < rows; row++) {
      g.appendChild(this._createRect(-hw + 5, startY + row * gapY, winW, winH, winColor, 1));
      g.appendChild(this._createRect(hw - winW - 5, startY + row * gapY, winW, winH, winColor, 1));
    }
  }

  /** @private */
  _addLights(g, hw, hh) {
    const lw = 7;
    const lh = 4;

    // Přední světla
    g.appendChild(this._createRect(-hw + 3, -hh + 3, lw, lh, '#ffffaa', 1));
    g.appendChild(this._createRect(hw - lw - 3, -hh + 3, lw, lh, '#ffffaa', 1));

    // Beam glow kružnice za zadními světly (zpočátku neviditelné)
    const glowY = hh - lh - 3 + lh / 2;
    const glowLx = -hw + 3 + lw / 2;
    const glowRx = hw - lw - 3 + lw / 2;

    this._beamLeft = this._createCircle(glowLx, glowY, 9, '#ffaa00', 0);
    this._beamRight = this._createCircle(glowRx, glowY, 9, '#ffaa00', 0);
    g.appendChild(this._beamLeft);
    g.appendChild(this._beamRight);

    // Zadní světla — uchováme reference pro blinkr (vykreslíme nad glow)
    this._rearLightLeft = this._createRect(-hw + 3, hh - lh - 3, lw, lh, '#ff4444', 1);
    this._rearLightRight = this._createRect(hw - lw - 3, hh - lh - 3, lw, lh, '#ff4444', 1);
    g.appendChild(this._rearLightLeft);
    g.appendChild(this._rearLightRight);
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

  /** @private */
  _createCircle(cx, cy, r, fill, opacity) {
    const c = this._createElement('circle');
    c.setAttribute('cx', cx);
    c.setAttribute('cy', cy);
    c.setAttribute('r', r);
    c.setAttribute('fill', fill);
    c.setAttribute('opacity', opacity);
    return c;
  }

  /** @private */
  _applyTransform() {
    this._group.setAttribute('transform', `translate(${this._cx}, ${this._cy})`);
  }

  /**
   * Aktualizuje blinkr — bliká světlem ve směru přejezdu + beam glow.
   * @private
   * @param {number} dt
   */
  _updateBlinker(dt) {
    const BLINK_INTERVAL = 0.22;
    this._blinkTimer += dt;
    if (this._blinkTimer >= BLINK_INTERVAL) {
      this._blinkTimer -= BLINK_INTERVAL;
      this._blinkOn = !this._blinkOn;
    }

    const blinkColor = this._blinkOn ? '#ffaa00' : '#ff4444';
    const beamOpacity = this._blinkOn ? '0.45' : '0';
    const steadyColor = '#ff4444';

    if (this._lcDir < 0) {
      // Bliká levé zadní světlo + levý beam
      this._rearLightLeft.setAttribute('fill', blinkColor);
      this._beamLeft.setAttribute('opacity', beamOpacity);
      this._rearLightRight.setAttribute('fill', steadyColor);
      this._beamRight.setAttribute('opacity', '0');
    } else {
      // Bliká pravé zadní světlo + pravý beam
      this._rearLightLeft.setAttribute('fill', steadyColor);
      this._beamLeft.setAttribute('opacity', '0');
      this._rearLightRight.setAttribute('fill', blinkColor);
      this._beamRight.setAttribute('opacity', beamOpacity);
    }
  }

  /** @private */
  _resetBlinker() {
    this._blinkOn = false;
    this._blinkTimer = 0;
    this._rearLightLeft.setAttribute('fill', '#ff4444');
    this._rearLightRight.setAttribute('fill', '#ff4444');
    this._beamLeft.setAttribute('opacity', '0');
    this._beamRight.setAttribute('opacity', '0');
  }

  /**
   * Cubic ease-in-out.
   * @private
   */
  _easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  /** @private */
  _darkenColor(hex, factor) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const d = (v) =>
      Math.max(0, Math.round(v * factor))
        .toString(16)
        .padStart(2, '0');
    return `#${d(r)}${d(g)}${d(b)}`;
  }

  // ─── Veřejné metody ─────────────────────────────────────────────────────────

  /**
   * Aktualizuje pozici vozidla každý frame.
   * @param {number} dt
   * @param {number} roadSpeed
   */
  update(dt, roadSpeed) {
    // Plynulé přibližování k cílové rychlosti
    const ACCEL = 30; // px/s² — pomalé přirozené zrychlení
    const DECEL = 80; // px/s² — rychlejší brzdění
    if (this._speed < this._targetSpeed) {
      this._speed = Math.min(this._targetSpeed, this._speed + ACCEL * dt);
    } else if (this._speed > this._targetSpeed) {
      this._speed = Math.max(this._targetSpeed, this._speed - DECEL * dt);
    }

    const relativeSpeed = roadSpeed - this._speed;
    this._cy += relativeSpeed * dt;

    // Lane-change stavový automat
    if (this._lcState === LaneChangeState.SIGNAL) {
      this._updateBlinker(dt);
      this._lcTimer += dt;
      if (this._lcTimer >= 1.0) {
        this._lcState = LaneChangeState.MOVING;
        this._lcTimer = 0;
        this._lcFromX = this._cx;
        this._lcToX = LANE_CENTERS[this._lcTargetLane];
      }
    } else if (this._lcState === LaneChangeState.MOVING) {
      this._updateBlinker(dt);
      this._lcTimer += dt;
      const MOVE_DURATION = 0.4;
      const t = Math.min(this._lcTimer / MOVE_DURATION, 1);
      this._cx = this._lcFromX + (this._lcToX - this._lcFromX) * this._easeInOut(t);

      if (t >= 1) {
        this._cx = this._lcToX;
        this.laneIndex = this._lcTargetLane;
        this._lcState = LaneChangeState.IDLE;
        this._lcTimer = 0;
        this._resetBlinker();
      }
    }

    // Boční impuls z kolizí + plynulý návrat do středu pruhu
    this._cx += this._vx * dt;
    this._vx *= Math.exp(-6 * dt);
    if (this._lcState === LaneChangeState.IDLE) {
      const targetCx = LANE_CENTERS[this.laneIndex];
      this._cx += (targetCx - this._cx) * Math.min(1, 2.5 * dt);
    }

    this._applyTransform();

    if (this._cy - this._def.height / 2 > CANVAS.HEIGHT + 20) {
      this.active = false;
    }
  }

  /**
   * Zahájí přejezd do sousedního pruhu.
   * Ignorováno pokud přejezd již probíhá.
   * @param {number} targetLane
   */
  startLaneChange(targetLane) {
    if (this._lcState !== LaneChangeState.IDLE) return;
    this._lcTargetLane = targetLane;
    this._lcDir = targetLane > this.laneIndex ? 1 : -1;
    this._lcState = LaneChangeState.SIGNAL;
    this._lcTimer = 0;
    this._blinkTimer = 0;
    this._blinkOn = true;
  }

  /** @returns {boolean} true pokud auto právě přejíždí pruh */
  get isChangingLane() {
    return this._lcState !== LaneChangeState.IDLE;
  }

  /**
   * Vrátí AABB hitbox ve světových souřadnicích.
   * @returns {{ x: number, y: number, width: number, height: number }}
   */
  getHitbox() {
    const hw = this._def.width / 2;
    const hh = this._def.height / 2;
    return {
      x: this._cx - hw,
      y: this._cy - hh,
      width: this._def.width,
      height: this._def.height,
    };
  }

  /** @returns {number} */
  get cy() {
    return this._cy;
  }

  /** @returns {number} */
  get cx() {
    return this._cx;
  }

  /** @returns {number} */
  get speed() {
    return this._speed;
  }

  /** @returns {number} */
  get height() {
    return this._def.height;
  }

  /** @returns {number} hmotnost úměrná ploše (pro kolizní impulzy) */
  get mass() {
    return this._def.width * this._def.height;
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
   * Omezí aktuální i cílovou rychlost shora (separace — nájezd na pomalejší auto).
   * @param {number} maxSpeed
   */
  capSpeed(maxSpeed) {
    if (this._speed > maxSpeed) this._speed = maxSpeed;
    if (this._targetSpeed > maxSpeed) this._targetSpeed = maxSpeed;
  }

  /**
   * Nastaví cílovou rychlost na rychlost předního vozidla (plynulé zpomalení).
   * @param {number} leaderSpeed
   * @param {number} dt
   */
  matchSpeed(leaderSpeed, dt = 0) {
    this._targetSpeed = leaderSpeed;
    if (this.type === VehicleType.CAR) {
      this._blockedTimer += dt;
    }
  }

  /**
   * Obnoví cílovou rychlost zpět na vlastní max (po uvolnění překážky).
   */
  resumeSpeed() {
    this._targetSpeed = this._ownMaxSpeed;
    this._blockedTimer = 0;
  }

  /** Vrátí jak dlouho je auto blokováno (s). Relevantní jen pro CAR. */
  get blockedTimer() {
    return this._blockedTimer;
  }

  /** Resetuje čítač blokování (po zahájení přejezdu). */
  resetBlockedTimer() {
    this._blockedTimer = 0;
  }

  /** Odstraní SVG skupinu z dokumentu. */
  remove() {
    if (this._group && this._group.parentNode) {
      this._group.parentNode.removeChild(this._group);
    }
  }
}
