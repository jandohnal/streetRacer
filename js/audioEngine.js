'use strict';

/**
 * @file audioEngine.js
 * Realistický zvukový engine motoru postavený na Web Audio API.
 *
 * Klíčové designové rozhodnutí:
 *   AudioContext se vytváří až v start() — při kliknutí uživatelem.
 *   load() pouze stáhne raw ArrayBuffery (fetch). Dekódování proběhne
 *   v start() po vytvoření kontextu. Tím se obchází browser autoplay policy.
 *
 * Uzlový graf:
 *   lowSrc  → lowGain  ─┐
 *   midSrc  → midGain  ─┤→ masterGain → destination
 *   highSrc → highGain ─┘
 *   turboSrc → turboGain ──→ destination
 *   blowoff  = one-shot (nový node při každém výstřelu)
 *
 * Simulace řazení:
 *   6 stupňů pokrývá rovnoměrný díl rozsahu SPEED_MIN–SPEED_MAX.
 *   RPM roste od RPM_SHIFT_DOWN po RPM_SHIFT_UP v rámci stupně.
 *   Přeřazení nahoru/dolů dle překročení hranic stupně.
 *   Aktuální RPM je lerpováno k cílovému (inerce AUDIO.RPM_LERP).
 */

class AudioEngine {
  constructor() {
    /** @private @type {AudioContext|null} */
    this._ctx = null;

    /**
     * Raw ArrayBuffery stažené přes fetch.
     * Dekódují se v start() po vytvoření AudioContext.
     * @private
     */
    this._rawBuffers = {
      low: null,
      mid: null,
      high: null,
      turbo: null,
      blowoff: null,
    };

    /** @private @type {Object.<string, AudioBuffer>} — dekódované buffery */
    this._buffers = {
      low: null,
      mid: null,
      high: null,
      turbo: null,
      blowoff: null,
    };

    /** @private — aktivní smyčkující source nody */
    this._sources = { low: null, mid: null, high: null, turbo: null };

    /** @private — gain nody */
    this._gains = { low: null, mid: null, high: null, turbo: null, master: null };

    /** @private — index aktuálního stupně (0–4) */
    this._gear = 0;
    /** @private — aktuální lerpovaná pozice v stupni (0–1) */
    this._gearN = 0;
    this._blowoffFired = false;
    this._running = false;

    /** @private — jak dlouho hráč nepřetržitě drží plyn (s) */
    this._throttleHeldTime = 0;
    /** @private — hodnota _throttleHeldTime z předchozího framu */
    this._prevThrottleHeldTime = 0;

    /** @private — true pokud raw buffery byly staženy */
    this._rawLoaded = false;
  }

  // ─── Načítání ────────────────────────────────────────────────────────────────

  /**
   * Dekóduje WAV data z base64 konstant (AUDIO_BUFFERS z audioBuffers.js).
   * Nevyžaduje fetch ani XHR — funguje na file:// protokolu.
   * AudioContext se vytváří až zde, před první uživatelskou interakcí
   * potřebujeme jen ArrayBuffery — ty získáme z atob().
   * @returns {Promise<void>}
   */
  async load() {
    try {
      // Převod base64 data URI → ArrayBuffer bez fetch/XHR
      for (const key of ['low', 'mid', 'high', 'turbo', 'blowoff']) {
        const dataUri = AUDIO_BUFFERS[key];
        const base64 = dataUri.split(',')[1];
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        this._rawBuffers[key] = bytes.buffer;
      }

      this._rawLoaded = true;
      console.log('[AudioEngine] Buffery připraveny, čeká se na start().');
    } catch (err) {
      console.warn('[AudioEngine] Načítání zvuků selhalo:', err.message);
    }
  }

  // ─── Spuštění / zastavení ────────────────────────────────────────────────────

