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

  // Create UI container
  const uiContainer = document.createElement('div');
  uiContainer.style.position = 'absolute';
  uiContainer.style.top = '10px';
  uiContainer.style.left = '10px';
  uiContainer.style.zIndex = '10';
  container.appendChild(uiContainer);

  // Territory mode button
  const territoryButton = document.createElement('button');
  territoryButton.textContent = 'Territory Mode: OFF';
  territoryButton.style.padding = '8px 12px';
  territoryButton.style.background = 'rgba(0,0,0,0.8)';
  territoryButton.style.color = 'white';
  territoryButton.style.border = '1px solid white';
  territoryButton.style.borderRadius = '4px';
  territoryButton.style.cursor = 'pointer';
  territoryButton.style.marginBottom = '8px';
  territoryButton.style.display = 'block';
  uiContainer.appendChild(territoryButton);

  // Territory selector
  const territorySelector = document.createElement('select');
  territorySelector.style.padding = '6px';
  territorySelector.style.background = 'rgba(0,0,0,0.8)';
  territorySelector.style.color = 'white';
  territorySelector.style.border = '1px solid white';
  territorySelector.style.borderRadius = '4px';
  territorySelector.style.marginBottom = '8px';
  territorySelector.style.display = 'none';
  uiContainer.appendChild(territorySelector);

  // Add territory button
  const addTerritoryButton = document.createElement('button');
  addTerritoryButton.textContent = '+ New Territory';
  addTerritoryButton.style.padding = '6px 10px';
  addTerritoryButton.style.background = 'rgba(0,0,0,0.8)';
  addTerritoryButton.style.color = 'white';
  addTerritoryButton.style.border = '1px solid white';
  addTerritoryButton.style.borderRadius = '4px';
  addTerritoryButton.style.cursor = 'pointer';
  addTerritoryButton.style.marginBottom = '8px';
  addTerritoryButton.style.display = 'none';
  addTerritoryButton.style.marginRight = '8px';
  uiContainer.appendChild(addTerritoryButton);

  // Color picker
  const colorPicker = document.createElement('input');
  colorPicker.type = 'color';
  colorPicker.style.width = '40px';
  colorPicker.style.height = '30px';
  colorPicker.style.cursor = 'pointer';
  colorPicker.style.marginBottom = '8px';
  colorPicker.style.display = 'none';
  colorPicker.style.border = '1px solid white';
  uiContainer.appendChild(colorPicker);

  const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7', '#a29bfe'];
  let nextColorIndex = 0;

  // Create settings container (top right)
  const settingsContainer = document.createElement('div');
  settingsContainer.style.position = 'absolute';
  settingsContainer.style.top = '10px';
  settingsContainer.style.right = '10px';
  settingsContainer.style.zIndex = '10';
  container.appendChild(settingsContainer);

  // Settings button
  const settingsButton = document.createElement('button');
  settingsButton.textContent = '⚙️ Settings';
  settingsButton.style.padding = '8px 12px';
  settingsButton.style.background = 'rgba(0,0,0,0.8)';
  settingsButton.style.color = 'white';
  settingsButton.style.border = '1px solid white';
  settingsButton.style.borderRadius = '4px';
  settingsButton.style.cursor = 'pointer';
  settingsButton.style.marginBottom = '8px';
  settingsButton.style.display = 'block';
  settingsContainer.appendChild(settingsButton);

  // Settings panel
  const settingsPanel = document.createElement('div');
  settingsPanel.style.background = 'rgba(0,0,0,0.9)';
  settingsPanel.style.border = '1px solid white';
  settingsPanel.style.borderRadius = '4px';
  settingsPanel.style.padding = '12px';
  settingsPanel.style.minWidth = '150px';
  settingsPanel.style.display = 'none';
  settingsPanel.style.marginBottom = '8px';
  settingsContainer.appendChild(settingsPanel);

  // Lines toggle
  const linesLabel = document.createElement('label');
  linesLabel.style.display = 'block';
  linesLabel.style.color = 'white';
  linesLabel.style.marginBottom = '8px';
  linesLabel.style.cursor = 'pointer';
  
  const linesCheckbox = document.createElement('input');
  linesCheckbox.type = 'checkbox';
  linesCheckbox.checked = true;
  linesCheckbox.style.marginRight = '6px';
  
  linesLabel.appendChild(linesCheckbox);
  linesLabel.appendChild(document.createTextNode('Show Lines'));
  settingsPanel.appendChild(linesLabel);

  settingsButton.addEventListener('click', () => {
    settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none';
  });

  const state = {
    canvas,
    ctx: canvas.getContext('2d'),
    camera: createCamera(),
    galaxy: generateGalaxy(galaxyOptions),
    selection: createSelection(),
    territoryMode: false,
    territories: new Map(),
    currentTerritoryId: null,
    showLines: true,
  };

  linesCheckbox.addEventListener('change', () => {
    state.showLines = linesCheckbox.checked;
  });

  function updateTerritorySelector() {
    territorySelector.innerHTML = '';
    for (const [id, territory] of state.territories.entries()) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = `${territory.name} (${territory.stars.size})`;
      option.style.backgroundColor = territory.color;
      territorySelector.appendChild(option);
    }
    if (state.currentTerritoryId && !territorySelector.querySelector(`[value="${state.currentTerritoryId}"]`)) {
      state.currentTerritoryId = null;
    }
    if (state.territories.size > 0 && !state.currentTerritoryId) {
      const firstId = state.territories.keys().next().value;
      state.currentTerritoryId = firstId;
    }
    if (state.currentTerritoryId) {
      territorySelector.value = state.currentTerritoryId;
    }
  }

  territoryButton.addEventListener('click', () => {
    state.territoryMode = !state.territoryMode;
    territoryButton.textContent = state.territoryMode ? 'Territory Mode: ON' : 'Territory Mode: OFF';
    territoryButton.style.background = state.territoryMode ? 'rgba(255,100,100,0.8)' : 'rgba(0,0,0,0.8)';
    territorySelector.style.display = state.territoryMode ? 'block' : 'none';
    addTerritoryButton.style.display = state.territoryMode ? 'block' : 'none';
    colorPicker.style.display = state.territoryMode ? 'block' : 'none';
  });

  addTerritoryButton.addEventListener('click', () => {
    const color = colorPicker.value || colors[nextColorIndex % colors.length];
    nextColorIndex++;
    const territoryId = `territory-${Date.now()}`;
    state.territories.set(territoryId, {
      id: territoryId,
      name: `Territory ${state.territories.size + 1}`,
      color,
      stars: new Set(),
    });
    updateTerritorySelector();
  });

  territorySelector.addEventListener('change', (e) => {
    state.currentTerritoryId = e.target.value;
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
        if (state.territoryMode && state.currentTerritoryId) {
          const territory = state.territories.get(state.currentTerritoryId);
          if (territory) {
            territory.stars.add(closest.id);
          }
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

  canvas.addEventListener('mousemove', (event) => {
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
      const hoverRadius = 50; // Larger radius for hover detection

      if (pxDistSq <= hoverRadius * hoverRadius) {
        state.selection.hoveredStarId = closest.id;
      } else {
        state.selection.hoveredStarId = null;
      }
    } else {
      state.selection.hoveredStarId = null;
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