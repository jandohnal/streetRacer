import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import jsdoc from 'eslint-plugin-jsdoc';

// Globální konstanty z constants.js
const projectConstants = {
  CANVAS: 'readonly',
  ROAD: 'readonly',
  LANE_WIDTH: 'readonly',
  LANE_CENTERS: 'readonly',
  PHYSICS: 'readonly',
  PLAYER: 'readonly',
  VehicleType: 'readonly',
  VEHICLE_DEFS: 'readonly',
  VEHICLE_SPAWN_POOL: 'readonly',
  SPAWN: 'readonly',
  COIN: 'readonly',
  SCORE: 'readonly',
  RACE: 'readonly',
  POLICE: 'readonly',
  PLAYER_ANIM: 'readonly',
  LANE_ANIM: 'readonly',
  AUDIO: 'readonly',
};

// Třídy definované v jednotlivých souborech, používané globálně (bez modulů)
const projectClasses = {
  AudioEngine: 'readonly',
  AUDIO_BUFFERS: 'readonly',
  Bonus: 'readonly',
  BonusManager: 'readonly',
  BonusType: 'readonly',
  Coin: 'readonly',
  CoinManager: 'readonly',
  CollisionSystem: 'readonly',
  FinishLine: 'readonly',
  GameState: 'readonly',
  Hud: 'readonly',
  InputManager: 'readonly',
  Leaderboard: 'readonly',
  Particle: 'readonly',
  ParticleShape: 'readonly',
  ParticleSystem: 'readonly',
  PlayerCar: 'readonly',
  PoliceCar: 'readonly',
  PoliceManager: 'readonly',
  RacerCar: 'readonly',
  RacerManager: 'readonly',
  Road: 'readonly',
  ScoreSystem: 'readonly',
  TrafficCar: 'readonly',
  TrafficManager: 'readonly',
};

export default [
  js.configs.recommended,
  {
    files: ['js/**/*.js'],
    plugins: { jsdoc },
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        ...projectConstants,
        ...projectClasses,
      },
    },
    rules: {
      // Google Style Guide — klíčová pravidla
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'warn',
      curly: ['error', 'all'],
      'default-case': 'error',
      'no-throw-literal': 'error',
      'prefer-const': 'error',
      'no-multi-assign': 'error',
      'no-new-object': 'error',
      'no-array-constructor': 'error',
      'no-extend-native': 'error',
      'no-extra-bind': 'error',
      'no-invalid-this': 'error',
      'no-new-wrappers': 'error',
      'no-eval': 'error',
      'no-with': 'error',

      // JSDoc validace
      'jsdoc/check-param-names': 'warn',
      'jsdoc/check-tag-names': 'warn',
      'jsdoc/check-types': 'warn',
      'jsdoc/require-param-description': 'warn',
      'jsdoc/require-returns-description': 'off',
    },
  },
  // Prettier musí být poslední — vypne konfliktní formátovací pravidla
  prettier,
];
