'use strict';

/**
 * @file hud.js
 * Aktualizuje DOM elementy HUD overlaye a overlay panely (start / game over).
 */

class Hud {
  constructor() {
    // HUD hodnoty
    this._elScore = document.getElementById('hud-score-value');
    this._elDistance = document.getElementById('hud-distance-value');
    this._elSpeed = document.getElementById('hud-speed-value');

    // Overlay panel
    this._overlay = document.getElementById('overlay');
    this._overlayTitle = document.getElementById('overlay-title');
    this._overlayStats = document.getElementById('overlay-stats');
    this._overlaySubtitle = document.getElementById('overlay-subtitle');
    this._btnStart = document.getElementById('btn-start');
    this._btnClose = document.getElementById('btn-close');

    // Výsledky
    this._elResultScore = document.getElementById('result-score');
    this._elResultDistance = document.getElementById('result-distance');
    this._elResultCoins = document.getElementById('result-coins');

    // Name entry (leaderboard)
    this._nameEntry = document.getElementById('name-entry');
    this._inputName = document.getElementById('input-name');
    this._btnSubmitScore = document.getElementById('btn-submit-score');
    this._scoreSaveStatus = document.getElementById('score-save-status');
    this._btnLeaderboard = document.getElementById('btn-leaderboard');

    // Leaderboard overlay
    this._lbOverlay = document.getElementById('leaderboard-overlay');
    this._lbList = document.getElementById('leaderboard-list');
    this._btnLbClose = document.getElementById('btn-leaderboard-close');

    // Anti-radar odpočet
    this._elAntiradar = document.getElementById('hud-antiradar');
    this._elAntiradaTimer = document.getElementById('hud-antirada-timer');
  }

  // ─── HUD ─────────────────────────────────────────────────────────────────────

