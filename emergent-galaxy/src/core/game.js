import { createCamera, screenToWorld } from '../camera/camera.js';
import { attachCameraControls } from '../camera/controls.js';
import { generateGalaxy } from '../galaxy/galaxyGenerator.js';
import { createRenderer } from '../render/renderer.js';
import { createInfoPanel } from '../ui/infoPanel.js';
import { createSelection } from '../interaction/selection.js';
import { createLoop } from './loop.js';

export function createGame(container, galaxyOptions = {}) {
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);

  const infoPanel = createInfoPanel(container);

  // Territory mode button
  const territoryButton = document.createElement('button');
  territoryButton.textContent = 'Territory Mode';
  territoryButton.style.position = 'absolute';
  territoryButton.style.top = '10px';
  territoryButton.style.left = '10px';
  territoryButton.style.zIndex = '10';
  territoryButton.style.padding = '8px 12px';
  territoryButton.style.background = 'rgba(0,0,0,0.8)';
  territoryButton.style.color = 'white';
  territoryButton.style.border = '1px solid white';
  territoryButton.style.borderRadius = '4px';
  territoryButton.style.cursor = 'pointer';
  container.appendChild(territoryButton);

  const state = {
    canvas,
    ctx: canvas.getContext('2d'),
    camera: createCamera(),
    galaxy: generateGalaxy(galaxyOptions),
    selection: createSelection(),
    territoryMode: false,
    ownedStars: new Set(),
  };

  territoryButton.addEventListener('click', () => {
    state.territoryMode = !state.territoryMode;
    territoryButton.textContent = state.territoryMode ? 'Exit Territory Mode' : 'Territory Mode';
    territoryButton.style.background = state.territoryMode ? 'rgba(255,100,100,0.8)' : 'rgba(0,0,0,0.8)';
  });

  const renderer = createRenderer(state, infoPanel);

  canvas.addEventListener('click', (event) => {
    const rect = canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    const worldPoint = screenToWorld(state.camera, { width: rect.width, height: rect.height }, screenX, screenY);

    let closest = null;
    let closestDistSq = Infinity;

    for (const star of state.galaxy.stars) {
      const dx = star.x - worldPoint.x;
      const dy = star.y - worldPoint.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < closestDistSq) {
        closest = star;
        closestDistSq = distSq;
      }
    }

    if (closest) {
      const maybeScreen = {
        x: (closest.x - state.camera.x) * state.camera.zoom + rect.width / 2,
        y: (closest.y - state.camera.y) * state.camera.zoom + rect.height / 2,
      };
      const pxDx = maybeScreen.x - screenX;
      const pxDy = maybeScreen.y - screenY;
      const pxDistSq = pxDx * pxDx + pxDy * pxDy;
      const pickRadius = 12;

      if (pxDistSq <= pickRadius * pickRadius) {
        if (state.territoryMode) {
          state.ownedStars.add(closest.id);
        } else {
          state.selection.selectedStarId = closest.id;
        }
      }
    } else {
      if (!state.territoryMode) {
        state.selection.selectedStarId = null;
      }
    }
  });

  attachCameraControls(state);
  const loop = createLoop(() => renderer.render());

  return {
    start() {
      renderer.resize();
      loop.start();
      window.addEventListener('resize', renderer.resize);
    }
  };
}