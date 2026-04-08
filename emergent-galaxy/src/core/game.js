import { createCamera, screenToWorld } from '../camera/camera.js';
import { attachCameraControls } from '../camera/controls.js';
import { generateGalaxy } from '../galaxy/galaxyGenerator.js';
import { createRenderer } from '../render/renderer.js';
import { createSelection } from '../interaction/selection.js';
import { captureBaselineState } from './galaxyState.js';
import { createLoop } from './loop.js';
import { MULTIPLAYER_GALAXY_SEED } from './multiplayerConfig.js';
import { createMultiplayerSync } from './multiplayerSync.js';
import { createSpatialGrid } from '../utils/spatialGrid.js';

const RESOURCE_DISPLAY = [
  { key: 'Credits', icon: '$', color: '#fbbf24' },
  { key: 'Metals', icon: '⚙', color: '#a8b5c7' },
  { key: 'Gas', icon: '☁', color: '#7dd3fc' },
  { key: 'Food', icon: '🌿', color: '#86efac' },
  { key: 'Rare Earth Elements', icon: '✦', color: '#c4b5fd' },
  { key: 'Uranium', icon: '☢', color: '#bef264' },
  { key: 'Water', icon: '💧', color: '#60a5fa' },
];
const RESOURCE_KEYS = RESOURCE_DISPLAY.map((resource) => resource.key);
const RESOURCE_INFRASTRUCTURE_MAP = {
  Food: 'farming',
  Water: 'waterExtraction',
  Gas: 'gasExtraction',
};
const RESOURCE_UPDATE_INTERVALS_MS = {
  hour: 60 * 60 * 1000,
  minute: 60 * 1000,
};
const SYSTEM_POOL_CAPACITY = 500;
const RESOURCE_STORAGE_WEIGHTS = {
  Credits: 0,
  Metals: 1,
  Gas: 1,
  Food: 1,
  Water: 1,
  'Rare Earth Elements': 2,
  Uranium: 3,
};

function createEmptyResources() {
  return Object.fromEntries(RESOURCE_KEYS.map((resource) => [resource, 0]));
}

function getLocalPeriodProductionForPlanet(planet) {
  const production = createEmptyResources();

  for (const resource of planet.prominentResources ?? []) {
    const infrastructureKey =
      RESOURCE_INFRASTRUCTURE_MAP[resource.name] ??
      (['Metals', 'Rare Earth Elements', 'Uranium'].includes(resource.name)
        ? 'mining'
        : null);

    if (!infrastructureKey) {
      continue;
    }

    const infrastructureLevel = planet.infrastructure?.[infrastructureKey] ?? 0;
    if (infrastructureLevel <= 0 || resource.abundance <= 0) {
      continue;
    }

    production[resource.name] += infrastructureLevel;
  }

  return production;
}

function sumResources(target, source) {
  for (const resource of RESOURCE_KEYS) {
    target[resource] = (target[resource] ?? 0) + (source[resource] ?? 0);
  }

  return target;
}

function cloneResources(source = {}) {
  return {
    ...createEmptyResources(),
    ...source,
  };
}

function createEmptySystemPool() {
  return {
    resources: createEmptyResources(),
  };
}

function cloneSystemPools(systemPools = {}, ownedStarIds = null) {
  const nextSystemPools = {};
  const starIds = ownedStarIds ? Array.from(ownedStarIds) : Object.keys(systemPools);

  for (const starId of starIds) {
    nextSystemPools[starId] = {
      resources: cloneResources(systemPools?.[starId]?.resources ?? systemPools?.[starId]),
    };
  }

  return nextSystemPools;
}

function getSystemPoolUsedCapacity(poolEntry) {
  const resources = poolEntry?.resources ?? createEmptyResources();
  return RESOURCE_KEYS.reduce(
    (sum, resource) => sum + (resources[resource] ?? 0) * (RESOURCE_STORAGE_WEIGHTS[resource] ?? 1),
    0
  );
}