  /**
   * Naformátuje čas na mm:ss.d (desetiny sekundy).
   * @param {number} seconds
   * @returns {string}
   */
  _formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds - m * 60;
    return `${m}:${s.toFixed(1).padStart(4, '0')}`;
  }

  /**
   * Aktualizuje zobrazené hodnoty v HUD.
   * @param {number} timeSeconds    - Uplynulý čas závodu (s).
   * @param {number} distanceMeters - Vzdálenost v metrech.
   * @param {number} speedPxPerS    - Rychlost silnice v px/s.
   */
  update(timeSeconds, distanceMeters, speedPxPerS) {
    this._elScore.textContent = this._formatTime(timeSeconds);
    this._elDistance.textContent = `${distanceMeters} / ${RACE.GOAL_METERS} m`;
    this._elSpeed.textContent = `${Math.round(speedPxPerS * PHYSICS.PX_PER_S_TO_KMH)} km/h`;
  }

  // ─── Overlay ─────────────────────────────────────────────────────────────────

  /**
   * Zobrazí úvodní (start) overlay.
   */
  showStart() {
    this._overlayTitle.textContent = 'STREET RACER';
    this._overlayTitle.style.color = '#e94560';
    this._overlayTitle.style.textShadow = '0 0 20px rgba(233, 69, 96, 0.6)';
    this._overlaySubtitle.textContent = `Ujeď ${RACE.GOAL_METERS} m co nejrychleji! Mince ti uberou čas.`;
    this._overlayStats.classList.add('hidden');
    this._nameEntry.classList.add('hidden');
    this._btnStart.textContent = 'HRÁT';
    this._btnLeaderboard.classList.add('hidden');
    this._btnClose.classList.add('hidden');
    this._overlay.classList.remove('hidden');
  }

  /**
   * Zobrazí game-over overlay s výsledky.
   * @param {number}  timeSeconds         - Výsledný čas závodu (s).
   * @param {number}  distanceMeters
   * @param {number}  coins
   * @param {boolean} [busted=false]      - true = BUSTED (policie)
   * @param {number}  [bustedSpeedKmh=0]  - Rychlost při chycení (km/h), jen pro BUSTED
   * @param {boolean} [finished=false]    - true = dojel cílovou vzdálenost
   */
  showGameOver(
    timeSeconds,
    distanceMeters,
    coins,
    busted = false,
    bustedSpeedKmh = 0,
    finished = false,
  ) {
    const title = finished ? 'DOJEL JSI!' : busted ? 'BUSTED!' : 'GAME OVER';
    const color = finished ? '#27e060' : busted ? '#1a8cff' : '#e94560';
    this._overlayTitle.textContent = title;
    this._overlayTitle.style.color = color;
    this._overlayTitle.style.textShadow = finished
      ? '0 0 20px rgba(39, 224, 96, 0.6)'
      : busted
        ? '0 0 20px rgba(26, 140, 255, 0.7)'
        : '0 0 20px rgba(233, 69, 96, 0.6)';

    if (busted) {
      this._overlaySubtitle.innerHTML =
        `Byl jsi chycen policií!<br>` +
        `<span class="busted-speed">${Math.round(bustedSpeedKmh)} km/h</span>`;
    } else if (finished) {
      this._overlaySubtitle.textContent = `Dojel jsi ${RACE.GOAL_METERS} m! (mince −${coins * RACE.COIN_TIME_BONUS}s)`;
    } else {
      this._overlaySubtitle.textContent = 'Dobrá jízda! Zkus to znovu.';
    }

    this._elResultScore.textContent = this._formatTime(timeSeconds);
    this._elResultDistance.textContent = `${distanceMeters} m`;
    this._elResultCoins.textContent = coins;

    this._overlayStats.classList.remove('hidden');
    this._btnStart.textContent = 'HRÁT ZNOVU';
    this._btnClose.classList.remove('hidden');
    this._btnLeaderboard.classList.remove('hidden');

    // Zobraz name entry pro uložení skóre — jen pokud hráč dojel nebo narazil (ne busted)
    if (!busted) {
      this._nameEntry.classList.remove('hidden');
      this._btnSubmitScore.disabled = false;
      this._inputName.value = localStorage.getItem('playerName') || '';
      this._scoreSaveStatus.textContent = '';
      this._scoreSaveStatus.className = 'score-save-status';
    } else {
      this._nameEntry.classList.add('hidden');
    }

    this._overlay.classList.remove('hidden');
  }

  /**
   * Zaregistruje handler pro odeslání skóre.
   * @param {Function} callback fn(name)
   */
  onSubmitScore(callback) {
    this._btnSubmitScore.addEventListener('click', () => {
      const name = this._inputName.value.trim() || 'Hráč';
      localStorage.setItem('playerName', name);
      callback(name);
    });
    this._inputName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._btnSubmitScore.click();
    });
  }

  /**
   * Zobrazí stav uložení skóre.
   * @param {'loading'|'ok'|'err'} state
   */
  setScoreSaveStatus(state) {
    const msgs = { loading: 'Ukládám...', ok: 'Skóre uloženo!', err: 'Chyba při ukládání.' };
    this._scoreSaveStatus.textContent = msgs[state] || '';
    this._scoreSaveStatus.className = 'score-save-status ' + (state === 'loading' ? '' : state);
    if (state !== 'loading') {
      this._btnSubmitScore.disabled = true;
    }
  }

  /**
   * Zaregistruje handler pro tlačítko žebříček.
   * @param {Function} callback
   */
  onLeaderboardClick(callback) {
    this._btnLeaderboard.addEventListener('click', callback);
    this._btnLbClose.addEventListener('click', () => this._lbOverlay.classList.add('hidden'));
  }

  /**
   * Zobrazí leaderboard overlay s daty.
   * @param {Array<{name:string, score:number}>} entries
   */
  showLeaderboard(entries) {
    this._lbList.innerHTML = '';
    if (entries.length === 0) {
      const li = document.createElement('li');
      li.className = 'lb-loading';
      li.textContent = 'Žádné výsledky.';
      this._lbList.appendChild(li);
    } else {
      entries.forEach((e, i) => {
        const li = document.createElement('li');
        const rank = i + 1;
        const value = typeof e.time === 'number' ? this._formatTime(e.time) : (e.score ?? '');
        li.innerHTML =
          `<span class="lb-rank lb-rank-${rank <= 3 ? rank : ''}">${rank}.</span>` +
          `<span class="lb-name">${this._escape(e.name)}</span>` +
          `<span class="lb-score">${value}</span>`;
        this._lbList.appendChild(li);
      });
    }
    this._lbOverlay.classList.remove('hidden');
  }

  /** @private */
  _escape(str) {
    return String(str).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  }

  /**
   * Skryje overlay.
   */
  hideOverlay() {
    this._overlay.classList.add('hidden');
  }

  /**
   * Zobrazí nebo aktualizuje odpočet anti-radaru v pravém horním rohu.
   * @param {number} remainingSeconds - Zbývající sekundy (0 = skryj).
   */
  updateAntiRadar(remainingSeconds) {
    if (remainingSeconds > 0) {
      this._elAntiradar.classList.remove('hidden');
      this._elAntiradaTimer.textContent = Math.ceil(remainingSeconds);
    } else {
      this._elAntiradar.classList.add('hidden');
    }
  }

  /**
   * Zaregistruje handler pro tlačítko start/restart.
   * @param {Function} callback
   */
  onStartClick(callback) {
    this._btnStart.addEventListener('click', callback);
  }

  /**
   * Zaregistruje handler pro tlačítko "Zpět na úvod".
   * @param {Function} callback
   */
  onCloseClick(callback) {
    this._btnClose.addEventListener('click', callback);
  }
}
