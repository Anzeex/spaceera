export function createLoop(render) {
  let frameId = null;

  function tick() {
    render();
    frameId = requestAnimationFrame(tick);
  }

  return {
    start() {
      if (frameId !== null) return;
      tick();
    },
    stop() {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
    }
  };
}