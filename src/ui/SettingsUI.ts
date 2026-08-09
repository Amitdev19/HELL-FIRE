import Phaser from 'phaser';
import { AudioSystem } from '../systems/AudioSystem';
import { SettingsManager } from '../systems/SettingsManager';
import { NetworkManager } from '../multiplayer/NetworkManager';

interface SliderData {
  container: Phaser.GameObjects.Container;
  track: Phaser.GameObjects.Graphics;
  fill: Phaser.GameObjects.Graphics;
  thumb: Phaser.GameObjects.Ellipse;
  valueText: Phaser.GameObjects.Text;
  getValue: () => number;
  setValue: (value: number) => void;
  value: number;
}

export class SettingsUI {
  private scene: Phaser.Scene;
  private audioSystem: AudioSystem | null = null;
  private panel: Phaser.GameObjects.Container | null = null;
  private isVisible: boolean = false;
  private overlay: Phaser.GameObjects.Rectangle | null = null;
  private keyListener: ((event: KeyboardEvent) => void) | null = null;

  private sliders: {
    master: SliderData | null;
    music: SliderData | null;
    sfx: SliderData | null;
  } = { master: null, music: null, sfx: null };

  private controlMode: 'pc' | 'mobile' = 'pc';
  private onControlModeChange: ((mode: 'pc' | 'mobile') => void) | null = null;

  private controlGuidePanel: Phaser.GameObjects.Container | null = null;
  private controlGuideOverlay: Phaser.GameObjects.Rectangle | null = null;

  private readonly PANEL_WIDTH = 400;
  private readonly PANEL_HEIGHT = 620;

  constructor(scene: Phaser.Scene, audioSystem?: AudioSystem) {
    this.scene = scene;
    this.audioSystem = audioSystem || null;
  }

  setAudioSystem(audioSystem: AudioSystem): void {
    this.audioSystem = audioSystem;
    this.updateSliderValues();
  }

  setControlModeChangeCallback(cb: (mode: 'pc' | 'mobile') => void): void {
    this.onControlModeChange = cb;
  }

  private updateSliderValues(): void {
    if (!this.sliders.master) return;

    const masterVal = this.audioSystem?.getMasterVolume() ?? SettingsManager.getMasterVolume();
    const musicVal = this.audioSystem?.getMusicVolume() ?? SettingsManager.getMusicVolume();
    const sfxVal = this.audioSystem?.getSFXVolume() ?? SettingsManager.getSFXVolume();

    this.updateSlider(this.sliders.master, masterVal);
    this.updateSlider(this.sliders.music!, musicVal);
    this.updateSlider(this.sliders.sfx!, sfxVal);
  }

  private updateSlider(slider: SliderData, value: number): void {
    slider.value = value;
    slider.valueText.setText(`${Math.round(value * 100)}%`);

    const fillWidth = Math.max(2, this.SLIDER_WIDTH * value);
    slider.fill.clear();
    slider.fill.fillStyle(0xff6600, 1);
    slider.fill.fillRoundedRect(this.TRACK_X, -4, fillWidth, 8, 2);

    slider.thumb.setPosition(this.TRACK_X + this.SLIDER_WIDTH * value, 0);
    slider.thumb.setFillStyle(0xff6600);
    slider.thumb.setStrokeStyle(2, 0xffffff);
  }

  show(): void {
    if (this.panel) {
      this.panel.destroy();
      this.panel = null;
    }
    if (this.overlay) {
      this.overlay.destroy();
      this.overlay = null;
    }
    if (this.controlGuidePanel) {
      this.controlGuidePanel.destroy();
      this.controlGuidePanel = null;
    }
    if (this.controlGuideOverlay) {
      this.controlGuideOverlay.destroy();
      this.controlGuideOverlay = null;
    }

    this.isVisible = true;
    this.controlMode = SettingsManager.getControlMode();

    const cam = this.scene.cameras.main;
    const centerX = cam.scrollX + cam.width / 2;
    const centerY = cam.scrollY + cam.height / 2;

    this.overlay = this.scene.add.rectangle(centerX, centerY, cam.width * 3, cam.height * 3, 0x000000, 0);
    this.overlay.setDepth(199);
    this.overlay.setInteractive();

    this.panel = this.scene.add.container(centerX, centerY + cam.height);
    this.panel.setDepth(200);
    this.panel.setAlpha(0);

    this.createPanel();
    this.updateSliderValues();

    this.scene.tweens.add({
      targets: this.overlay,
      fillAlpha: 0.75,
      duration: 150,
      ease: 'Sine.easeOut',
    });
    this.scene.tweens.add({
      targets: this.panel,
      y: centerY,
      alpha: 1,
      duration: 200,
      ease: 'Back.easeOut',
    });

    this.scene.time.delayedCall(50, () => {
      if (this.isVisible) {
        this.setupInput();
      }
    });
  }