  /**
   * Spustí engine zvuky.
   * Volá se při kliknutí na HRÁT — zde je garantována uživatelská interakce,
   * takže AudioContext lze vytvořit a ihned resume().
   * Dekóduje buffery (pokud ještě nejsou) a spustí smyčky.
   */
  async start() {
    if (this._running) return;

    if (!this._rawLoaded) {
      console.warn('[AudioEngine] start() voláno dříve než load() dokončil — ticho.');
      return;
    }

    // Vytvoř nebo znovu použij AudioContext
    if (!this._ctx || this._ctx.state === 'closed') {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }

    // Probudí kontext (povinné po browser autoplay policy)
    await this._ctx.resume();
    console.log('[AudioEngine] AudioContext state:', this._ctx.state);

    // Dekóduj ArrayBuffery → AudioBuffery (musí proběhnout po vytvoření ctx)
    try {
      for (const key of ['low', 'mid', 'high', 'turbo', 'blowoff']) {
        if (this._rawBuffers[key] && !this._buffers[key]) {
          // slice() — decodeAudioData spotřebuje buffer, potřebujeme kopii pro restart
          this._buffers[key] = await this._ctx.decodeAudioData(this._rawBuffers[key].slice(0));
        }
      }
    } catch (err) {
      console.error('[AudioEngine] Dekódování selhalo:', err);
      return;
    }

    // Sestav graf
    this._buildGraph();

    // Spusť smyčky
    for (const layer of ['low', 'mid', 'high']) {
      this._sources[layer] = this._createLoopSource(this._buffers[layer]);
      this._sources[layer].connect(this._gains[layer]);
      this._sources[layer].start(0);
    }

    this._sources.turbo = this._createLoopSource(this._buffers.turbo);
    this._sources.turbo.connect(this._gains.turbo);
    this._sources.turbo.start(0);

    // Fade-in master gainu (respektuje stav mute)
    const master = this._gains.master;
    const t = this._ctx.currentTime;
    const targetVol = this._muted ? 0 : AUDIO.MASTER_VOLUME;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(0, t);
    master.gain.linearRampToValueAtTime(targetVol, t + 0.3);

    // Reset herního stavu
    this._gear = 0;
    this._gearN = 0;
    this._blowoffFired = false;
    this._throttleHeldTime = 0;
    this._prevThrottleHeldTime = 0;
    this._running = true;

    console.log('[AudioEngine] Engine spuštěn.');
  }

  /**
   * Zastaví engine zvuky s fade-outem. Volá se při game over.
   */
  stop() {
    if (!this._running) return;
    this._running = false;

    const ctx = this._ctx;
    const master = this._gains.master;
    const turbo = this._gains.turbo;
    const t = ctx.currentTime;
    const tEnd = t + AUDIO.FADE_OUT_TIME;

    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(0, tEnd);

    turbo.gain.cancelScheduledValues(t);
    turbo.gain.setValueAtTime(turbo.gain.value, t);
    turbo.gain.linearRampToValueAtTime(0, tEnd);

    setTimeout(
      () => {
        for (const key of ['low', 'mid', 'high', 'turbo']) {
          if (this._sources[key]) {
            try {
              this._sources[key].stop();
            } catch (_) {
              // zdroj již nebyl přehrávám, ignorujeme
            }
            this._sources[key] = null;
          }
        }
        // Nuluj gains pro příští start()
        for (const key of Object.keys(this._gains)) {
          this._gains[key] = null;
        }
        ctx.suspend();
        console.log('[AudioEngine] Engine zastaven.');
      },
      AUDIO.FADE_OUT_TIME * 1000 + 50,
    );
  }

  /**
   * Ztlumí nebo odztlumí engine.
   * Funguje i když engine právě nehraje (uloží stav pro příští start()).
   * @param {boolean} muted
   */
  setMuted(muted) {
    this._muted = muted;
    if (this._gains && this._gains.master) {
      const t = this._ctx.currentTime;
      const target = muted ? 0 : AUDIO.MASTER_VOLUME;
      this._gains.master.gain.cancelScheduledValues(t);
      this._gains.master.gain.setValueAtTime(this._gains.master.gain.value, t);
      this._gains.master.gain.linearRampToValueAtTime(target, t + 0.08);
    }
  }

  // ─── Herní smyčka ────────────────────────────────────────────────────────────

