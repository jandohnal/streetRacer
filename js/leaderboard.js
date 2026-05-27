'use strict';

/**
 * @file leaderboard.js
 * Komunikace s Firebase Firestore — ukládání a načítání výsledků.
 *
 * Závisí na globálních proměnných window._fbApp a window._fbDb,
 * které jsou inicializovány Firebase CDN skriptem v index.html.
 */

const LEADERBOARD_COLLECTION = 'leaderboard';
const LEADERBOARD_TOP_N      = 10;

class Leaderboard {
  constructor() {
    /** @private */
    this._db = window._fbDb || null;

    if (!this._db) {
      console.warn('[Leaderboard] Firebase Firestore není dostupné.');
    }
  }

  /**
   * Uloží skóre do Firestore.
   * @param {string} name   - Jméno hráče
   * @param {number} score  - Celkové skóre
   * @param {number} distance - Vzdálenost v metrech
   * @param {number} coins  - Počet mincí
   * @returns {Promise<boolean>} true při úspěchu
   */
  async saveScore(name, score, distance, coins) {
    if (!this._db) return false;
    try {
      const { collection, addDoc } = window._fbFirestore;
      await addDoc(collection(this._db, LEADERBOARD_COLLECTION), {
        name:     name.trim().slice(0, 20) || 'Hráč',
        score,
        distance,
        coins,
        date: Date.now(),
      });
      return true;
    } catch (err) {
      console.error('[Leaderboard] Chyba při ukládání:', err);
      return false;
    }
  }

  /**
   * Načte top N výsledků ze Firestore, seřazených podle skóre sestupně.
   * @returns {Promise<Array<{name:string, score:number, distance:number, coins:number}>>}
   */
  async getTopScores() {
    if (!this._db) return [];
    try {
      const { collection, query, orderBy, limit, getDocs } = window._fbFirestore;
      const q    = query(
        collection(this._db, LEADERBOARD_COLLECTION),
        orderBy('score', 'desc'),
        limit(LEADERBOARD_TOP_N)
      );
      const snap = await getDocs(q);
      return snap.docs.map(doc => doc.data());
    } catch (err) {
      console.error('[Leaderboard] Chyba při načítání:', err);
      return [];
    }
  }
}