  private createPanel(): void {
    if (!this.panel) return;

    const halfW = this.PANEL_WIDTH / 2;
    const halfH = this.PANEL_HEIGHT / 2;

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x0a0a0a, 0.95);
    bg.fillRoundedRect(-halfW, -halfH, this.PANEL_WIDTH, this.PANEL_HEIGHT, 8);
    bg.lineStyle(1, 0x444444, 0.8);
    bg.strokeRoundedRect(-halfW, -halfH, this.PANEL_WIDTH, this.PANEL_HEIGHT, 8);
    this.panel.add(bg);

    this.drawCornerAccents(halfW, halfH);
    this.createHeader(halfW, halfH);
    this.createVolumeSection(halfW, halfH);
    this.createControlsSection(halfW, halfH);
    this.createControlModeSection(halfW, halfH);
    this.createServerSection(halfW, halfH);
    this.createControlGuideButton(halfH);
    this.createResetButton(halfH);
  }

  private drawCornerAccents(halfW: number, halfH: number): void {
    if (!this.panel) return;

    const corners = this.scene.add.graphics();
    corners.lineStyle(2, 0xff6600, 0.9);
    const cornerSize = 14;

    corners.beginPath();
    corners.moveTo(-halfW, -halfH + cornerSize);
    corners.lineTo(-halfW, -halfH);
    corners.lineTo(-halfW + cornerSize, -halfH);
    corners.strokePath();

    corners.beginPath();
    corners.moveTo(halfW - cornerSize, -halfH);
    corners.lineTo(halfW, -halfH);
    corners.lineTo(halfW, -halfH + cornerSize);
    corners.strokePath();

    corners.beginPath();
    corners.moveTo(-halfW, halfH - cornerSize);
    corners.lineTo(-halfW, halfH);
    corners.lineTo(-halfW + cornerSize, halfH);
    corners.strokePath();

    corners.beginPath();
    corners.moveTo(halfW - cornerSize, halfH);
    corners.lineTo(halfW, halfH);
    corners.lineTo(halfW + cornerSize, halfH);
    corners.strokePath();

    this.panel.add(corners);
  }

  private createHeader(halfW: number, halfH: number): void {
    if (!this.panel) return;

    const headerBg = this.scene.add.graphics();
    headerBg.fillStyle(0x1a1a1a, 0.8);
    headerBg.fillRect(-halfW + 15, -halfH + 15, this.PANEL_WIDTH - 30, 40);
    this.panel.add(headerBg);

    const accent = this.scene.add.text(-halfW + 25, -halfH + 35, '◆', {
      fontSize: '14px',
      color: '#ff6600',
    });
    accent.setOrigin(0, 0.5);
    this.panel.add(accent);

    const title = this.scene.add.text(-halfW + 45, -halfH + 35, 'SETTINGS', {
      fontSize: '18px',
      fontFamily: 'Cinzel, Georgia, serif',
      color: '#ffffff',
    });
    title.setOrigin(0, 0.5);
    this.panel.add(title);

    const closeBtn = this.scene.add.text(halfW - 25, -halfH + 35, '✕', {
      fontSize: '16px',
      fontFamily: 'Roboto Mono, Courier New, monospace',
      color: '#666666',
    });
    closeBtn.setOrigin(0.5, 0.5);
    closeBtn.setInteractive({ useHandCursor: true });
    closeBtn.on('pointerover', () => closeBtn.setColor('#ff4444'));
    closeBtn.on('pointerout', () => closeBtn.setColor('#666666'));
    closeBtn.on('pointerdown', () => this.hide());
    this.panel.add(closeBtn);
  }

  private createVolumeSection(halfW: number, halfH: number): void {
    if (!this.panel) return;

    const sectionY = -halfH + 75;

    const label = this.scene.add.text(-halfW + 25, sectionY, 'VOLUME', {
      fontSize: '12px',
      fontFamily: 'Cinzel, Georgia, serif',
      color: '#888888',
    });
    label.setOrigin(0, 0.5);
    this.panel.add(label);

    const divider = this.scene.add.graphics();
    divider.lineStyle(1, 0x333333, 0.8);
    divider.lineBetween(-halfW + 80, sectionY, halfW - 25, sectionY);
    this.panel.add(divider);

    this.sliders.master = this.createSlider(
      'Master',
      sectionY + 35,
      halfW,
      () => this.audioSystem?.getMasterVolume() ?? SettingsManager.getMasterVolume(),
      (value: number) => this.audioSystem?.setMasterVolume(value)
    );

    this.sliders.music = this.createSlider(
      'Music',
      sectionY + 70,
      halfW,
      () => this.audioSystem?.getMusicVolume() ?? SettingsManager.getMusicVolume(),
      (value: number) => this.audioSystem?.setMusicVolume(value)
    );

    this.sliders.sfx = this.createSlider(
      'SFX',
      sectionY + 105,
      halfW,
      () => this.audioSystem?.getSFXVolume() ?? SettingsManager.getSFXVolume(),
      (value: number) => {
        this.audioSystem?.setSFXVolume(value);
        this.audioSystem?.play('sfx_pickup', 0.5);
      }
    );
  }

  private readonly SLIDER_WIDTH = 120;
  private readonly TRACK_X = 0;

  private createSlider(
    label: string,
    y: number,
    halfW: number,
    getValue: () => number,
    setValue: (value: number) => void
  ): SliderData {
    if (!this.panel) throw new Error('Panel not initialized');

    const container = this.scene.add.container(0, y);
    const initialValue = getValue();

    const labelText = this.scene.add.text(-halfW + 25, 0, label, {
      fontSize: '13px',
      fontFamily: 'Roboto Mono, Courier New, monospace',
      color: '#cccccc',
    });
    labelText.setOrigin(0, 0.5);
    container.add(labelText);

    const track = this.scene.add.graphics();
    track.fillStyle(0x1a1a1a, 1);
    track.fillRoundedRect(this.TRACK_X, -4, this.SLIDER_WIDTH, 8, 2);
    track.lineStyle(1, 0x333333, 1);
    track.strokeRoundedRect(this.TRACK_X, -4, this.SLIDER_WIDTH, 8, 2);
    container.add(track);

    const fillWidth = Math.max(2, this.SLIDER_WIDTH * initialValue);
    const fill = this.scene.add.graphics();
    fill.fillStyle(0xff6600, 1);
    fill.fillRoundedRect(this.TRACK_X, -4, fillWidth, 8, 2);
    container.add(fill);

    const thumb = this.scene.add.ellipse(this.TRACK_X + this.SLIDER_WIDTH * initialValue, 0, 14, 14, 0xff6600);
    thumb.setStrokeStyle(2, 0xffffff);
    container.add(thumb);

    const valueText = this.scene.add.text(halfW - 30, 0, `${Math.round(initialValue * 100)}%`, {
      fontSize: '11px',
      fontFamily: 'Roboto Mono, Courier New, monospace',
      color: '#888888',
    });
    valueText.setOrigin(1, 0.5);
    container.add(valueText);

    const hitArea = this.scene.add.rectangle(this.TRACK_X + this.SLIDER_WIDTH / 2, 0, this.SLIDER_WIDTH + 20, 24, 0xffffff, 0);
    hitArea.setInteractive({ useHandCursor: true, draggable: true });
    container.add(hitArea);

    const sliderData: SliderData = {
      container,
      track,
      fill,
      thumb,
      valueText,
      getValue,
      setValue,
      value: initialValue,
    };

    hitArea.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const localX = pointer.x - (this.panel!.x + this.TRACK_X);
      const newValue = Phaser.Math.Clamp(localX / this.SLIDER_WIDTH, 0, 1);
      this.updateSlider(sliderData, newValue);
      setValue(newValue);
    });

    hitArea.on('drag', (pointer: Phaser.Input.Pointer) => {
      const localX = pointer.x - (this.panel!.x + this.TRACK_X);
      const newValue = Phaser.Math.Clamp(localX / this.SLIDER_WIDTH, 0, 1);
      this.updateSlider(sliderData, newValue);
      setValue(newValue);
    });

    this.panel.add(container);
    return sliderData;
  }

  private createControlsSection(halfW: number, halfH: number): void {
    if (!this.panel) return;

    const sectionY = -halfH + 210;

    const label = this.scene.add.text(-halfW + 25, sectionY, 'CONTROLS', {
      fontSize: '12px',
      fontFamily: 'Cinzel, Georgia, serif',
      color: '#888888',
    });
    label.setOrigin(0, 0.5);
    this.panel.add(label);

    const divider = this.scene.add.graphics();
    divider.lineStyle(1, 0x333333, 0.8);
    divider.lineBetween(-halfW + 100, sectionY, halfW - 25, sectionY);
    this.panel.add(divider);

    const controls = [
      ['WASD / Arrows', 'Move'],
      ['Left Click', 'Attack'],
      ['Space', 'Dodge'],
      ['E', 'Inventory'],
      ['L', 'Level Up'],
      ['ESC', 'Settings'],
    ];

    const startY = sectionY + 25;
    const rowHeight = 22;

    for (let i = 0; i < controls.length; i++) {
      const [key, action] = controls[i];
      const y = startY + i * rowHeight;

      const keyText = this.scene.add.text(-halfW + 30, y, key, {
        fontSize: '11px',
        fontFamily: 'Roboto Mono, Courier New, monospace',
        color: '#cccccc',
      });
      keyText.setOrigin(0, 0.5);
      this.panel.add(keyText);

      const actionText = this.scene.add.text(halfW - 30, y, action, {
        fontSize: '11px',
        fontFamily: 'Roboto Mono, Courier New, monospace',
        color: '#888888',
      });
      actionText.setOrigin(1, 0.5);
      this.panel.add(actionText);
    }
  }

  private createControlModeSection(halfW: number, halfH: number): void {
    if (!this.panel) return;

    const sectionY = -halfH + 345;

    const label = this.scene.add.text(-halfW + 25, sectionY, 'CONTROL MODE', {
      fontSize: '12px',
      fontFamily: 'Cinzel, Georgia, serif',
      color: '#888888',
    });
    label.setOrigin(0, 0.5);
    this.panel.add(label);

    const divider = this.scene.add.graphics();
    divider.lineStyle(1, 0x333333, 0.8);
    divider.lineBetween(-halfW + 120, sectionY, halfW - 25, sectionY);
    this.panel.add(divider);

    const btnW = 140;
    const btnH = 36;
    const gap = 20;
    const startX = -btnW / 2 - gap / 2;
    const btnY = sectionY + 30;

    const makeToggleBtn = (x: number, label: string, mode: 'pc' | 'mobile'): Phaser.GameObjects.Container => {
      const container = this.scene.add.container(x, btnY);

      const bg = this.scene.add.graphics();
      const isActive = this.controlMode === mode;
      bg.fillStyle(isActive ? 0xff6600 : 0x1a1a1a, isActive ? 0.9 : 0.8);
      bg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 4);
      bg.lineStyle(1, isActive ? 0xff4400 : 0x444444, isActive ? 0.9 : 0.6);
      bg.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 4);
      container.add(bg);

      const text = this.scene.add.text(0, 0, label, {
        fontSize: '13px',
        fontFamily: 'Cinzel, Georgia, serif',
        color: isActive ? '#ffffff' : '#888888',
      });
      text.setOrigin(0.5, 0.5);
      container.add(text);

      const hitArea = this.scene.add.rectangle(0, 0, btnW, btnH, 0xffffff, 0);
      hitArea.setInteractive({ useHandCursor: true });
      hitArea.on('pointerover', () => {
        if (this.controlMode !== mode) {
          bg.clear();
          bg.fillStyle(0x2a2a2a, 0.8);
          bg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 4);
          bg.lineStyle(1, 0x666666, 0.8);
          bg.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 4);
        }
      });
      hitArea.on('pointerout', () => {
        // Redraw in current state handled by click
      });
      hitArea.on('pointerdown', () => {
        if (this.controlMode === mode) return;
        this.controlMode = mode;
        SettingsManager.setControlMode(mode);
        this.onControlModeChange?.(mode);
        this.hide();
        this.show();
      });
      container.add(hitArea);

      return container;
    };

    const pcBtn = makeToggleBtn(startX, 'PC', 'pc');
    const mobileBtn = makeToggleBtn(startX + btnW + gap, 'MOBILE', 'mobile');

    this.panel.add(pcBtn);
    this.panel.add(mobileBtn);
  }

  private createServerSection(halfW: number, halfH: number): void {
    if (!this.panel) return;

    const sectionY = -halfH + 420;
    const label = this.scene.add.text(-halfW + 25, sectionY, 'CO-OP SERVER', {
      fontSize: '12px',
      fontFamily: 'Cinzel, Georgia, serif',
      color: '#888888',
    });
    label.setOrigin(0, 0.5);
    this.panel.add(label);

    const divider = this.scene.add.graphics();
    divider.lineStyle(1, 0x333333, 0.8);
    divider.lineBetween(-halfW + 120, sectionY, halfW - 25, sectionY);
    this.panel.add(divider);

    const currentUrl = SettingsManager.getServerUrl();
    const inputY = sectionY + 28;
    const inputW = halfW * 2 - 50;
    const inputH = 32;

    const inputBg = this.scene.add.rectangle(0, inputY, inputW, inputH, 0x1a1a1a, 0.9);
    inputBg.setStrokeStyle(1, 0x444444, 0.8);
    this.panel.add(inputBg);

    const urlText = this.scene.add.text(-inputW / 2 + 10, inputY, currentUrl || 'ws://localhost:3001 (auto)', {
      fontSize: '11px',
      fontFamily: 'Roboto Mono, Courier New, monospace',
      color: currentUrl ? '#ffcc00' : '#666666',
    });
    urlText.setOrigin(0, 0.5);
    urlText.setName('serverUrlText');
    this.panel.add(urlText);

    const editBtn = this.scene.add.text(inputW / 2 - 10, inputY, 'EDIT', {
      fontSize: '10px',
      fontFamily: 'Roboto Mono, Courier New, monospace',
      color: '#888888',
    });
    editBtn.setOrigin(1, 0.5);
    editBtn.setInteractive({ useHandCursor: true });
    editBtn.on('pointerover', () => editBtn.setColor('#ffffff'));
    editBtn.on('pointerout', () => editBtn.setColor('#888888'));
    editBtn.on('pointerdown', () => {
      const newUrl = prompt('Enter relay server URL:', currentUrl || 'ws://localhost:3001');
      if (newUrl !== null) {
        const trimmed = newUrl.trim();
        SettingsManager.setServerUrl(trimmed);
        NetworkManager.setServerUrl(trimmed);
        const display = trimmed || 'ws://localhost:3001 (auto)';
        const txt = this.panel?.getByName('serverUrlText') as Phaser.GameObjects.Text | undefined;
        if (txt) txt.setText(display);
      }
    });
    this.panel.add(editBtn);

    const btnY = inputY + 28;
    const btnW = 120;
    const btnH = 30;
    const gap = 16;
    const startX = -btnW - gap / 2;

    const makePresetBtn = (x: number, label: string, url: string): Phaser.GameObjects.Container => {
      const container = this.scene.add.container(x, btnY);
      const bg = this.scene.add.graphics();
      bg.fillStyle(0x1a1a2e, 0.9);
      bg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 4);
      bg.lineStyle(1, 0xff6600, 0.6);
      bg.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 4);
      container.add(bg);

      const text = this.scene.add.text(0, 0, label, {
        fontSize: '10px',
        fontFamily: 'Roboto Mono, Courier New, monospace',
        color: '#ffcc00',
      });
      text.setOrigin(0.5, 0.5);
      container.add(text);

      const hit = this.scene.add.rectangle(0, 0, btnW, btnH, 0xffffff, 0);
      hit.setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        SettingsManager.setServerUrl(url);
        NetworkManager.setServerUrl(url);
        const txt = this.panel?.getByName('serverUrlText') as Phaser.GameObjects.Text | undefined;
        if (txt) txt.setText(url);
      });
      container.add(hit);
      return container;
    };

    // PUBLIC = the relay bundled with this hosted site (same origin).
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const sameOrigin = isLocal ? 'ws://localhost:3001' : `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;

    const localBtn = makePresetBtn(startX, 'LOCAL', '');
    const publicBtn = makePresetBtn(startX + btnW + gap, 'PUBLIC', sameOrigin);

    // PRIVATE = your own relay. Prompt for the URL instead of a fixed value.
    const privateBtn = this.scene.add.container(startX + (btnW + gap) * 2, btnY);
    {
      const bg = this.scene.add.graphics();
      bg.fillStyle(0x1a1a2e, 0.9);
      bg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 4);
      bg.lineStyle(1, 0xff6600, 0.6);
      bg.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 4);
      privateBtn.add(bg);

      const text = this.scene.add.text(0, 0, 'PRIVATE', {
        fontSize: '10px',
        fontFamily: 'Roboto Mono, Courier New, monospace',
        color: '#ffcc00',
      });
      text.setOrigin(0.5, 0.5);
      privateBtn.add(text);

      const hit = this.scene.add.rectangle(0, 0, btnW, btnH, 0xffffff, 0);
      hit.setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        const current = SettingsManager.getServerUrl();
        const newUrl = prompt('Enter your PRIVATE relay URL (e.g. wss://my-server.com):', current || '');
        if (newUrl !== null) {
          const trimmed = newUrl.trim();
          SettingsManager.setServerUrl(trimmed);
          NetworkManager.setServerUrl(trimmed);
          const txt = this.panel?.getByName('serverUrlText') as Phaser.GameObjects.Text | undefined;
          if (txt) txt.setText(trimmed || 'ws://localhost:3001 (auto)');
        }
      });
      privateBtn.add(hit);
    }

    this.panel.add(localBtn);
    this.panel.add(publicBtn);
    this.panel.add(privateBtn);
  }

  private createControlGuideButton(halfH: number): void {
    if (!this.panel) return;

    const btnWidth = 200;
    const btnHeight = 34;
    const y = -halfH + 430;

    const container = this.scene.add.container(0, y);

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x1a1a2e, 0.9);
    bg.fillRoundedRect(-btnWidth / 2, -btnHeight / 2, btnWidth, btnHeight, 4);
    bg.lineStyle(1, 0xff6600, 0.7);
    bg.strokeRoundedRect(-btnWidth / 2, -btnHeight / 2, btnWidth, btnHeight, 4);
    container.add(bg);

    const text = this.scene.add.text(0, 0, '📖  CONTROL GUIDE', {
      fontSize: '12px',
      fontFamily: 'Cinzel, Georgia, serif',
      color: '#ffcc00',
    });
    text.setOrigin(0.5, 0.5);
    container.add(text);

    const hitArea = this.scene.add.rectangle(0, 0, btnWidth, btnHeight, 0xffffff, 0);
    hitArea.setInteractive({ useHandCursor: true });
    hitArea.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(0x2a1a3e, 0.9);
      bg.fillRoundedRect(-btnWidth / 2, -btnHeight / 2, btnWidth, btnHeight, 4);
      bg.lineStyle(1, 0xffaa00, 0.9);
      bg.strokeRoundedRect(-btnWidth / 2, -btnHeight / 2, btnWidth, btnHeight, 4);
    });
    hitArea.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(0x1a1a2e, 0.9);
      bg.fillRoundedRect(-btnWidth / 2, -btnHeight / 2, btnWidth, btnHeight, 4);
      bg.lineStyle(1, 0xff6600, 0.7);
      bg.strokeRoundedRect(-btnWidth / 2, -btnHeight / 2, btnWidth, btnHeight, 4);
    });
    hitArea.on('pointerdown', () => this.showControlGuide());
    container.add(hitArea);

    this.panel.add(container);
  }

  private showControlGuide(): void {
    const cam = this.scene.cameras.main;
    const cx = cam.scrollX + cam.width / 2;
    const cy = cam.scrollY + cam.height / 2;

    this.controlGuideOverlay = this.scene.add.rectangle(cx, cy, cam.width * 3, cam.height * 3, 0x000000, 0);
    this.controlGuideOverlay.setDepth(298);
    this.controlGuideOverlay.setInteractive();
    this.controlGuideOverlay.on('pointerdown', () => this.hideControlGuide());

    const panel = this.scene.add.container(cx, cy + cam.height);
    panel.setDepth(300);
    panel.setAlpha(0);
    this.controlGuidePanel = panel;

    const panelW = Math.min(600, cam.width - 40);
    const panelH = 380;
    const halfW = panelW / 2;
    const halfH = panelH / 2;

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x0a0a0a, 0.97);
    bg.fillRoundedRect(-halfW, -halfH, panelW, panelH, 8);
    bg.lineStyle(1, 0xff6600, 0.7);
    bg.strokeRoundedRect(-halfW, -halfH, panelW, panelH, 8);
    panel.add(bg);

    const headerBg = this.scene.add.graphics();
    headerBg.fillStyle(0x1a1a1a, 0.9);
    headerBg.fillRect(-halfW + 15, -halfH + 15, panelW - 30, 40);
    panel.add(headerBg);

    const accent = this.scene.add.text(-halfW + 25, -halfH + 35, '◆', {
      fontSize: '14px', color: '#ff6600',
    });
    accent.setOrigin(0, 0.5);
    panel.add(accent);

    const title = this.scene.add.text(-halfW + 45, -halfH + 35, 'CONTROL GUIDE', {
      fontSize: '16px', fontFamily: 'Cinzel, Georgia, serif', color: '#ffffff',
    });
    title.setOrigin(0, 0.5);
    panel.add(title);

    const closeBtn = this.scene.add.text(halfW - 25, -halfH + 35, '✕', {
      fontSize: '16px', fontFamily: 'Roboto Mono, Courier New, monospace', color: '#666666',
    });
    closeBtn.setOrigin(0.5, 0.5);
    closeBtn.setInteractive({ useHandCursor: true });
    closeBtn.on('pointerover', () => closeBtn.setColor('#ff4444'));
    closeBtn.on('pointerout', () => closeBtn.setColor('#666666'));
    closeBtn.on('pointerdown', () => this.hideControlGuide());
    panel.add(closeBtn);

    const colW = (panelW - 60) / 2;
    const colStartX = -halfW + 30;
    const colGap = colW + 30;

    const makeColTitle = (x: number, y: number, text: string) => {
      const t = this.scene.add.text(x, y, text, {
        fontSize: '13px', fontFamily: 'Cinzel, Georgia, serif', color: '#ff6600',
      });
      t.setOrigin(0, 0.5);
      panel.add(t);

      const div = this.scene.add.graphics();
      div.lineStyle(1, 0x333333, 0.8);
      div.lineBetween(x, y + 12, x + colW - 10, y + 12);
      panel.add(div);
    };

    makeColTitle(colStartX, -halfH + 70, 'PC');
    makeColTitle(colStartX + colGap, -halfH + 70, 'MOBILE');

    const pcControls: [string, string][] = [
      ['WASD / Arrows', 'Move'],
      ['Left Click', 'Attack'],
      ['Space', 'Dodge'],
      ['E', 'Inventory'],
      ['L', 'Level Up'],
      ['ESC', 'Settings'],
    ];

    const mobileControls: [string, string][] = [
      ['Joystick (left)', 'Move'],
      ['ATK Button', 'Attack'],
      ['DODGE Button', 'Dodge Roll'],
      ['BAG Button', 'Inventory'],
    ];

    const rowH = 26;
    const startY = -halfH + 100;

    const drawControls = (x: number, y: number, items: [string, string][]) => {
      items.forEach(([key, action], i) => {
        const rowY = y + i * rowH;
        const kt = this.scene.add.text(x, rowY, key, {
          fontSize: '11px', fontFamily: 'Roboto Mono, Courier New, monospace', color: '#cccccc',
        });
        kt.setOrigin(0, 0.5);
        panel.add(kt);

        const at = this.scene.add.text(x + colW - 10, rowY, action, {
          fontSize: '11px', fontFamily: 'Roboto Mono, Courier New, monospace', color: '#888888',
        });
        at.setOrigin(1, 0.5);
        panel.add(at);
      });
    };

    drawControls(colStartX, startY, pcControls);
    drawControls(colStartX + colGap, startY, mobileControls);

    const footer = this.scene.add.text(0, halfH - 25, 'Press ESC or click outside to close', {
      fontSize: '10px', fontFamily: 'Roboto Mono, Courier New, monospace', color: '#555555',
    });
    footer.setOrigin(0.5, 0.5);
    panel.add(footer);

    this.scene.tweens.add({
      targets: this.controlGuideOverlay,
      fillAlpha: 0.7,
      duration: 150,
      ease: 'Sine.easeOut',
    });
    this.scene.tweens.add({
      targets: panel,
      y: cy,
      alpha: 1,
      duration: 200,
      ease: 'Back.easeOut',
    });

    this.setupInput();
  }

  private hideControlGuide(): void {
    if (!this.controlGuidePanel) return;

    const cy = this.scene.cameras.main.scrollY + this.scene.cameras.main.height / 2;

    this.scene.tweens.add({
      targets: this.controlGuideOverlay,
      fillAlpha: 0,
      duration: 100,
      onComplete: () => {
        this.controlGuideOverlay?.destroy();
        this.controlGuideOverlay = null;
      },
    });
    this.scene.tweens.add({
      targets: this.controlGuidePanel,
      y: cy + 40,
      alpha: 0,
      duration: 150,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.controlGuidePanel?.destroy();
        this.controlGuidePanel = null;
      },
    });
  }

  private createResetButton(halfH: number): void {
    if (!this.panel) return;

    const btnWidth = 120;
    const btnHeight = 32;
    const y = -halfH + 480;

    const container = this.scene.add.container(0, y);

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x4a1a1a, 0.9);
    bg.fillRoundedRect(-btnWidth / 2, -btnHeight / 2, btnWidth, btnHeight, 4);
    bg.lineStyle(1, 0x884444, 0.6);
    bg.strokeRoundedRect(-btnWidth / 2, -btnHeight / 2, btnWidth, btnHeight, 4);
    container.add(bg);

    const corners = this.scene.add.graphics();
    corners.lineStyle(1, 0xff6600, 0.7);
    const cs = 6;
    const hw = btnWidth / 2;
    const hh = btnHeight / 2;
    corners.beginPath();
    corners.moveTo(-hw, -hh + cs);
    corners.lineTo(-hw, -hh);
    corners.lineTo(-hw + cs, -hh);
    corners.strokePath();
    corners.beginPath();
    corners.moveTo(hw - cs, -hh);
    corners.lineTo(hw, -hh);
    corners.lineTo(hw + cs, -hh);
    corners.strokePath();
    container.add(corners);

    const text = this.scene.add.text(0, 0, 'RESET', {
      fontSize: '12px',
      fontFamily: 'Roboto Mono, Courier New, monospace',
      color: '#ffffff',
    });
    text.setOrigin(0.5, 0.5);
    container.add(text);

    const hitArea = this.scene.add.rectangle(0, 0, btnWidth, btnHeight, 0xffffff, 0);
    hitArea.setInteractive({ useHandCursor: true });
    hitArea.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(0x5a2a2a, 0.9);
      bg.fillRoundedRect(-btnWidth / 2, -btnHeight / 2, btnWidth, btnHeight, 4);
      bg.lineStyle(1, 0xaa6666, 0.8);
      bg.strokeRoundedRect(-btnWidth / 2, -btnHeight / 2, btnWidth, btnHeight, 4);
    });
    hitArea.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(0x4a1a1a, 0.9);
      bg.fillRoundedRect(-btnWidth / 2, -btnHeight / 2, btnWidth, btnHeight, 4);
      bg.lineStyle(1, 0x884444, 0.6);
      bg.strokeRoundedRect(-btnWidth / 2, -btnHeight / 2, btnWidth, btnHeight, 4);
    });
    hitArea.on('pointerdown', () => this.resetDefaults());
    container.add(hitArea);

    this.panel.add(container);
  }

  private setupInput(): void {
    this.keyListener = (event: KeyboardEvent) => {
      if (!this.isVisible) return;

      if (event.code === 'Escape') {
        event.preventDefault();
        if (this.controlGuidePanel) {
          this.hideControlGuide();
        } else {
          this.hide();
        }
      }
    };

    this.scene.input.keyboard?.on('keydown', this.keyListener);
  }

  private resetDefaults(): void {
    SettingsManager.resetToDefaults();
    const defaults = SettingsManager.get();

    if (this.audioSystem) {
      this.audioSystem.setMasterVolume(defaults.masterVolume);
      this.audioSystem.setMusicVolume(defaults.musicVolume);
      this.audioSystem.setSFXVolume(defaults.sfxVolume);
    }

    SettingsManager.resetToDefaults();
    this.controlMode = SettingsManager.getControlMode();
    this.onControlModeChange?.(this.controlMode);

    this.updateSliderValues();
  }

  hide(): void {
    this.isVisible = false;

    if (this.keyListener) {
      this.scene.input.keyboard?.off('keydown', this.keyListener);
      this.keyListener = null;
    }

    if (this.controlGuidePanel) {
      this.controlGuidePanel.destroy();
      this.controlGuidePanel = null;
    }
    if (this.controlGuideOverlay) {
      this.controlGuideOverlay.destroy();
      this.controlGuideOverlay = null;
    }

    if (this.panel) {
      this.panel.destroy();
      this.panel = null;
    }
    if (this.overlay) {
      this.overlay.destroy();
      this.overlay = null;
    }

    this.sliders = { master: null, music: null, sfx: null };
  }

  toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  getIsVisible(): boolean {
    return this.isVisible;
  }

  destroy(): void {
    this.hide();
  }
}
