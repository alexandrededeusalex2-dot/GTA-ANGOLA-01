/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { InputAxisState } from '../core/types';

/**
 * Unified Keyboard + Android Touch Input Hub.
 * Handles edge-triggered actions, virtual thumbstick axes, and focus-loss
 * key release hygiene so keys never stick across browser tab switches.
 */
export class InputManager {
  private keysHeld = new Set<string>();
  private touchMoveX = 0;
  private touchMoveY = 0;
  private lookDeltaX = 0;
  private lookDeltaY = 0;
  private sprintTouch = false;
  private interactQueued = false;
  private resetViewQueued = false;
  private attached = false;

  onTogglePause?: () => void;
  onToggleMute?: () => void;
  onToggleInspector?: () => void;
  onToggleCameraMode?: () => void;
  onStartFromTitle?: () => void;

  attach(): void {
    if (this.attached) return;
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.attached = true;
  }

  detach(): void {
    if (!this.attached) return;
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.keysHeld.clear();
    this.attached = false;
  }

  setTouchStick(x: number, y: number): void {
    this.touchMoveX = Math.max(-1, Math.min(1, x));
    this.touchMoveY = Math.max(-1, Math.min(1, y));
  }

  setTouchSprint(active: boolean): void {
    this.sprintTouch = active;
  }

  addLookDelta(dx: number, dy: number): void {
    this.lookDeltaX += dx;
    this.lookDeltaY += dy;
  }

  queueInteract(): void {
    this.interactQueued = true;
  }

  queueResetView(): void {
    this.resetViewQueued = true;
  }

  clearHeld(): void {
    this.keysHeld.clear();
    this.touchMoveX = 0;
    this.touchMoveY = 0;
    this.sprintTouch = false;
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
  }

  consumeFrameState(): InputAxisState {
    let kbX = 0;
    let kbY = 0;
    if (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft')) kbX -= 1;
    if (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight')) kbX += 1;
    if (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp')) kbY += 1;
    if (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown')) kbY -= 1;

    const moveX = Math.abs(this.touchMoveX) > 0.05 ? this.touchMoveX : kbX;
    const moveY = Math.abs(this.touchMoveY) > 0.05 ? this.touchMoveY : kbY;

    const state: InputAxisState = {
      moveX,
      moveY,
      lookDeltaX: this.lookDeltaX,
      lookDeltaY: this.lookDeltaY,
      sprint:
        this.sprintTouch ||
        this.keysHeld.has('ShiftLeft') ||
        this.keysHeld.has('ShiftRight'),
      interactPressed: this.interactQueued,
      resetViewPressed: this.resetViewQueued,
    };

    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.interactQueued = false;
    this.resetViewQueued = false;
    return state;
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return;

    const currentState = document.body.dataset.state;
    if (currentState === 'title' && (event.code === 'Enter' || event.code === 'Space')) {
      event.preventDefault();
      this.onStartFromTitle?.();
      return;
    }

    if (event.code === 'Escape' || event.code === 'KeyP') {
      this.onTogglePause?.();
      return;
    }

    if (event.code === 'KeyM') {
      this.onToggleMute?.();
      return;
    }

    if (event.code === 'KeyI') {
      this.onToggleInspector?.();
      return;
    }

    if (event.code === 'KeyV') {
      this.onToggleCameraMode?.();
      return;
    }

    if (event.code === 'KeyR') {
      this.resetViewQueued = true;
      return;
    }

    if (event.code === 'KeyE') {
      this.interactQueued = true;
      return;
    }

    this.keysHeld.add(event.code);
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    this.keysHeld.delete(event.code);
  };

  private handleWindowBlur = (): void => {
    this.clearHeld();
  };

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.clearHeld();
    }
  };
}