function addResourcesToSystemPool(poolEntry, production) {
  const nextResources = cloneResources(poolEntry.resources);
  const acceptedProduction = createEmptyResources();
  let usedCapacity = getSystemPoolUsedCapacity({ resources: nextResources });

  for (const resource of RESOURCE_KEYS) {
    const amount = production[resource] ?? 0;
    if (amount <= 0) {
      continue;
    }

    const weight = RESOURCE_STORAGE_WEIGHTS[resource] ?? 1;
    if (weight <= 0) {
      nextResources[resource] += amount;
      acceptedProduction[resource] += amount;
      continue;
    }

    const remainingCapacity = Math.max(0, SYSTEM_POOL_CAPACITY - usedCapacity);
    if (remainingCapacity < weight) {
      continue;
    }

    const acceptedAmount = Math.min(amount, Math.floor(remainingCapacity / weight));
    if (acceptedAmount <= 0) {
      continue;
    }

    nextResources[resource] += acceptedAmount;
    acceptedProduction[resource] += acceptedAmount;
    usedCapacity += acceptedAmount * weight;
  }

  poolEntry.resources = nextResources;
  return acceptedProduction;
}

function getLocalPeriodProductionForStar(star) {
  const production = createEmptyResources();

  for (const planet of star.planets ?? []) {
    sumResources(production, getLocalPeriodProductionForPlanet(planet));
  }

  return production;
}

