export function createCamera() {
  return {
    x: 0,
    y: 0,
    zoom: 0.35,
    minZoom: 0.05,
    maxZoom: 5,
  };
}

export function worldToScreen(camera, canvas, x, y) {
  return {
    x: (x - camera.x) * camera.zoom + canvas.width / 2,
    y: (y - camera.y) * camera.zoom + canvas.height / 2,
  };
}

export function screenToWorld(camera, canvas, x, y) {
  return {
    x: (x - canvas.width / 2) / camera.zoom + camera.x,
    y: (y - canvas.height / 2) / camera.zoom + camera.y,
  };
}