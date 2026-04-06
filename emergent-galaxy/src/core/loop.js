export function createLoop(render) {
  let frameId = null;
  let running = false;
  let dirty = false;

  function tick() {
    frameId = null;

    if (!running || !dirty) {
      return;
    }

    dirty = false;
    render();

    if (dirty && frameId === null) {
      frameId = requestAnimationFrame(tick);
    }
  }

  return {
    start() {
      if (running) return;
      running = true;
      dirty = true;
      frameId = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
    },
    invalidate() {
      dirty = true;
      if (running && frameId === null) {
        frameId = requestAnimationFrame(tick);
      }
    },
  };
}
