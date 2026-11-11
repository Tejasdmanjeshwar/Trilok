import { AimCursor } from "@trilok/input";
import { normalizedPointer } from "../combat/CombatHitVolumes";

export interface AimBrowserBindings {
  readonly active: () => boolean;
  readonly fire: () => void;
}
export class BrowserAimInput {
  private dragging: { id: number; x: number; y: number } | null = null;
  private readonly heldKeys = new Set<string>();
  private gamepadFirePrevious = false;
  private lastActive = false;

  constructor(readonly canvas: HTMLCanvasElement, readonly cursor: AimCursor,
    readonly bindings: AimBrowserBindings) {
    canvas.addEventListener("pointerdown", this.pointerDown);
    canvas.addEventListener("pointermove", this.pointerMove);
    canvas.addEventListener("pointerup", this.pointerUp);
    canvas.addEventListener("pointercancel", this.pointerUp);
    canvas.addEventListener("contextmenu", this.contextMenu);
    window.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);
    window.addEventListener("blur", this.blur);
    this.syncActive();
  }

  private readonly contextMenu = (event: MouseEvent): void => {
    if (this.bindings.active()) event.preventDefault();
  };
  private readonly keyDown = (event: KeyboardEvent): void => {
    if (!this.bindings.active()) return;
    if (event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement ||
        event.target instanceof HTMLTextAreaElement) return;
    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(event.code)) {
      this.heldKeys.add(event.code);
      event.preventDefault();
    }
  };
  private readonly keyUp = (event: KeyboardEvent): void => {
    this.heldKeys.delete(event.code);
  };
  private readonly blur = (): void => {
    this.heldKeys.clear();
    this.dragging = null;
    this.gamepadFirePrevious = false;
  };
  private readonly pointerDown = (event: PointerEvent): void => {
    if (!this.bindings.active()) return;
    if (event.pointerType === "touch" || event.pointerType === "pen") {
      // Drag anywhere on the actual canvas to move the reticle; tapping isn't
      // a shot. Mobile/pen users use the separate FIRE HUD control.
      if (!this.dragging) {
        this.dragging = {id:event.pointerId,x:event.clientX,y:event.clientY};
        this.canvas.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
    } else if (event.pointerType === "mouse" && event.button === 0) {
      this.moveMouse(event);
      event.preventDefault();
      this.bindings.fire();
    }
  };
  private moveMouse(event: PointerEvent): void {
    const point = normalizedPointer(this.canvas,event.clientX,event.clientY);
    if (point) this.cursor.absolute(point.x,point.y);
  }
  private readonly pointerMove = (event: PointerEvent): void => {
    if (!this.bindings.active()) return;
    if (this.dragging && event.pointerId === this.dragging.id) {
      const rect = this.canvas.getBoundingClientRect();
      this.cursor.relative(event.clientX-this.dragging.x,
        event.clientY-this.dragging.y,rect.width,rect.height,"touch");
      this.dragging.x=event.clientX;
      this.dragging.y=event.clientY;
      event.preventDefault();
    } else if (event.pointerType === "mouse") {
      this.moveMouse(event);
    }
  };
  private readonly pointerUp = (event: PointerEvent): void => {
    if (this.dragging?.id !== event.pointerId) return;
    this.dragging = null;
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
  };

  private syncActive(): void {
    const active=this.bindings.active();
    if (active === this.lastActive) return;
    this.lastActive=active;
    this.canvas.style.touchAction=active?"none":"";
    if (!active) this.blur();
  }

  update(deltaSeconds: number): void {
    this.syncActive();
    if (!this.bindings.active()) return;
    const horizontal=Number(this.heldKeys.has("ArrowRight"))-
      Number(this.heldKeys.has("ArrowLeft"));
    const vertical=Number(this.heldKeys.has("ArrowDown"))-
      Number(this.heldKeys.has("ArrowUp"));
    if (horizontal || vertical) this.cursor.axis(horizontal,vertical,deltaSeconds,"keyboard");
    // Web Gamepad API is optional; future native ports feed AimCursor.axis().
    const pads=typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
    const pad=Array.from(pads).find(item=>item?.connected);
    if (!pad) {this.gamepadFirePrevious=false;return;}
    this.cursor.axis(pad.axes[2]??0,pad.axes[3]??0,deltaSeconds,"gamepad");
    const fire=pad.buttons[7]?.pressed===true;
    if (fire && !this.gamepadFirePrevious) this.bindings.fire();
    this.gamepadFirePrevious=fire;
  }

  dispose(): void {
    this.canvas.removeEventListener("pointerdown",this.pointerDown);
    this.canvas.removeEventListener("pointermove",this.pointerMove);
    this.canvas.removeEventListener("pointerup",this.pointerUp);
    this.canvas.removeEventListener("pointercancel",this.pointerUp);
    this.canvas.removeEventListener("contextmenu",this.contextMenu);
    window.removeEventListener("keydown",this.keyDown);
    window.removeEventListener("keyup",this.keyUp);
    window.removeEventListener("blur",this.blur);
    this.canvas.style.touchAction="";
    this.blur();
  }
}
