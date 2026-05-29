'use strict';

const RACER_COLORS = ['#ff3300', '#ff00cc', '#00ccff', '#aaff00', '#ff9900'];

class RacerCar {
  /**
   * @param {SVGElement} svg       - Kořenový SVG element.
   * @param {number}     laneIndex - Počáteční pruh (0–5).
   * @param {number}     startY    - Počáteční Y (blízko spodního okraje).
   * @param {number}     [roadSpeed=0] - Aktuální rychlost silnice (px/s) v okamžiku spawnu.
   */
  constructor(svg, laneIndex, startY, roadSpeed = 0) {
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

    /** @private — vlastní absolutní rychlost (px/s); start o 5 % rychlejší než hráč */
    this._speed = roadSpeed * 1.05;

    /** @private — true pokud racer čeká na hráče (odplul na horní okraj) */
    this._waiting = false;

    /** @private — cooldown pro přejezd pruhu (s) */
    this._laneChangeCooldown = 0;

    /** @private — boční rychlost z kolizních impulzů (px/s), tlumí se */
    this._vx = 0;

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
   * @param {number}       dt
   * @param {number}       roadSpeed    - Aktuální rychlost silnice (px/s).
   * @param {TrafficCar[]} trafficCars  - Všechna dopravní auta (pro vyhýbání).
   * @param {PlayerCar}    [player]     - Hráč (pro vyhýbání).
   */
  update(dt, roadSpeed, trafficCars, player, policeCars = []) {
    const playerY = PLAYER.Y_CENTER;

    // ── Gumičkový multiplikátor ──────────────────────────────────────────────
    const ZONE_TOP    = CANVAS.HEIGHT * 0.05;
    const ZONE_BOTTOM = CANVAS.HEIGHT * 0.75;
    const WAIT_UNTIL  = CANVAS.HEIGHT * 0.50; // vrátí se sem před obnovením závodění

    // Přechod do čekacího stavu — racer odplul příliš vysoko
    if (!this._waiting && this._cy < ZONE_TOP) {
      this._waiting = true;
    }
    // Opuštění čekacího stavu — racer se vrátil do půlky obrazovky
    if (this._waiting && this._cy >= WAIT_UNTIL) {
      this._waiting = false;
    }

    let K;
    if (this._waiting) {
      // Jede výrazně pomaleji než hráč → driftuje dolů zpět do středu
      K = 0.80;
    } else if (this._cy > playerY) {
      // Racer za hráčem → agresivně dohání
      K = 1.12;
    } else if (playerY - this._cy < 150) {
      // Hráč se přiblížil → odmotá se
      K = 1.08;
    } else {
      // Standardní vedení — mírně rychlejší než hráč
      K = 1.02;
    }

    // Clamp dolů — racer příliš nízko → zrychlí
    if (!this._waiting && this._cy > ZONE_BOTTOM) {
      K = Math.max(K, 1.10);
    }

    let desiredSpeed = roadSpeed * K;

    // Brzdění před překážkou (traffic, police nebo hráč) — hitbox-based detekce
    const BRAKE_DIST = 180;
    const obstacle = this._findObstacleAhead(trafficCars, player, policeCars, BRAKE_DIST);
    if (obstacle) {
      const obsSpeed = obstacle.isPolice ? 0 : (obstacle.isPlayer ? roadSpeed : obstacle.speed);
      if (obstacle.dist < 60) {
        desiredSpeed = Math.min(desiredSpeed, obsSpeed * 0.85);
      } else {
        desiredSpeed = Math.min(desiredSpeed, obsSpeed);
      }
    }

    // Vyhýbání radaru — zpomal na rychlost silnice aby racer neproletěl kruhem
    const inRadar = this._isInsideAnyRadar(policeCars);
    if (inRadar) {
      desiredSpeed = Math.min(desiredSpeed, roadSpeed * 0.97);
    }

    // Plynulá akcelerace/decelerace
    const ACCEL = 120;
    const DECEL = 250;
    if (this._speed < desiredSpeed) {
      this._speed = Math.min(desiredSpeed, this._speed + ACCEL * dt);
    } else if (this._speed > desiredSpeed) {
      this._speed = Math.max(desiredSpeed, this._speed - DECEL * dt);
    }

    // Pohyb vůči silnici
    const relativeSpeed = roadSpeed - this._speed;
    this._cy += relativeSpeed * dt;

    // Přejezdy pruhu — nouzový přejezd ignoruje cooldown
    this._laneChangeCooldown = Math.max(0, this._laneChangeCooldown - dt);
    if (!this._lcActive) {
      const emergency = obstacle && obstacle.dist < 100;
      if (emergency || this._laneChangeCooldown <= 0) {
        this._considerLaneChange(trafficCars, player, policeCars, emergency);
      }
    }

    // Animace přejezdu
    if (this._lcActive) {
      this._lcTimer += dt;
      const MOVE_DUR = this._lcDuration ?? 0.35;
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

    // Boční impuls z kolizí + plynulý návrat do středu pruhu (jen mimo přejezd)
    this._cx += this._vx * dt;
    this._vx *= Math.exp(-6 * dt);
    if (!this._lcActive) {
      const laneCx = LANE_CENTERS[this.laneIndex];
      this._cx += (laneCx - this._cx) * Math.min(1, 2.5 * dt);
    }

    this._applyTransform();

    // Deaktivace jen pokud racer zcela opustí obrazovku (nemělo by nastat díky clampu)
    if (this._cy < -this._h * 2 || this._cy > CANVAS.HEIGHT + 300) {
      this.active = false;
    }
  }

  /**
   * Rozhodne zda a kam přejet pruh.
   * @param {boolean} emergency - Ignorovat cooldown, přejet okamžitě.
   * @private
   */
  _considerLaneChange(trafficCars, player, policeCars = [], emergency = false) {
    // Žádný přejezd, pokud je hráč v okruhu 2× délky auta (radius)
    if (player) {
      const dx = LANE_CENTERS[player.laneIndex] - this._cx;
      const dy = PLAYER.Y_CENTER - this._cy;
      if (Math.hypot(dx, dy) < this._h * 2) return;
    }

    const LOOK_AHEAD = emergency ? 120 : 220;
    const blockLeft    = this._isLaneBlockedAhead(this.laneIndex - 1, trafficCars, player, policeCars, LOOK_AHEAD);
    const blockCurrent = this._isLaneBlockedAhead(this.laneIndex,     trafficCars, player, policeCars, LOOK_AHEAD);
    const blockRight   = this._isLaneBlockedAhead(this.laneIndex + 1, trafficCars, player, policeCars, LOOK_AHEAD);

    let targetLane = -1;

    if (blockCurrent) {
      const tryLeft  = this.laneIndex - 1;
      const tryRight = this.laneIndex + 1;
      // Preferuj stranu s více volnými pruhy za ní
      const leftFree  = !blockLeft  && tryLeft  >= 0;
      const rightFree = !blockRight && tryRight < ROAD.LANE_COUNT;
      if (leftFree && rightFree) {
        targetLane = Math.random() < 0.5 ? tryLeft : tryRight;
      } else if (leftFree) {
        targetLane = tryLeft;
      } else if (rightFree) {
        targetLane = tryRight;
      }
    } else if (!emergency) {
      // Občasný náhodný přejezd jen mimo nouzový režim
      if (Math.random() < 0.015) {
        const dir = Math.random() < 0.5 ? -1 : 1;
        const t   = this.laneIndex + dir;
        if (t >= 0 && t < ROAD.LANE_COUNT && !this._isLaneBlockedAhead(t, trafficCars, player, policeCars, LOOK_AHEAD)) {
          targetLane = t;
        }
      }
    }

    if (targetLane !== -1) {
      this._startLaneChange(targetLane, emergency);
    }
  }

  /**
   * Zjistí zda je cílový pruh blokován — hitbox-based, včetně policejních aut a jejich radaru.
   * @private
   */
  _isLaneBlockedAhead(lane, trafficCars, player, policeCars, lookAhead) {
    if (lane < 0 || lane >= ROAD.LANE_COUNT) return true;
    const targetCx = LANE_CENTERS[lane];
    const xOverlap = this._w * 0.9;

    for (const car of trafficCars) {
      const carCx = car._cx !== undefined ? car._cx : LANE_CENTERS[car.laneIndex];
      if (Math.abs(carCx - targetCx) > xOverlap) continue;
      const dist = this._cy - car.cy;
      if (dist > -30 && dist < lookAhead) return true;
    }

    for (const pc of policeCars) {
      const pcCx = pc._cx !== undefined ? pc._cx : LANE_CENTERS[pc.laneIndex];
      if (Math.abs(pcCx - targetCx) > xOverlap) continue;
      const dist = this._cy - pc.cy;
      if (dist > -30 && dist < lookAhead) return true;
      // Radar kruhu — blokuj pruh pokud by racer vjel do radaru
      const radar = pc.getRadarCircle();
      if (this._laneEntersRadar(targetCx, radar)) return true;
    }

    if (player && player.laneIndex === lane) {
      // Nepřejíždět do pruhu, pokud je hráč v okruhu 2× délky auta
      if (Math.abs(this._cy - PLAYER.Y_CENTER) < this._h * 2) return true;
      const dist = this._cy - PLAYER.Y_CENTER;
      if (dist > -30 && dist < lookAhead) return true;
    }
    return false;
  }

  /**
   * Vrátí true pokud střed pruhu leží uvnitř radarového kruhu.
   * @private
   */
  _laneEntersRadar(laneCx, radar) {
    const dx = laneCx - radar.cx;
    const dy = this._cy - radar.cy;
    return Math.sqrt(dx * dx + dy * dy) < radar.r + this._w / 2;
  }

  /**
   * Vrátí true pokud racer aktuálně leží uvnitř nějakého radarového kruhu.
   * @private
   */
  _isInsideAnyRadar(policeCars) {
    for (const pc of policeCars) {
      const radar = pc.getRadarCircle();
      const dx = this._cx - radar.cx;
      const dy = this._cy - radar.cy;
      if (Math.sqrt(dx * dx + dy * dy) < radar.r) return true;
    }
    return false;
  }

  /**
   * Najde nejbližší překážku před racerem — traffic, police i hráč (hitbox-based).
   * @private
   */
  _findObstacleAhead(trafficCars, player, policeCars, lookAhead) {
    let best = null;
    let bestDist = Infinity;
    const xOverlap = this._w * 0.8;

    for (const car of trafficCars) {
      const carCx = car._cx !== undefined ? car._cx : LANE_CENTERS[car.laneIndex];
      if (Math.abs(carCx - this._cx) > xOverlap) continue;
      const dist = this._cy - car.cy;
      if (dist > 0 && dist < lookAhead && dist < bestDist) {
        bestDist = dist;
        best = { speed: car.speed, isPlayer: false, isPolice: false, dist };
      }
    }

    for (const pc of policeCars) {
      const pcCx = pc._cx !== undefined ? pc._cx : LANE_CENTERS[pc.laneIndex];
      if (Math.abs(pcCx - this._cx) > xOverlap) continue;
      const dist = this._cy - pc.cy;
      if (dist > 0 && dist < lookAhead && dist < bestDist) {
        bestDist = dist;
        best = { speed: 0, isPlayer: false, isPolice: true, dist };
      }
    }

    if (player) {
      const playerCx = LANE_CENTERS[player.laneIndex];
      if (Math.abs(playerCx - this._cx) <= xOverlap) {
        const dist = this._cy - PLAYER.Y_CENTER;
        if (dist > 0 && dist < lookAhead && dist < bestDist) {
          bestDist = dist;
          best = { speed: 0, isPlayer: true, isPolice: false, dist };
        }
      }
    }
    return best;
  }

  /** @private */
  _startLaneChange(targetLane, emergency = false) {
    this._lcActive   = true;
    this._lcFromX    = this._cx;
    this._lcToX      = LANE_CENTERS[targetLane];
    this._lcTarget   = targetLane;
    this._lcTimer    = 0;
    this._lcDuration = emergency ? 0.18 : 0.35;
    this._blinkDir   = targetLane > this.laneIndex ? 1 : -1;
    this._blinkOn    = true;
    this._blinkTimer = 0;
    this._laneChangeCooldown = emergency ? 0.4 : 1.2 + Math.random() * 0.8;
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
  get cx()     { return this._cx; }
  get height() { return this._h; }
  get speed()  { return this._speed; }

  /** @returns {number} hmotnost úměrná ploše (pro kolizní impulzy) */
  get mass() { return this._w * this._h; }

  /**
   * Přímo nastaví aktuální rychlost (kolizní přenos hybnosti).
   * @param {number} v
   */
  setSpeed(v) { this._speed = Math.max(0, v); }

  /**
   * Přidá boční rychlost (kolizní odraz do strany).
   * @param {number} dvx
   */
  applyLateralImpulse(dvx) { this._vx += dvx; }

  getHitbox() {
    return {
      x:      this._cx - this._w / 2,
      y:      this._cy - this._h / 2,
      width:  this._w,
      height: this._h,
    };
  }

  /**
   * Posune racera o daný offset (separace kolizí).
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

  remove() {
    if (this._group && this._group.parentNode) {
      this._group.parentNode.removeChild(this._group);
    }
  }
}
