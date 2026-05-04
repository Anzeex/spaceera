import { screenToWorld } from './camera.js';

export function attachCameraControls(state) {
  const { canvas, camera } = state;
  let wheelMovementTimeoutId = null;

  function setCameraMoving(isMoving) {
    if (state.isCameraMoving === isMoving) {
      return;
    }

    state.isCameraMoving = isMoving;
    state.onCameraMovementChanged?.(isMoving);
    state.invalidateRender?.();
  }

  function scheduleWheelMovementStop() {
    if (wheelMovementTimeoutId !== null) {
      clearTimeout(wheelMovementTimeoutId);
    }

    wheelMovementTimeoutId = window.setTimeout(() => {
      wheelMovementTimeoutId = null;
      if (!drag.active) {
        setCameraMoving(false);
      }
    }, 180);
  }

  const drag = {
    active: false,
    lastX: 0,
    lastY: 0,
    moved: false,
  };

  canvas.addEventListener('pointerdown', (e) => {
    drag.active = true;
    drag.moved = false;
    state.suppressCanvasClick = false;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    state.invalidateRender?.();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drag.active) return;

    const dx = e.clientX - drag.lastX;
    const dy = e.clientY - drag.lastY;

    const hasMeaningfulMovement = Math.abs(dx) > 1 || Math.abs(dy) > 1;
    if (!hasMeaningfulMovement) {
      return;
    }

    drag.moved = true;
    setCameraMoving(true);

    camera.x -= dx / camera.zoom;
    camera.y -= dy / camera.zoom;

    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    state.invalidateRender?.();
  });

  canvas.addEventListener('pointerup', (e) => {
    drag.active = false;
    state.suppressCanvasClick = drag.moved;
    setCameraMoving(false);
    canvas.releasePointerCapture(e.pointerId);
    state.invalidateRender?.();
  });

  canvas.addEventListener('pointercancel', () => {
    drag.active = false;
    state.suppressCanvasClick = false;
    setCameraMoving(false);
    state.invalidateRender?.();
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const before = screenToWorld(camera, canvas, mouseX, mouseY);

    const factor = Math.exp(-e.deltaY * 0.001);
    camera.zoom *= factor;
    camera.zoom = Math.max(camera.minZoom, Math.min(camera.maxZoom, camera.zoom));

    const after = screenToWorld(camera, canvas, mouseX, mouseY);

    camera.x += before.x - after.x;
    camera.y += before.y - after.y;
    setCameraMoving(true);
    scheduleWheelMovementStop();
    state.invalidateRender?.();
  }, { passive: false });
}
