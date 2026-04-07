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

  function renderPlayerResources() {
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
    const hourlyLines = Object.entries(playerState.hourlyProduction || {})
      .filter(([, amount]) => amount > 0)
      .map(([resourceName, amount]) => `${resourceName}: ${amount}/h`)
      .join(' | ');
    const productionStatus = ownedStarCount === 0
      ? 'No owned stars'
      : hourlyLines || 'No production infrastructure';

    resourcePanel.innerHTML = `
      <strong>${playerState.playerName || playerState.playerId}</strong><br>
      Owned stars: ${ownedStarCount}<br>
      Resources: ${resourceLines || 'None'}<br>
      Production (/h): ${productionStatus}<br>
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
    state.hasPendingInfrastructureChanges = true;
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
      renderer.resize();
      loop.start();
      loop.invalidate();
      window.addEventListener('resize', renderer.resize);
    },
  };
}