  /**
   * Aktualizuje zvuk motoru každý frame.
   * @param {number}  speedPxPerS - Aktuální rychlost silnice (px/s).
   * @param {boolean} throttle    - True = hráč drží plyn (↑).
   * @param {number}  dt          - Delta time (s).
   */
  update(speedPxPerS, throttle, dt) {
    if (!this._running) return;

    // Sledování doby držení plynu (pro blowoff)
    const prevHeld = this._throttleHeldTime;
    if (throttle) {
      this._throttleHeldTime += dt;
    } else {
      this._throttleHeldTime = 0;
    }
    this._prevThrottleHeldTime = prevHeld;

    // Vypočti gear, cílové n a playbackRate
    const { gear, targetN, rate } = this._calcGearAndRate(speedPxPerS, throttle);
    this._gear = gear;

    // Lerp n — rychlost závisí na throttle (engine braking = rychlejší pokles)
    const lerpSpeed = throttle ? AUDIO.RPM_LERP_ACCEL : AUDIO.RPM_LERP_DECEL;
    const lerpFactor = 1 - Math.exp(-lerpSpeed * dt);
    this._gearN = this._gearN + (targetN - this._gearN) * lerpFactor;

    // n_global = plynulá pozice přes celý rychlostní rozsah (0–1)
    // Používá se pro crossfade vrstev — nezávislé na přeřazení
    const nGlobal = Math.max(0, Math.min(1, speedPxPerS / PHYSICS.SPEED_MAX));

    this._updateLayers(nGlobal, rate, throttle);
    this._updateTurbo();
    this._updateBlowoff(throttle);
  }

  // ─── Privátní — graf ─────────────────────────────────────────────────────────

  /**
   * Sestaví audio uzlový graf. Volá se při každém start().
   * @private
   */
  _buildGraph() {
    const ctx = this._ctx;

    this._gains.master = ctx.createGain();
    this._gains.master.gain.value = 0;
    this._gains.master.connect(ctx.destination);

    this._gains.turbo = ctx.createGain();
    this._gains.turbo.gain.value = 0;
    this._gains.turbo.connect(ctx.destination);

    for (const layer of ['low', 'mid', 'high']) {
      const gain = ctx.createGain();
      gain.gain.value = layer === 'low' ? 1 : 0; // low jako výchozí vrstva
      gain.connect(this._gains.master);
      this._gains[layer] = gain;
    }
  }

  // ─── Privátní — řazení a pitch ───────────────────────────────────────────────

  /**
   * Určí aktuální stupeň, cílové n (pozici v stupni) a playbackRate.
   *
   * Stupeň se přepne při překročení hranice speedHigh/speedLow z GEAR_DEFS.
   * Hystereze: přeřazení dolů nastane při poklesu 5 % pod speedLow stupně —
   * zabraňuje rychlému přepínání na hranici stupňů.
   *
   * playbackRate = rateStart + n * (rateEnd - rateStart)
   * Při engine braking se rate sníží o DECEL_PITCH_OFFSET.
   *
   * @private
   * @param {number}  speed
   * @param {boolean} throttle
   * @returns {{ gear: number, targetN: number, rate: number }}
   */
  _calcGearAndRate(speed, throttle) {
    const defs = AUDIO.GEAR_DEFS;
    const maxGear = AUDIO.GEAR_COUNT - 1;

    // Přeřazení nahoru
    while (this._gear < maxGear && speed >= defs[this._gear].speedHigh) {
      this._gear++;
    }
    // Přeřazení dolů (hystereze 5 % šířky stupně)
    while (this._gear > 0) {
      const prevDef = defs[this._gear - 1];
      const hysteresis = (defs[this._gear].speedHigh - defs[this._gear].speedLow) * 0.05;
      if (speed < defs[this._gear].speedLow - hysteresis) {
        this._gear--;
      } else {
        break;
      }
    }

    const def = defs[this._gear];
    const span = def.speedHigh - def.speedLow;
    const targetN = span > 0 ? Math.max(0, Math.min(1, (speed - def.speedLow) / span)) : 0;

    // playbackRate pro aktuální pozici v stupni
    let rate = def.rateStart + targetN * (def.rateEnd - def.rateStart);

    // Engine braking — lehce stáhne tón při puštění plynu
    if (!throttle) {
      rate += AUDIO.DECEL_PITCH_OFFSET;
    }

    return { gear: this._gear, targetN, rate };
  }

