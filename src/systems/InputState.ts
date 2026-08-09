/**
 * Unified input state shared by keyboard (desktop) and touch (mobile) controls.
 * Both write into this singleton; the Player and GameScene read from it.
 */
class InputStateClass {
  // Movement vector in range [-1, 1] for each axis (already normalized).
  public moveX = 0;
  public moveY = 0;

  // Edge-triggered intents. Producers set them true; consumers read+reset.
  public attackQueued = false; // a discrete "fire" request
  public dodgeQueued = false; // a discrete "dodge" request
  public inventoryToggleQueued = false; // a discrete "toggle inventory" request

  // Held movement direction from the virtual joystick (radians), or undefined.
  public aimAngle?: number;

  // True while a finger is on the touch UI (joystick / buttons). Used to
  // suppress scene-level pointer attacks so tapping a button does not also shoot.
  public uiActive = false;

  // Override point used by MobileControls: when set, this is the desired
  // movement vector from the joystick, replacing keyboard movement.
  public joystickActive = false;
  public joystickX = 0;
  public joystickY = 0;

  queueAttack(): void {
    this.attackQueued = true;
  }

  consumeAttack(): boolean {
    if (this.attackQueued) {
      this.attackQueued = false;
      return true;
    }
    return false;
  }

  queueDodge(): void {
    this.dodgeQueued = true;
  }

  consumeDodge(): boolean {
    if (this.dodgeQueued) {
      this.dodgeQueued = false;
      return true;
    }
    return false;
  }

  queueInventoryToggle(): void {
    this.inventoryToggleQueued = true;
  }

  consumeInventoryToggle(): boolean {
    if (this.inventoryToggleQueued) {
      this.inventoryToggleQueued = false;
      return true;
    }
    return false;
  }

  /** Apply keyboard movement into the shared move vector. */
  setKeyboardMove(x: number, y: number): void {
    if (this.joystickActive) return; // touch overrides keyboard
    this.moveX = x;
    this.moveY = y;
  }

  /** Apply joystick movement into the shared move vector. */
  setJoystick(x: number, y: number): void {
    if (x === 0 && y === 0) {
      this.joystickActive = false;
      this.joystickX = 0;
      this.joystickY = 0;
      this.aimAngle = undefined;
      return;
    }
    this.joystickActive = true;
    this.joystickX = x;
    this.joystickY = y;
    this.moveX = x;
    this.moveY = y;
    this.aimAngle = Math.atan2(y, x);
  }

  reset(): void {
    this.moveX = 0;
    this.moveY = 0;
    this.attackQueued = false;
    this.dodgeQueued = false;
    this.inventoryToggleQueued = false;
    this.uiActive = false;
    this.joystickActive = false;
    this.joystickX = 0;
    this.joystickY = 0;
    this.aimAngle = undefined;
  }
}

export const InputState = new InputStateClass();

/** Returns true when the device is primarily touch-driven (phones/tablets). */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'ontouchstart' in window ||
    (navigator.maxTouchPoints ?? 0) > 0 ||
    window.matchMedia?.('(pointer: coarse)').matches
  );
}
