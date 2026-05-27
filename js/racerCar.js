'use strict';

/**
 * @file racerCar.js
 * Závodní soupeř — auto které začne závodit s hráčem.
 *
 * Chování:
 *  - Spawne se dole na obrazovce (blízko hráče) v náhodném pruhu.
 *  - Čeká dokud hráč nejede nad 130 km/h, pak začne zrychlovat.
 *  - Cílová rychlost: 220–250 km/h (vlastní rychlost = absolutní px/s).
 *  - Plynule přejíždí pruhy, vyhýbá se pomalým autům vpředu.
 *  - Vizuál: výrazná barva, sportovní tvar, odlišný od běžného trafficu.
 *  - Deaktivuje se když ujede příliš daleko před hráče (>CANVAS.HEIGHT*1.5 nad).
 */

const RACER_COLORS = ['#ff3300', '#ff00cc', '#00ccff', '#aaff00', '#ff9900'];

class RacerCar {
  /**
   * @param {SVGElement} svg       - Kořenový SVG element.
   * @param {number}     laneIndex - Počáteční pruh (0–5).
   * @param {number}     startY    - Počáteční Y (blízko spodního okraje).
   */
  constructor(svg, laneIndex, startY) {
    /** @private */
    this._svg = svg;

    /** Aktuální index pruhu */
    this.laneIndex = laneIndex;

    /** @private */
    this._cx = LANE_CENTERS[laneIndex];
    /** @private */
    this._cy = startY;

    // Vizuální rozměry (stejné jako CAR)
    this._w = 38;
    this._h = 65;

    /** @private — vlastní absolutní rychlost (px/s) */
    this._speed = PHYSICS.SPEED_INITIAL * 0.5; // začíná pomalu

    /** @private — cílová vlastní rychlost (px/s) */
    this._targetSpeed = (220 + Math.random() * 30) / PHYSICS.PX_PER_S_TO_KMH;

    /** @private — zda již začal závodit */
    this._racing = false;

    /** @private — cooldown pro přejezd pruhu (s) */
    this._laneChangeCooldown = 0;

    // Lane-change animace
    this._lcActive = false;
    this._lcFromX  = 0;
    this._lcToX    = 0;
    this._lcTimer  = 0;
    this._lcTarget = laneIndex;

    /** Aktivní příznak */
    this.active = true;

    /** @private */
    this._group      = null;
    this._blinkerL   = null;
    this._blinkerR   = null;
    this._blinkTimer = 0;
    this._blinkOn    = false;
    this._blinkDir   = 0;

    this._color = RACER_COLORS[Math.floor(Math.random() * RACER_COLORS.length)];
    this._createElements();
  }

  // ─── SVG ─────────────────────────────────────────────────────────────────────

  /** @private */
  _createElements() {
    const ns = 'http://www.w3.org/2000/svg';
    const el = (tag) => document.createElementNS(ns, tag);
    const rect = (x, y, w, h, fill, rx = 0) => {
      const r = el('rect');
      r.setAttribute('x', x); r.setAttribute('y', y);
      r.setAttribute('width', w); r.setAttribute('height', h);
      r.setAttribute('fill', fill);
      if (rx) r.setAttribute('rx', rx);
      return r;
    };

    const g  = el('g');
    const hw = this._w / 2;
    const hh = this._h / 2;
    const dark = this._darken(this._color, 0.65);

    // Karoserie
    g.appendChild(rect(-hw, -hh, this._w, this._h, this._color, 4));

    // Střecha — sportovní (nižší, užší)
    const rw = this._w * 0.58;
    const rh = this._h * 0.32;
    g.appendChild(rect(-rw/2, -hh + this._h * 0.24, rw, rh, dark, 3));

    // Přední světla (světle žlutá)
    g.appendChild(rect(-hw + 3,      -hh + 3, 7, 4, '#ffffaa', 1));
    g.appendChild(rect(hw - 10,      -hh + 3, 7, 4, '#ffffaa', 1));

    // Zadní světla — reference pro blinkr
    this._blinkerL = rect(-hw + 3,   hh - 7, 7, 4, '#ff2200', 1);
    this._blinkerR = rect(hw - 10,   hh - 7, 7, 4, '#ff2200', 1);
    g.appendChild(this._blinkerL);
    g.appendChild(this._blinkerR);

    // Sportovní pruhy na kapotě
    g.appendChild(rect(-3, -hh + 6, 6, this._h * 0.35, this._darken(this._color, 0.5), 1));

    // Číslo "R" — označení racera
    const txt = el('text');
    txt.setAttribute('x', 0); txt.setAttribute('y', 4);
    txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('font-size', '11');
    txt.setAttribute('font-weight', 'bold');
    txt.setAttribute('font-family', 'Arial, sans-serif');
    txt.setAttribute('fill', dark);
    txt.textContent = 'R';
    g.appendChild(txt);

    this._group = g;
    this._svg.appendChild(g);
    this._applyTransform();
  }