  // ─── Privátní — audio uzly ───────────────────────────────────────────────────

  /**
   * Nastaví gainy crossfade vrstev a playbackRate všech smyček.
   *
   * Crossfade je řízen n_global (0–1 přes celý rychlostní rozsah),
   * takže vrstva „low" dominuje při nízkých rychlostech a „high" při vysokých
   * — nezávisle na přeřazení.
   *
   * Crossfade funkce:
   *   gainLow  = clamp(1 - nGlobal * 3,        0, 1)   → aktivní do ~33 % max
   *   gainMid  = clamp(1 - |nGlobal-0.5| * 3,  0, 1)   → aktivní kolem 50 %
   *   gainHigh = clamp((nGlobal - 0.67) * 3,   0, 1)   → aktivní od ~67 % max
   *
   * Každá vrstva má vlastní playbackRate odpovídající pozici v aktuálním stupni.
   *
   * @private
   * @param {number}  nGlobal  - Pozice v celém rychlostním rozsahu (0–1).
   * @param {number}  rate     - Cílový playbackRate.
   * @param {boolean} throttle
   */
  _updateLayers(nGlobal, rate, throttle) {
    const gainLow = Math.max(0, Math.min(1, 1 - nGlobal * 3));
    const gainMid = Math.max(0, Math.min(1, 1 - Math.abs(nGlobal - 0.5) * 3));
    const gainHigh = Math.max(0, Math.min(1, (nGlobal - 0.67) * 3));

    this._setGain(this._gains.low, gainLow);
    this._setGain(this._gains.mid, gainMid);
    this._setGain(this._gains.high, gainHigh);

    // Plynulý lerp playbackRate — zamezí skokovému praskání při přeřazení
    for (const layer of ['low', 'mid', 'high']) {
      const src = this._sources[layer];
      if (!src) continue;
      const current = src.playbackRate.value;
      // Rychlé přiblížení (exponenciální smoothing ~3 framy)
      src.playbackRate.value = current + (rate - current) * 0.12;
    }
  }

  /** @private — turbo one-shot vypnut */
  _updateTurbo() {}

  /**
   * Přehraje blowoff při release plynu po alespoň 1s držení.
   * @private
   */
  _updateBlowoff(throttle) {
    const wasHeldLong = this._prevThrottleHeldTime >= AUDIO.TURBO_THROTTLE_MIN;

    if (!throttle && wasHeldLong && !this._blowoffFired) {
      this._blowoffFired = true;
      this._playOneShot(this._buffers.blowoff, AUDIO.BLOWOFF_VOLUME);
    }
    if (throttle) this._blowoffFired = false;
  }

  // ─── Privátní — pomocné ──────────────────────────────────────────────────────

  /** @private */
  _createLoopSource(buffer) {
    const src = this._ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    return src;
  }

  /**
   * Přehraje buffer jako one-shot přes masterGain (respektuje mute).
   * @private
   */
  _playOneShot(buffer, volume) {
    if (!buffer || !this._ctx) return;
    if (!this._gains.master) return;

    const gainNode = this._ctx.createGain();
    gainNode.gain.value = volume;
    gainNode.connect(this._gains.master);

    const src = this._ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = false;
    src.connect(gainNode);
    src.start(0);
    src.onended = () => {
      try {
        gainNode.disconnect();
      } catch (_) {
        // uzel již byl odpojen, ignorujeme
      }
    };
  }

  /**
   * Plynule nastaví gain hodnotu (zamezí klikání / praskání).
   * @private
   */
  _setGain(gainNode, value) {
    if (!gainNode) return;
    const t = this._ctx.currentTime;
    gainNode.gain.cancelScheduledValues(t);
    gainNode.gain.setTargetAtTime(value, t, 0.016);
  }
}
