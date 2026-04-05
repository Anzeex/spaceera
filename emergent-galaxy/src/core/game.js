import { createCamera, screenToWorld } from '../camera/camera.js';
import { attachCameraControls } from '../camera/controls.js';
import { generateGalaxy } from '../galaxy/galaxyGenerator.js';
import { createRenderer } from '../render/renderer.js';
import { createSelection } from '../interaction/selection.js';
import { createLoop } from './loop.js';

const GALAXY_SEED_STORAGE_KEY = 'emergent-galaxy.seed';
const GALAXY_STATE_STORAGE_KEY_PREFIX = 'emergent-galaxy.state.';

function generateGalaxySeed() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `seed-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getPersistentGalaxySeed() {
  const existingSeed = globalThis.localStorage?.getItem(GALAXY_SEED_STORAGE_KEY);
  if (existingSeed) {
    return existingSeed;
  }

  const newSeed = generateGalaxySeed();
  globalThis.localStorage?.setItem(GALAXY_SEED_STORAGE_KEY, newSeed);
  return newSeed;
}

function resetPersistentGalaxySeed() {
  const newSeed = generateGalaxySeed();
  globalThis.localStorage?.setItem(GALAXY_SEED_STORAGE_KEY, newSeed);
  return newSeed;
}

function getGalaxyStateStorageKey(seed) {
  return `${GALAXY_STATE_STORAGE_KEY_PREFIX}${seed}`;
}

function captureBaselineState(galaxy) {
  const baselineStars = new Map();

  for (const star of galaxy.stars) {
    baselineStars.set(star.id, {
      owner: star.owner,
      faction: star.faction ?? null,
      population: star.population,
      gdp: star.gdp,
      systemDefense: star.systemDefense,
      explored: star.explored,
      richness: star.richness,
      danger: star.danger,
      planets: star.planets.map((planet) => ({
        id: planet.id,
        population: planet.population,
        gdp: planet.gdp,
        infrastructure: { ...planet.infrastructure },
      })),
    });
  }

  return {
    stars: baselineStars,
  };
}

function serializeGameState(state, baselineState) {
  const starOverrides = {};

  for (const star of state.galaxy.stars) {
    const baselineStar = baselineState.stars.get(star.id);
    if (!baselineStar) continue;

    const starDiff = {};

    if (star.owner !== baselineStar.owner) {
      starDiff.owner = star.owner;
    }

    if ((star.faction ?? null) !== baselineStar.faction) {
      starDiff.faction = star.faction ?? null;
    }

    if (star.population !== baselineStar.population) {
      starDiff.population = star.population;
    }

    if (star.gdp !== baselineStar.gdp) {
      starDiff.gdp = star.gdp;
    }

    if (star.systemDefense !== baselineStar.systemDefense) {
      starDiff.systemDefense = star.systemDefense;
    }

    if (star.explored !== baselineStar.explored) {
      starDiff.explored = star.explored;
    }

    if (star.richness !== baselineStar.richness) {
      starDiff.richness = star.richness;
    }

    if (star.danger !== baselineStar.danger) {
      starDiff.danger = star.danger;
    }

    const planetOverrides = {};
    for (const planet of star.planets) {
      const baselinePlanet = baselineStar.planets.find((entry) => entry.id === planet.id);
      if (!baselinePlanet) continue;

      const planetDiff = {};
      if (planet.population !== baselinePlanet.population) {
        planetDiff.population = planet.population;
      }

      if (planet.gdp !== baselinePlanet.gdp) {
        planetDiff.gdp = planet.gdp;
      }

      const infrastructureDiff = {};
      for (const [key, value] of Object.entries(planet.infrastructure)) {
        if (baselinePlanet.infrastructure[key] !== value) {
          infrastructureDiff[key] = value;
        }
      }

      if (Object.keys(infrastructureDiff).length > 0) {
        planetDiff.infrastructure = infrastructureDiff;
      }

      if (Object.keys(planetDiff).length > 0) {
        planetOverrides[planet.id] = planetDiff;
      }
    }

    if (Object.keys(planetOverrides).length > 0) {
      starDiff.planets = planetOverrides;
    }

    if (Object.keys(starDiff).length > 0) {
      starOverrides[star.id] = starDiff;
    }
  }

  return {
    territories: Array.from(state.territories.values()).map((territory) => ({
      id: territory.id,
      name: territory.name,
      color: territory.color,
      faction: territory.faction,
      stars: Array.from(territory.stars),
    })),
    currentTerritoryId: state.currentTerritoryId,
    starOverrides,
  };
}

function applyStoredState(state, storedState) {
  if (!storedState) return;

  state.territories = new Map(
    (storedState.territories || []).map((territory) => [
      territory.id,
      {
        ...territory,
        stars: new Set(territory.stars || []),
      },
    ])
  );

  state.currentTerritoryId = storedState.currentTerritoryId || null;

  for (const star of state.galaxy.stars) {
    const override = storedState.starOverrides?.[star.id];
    if (!override) continue;

    if ('owner' in override) star.owner = override.owner;
    if ('faction' in override) star.faction = override.faction;
    if ('population' in override) star.population = override.population;
    if ('gdp' in override) star.gdp = override.gdp;
    if ('systemDefense' in override) star.systemDefense = override.systemDefense;
    if ('explored' in override) star.explored = override.explored;
    if ('richness' in override) star.richness = override.richness;
    if ('danger' in override) star.danger = override.danger;

    if (override.planets) {
      for (const planet of star.planets) {
        const planetOverride = override.planets[planet.id];
        if (!planetOverride) continue;

        if ('population' in planetOverride) planet.population = planetOverride.population;
        if ('gdp' in planetOverride) planet.gdp = planetOverride.gdp;
        if (planetOverride.infrastructure) {
          Object.assign(planet.infrastructure, planetOverride.infrastructure);
        }
      }
    }
  }
}

function loadStoredState(seed) {
  const raw = globalThis.localStorage?.getItem(getGalaxyStateStorageKey(seed));
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveStoredState(seed, serializedState) {
  globalThis.localStorage?.setItem(
    getGalaxyStateStorageKey(seed),
    JSON.stringify(serializedState)
  );
}

export function createGame(container, galaxyOptions = {}) {
  const persistentSeed = galaxyOptions.seed ?? getPersistentGalaxySeed();
  const resolvedGalaxyOptions = {
    ...galaxyOptions,
    seed: persistentSeed,
  };

  const canvas = document.createElement('canvas');
  container.appendChild(canvas);

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

  // Territory name input
  const territoryNameInput = document.createElement('input');
  territoryNameInput.type = 'text';
  territoryNameInput.placeholder = 'Territory Name';
  territoryNameInput.style.padding = '6px';
  territoryNameInput.style.background = 'rgba(0,0,0,0.8)';
  territoryNameInput.style.color = 'white';
  territoryNameInput.style.border = '1px solid white';
  territoryNameInput.style.borderRadius = '4px';
  territoryNameInput.style.marginBottom = '8px';
  territoryNameInput.style.display = 'none';
  uiContainer.appendChild(territoryNameInput);

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

  const seedLabel = document.createElement('div');
  seedLabel.style.color = 'rgba(255,255,255,0.75)';
  seedLabel.style.fontSize = '12px';
  seedLabel.style.marginBottom = '8px';
  settingsPanel.appendChild(seedLabel);

  const resetGalaxyButton = document.createElement('button');
  resetGalaxyButton.textContent = 'Reset Galaxy';
  resetGalaxyButton.style.padding = '8px 12px';
  resetGalaxyButton.style.background = 'rgba(120,20,20,0.9)';
  resetGalaxyButton.style.color = 'white';
  resetGalaxyButton.style.border = '1px solid rgba(255,255,255,0.35)';
  resetGalaxyButton.style.borderRadius = '4px';
  resetGalaxyButton.style.cursor = 'pointer';
  resetGalaxyButton.style.width = '100%';
  settingsPanel.appendChild(resetGalaxyButton);

  settingsButton.addEventListener('click', () => {
    settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none';
  });

  const state = {
    canvas,
    ctx: canvas.getContext('2d'),
    camera: createCamera(),
    galaxySeed: persistentSeed,
    galaxy: generateGalaxy(resolvedGalaxyOptions),
    selection: createSelection(),
    territoryMode: false,
    territories: new Map(),
    currentTerritoryId: null,
    showLines: true,
  };
  const baselineState = captureBaselineState(state.galaxy);

  function persistGameState() {
    saveStoredState(
      state.galaxySeed,
      serializeGameState(state, baselineState)
    );
  }

  applyStoredState(state, loadStoredState(state.galaxySeed));

  seedLabel.textContent = `Galaxy Seed: ${state.galaxySeed}`;

  linesCheckbox.addEventListener('change', () => {
    state.showLines = linesCheckbox.checked;
  });

  resetGalaxyButton.addEventListener('click', () => {
    globalThis.localStorage?.removeItem(getGalaxyStateStorageKey(state.galaxySeed));
    resetPersistentGalaxySeed();
    window.location.reload();
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

  function findTerritoryByStarId(starId) {
    for (const [territoryId, territory] of state.territories.entries()) {
      if (territory.stars.has(starId)) {
        return { territoryId, territory };
      }
    }

    return null;
  }

  updateTerritorySelector();

  territoryButton.addEventListener('click', () => {
    state.territoryMode = !state.territoryMode;
    territoryButton.textContent = state.territoryMode ? 'Territory Mode: ON' : 'Territory Mode: OFF';
    territoryButton.style.background = state.territoryMode ? 'rgba(255,100,100,0.8)' : 'rgba(0,0,0,0.8)';
    territorySelector.style.display = state.territoryMode ? 'block' : 'none';
    addTerritoryButton.style.display = state.territoryMode ? 'block' : 'none';
    colorPicker.style.display = state.territoryMode ? 'block' : 'none';
    territoryNameInput.style.display = state.territoryMode ? 'block' : 'none';
  });

  addTerritoryButton.addEventListener('click', () => {
    const color = colorPicker.value || colors[nextColorIndex % colors.length];
    nextColorIndex++;
    const name = territoryNameInput.value.trim() || `Territory ${state.territories.size + 1}`;
    const territoryId = `territory-${Date.now()}`;
    state.territories.set(territoryId, {
      id: territoryId,
      name,
      color,
      faction: name,
      stars: new Set(),
    });
    territoryNameInput.value = '';
    updateTerritorySelector();
    persistGameState();
  });

  territorySelector.addEventListener('change', (e) => {
    state.currentTerritoryId = e.target.value;
    persistGameState();
  });

  const renderer = createRenderer(state);

  canvas.addEventListener('click', (event) => {
    const rect = canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;

    if (renderer.handleCanvasClick(screenX, screenY)) {
      return;
    }

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
          const occupiedTerritory = findTerritoryByStarId(closest.id);
          const territory = state.territories.get(state.currentTerritoryId);

          if (occupiedTerritory) {
            occupiedTerritory.territory.stars.delete(closest.id);
            closest.faction = 'Unclaimed';
            closest.owner = 'Unclaimed';
            updateTerritorySelector();
            persistGameState();
          } else if (territory) {
              territory.stars.add(closest.id);
              closest.faction = territory.faction;
              closest.owner = territory.faction;
            persistGameState();
            updateTerritorySelector();
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
  window.addEventListener('beforeunload', persistGameState);
  const loop = createLoop(() => renderer.render());

  return {
    start() {
      renderer.resize();
      loop.start();
      window.addEventListener('resize', renderer.resize);
    }
  };
}