export function createGame(container, galaxyOptions = {}) {
  const persistentSeed = galaxyOptions.seed ?? MULTIPLAYER_GALAXY_SEED;
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

  const resourceTopBar = document.createElement('div');
  resourceTopBar.style.position = 'absolute';
  resourceTopBar.style.top = '10px';
  resourceTopBar.style.left = '50%';
  resourceTopBar.style.transform = 'translateX(-50%)';
  resourceTopBar.style.zIndex = '10';
  resourceTopBar.style.display = 'flex';
  resourceTopBar.style.flexWrap = 'wrap';
  resourceTopBar.style.justifyContent = 'center';
  resourceTopBar.style.gap = '8px';
  resourceTopBar.style.maxWidth = 'min(720px, calc(100vw - 32px))';
  container.appendChild(resourceTopBar);

  const resourceBadgeAmounts = new Map();
  const resourceBadgeProduction = new Map();
  for (const resource of RESOURCE_DISPLAY) {
    const badge = document.createElement('div');
    badge.style.position = 'relative';
    badge.style.display = 'flex';
    badge.style.alignItems = 'center';
    badge.style.gap = '8px';
    badge.style.padding = '6px 10px';
    badge.style.background = 'rgba(0,0,0,0.78)';
    badge.style.border = '1px solid rgba(255,255,255,0.24)';
    badge.style.borderRadius = '999px';
    badge.style.color = 'white';
    badge.style.fontSize = '12px';
    badge.style.lineHeight = '1';

    const icon = document.createElement('span');
    icon.textContent = resource.icon;
    icon.style.display = 'inline-flex';
    icon.style.alignItems = 'center';
    icon.style.justifyContent = 'center';
    icon.style.width = '18px';
    icon.style.height = '18px';
    icon.style.borderRadius = '999px';
    icon.style.background = resource.color;
    icon.style.color = '#03111f';
    icon.style.fontSize = '11px';
    icon.style.fontWeight = '700';
    icon.style.boxShadow = `0 0 12px ${resource.color}55`;

    const amount = document.createElement('span');
    amount.textContent = '0';
    amount.style.fontVariantNumeric = 'tabular-nums';
    amount.style.minWidth = '18px';

    const tooltip = document.createElement('div');
    tooltip.style.position = 'absolute';
    tooltip.style.top = 'calc(100% + 10px)';
    tooltip.style.left = '50%';
    tooltip.style.transform = 'translateX(-50%)';
    tooltip.style.minWidth = '150px';
    tooltip.style.padding = '10px 12px';
    tooltip.style.background = 'rgba(3, 11, 20, 0.96)';
    tooltip.style.border = `1px solid ${resource.color}`;
    tooltip.style.borderRadius = '10px';
    tooltip.style.boxShadow = '0 12px 28px rgba(0,0,0,0.35)';
    tooltip.style.display = 'none';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.zIndex = '20';
    tooltip.style.lineHeight = '1.35';
    tooltip.style.whiteSpace = 'nowrap';

    const tooltipTitle = document.createElement('div');
    tooltipTitle.textContent = resource.key;
    tooltipTitle.style.color = resource.color;
    tooltipTitle.style.fontSize = '12px';
    tooltipTitle.style.fontWeight = '700';
    tooltipTitle.style.marginBottom = '6px';

    const tooltipProduction = document.createElement('div');
    tooltipProduction.textContent = 'Production: 0/min';
    tooltipProduction.style.fontSize = '11px';
    tooltipProduction.style.color = 'rgba(255,255,255,0.9)';
    tooltipProduction.style.marginBottom = '4px';

    const tooltipPrice = document.createElement('div');
    tooltipPrice.textContent = 'Price: 10';
    tooltipPrice.style.fontSize = '11px';
    tooltipPrice.style.color = 'rgba(255,255,255,0.7)';

    tooltip.appendChild(tooltipTitle);
    tooltip.appendChild(tooltipProduction);
    tooltip.appendChild(tooltipPrice);

    badge.addEventListener('mouseenter', () => {
      tooltip.style.display = 'block';
    });
    badge.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
    });

    badge.appendChild(icon);
    badge.appendChild(amount);
    badge.appendChild(tooltip);
    resourceTopBar.appendChild(badge);
    resourceBadgeAmounts.set(resource.key, amount);
    resourceBadgeProduction.set(resource.key, tooltipProduction);
  }

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

  const resourcePanel = document.createElement('div');
  resourcePanel.style.padding = '8px 10px';
  resourcePanel.style.background = 'rgba(0,0,0,0.8)';
  resourcePanel.style.color = 'white';
  resourcePanel.style.border = '1px solid white';
  resourcePanel.style.borderRadius = '4px';
  resourcePanel.style.marginTop = '8px';
  resourcePanel.style.maxWidth = '280px';
  resourcePanel.style.fontSize = '12px';
  resourcePanel.style.display = 'none';
  resourcePanel.textContent = 'No player resources loaded yet.';
  uiContainer.appendChild(resourcePanel);

  const performancePanel = document.createElement('div');
  performancePanel.style.position = 'absolute';
  performancePanel.style.right = '10px';
  performancePanel.style.bottom = '10px';
  performancePanel.style.width = '240px';
  performancePanel.style.padding = '8px';
  performancePanel.style.background = 'rgba(0,0,0,0.82)';
  performancePanel.style.color = 'white';
  performancePanel.style.border = '1px solid rgba(255,255,255,0.35)';
  performancePanel.style.borderRadius = '6px';
  performancePanel.style.display = 'none';
  performancePanel.style.zIndex = '10';
  container.appendChild(performancePanel);

  const performanceTitle = document.createElement('div');
  performanceTitle.style.fontSize = '12px';
  performanceTitle.style.marginBottom = '6px';
  performanceTitle.textContent = 'Performance';
  performancePanel.appendChild(performanceTitle);

  const performanceStats = document.createElement('div');
  performanceStats.style.fontSize = '11px';
  performanceStats.style.marginBottom = '6px';
  performanceStats.textContent = 'FPS: -- | Frame: -- ms | Load: --';
  performancePanel.appendChild(performanceStats);

  const performanceCanvas = document.createElement('canvas');
  performanceCanvas.width = 224;
  performanceCanvas.height = 72;
  performanceCanvas.style.width = '224px';
  performanceCanvas.style.height = '72px';
  performanceCanvas.style.display = 'block';
  performancePanel.appendChild(performanceCanvas);

  const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7', '#a29bfe'];
  let nextColorIndex = 0;
  let localResourceTickIntervalId = null;

  // Create settings container (top right)
  const settingsContainer = document.createElement('div');
  settingsContainer.style.position = 'absolute';
  settingsContainer.style.bottom = '10px';
  settingsContainer.style.left = '10px';
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

  const resourceDebugLabel = document.createElement('label');
  resourceDebugLabel.style.display = 'block';
  resourceDebugLabel.style.color = 'white';
  resourceDebugLabel.style.marginBottom = '8px';
  resourceDebugLabel.style.cursor = 'pointer';

  const resourceDebugCheckbox = document.createElement('input');
  resourceDebugCheckbox.type = 'checkbox';
  resourceDebugCheckbox.checked = false;
  resourceDebugCheckbox.style.marginRight = '6px';

  resourceDebugLabel.appendChild(resourceDebugCheckbox);
  resourceDebugLabel.appendChild(document.createTextNode('Show Resource Debug'));
  settingsPanel.appendChild(resourceDebugLabel);

  const performanceGraphLabel = document.createElement('label');
  performanceGraphLabel.style.display = 'block';
  performanceGraphLabel.style.color = 'white';
  performanceGraphLabel.style.marginBottom = '8px';
  performanceGraphLabel.style.cursor = 'pointer';

  const performanceGraphCheckbox = document.createElement('input');
  performanceGraphCheckbox.type = 'checkbox';
  performanceGraphCheckbox.checked = false;
  performanceGraphCheckbox.style.marginRight = '6px';

  performanceGraphLabel.appendChild(performanceGraphCheckbox);
  performanceGraphLabel.appendChild(document.createTextNode('Show Performance Graph'));
  settingsPanel.appendChild(performanceGraphLabel);

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
  resetGalaxyButton.style.marginBottom = '8px';
  settingsPanel.appendChild(resetGalaxyButton);

  const clearDatabaseButton = document.createElement('button');
  clearDatabaseButton.textContent = 'Clear Database';
  clearDatabaseButton.style.padding = '8px 12px';
  clearDatabaseButton.style.background = 'rgba(90,45,10,0.9)';
  clearDatabaseButton.style.color = 'white';
  clearDatabaseButton.style.border = '1px solid rgba(255,255,255,0.35)';
  clearDatabaseButton.style.borderRadius = '4px';
  clearDatabaseButton.style.cursor = 'pointer';
  clearDatabaseButton.style.width = '100%';
  settingsPanel.appendChild(clearDatabaseButton);

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
    showResourceDebug: false,
    showPerformanceGraph: false,
    playerState: null,
    performanceHistory: [],
    lastFrameTimestamp: null,
    performanceGraphFrameId: null,
    hasPendingInfrastructureChanges: false,
    onInfrastructureChanged: null,
    onSaveInfrastructureChanges: null,
    onCollectStarResources: null,
    invalidateRender: () => {},
  };
  const baselineState = captureBaselineState(state.galaxy);
  state.starSpatialIndex = createSpatialGrid(state.galaxy.stars, { cellSize: 400 });

  seedLabel.textContent = `Galaxy Seed: ${state.galaxySeed}`;

  linesCheckbox.addEventListener('change', () => {
    state.showLines = linesCheckbox.checked;
    state.invalidateRender();
  });

  resourceDebugCheckbox.addEventListener('change', () => {
    state.showResourceDebug = resourceDebugCheckbox.checked;
    renderPlayerResources();
    state.invalidateRender();
  });

  performanceGraphCheckbox.addEventListener('change', () => {
    state.showPerformanceGraph = performanceGraphCheckbox.checked;
    performancePanel.style.display = state.showPerformanceGraph ? 'block' : 'none';
    if (state.showPerformanceGraph) {
      startPerformanceGraphLoop();
    } else {
      stopPerformanceGraphLoop();
    }
    state.invalidateRender();
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

  function handleStateApplied() {
    updateTerritorySelector();
    state.hasPendingInfrastructureChanges = false;
  }

  const sync = createMultiplayerSync({
    state,
    baselineState,
    onStateApplied: handleStateApplied,
  });

  function formatSwedishDateTime(isoString) {
    if (!isoString) {
      return 'Unknown';
    }

    const parsedDate = new Date(isoString);
    if (Number.isNaN(parsedDate.getTime())) {
      return isoString;
    }

    return new Intl.DateTimeFormat('sv-SE', {
      dateStyle: 'short',
      timeStyle: 'medium',
      timeZone: 'Europe/Stockholm',
    }).format(parsedDate);
  }

  function renderTopResourceBar() {
    const resources = state.playerState?.resources ?? {};
    const production = state.playerState?.hourlyProduction ?? {};
    const periodLabel = state.playerState?.resourceUpdateInterval === 'hour' ? 'h' : 'min';
    for (const resource of RESOURCE_DISPLAY) {
      const amountNode = resourceBadgeAmounts.get(resource.key);
      const productionNode = resourceBadgeProduction.get(resource.key);
      if (!amountNode) {
        continue;
      }

      amountNode.textContent = String(resources[resource.key] ?? 0);
      amountNode.style.opacity = state.playerState ? '1' : '0.65';
      if (productionNode) {
        productionNode.textContent = `Production: ${production[resource.key] ?? 0}/${periodLabel}`;
      }
    }
  }

  function getPlayerIntervalMs(playerState) {
    return RESOURCE_UPDATE_INTERVALS_MS[playerState?.resourceUpdateInterval] ?? RESOURCE_UPDATE_INTERVALS_MS.minute;
  }

  function getOwnedStarsForCurrentTerritory() {
    if (!state.currentTerritoryId) {
      return [];
    }

    const territory = state.territories.get(state.currentTerritoryId);
    const ownedStarIds = territory?.stars ?? new Set();
    return state.galaxy.stars.filter((star) => ownedStarIds.has(star.id));
  }

  function calculateLocalPeriodProductionFromPools(systemPools, ownedStars) {
    const periodProduction = createEmptyResources();

    for (const star of ownedStars) {
      const poolEntry = systemPools[star.id] ?? createEmptySystemPool();
      sumResources(
        periodProduction,
        addResourcesToSystemPool(
          { resources: cloneResources(poolEntry.resources) },
          getLocalPeriodProductionForStar(star)
        )
      );
    }

    return periodProduction;
  }

  function settleLocalSystemPools(nowMs = Date.now()) {
    if (!state.playerState || !state.currentTerritoryId) {
      return false;
    }

    const ownedStars = getOwnedStarsForCurrentTerritory();
    const ownedStarIds = new Set(ownedStars.map((star) => star.id));
    const intervalMs = getPlayerIntervalMs(state.playerState);
    const lastResourceUpdateMs = Date.parse(state.playerState.lastResourceUpdate);
    if (!Number.isFinite(lastResourceUpdateMs)) {
      return false;
    }

    const completedIntervals =
      Math.floor(nowMs / intervalMs) - Math.floor(lastResourceUpdateMs / intervalMs);

    if (completedIntervals <= 0) {
      return false;
    }

    const systemPools = cloneSystemPools(state.playerState.systemPools, ownedStarIds);
    for (let intervalIndex = 0; intervalIndex < completedIntervals; intervalIndex++) {
      for (const star of ownedStars) {
        const poolEntry = systemPools[star.id] ?? createEmptySystemPool();
        systemPools[star.id] = poolEntry;
        addResourcesToSystemPool(poolEntry, getLocalPeriodProductionForStar(star));
      }
    }

    state.playerState = {
      ...state.playerState,
      systemPools,
      systemPoolCapacity: SYSTEM_POOL_CAPACITY,
      hourlyProduction: calculateLocalPeriodProductionFromPools(systemPools, ownedStars),
      completedHours: (state.playerState.completedHours ?? 0) + completedIntervals,
      lastResourceUpdate: new Date(Math.floor(nowMs / intervalMs) * intervalMs).toISOString(),
    };

    return true;
  }

  function updateLocalPlayerProduction() {
    if (!state.playerState || !state.currentTerritoryId) {
      return;
    }

    const ownedStars = getOwnedStarsForCurrentTerritory();
    const ownedStarIds = new Set(ownedStars.map((star) => star.id));
    const systemPools = cloneSystemPools(state.playerState.systemPools, ownedStarIds);
    const periodProduction = calculateLocalPeriodProductionFromPools(systemPools, ownedStars);

    state.playerState = {
      ...state.playerState,
      systemPools,
      systemPoolCapacity: SYSTEM_POOL_CAPACITY,
      hourlyProduction: periodProduction,
    };
  }

  function collectLocalStarSystemPool(starId) {
    if (!state.playerState || !state.currentTerritoryId) {
      return false;
    }

    const ownedStars = getOwnedStarsForCurrentTerritory();
    if (!ownedStars.some((star) => star.id === starId)) {
      return false;
    }

    const ownedStarIds = new Set(ownedStars.map((star) => star.id));
    const systemPools = cloneSystemPools(state.playerState.systemPools, ownedStarIds);
    const poolEntry = systemPools[starId] ?? createEmptySystemPool();
    const nextResources = cloneResources(state.playerState.resources);
    sumResources(nextResources, poolEntry.resources);
    systemPools[starId] = createEmptySystemPool();

    state.playerState = {
      ...state.playerState,
      resources: nextResources,
      systemPools,
      systemPoolCapacity: SYSTEM_POOL_CAPACITY,
      hourlyProduction: calculateLocalPeriodProductionFromPools(systemPools, ownedStars),
    };

    return true;
  }

  function renderPlayerResources() {
    settleLocalSystemPools();
    renderTopResourceBar();
    resourcePanel.style.display = state.showResourceDebug ? 'block' : 'none';
    if (!state.showResourceDebug) {
      return;
    }

    const playerState = state.playerState;
    if (!playerState) {
      resourcePanel.textContent = sync.isLocalServerUnavailable()
        ? 'Resource server offline. Start `npm run dev:server` for authoritative resource production.'
        : 'No player resources loaded yet.';
      return;
    }

    const activeTerritory = state.territories.get(state.currentTerritoryId);
    const ownedStarCount = activeTerritory?.stars?.size ?? 0;
    const updateInterval = playerState.resourceUpdateInterval === 'minute' ? 'min' : 'h';
    const resourceLines = Object.entries(playerState.resources || {})
      .map(([resourceName, amount]) => `${resourceName}: ${amount}`)
      .join(' | ');
    const periodLines = Object.entries(playerState.hourlyProduction || {})
      .filter(([, amount]) => amount > 0)
      .map(([resourceName, amount]) => `${resourceName}: ${amount}/${updateInterval}`)
      .join(' | ');
    const productionStatus = ownedStarCount === 0
      ? 'No owned stars'
      : periodLines || 'No production infrastructure';

    resourcePanel.innerHTML = `
      <strong>${playerState.playerName || playerState.playerId}</strong><br>
      Owned stars: ${ownedStarCount}<br>
      Resources: ${resourceLines || 'None'}<br>
      Production (/${updateInterval}): ${productionStatus}<br>
      Completed ${updateInterval} ticks: ${playerState.completedHours ?? 0}<br>
      Last update: ${formatSwedishDateTime(playerState.lastResourceUpdate)}
    `;
  }

  function drawPerformanceGraph() {
    if (!state.showPerformanceGraph) {
      return;
    }

    const ctx = performanceCanvas.getContext('2d');
    const { width, height } = performanceCanvas;
    const samples = state.performanceHistory;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#081018';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    for (const y of [16, 33, 50]) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    if (!samples.length) {
      performanceStats.textContent = 'FPS: -- | Frame: -- ms | Load: --';
      return;
    }

    const latest = samples[samples.length - 1];
    const smoothedSamples = samples.map((sample) => {
      const windowSamples = getRecentPerformanceSamples(sample.timestamp);
      const averageFrameMs =
        windowSamples.reduce((sum, item) => sum + item.frameMs, 0) / windowSamples.length;
      const averageRenderMs =
        windowSamples.reduce((sum, item) => sum + item.renderMs, 0) / windowSamples.length;

      return {
        ...sample,
        frameMs: averageFrameMs,
        renderMs: averageRenderMs,
      };
    });
    const recentSmoothedSamples = smoothedSamples.filter((sample) => {
      const ageMs = latest.timestamp - sample.timestamp;
      return ageMs >= 0 && ageMs <= 1000;
    });
    const statsSamples = recentSmoothedSamples.length ? recentSmoothedSamples : smoothedSamples;
    const averageFrameMs =
      statsSamples.reduce((sum, sample) => sum + sample.frameMs, 0) / statsSamples.length;
    const averageFps = averageFrameMs > 0 ? 1000 / averageFrameMs : 0;
    const averageRenderMs =
      statsSamples.reduce((sum, sample) => sum + sample.renderMs, 0) / statsSamples.length;
    const loadRatio = averageFrameMs > 0 ? averageRenderMs / averageFrameMs : 0;
    const loadPercent = Math.max(0, Math.min(loadRatio * 100, 999));

    performanceStats.textContent =
      `FPS: ${averageFps.toFixed(1)} | Frame: ${averageFrameMs.toFixed(1)} ms | Load: ${loadPercent.toFixed(0)}%`;

    ctx.fillStyle = 'rgba(78, 205, 196, 0.14)';
    ctx.beginPath();

    smoothedSamples.forEach((sample, index) => {
      const x = smoothedSamples.length === 1 ? 0 : (index / (smoothedSamples.length - 1)) * (width - 1);
      const load = sample.frameMs > 0 ? sample.renderMs / sample.frameMs : 0;
      const normalized = Math.min(Math.max(load, 0), 1);
      const y = height - 4 - normalized * (height - 8);

      if (index === 0) {
        ctx.moveTo(x, height - 4);
        ctx.lineTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.lineTo(width - 1, height - 4);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#4ecdc4';
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    smoothedSamples.forEach((sample, index) => {
      const x = smoothedSamples.length === 1 ? 0 : (index / (smoothedSamples.length - 1)) * (width - 1);
      const normalized = Math.min(sample.frameMs, 50) / 50;
      const y = height - 4 - normalized * (height - 8);

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    ctx.strokeStyle = '#ff9f43';
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    smoothedSamples.forEach((sample, index) => {
      const x = smoothedSamples.length === 1 ? 0 : (index / (smoothedSamples.length - 1)) * (width - 1);
      const load = sample.frameMs > 0 ? sample.renderMs / sample.frameMs : 0;
      const normalized = Math.min(Math.max(load, 0), 1);
      const y = height - 4 - normalized * (height - 8);

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 209, 102, 0.9)';
    const budgetY = height - 4 - (16.67 / 50) * (height - 8);
    ctx.fillRect(0, budgetY, width, 1);

    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '10px sans-serif';
    ctx.fillText('Frame ms', 6, 11);
    ctx.fillStyle = '#ff9f43';
    ctx.fillText('Load %', width - 42, 11);
  }

  function recordPerformance(renderDurationMs) {
    const now = performance.now();
    const frameIntervalMs = state.lastFrameTimestamp === null
      ? renderDurationMs
      : now - state.lastFrameTimestamp;

    state.lastFrameTimestamp = now;
    state.performanceHistory.push({
      timestamp: now,
      frameMs: frameIntervalMs,
      renderMs: renderDurationMs,
    });

    if (state.performanceHistory.length > 120) {
      state.performanceHistory.shift();
    }

    drawPerformanceGraph();
  }

  function samplePerformanceGraphFrame() {
    if (!state.showPerformanceGraph) {
      state.performanceGraphFrameId = null;
      return;
    }

    const now = performance.now();
    const frameIntervalMs = state.lastFrameTimestamp === null
      ? 16.67
      : now - state.lastFrameTimestamp;

    state.lastFrameTimestamp = now;
    state.performanceHistory.push({
      timestamp: now,
      frameMs: frameIntervalMs,
      renderMs: 0,
    });

    if (state.performanceHistory.length > 120) {
      state.performanceHistory.shift();
    }

    drawPerformanceGraph();
    state.performanceGraphFrameId = requestAnimationFrame(samplePerformanceGraphFrame);
  }

  function getRecentPerformanceSamples(referenceTimestamp, windowMs = 1000) {
    return state.performanceHistory.filter(
      (sample) => {
        const ageMs = referenceTimestamp - sample.timestamp;
        return ageMs >= 0 && ageMs <= windowMs;
      }
    );
  }

  function startPerformanceGraphLoop() {
    if (state.performanceGraphFrameId !== null) {
      return;
    }

    state.lastFrameTimestamp = performance.now();
    state.performanceGraphFrameId = requestAnimationFrame(samplePerformanceGraphFrame);
  }

  function stopPerformanceGraphLoop() {
    if (state.performanceGraphFrameId !== null) {
      cancelAnimationFrame(state.performanceGraphFrameId);
      state.performanceGraphFrameId = null;
    }
  }

  async function refreshCurrentPlayerState() {
    if (!state.currentTerritoryId) {
      state.playerState = null;
      renderPlayerResources();
      return;
    }

    try {
      const territory = state.territories.get(state.currentTerritoryId);
      const response = await sync.fetchPlayerState(state.currentTerritoryId);
      state.playerState = {
        ...response.player,
        playerName: territory?.name ?? response.player.playerId,
      };
      renderPlayerResources();
      state.invalidateRender();
    } catch (error) {
      console.warn('Failed to fetch authoritative player resources.', error);
      resourcePanel.textContent = sync.isLocalServerUnavailable()
        ? 'Resource server offline. Start `npm run dev:server` for authoritative resource production.'
        : 'Failed to load player resources from server.';
    }
  }

  state.onInfrastructureChanged = () => {
    settleLocalSystemPools();
    updateLocalPlayerProduction();
    state.hasPendingInfrastructureChanges = true;
    renderPlayerResources();
    state.invalidateRender();
  };

  state.onSaveInfrastructureChanges = async () => {
    if (!state.hasPendingInfrastructureChanges) {
      return;
    }

    await sync.pushState();
    state.hasPendingInfrastructureChanges = false;
    await refreshCurrentPlayerState();
    state.invalidateRender();
  };

  state.onCollectStarResources = async (starId) => {
    settleLocalSystemPools();
    collectLocalStarSystemPool(starId);
    renderPlayerResources();
    state.invalidateRender();

    if (!state.currentTerritoryId) {
      return;
    }

    try {
      const territory = state.territories.get(state.currentTerritoryId);
      const response = await sync.collectStarSystemPool(state.currentTerritoryId, starId);
      state.playerState = {
        ...response.player,
        playerName: territory?.name ?? response.player.playerId,
      };
      renderPlayerResources();
      state.invalidateRender();
    } catch (error) {
      console.warn('Failed to collect star system pool.', error);
      await refreshCurrentPlayerState();
    }
  };

  function startLocalResourceTicker() {
    if (localResourceTickIntervalId !== null) {
      return;
    }

    localResourceTickIntervalId = window.setInterval(() => {
      if (settleLocalSystemPools()) {
        renderPlayerResources();
        state.invalidateRender();
      }
    }, 1000);
  }

  resetGalaxyButton.addEventListener('click', async () => {
    await sync.resetRemoteState();
    window.location.reload();
  });

  clearDatabaseButton.addEventListener('click', async () => {
    await sync.resetRemoteState();
  });

  territoryButton.addEventListener('click', () => {
    state.territoryMode = !state.territoryMode;
    territoryButton.textContent = state.territoryMode ? 'Territory Mode: ON' : 'Territory Mode: OFF';
    territoryButton.style.background = state.territoryMode ? 'rgba(255,100,100,0.8)' : 'rgba(0,0,0,0.8)';
    territorySelector.style.display = state.territoryMode ? 'block' : 'none';
    addTerritoryButton.style.display = state.territoryMode ? 'block' : 'none';
    colorPicker.style.display = state.territoryMode ? 'block' : 'none';
    territoryNameInput.style.display = state.territoryMode ? 'block' : 'none';
  });

  addTerritoryButton.addEventListener('click', async () => {
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
    await sync.pushState();
    await refreshCurrentPlayerState();
  });

  territorySelector.addEventListener('change', async (e) => {
    state.currentTerritoryId = e.target.value;
    await sync.pushState();
    await refreshCurrentPlayerState();
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
    const closest = findClosestStarNearPoint(worldPoint, 12, rect.width, rect.height);

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
            void sync.pushState();
            state.invalidateRender();
          } else if (territory) {
              territory.stars.add(closest.id);
              closest.faction = territory.faction;
              closest.owner = territory.faction;
              updateTerritorySelector();
              void sync.pushState();
              state.invalidateRender();
          }
        } else {
          state.selection.selectedStarId = closest.id;
          state.invalidateRender();
        }
      }
    } else {
      if (!state.territoryMode) {
        state.selection.selectedStarId = null;
        state.invalidateRender();
      }
    }
  });

  function findClosestStarNearPoint(worldPoint, screenRadius) {
    const worldRadius = screenRadius / state.camera.zoom;
    const nearbyStars = state.starSpatialIndex.queryRange(
      worldPoint.x - worldRadius,
      worldPoint.y - worldRadius,
      worldPoint.x + worldRadius,
      worldPoint.y + worldRadius
    );

    let closest = null;
    let closestDistSq = Infinity;

    for (const star of nearbyStars) {
      const dx = star.x - worldPoint.x;
      const dy = star.y - worldPoint.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < closestDistSq) {
        closest = star;
        closestDistSq = distSq;
      }
    }

    return closest;
  }

  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    const worldPoint = screenToWorld(state.camera, { width: rect.width, height: rect.height }, screenX, screenY);
    const previousHoveredStarId = state.selection.hoveredStarId;
    const closest = findClosestStarNearPoint(worldPoint, 50);

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

    if (previousHoveredStarId !== state.selection.hoveredStarId) {
      state.invalidateRender();
    }
  });

  attachCameraControls(state);
  const loop = createLoop(() => {
    const renderStart = performance.now();
    renderer.render();
    recordPerformance(performance.now() - renderStart);
  });
  state.invalidateRender = () => loop.invalidate();

  return {
    async start() {
      await sync.start();
      await sync.pushState();
      await refreshCurrentPlayerState();
      startLocalResourceTicker();
      renderTopResourceBar();
      renderer.resize();
      loop.start();
      loop.invalidate();
      window.addEventListener('resize', renderer.resize);
    },
  };
}