  /** @private */
  _darken(hex, f) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    const d = v => Math.max(0,Math.round(v*f)).toString(16).padStart(2,'0');
    return `#${d(r)}${d(g)}${d(b)}`;
  }

  /** @private */
  _applyTransform() {
    this._group.setAttribute('transform', `translate(${this._cx}, ${this._cy})`);
  }

  // ─── Logika ──────────────────────────────────────────────────────────────────

  /**
   * Hlavní update — volá se každý frame.
   * @param {number}      dt
   * @param {number}      roadSpeed    - Aktuální rychlost silnice (px/s).
   * @param {TrafficCar[]} trafficCars - Všechna dopravní auta (pro vyhýbání).
   */
  update(dt, roadSpeed, trafficCars) {
    const playerKmh = roadSpeed * PHYSICS.PX_PER_S_TO_KMH;

    // Aktivace závodění — hráč musí jet nad 130 km/h
    if (!this._racing && playerKmh > 130) {
      this._racing = true;
    }

    // Zrychlování / udržování rychlosti
    if (this._racing) {
      const accel = 80; // px/s²
      if (this._speed < this._targetSpeed) {
        this._speed = Math.min(this._targetSpeed, this._speed + accel * dt);
      }
    }

    // Pohyb: relativní rychlost vůči silnici
    // Vlastní rychlost > roadSpeed → auto jede rychleji než hráč → posouvá se nahoru
    const relativeSpeed = roadSpeed - this._speed;
    this._cy += relativeSpeed * dt;

    // Vyhýbání pomalým autům vpředu + přejezdy
    this._laneChangeCooldown = Math.max(0, this._laneChangeCooldown - dt);
    if (this._racing && !this._lcActive && this._laneChangeCooldown <= 0) {
      this._considerLaneChange(trafficCars);
    }

    // Animace přejezdu
    if (this._lcActive) {
      this._lcTimer += dt;
      const MOVE_DUR = 0.35;
      const t = Math.min(this._lcTimer / MOVE_DUR, 1);
      const ease = t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
      this._cx = this._lcFromX + (this._lcToX - this._lcFromX) * ease;
      if (t >= 1) {
        this._cx       = this._lcToX;
        this.laneIndex = this._lcTarget;
        this._lcActive = false;
        this._lcTimer  = 0;
        this._resetBlinker();
      }
      this._updateBlinker(dt);
    }

    this._applyTransform();

    // Deaktivace — ujel příliš daleko před hráče
    if (this._cy < -CANVAS.HEIGHT * 1.5) {
      this.active = false;
    }
    // Deaktivace — zůstal příliš daleko za hráčem (hráč brzdil)
    if (this._cy > CANVAS.HEIGHT + 100) {
      this.active = false;
    }
  }

  /**
   * Rozhodne zda a kam přejet pruh — vyhýbá se pomalým autům vpředu.
   * @private
   */
  _considerLaneChange(trafficCars) {
    const LOOK_AHEAD   = 180; // px před racerem — zóna detekce překážky
    const blockLeft    = this._isLaneBlockedAhead(this.laneIndex - 1, trafficCars, LOOK_AHEAD);
    const blockCurrent = this._isLaneBlockedAhead(this.laneIndex,     trafficCars, LOOK_AHEAD);
    const blockRight   = this._isLaneBlockedAhead(this.laneIndex + 1, trafficCars, LOOK_AHEAD);

    let targetLane = -1;

    if (blockCurrent) {
      // Aktuální pruh blokován — vyber volný sousední
      const tryLeft  = this.laneIndex - 1;
      const tryRight = this.laneIndex + 1;
      if (!blockLeft  && tryLeft  >= 0)                   targetLane = tryLeft;
      else if (!blockRight && tryRight < ROAD.LANE_COUNT) targetLane = tryRight;
    } else {
      // Volný pruh — občasný náhodný přejezd (simulace závodění)
      if (Math.random() < 0.015) {
        const dir = Math.random() < 0.5 ? -1 : 1;
        const t   = this.laneIndex + dir;
        if (t >= 0 && t < ROAD.LANE_COUNT && !this._isLaneBlockedAhead(t, trafficCars, LOOK_AHEAD)) {
          targetLane = t;
        }
      }
    }

    if (targetLane !== -1) {
      this._startLaneChange(targetLane);
    }
  }

  /**
   * Zjistí zda je v daném pruhu překážka před racerem.
   * @private
   */
  _isLaneBlockedAhead(lane, trafficCars, lookAhead) {
    if (lane < 0 || lane >= ROAD.LANE_COUNT) return true;
    for (const car of trafficCars) {
      if (car.laneIndex !== lane) continue;
      // Auto je "vpředu" pokud má menší Y (výše na obrazovce = před racerem)
      const dist = this._cy - car.cy;
      if (dist > 0 && dist < lookAhead) return true;
    }
    return false;
  }

  /** @private */
  _startLaneChange(targetLane) {
    this._lcActive  = true;
    this._lcFromX   = this._cx;
    this._lcToX     = LANE_CENTERS[targetLane];
    this._lcTarget  = targetLane;
    this._lcTimer   = 0;
    this._blinkDir  = targetLane > this.laneIndex ? 1 : -1;
    this._blinkOn   = true;
    this._blinkTimer = 0;
    this._laneChangeCooldown = 1.2 + Math.random() * 0.8;
  }

  /** @private */
  _updateBlinker(dt) {
    const INTERVAL = 0.20;
    this._blinkTimer += dt;
    if (this._blinkTimer >= INTERVAL) {
      this._blinkTimer -= INTERVAL;
      this._blinkOn = !this._blinkOn;
    }
    const blink  = this._blinkOn ? '#ffaa00' : '#ff2200';
    const steady = '#ff2200';
    if (this._blinkDir < 0) {
      this._blinkerL.setAttribute('fill', blink);
      this._blinkerR.setAttribute('fill', steady);
    } else {
      this._blinkerL.setAttribute('fill', steady);
      this._blinkerR.setAttribute('fill', blink);
    }
  }

  /** @private */
  _resetBlinker() {
    this._blinkerL.setAttribute('fill', '#ff2200');
    this._blinkerR.setAttribute('fill', '#ff2200');
    this._blinkOn  = false;
    this._blinkDir = 0;
  }

  // ─── Veřejné gettery ─────────────────────────────────────────────────────────

  get cy()     { return this._cy; }
  get height() { return this._h; }
  get speed()  { return this._speed; }

  /**
   * Vrátí AABB hitbox (pro kolizní detekci s hráčem).
   */
  getHitbox() {
    return {
      x:      this._cx - this._w / 2,
      y:      this._cy - this._h / 2,
      width:  this._w,
      height: this._h,
    };
  }

  /** Odstraní SVG skupinu. */
  remove() {
    if (this._group && this._group.parentNode) {
      this._group.parentNode.removeChild(this._group);
    }
  }
}
