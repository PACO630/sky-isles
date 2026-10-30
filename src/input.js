// Unified keyboard/mouse + touch input. Touch: left half = floating joystick, right half = camera.

export class Input {
  constructor(canvas, els) {
    this.moveX = 0;
    this.moveY = 0;
    this.jumpHeld = false;
    this.jumpPressed = false;
    this.interactPressed = false;
    this.sprint = false;
    this.lookX = 0;
    this.lookY = 0;
    this.zoom = 0;
    this.emote = -1;
    this.escape = false;
    this.keys = new Set();
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.enabled = true;

    this.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.look = { id: null, x: 0, y: 0 };
    this.mouseDrag = false;
    this.els = els;

    const typing = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    window.addEventListener('keydown', (e) => {
      if (typing(e) || !this.enabled) return;
      if (e.code === 'Space') {
        if (!this.keys.has('Space')) this.jumpPressed = true;
        e.preventDefault();
      }
      if (e.code === 'KeyE' || e.code === 'KeyF') this.interactPressed = true;
      if (/^Digit[1-4]$/.test(e.code)) this.emote = +e.code.slice(5) - 1;
      if (e.code === 'KeyJ') this.journal = true;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('keydown', (e) => e.code === 'Escape' && (this.escape = true));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => this._down(e, canvas));
    window.addEventListener('pointermove', (e) => this._move(e));
    window.addEventListener('pointerup', (e) => this._up(e));
    window.addEventListener('pointercancel', (e) => this._up(e));
    canvas.addEventListener('wheel', (e) => { this.zoom += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });

    const hold = (el, on, off) => {
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('down'); on(); });
      const release = () => { el.classList.remove('down'); off && off(); };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('pointerleave', release);
    };
    hold(els.jump, () => { this.jumpPressed = true; this.jumpHeld = true; this._touchJump = true; }, () => { this._touchJump = false; });
    hold(els.interact, () => { this.interactPressed = true; });
  }

  _down(e, canvas) {
    if (!this.enabled) return;
    if (e.pointerType === 'mouse') {
      this.mouseDrag = true;
      this.look.x = e.clientX;
      this.look.y = e.clientY;
      return;
    }
    canvas.setPointerCapture?.(e.pointerId);
    if (e.clientX < window.innerWidth * 0.45 && this.joy.id === null) {
      this.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
      this._showJoy(true);
    } else if (this.look.id === null) {
      this.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
    }
  }

  _move(e) {
    if (e.pointerType === 'mouse') {
      if (!this.mouseDrag) return;
      this.lookX += e.clientX - this.look.x;
      this.lookY += e.clientY - this.look.y;
      this.look.x = e.clientX;
      this.look.y = e.clientY;
      return;
    }
    if (e.pointerId === this.joy.id) {
      let dx = e.clientX - this.joy.ox, dy = e.clientY - this.joy.oy;
      const max = 55;
      const d = Math.hypot(dx, dy);
      if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
      this.joy.x = dx / max;
      this.joy.y = dy / max;
      this.els.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    } else if (e.pointerId === this.look.id) {
      this.lookX += (e.clientX - this.look.x) * 1.3;
      this.lookY += (e.clientY - this.look.y) * 1.3;
      this.look.x = e.clientX;
      this.look.y = e.clientY;
    }
  }

  _up(e) {
    if (e.pointerType === 'mouse') {
      this.mouseDrag = false;
      return;
    }
    if (e.pointerId === this.joy.id) {
      this.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
      this._showJoy(false);
    } else if (e.pointerId === this.look.id) {
      this.look.id = null;
    }
  }

  _showJoy(on) {
    const { joyBase, knob } = this.els;
    joyBase.classList.toggle('active', on);
    if (on) {
      joyBase.style.left = this.joy.ox + 'px';
      joyBase.style.top = this.joy.oy + 'px';
    }
    knob.style.transform = 'translate(0px, 0px)';
  }

  // call once per frame before reading
  poll() {
    const k = this.keys;
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    if (this.joy.id !== null) {
      x = this.joy.x;
      y = -this.joy.y;
      sprint = Math.hypot(x, y) > 0.92;
    }
    this.moveX = x;
    this.moveY = y;
    this.sprint = sprint;
    this.jumpHeld = k.has('Space') || !!this._touchJump;
  }

  endFrame() {
    this.jumpPressed = false;
    this.interactPressed = false;
    this.lookX = 0;
    this.lookY = 0;
    this.zoom = 0;
    this.emote = -1;
    this.escape = false;
    this.journal = false;
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) {
      this.keys.clear();
      this.mouseDrag = false;
    }
  }
}
