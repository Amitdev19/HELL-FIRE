// Settings persistence and state management

export interface GameSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  controlMode: 'pc' | 'mobile';
  serverUrl: string;
}

const STORAGE_KEY = 'hell_fire_settings';

// Touch players can't reach Settings to switch control mode, so default to
// mobile controls on phones/tablets (coarse pointer or mobile user-agent).
function detectDefaultControlMode(): 'pc' | 'mobile' {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'pc';
  const ua = navigator.userAgent || '';
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
  const coarse =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  return isMobileUA || coarse ? 'mobile' : 'pc';
}

const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 0.7,
  musicVolume: 0.5,
  sfxVolume: 0.6,
  controlMode: detectDefaultControlMode(),
  serverUrl: '',
};

class SettingsManagerClass {
  private settings: GameSettings;

  constructor() {
    this.settings = this.load();
  }

  private load(): GameSettings {
    let settings: GameSettings;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<GameSettings>;
        settings = { ...DEFAULT_SETTINGS, ...parsed };
      } else {
        settings = { ...DEFAULT_SETTINGS };
      }
    } catch (e) {
      console.warn('Failed to load settings:', e);
      settings = { ...DEFAULT_SETTINGS };
    }
    // Touch players can't reach Settings to switch control mode, so force
    // mobile controls on touch devices even if a stale 'pc' was saved before.
    if (detectDefaultControlMode() === 'mobile' && settings.controlMode === 'pc') {
      settings.controlMode = 'mobile';
    }
    return settings;
  }

  save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch (e) {
      console.warn('Failed to save settings:', e);
    }
  }

  get(): GameSettings {
    return { ...this.settings };
  }

  setMasterVolume(value: number): void {
    this.settings.masterVolume = Math.max(0, Math.min(1, value));
    this.save();
  }

  setMusicVolume(value: number): void {
    this.settings.musicVolume = Math.max(0, Math.min(1, value));
    this.save();
  }

  setSFXVolume(value: number): void {
    this.settings.sfxVolume = Math.max(0, Math.min(1, value));
    this.save();
  }

  getMasterVolume(): number {
    return this.settings.masterVolume;
  }

  getMusicVolume(): number {
    return this.settings.musicVolume;
  }

  getSFXVolume(): number {
    return this.settings.sfxVolume;
  }

  getControlMode(): 'pc' | 'mobile' {
    return this.settings.controlMode;
  }

  setControlMode(mode: 'pc' | 'mobile'): void {
    this.settings.controlMode = mode;
    this.save();
  }

  getServerUrl(): string {
    return this.settings.serverUrl;
  }

  setServerUrl(url: string): void {
    this.settings.serverUrl = url;
    this.save();
  }

  resetToDefaults(): void {
    this.settings = { ...DEFAULT_SETTINGS, controlMode: detectDefaultControlMode() };
    this.save();
  }
}

// Singleton instance
export const SettingsManager = new SettingsManagerClass();
