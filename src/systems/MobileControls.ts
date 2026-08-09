import Phaser from 'phaser';
import { InputState } from './InputState';

/**
 * On-screen touch controls for mobile: a fixed virtual joystick (left) and
 * three action buttons (right) — Attack, Dodge, Inventory. All elements use
 * scrollFactor(0) / setScrollFactor(0) so they stay pinned to the screen
 * regardless of camera movement, and sit on a very high depth.
 */
export class MobileControls {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;

  // Joystick
  private joystickBaseX = 0;
  private joystickBaseY = 0;
  private joystickBaseRadius = 60;
  private joystickKnobRadius = 28;
  private joystickGraphics!: Phaser.GameObjects.Graphics;
  private joystickPointerId: number | null = null;

  // Buttons
  private btnTexts: Phaser.GameObjects.Text[] = [];

  private onInventoryToggle: () => void;

  constructor(scene: Phaser.Scene, onInventoryToggle: () => void) {
    this.scene = scene;
    this.onInventoryToggle = onInventoryToggle;
    this.container = scene.add.container(0, 0).setDepth(1000).setScrollFactor(0);
    this.layout();
    this.createJoystick();
    this.createButtons();
  }

  private layout(): void {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    this.joystickBaseRadius = Math.max(50, Math.min(70, w * 0.11));
    this.joystickKnobRadius = this.joystickBaseRadius * 0.45;
    this.joystickBaseX = this.joystickBaseRadius + w * 0.04;
    this.joystickBaseY = h - this.joystickBaseRadius - h * 0.06;
  }

  private createJoystick(): void {
    const g = this.scene.add.graphics().setScrollFactor(0).setDepth(1000);
    this.joystickGraphics = g;
    this.drawJoystick(0, 0);
    this.container.add(g);

    const hit = this.scene.add
      .circle(this.joystickBaseX, this.joystickBaseY, this.joystickBaseRadius * 1.6, 0x000000, 0.001)
      .setScrollFactor(0)
      .setDepth(999)
      .setInteractive({ useHandCursor: false });

    hit.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.joystickPointerId !== null) return;
      this.joystickPointerId = pointer.id;
      InputState.uiActive = true;
      this.updateJoystick(pointer);
    });
    hit.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.joystickPointerId !== pointer.id) return;
      this.updateJoystick(pointer);
    });
    const release = (pointer: Phaser.Input.Pointer) => {
      if (this.joystickPointerId !== pointer.id) return;
      this.joystickPointerId = null;
      InputState.uiActive = false;
      InputState.setJoystick(0, 0);
      this.drawJoystick(0, 0);
    };
    hit.on('pointerup', release);
    hit.on('pointerupoutside', release);
    this.container.add(hit);
  }

  private updateJoystick(pointer: Phaser.Input.Pointer): void {
    const dx = pointer.x - this.joystickBaseX;
    const dy = pointer.y - this.joystickBaseY;
    const dist = Math.hypot(dx, dy);
    const max = this.joystickBaseRadius;
    let nx = dx;
    let ny = dy;
    if (dist > max) {
      nx = (dx / dist) * max;
      ny = (dy / dist) * max;
    }
    this.drawJoystick(nx, ny);
    const norm = dist > 0 ? { x: nx / max, y: ny / max } : { x: 0, y: 0 };
    InputState.setJoystick(
      Math.abs(norm.x) < 0.15 ? 0 : norm.x,
      Math.abs(norm.y) < 0.15 ? 0 : norm.y
    );
  }

  private drawJoystick(knobX: number, knobY: number): void {
    const g = this.joystickGraphics;
    g.clear();
    // Base ring
    g.lineStyle(3, 0xff6a00, 0.5);
    g.strokeCircle(this.joystickBaseX, this.joystickBaseY, this.joystickBaseRadius);
    g.fillStyle(0x000000, 0.25);
    g.fillCircle(this.joystickBaseX, this.joystickBaseY, this.joystickBaseRadius);
    // Knob
    g.fillStyle(0xff8844, 0.85);
    g.fillCircle(
      this.joystickBaseX + knobX,
      this.joystickBaseY + knobY,
      this.joystickKnobRadius
    );
    g.lineStyle(2, 0xffffff, 0.4);
    g.strokeCircle(
      this.joystickBaseX + knobX,
      this.joystickBaseY + knobY,
      this.joystickKnobRadius
    );
  }

  private createButtons(): void {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const marginX = w * 0.05;
    const marginBottom = h * 0.07;
    const spacing = Math.max(70, w * 0.13);
    const invY = h - marginBottom - spacing;
    const dodgeY = h - marginBottom;
    const atkY = h - marginBottom - spacing * 0.5;
    const atkX = w - marginX - spacing * 0.5;
    const dodgeX = w - marginX - spacing * 0.5 - spacing * 0.2;
    const invX = w - marginX;

    this.makeButton(atkX, atkY, 38, 0xff4400, 'ATK', () =>
      InputState.queueAttack()
    );
    this.makeButton(dodgeX, dodgeY, 32, 0x3aa0ff, 'DODGE', () =>
      InputState.queueDodge()
    );
    this.makeButton(invX, invY, 30, 0x9b6bff, 'BAG', () => {
      InputState.queueInventoryToggle();
      this.onInventoryToggle();
    });
  }

  setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }

  private makeButton(
    x: number,
    y: number,
    radius: number,
    color: number,
    label: string,
    onTap: () => void
  ): Phaser.GameObjects.Arc {
    const circle = this.scene.add
      .circle(x, y, radius, color, 0.35)
      .setScrollFactor(0)
      .setDepth(1001)
      .setStrokeStyle(2, color, 0.9)
      .setInteractive({ useHandCursor: false });

    const text = this.scene.add
      .text(x, y, label, {
        fontSize: `${Math.round(radius * 0.55)}px`,
        fontFamily: 'Roboto Mono, Courier New, monospace',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1002);

    this.btnTexts.push(text);
    this.container.add([circle, text]);

    circle.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      InputState.uiActive = true;
      circle.setFillStyle(color, 0.7);
      circle.setScale(0.92);
      onTap();
      // Release the uiActive flag shortly after (buttons are tap, not hold)
      this.scene.time.delayedCall(120, () => {
        if (this.joystickPointerId === null) InputState.uiActive = false;
        circle.setFillStyle(color, 0.35);
        circle.setScale(1);
      });
      void pointer;
    });

    return circle;
  }

  /** Recompute layout on resize / orientation change. */
  relayout(): void {
    this.container.removeAll(true);
    this.btnTexts = [];
    this.layout();
    this.createJoystick();
    this.createButtons();
  }

  destroy(): void {
    this.container.destroy(true);
  }
}
