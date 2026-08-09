import Phaser from 'phaser';
import { gameConfig } from './config';
import { initTestAPI } from './testing/TestAPI';

const game = new Phaser.Game(gameConfig);

// Initialize test API for Playwright testing (dev mode only)
initTestAPI(game);

// Register service worker for PWA / offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}
