'use strict';

/**
 * @file hud.js
 * Aktualizuje DOM elementy HUD overlaye a overlay panely (start / game over).
 */

class Hud {
  constructor() {
    // HUD hodnoty
    this._elScore    = document.getElementById('hud-score-value');
    this._elDistance = document.getElementById('hud-distance-value');
    this._elSpeed    = document.getElementById('hud-speed-value');

    // Overlay panel
    this._overlay        = document.getElementById('overlay');
    this._overlayTitle   = document.getElementById('overlay-title');
    this._overlayStats   = document.getElementById('overlay-stats');
    this._overlaySubtitle = document.getElementById('overlay-subtitle');
    this._btnStart       = document.getElementById('btn-start');
    this._btnClose       = document.getElementById('btn-close');

    // Výsledky
    this._elResultScore    = document.getElementById('result-score');
    this._elResultDistance = document.getElementById('result-distance');
    this._elResultCoins    = document.getElementById('result-coins');

    // Anti-radar odpočet
    this._elAntiradar      = document.getElementById('hud-antiradar');
    this._elAntiradaTimer  = document.getElementById('hud-antirada-timer');
  }

  // ─── HUD ─────────────────────────────────────────────────────────────────────

  /**
   * Aktualizuje zobrazené hodnoty v HUD.
   * @param {number} score        - Celkové skóre.
   * @param {number} distanceMeters - Vzdálenost v metrech.
   * @param {number} speedPxPerS  - Rychlost silnice v px/s.
   */
  update(score, distanceMeters, speedPxPerS) {
    this._elScore.textContent    = score;
    this._elDistance.textContent = `${distanceMeters} m`;
    this._elSpeed.textContent    = `${Math.round(speedPxPerS * PHYSICS.PX_PER_S_TO_KMH)} km/h`;
  }

  // ─── Overlay ─────────────────────────────────────────────────────────────────

  /**
   * Zobrazí úvodní (start) overlay.
   */
  showStart() {
    this._overlayTitle.textContent    = 'STREET RACER';
    this._overlayTitle.style.color    = '#e94560';
    this._overlayTitle.style.textShadow = '0 0 20px rgba(233, 69, 96, 0.6)';
    this._overlaySubtitle.textContent = 'Vyhýbej se autům a sbírej mince!';
    this._overlayStats.classList.add('hidden');
    this._btnStart.textContent = 'HRÁT';
    this._btnClose.classList.add('hidden');
    this._overlay.classList.remove('hidden');
  }

  /**
   * Zobrazí game-over overlay s výsledky.
   * @param {number}  score
   * @param {number}  distanceMeters
   * @param {number}  coins
   * @param {boolean} [busted=false]      - true = BUSTED (policie), false = CRASH
   * @param {number}  [bustedSpeedKmh=0]  - Rychlost při chycení (km/h), jen pro BUSTED
   */
  showGameOver(score, distanceMeters, coins, busted = false, bustedSpeedKmh = 0) {
    this._overlayTitle.textContent = busted ? 'BUSTED!' : 'GAME OVER';
    this._overlayTitle.style.color = busted ? '#1a8cff' : '#e94560';
    this._overlayTitle.style.textShadow = busted
      ? '0 0 20px rgba(26, 140, 255, 0.7)'
      : '0 0 20px rgba(233, 69, 96, 0.6)';

    if (busted) {
      this._overlaySubtitle.innerHTML =
        `Byl jsi chycen policií!<br>` +
        `<span class="busted-speed">${Math.round(bustedSpeedKmh)} km/h</span>`;
    } else {
      this._overlaySubtitle.textContent = 'Dobrá jízda! Zkus to znovu.';
    }

    this._elResultScore.textContent    = score;
    this._elResultDistance.textContent = `${distanceMeters} m`;
    this._elResultCoins.textContent    = coins;

    this._overlayStats.classList.remove('hidden');
    this._btnStart.textContent = 'HRÁT ZNOVU';
    this._btnClose.classList.remove('hidden');
    this._overlay.classList.remove('hidden');
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
