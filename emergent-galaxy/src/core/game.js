import { createCamera, screenToWorld } from '../camera/camera.js';
import { attachCameraControls } from '../camera/controls.js';
import { generateGalaxy } from '../galaxy/galaxyGenerator.js';
import { createRenderer } from '../render/renderer.js';
import { createSelection } from '../interaction/selection.js';
import { captureBaselineState } from './galaxyState.js';
import { getCapitalBonusMultiplier } from './capitalBonuses.js';
import { createLoop } from './loop.js';
import { MULTIPLAYER_GALAXY_SEED } from './multiplayerConfig.js';
import { createMultiplayerSync } from './multiplayerSync.js';
import {
  calculateAndApplyTerritoryEnergyState,
  clearInfrastructurePowerState,
  getEffectiveInfrastructureLevel,
} from './energy.js';
import { RESOURCE_STANDARD_PRICES } from './economyConfig.js';
import { ITEM_DEFINITIONS } from './itemDefinitions.js';
import {
  applyInfrastructureCost,
  canAffordInfrastructureCost,
  formatInfrastructureCost,
  getInfrastructureBuildCost,
  getInfrastructureUpgradeCostDelta,
  MAX_INFRASTRUCTURE_LEVEL,
} from './infrastructureCosts.js';
import { ensureStarMinimumPopulation, settleStarPopulation } from './population.js';
import { createSpatialGrid } from '../utils/spatialGrid.js';
import {
  addResourcesToSystemPool,
  calculateSystemPoolCapacitiesForStars,
  cloneResources,
  cloneSystemPools,
  createEmptyResources,
  createEmptySystemPool,
  getDirectPopulationCreditsForOwnedStars,
  getLocalPeriodProductionForStar,
  settleOwnedStarPopulations,
  sumResources,
} from './resourceEconomy.js';

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
const RESOURCE_UPDATE_INTERVALS_MS = {
  hour: 60 * 60 * 1000,
  minute: 60 * 1000,
};

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
  let energyStatusBadge = null;
  let energyOutputNode = null;
  let energyConsumptionNode = null;
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
    tooltipProduction.textContent = 'Production: 0/h';
    tooltipProduction.style.fontSize = '11px';
    tooltipProduction.style.color = 'rgba(255,255,255,0.9)';
    tooltipProduction.style.marginBottom = '4px';

    const tooltipPrice = document.createElement('div');
    tooltipPrice.textContent = `Price: ${RESOURCE_STANDARD_PRICES[resource.key] ?? '-'}`;
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

  energyStatusBadge = document.createElement('div');
  energyStatusBadge.style.position = 'relative';
  energyStatusBadge.style.display = 'flex';
  energyStatusBadge.style.flexDirection = 'column';
  energyStatusBadge.style.gap = '2px';
  energyStatusBadge.style.padding = '6px 12px';
  energyStatusBadge.style.background = 'rgba(0,0,0,0.82)';
  energyStatusBadge.style.border = '1px solid rgba(255, 209, 102, 0.34)';
  energyStatusBadge.style.borderRadius = '12px';
  energyStatusBadge.style.color = 'white';
  energyStatusBadge.style.minWidth = '154px';

  const energyTitleNode = document.createElement('span');
  energyTitleNode.textContent = 'Energy / period';
  energyTitleNode.style.fontSize = '11px';
  energyTitleNode.style.color = 'rgba(255,255,255,0.72)';

  energyOutputNode = document.createElement('span');
  energyOutputNode.textContent = 'Output: 0';
  energyOutputNode.style.fontSize = '12px';
  energyOutputNode.style.fontWeight = '700';
  energyOutputNode.style.color = '#ffd166';

  energyConsumptionNode = document.createElement('span');
  energyConsumptionNode.textContent = 'Use: 0';
  energyConsumptionNode.style.fontSize = '11px';
  energyConsumptionNode.style.color = 'rgba(255,255,255,0.82)';

  energyStatusBadge.appendChild(energyTitleNode);
  energyStatusBadge.appendChild(energyOutputNode);
  energyStatusBadge.appendChild(energyConsumptionNode);
  resourceTopBar.appendChild(energyStatusBadge);

  const profilePanel = document.createElement('div');
  profilePanel.style.position = 'absolute';
  profilePanel.style.top = '10px';
  profilePanel.style.right = '10px';
  profilePanel.style.zIndex = '10';
  profilePanel.style.display = 'flex';
  profilePanel.style.alignItems = 'center';
  profilePanel.style.gap = '10px';
  profilePanel.style.padding = '8px 10px';
  profilePanel.style.background = 'rgba(3, 11, 20, 0.88)';
  profilePanel.style.border = '1px solid rgba(255,255,255,0.22)';
  profilePanel.style.borderRadius = '14px';
  profilePanel.style.boxShadow = '0 14px 34px rgba(0,0,0,0.32)';
  profilePanel.style.color = 'white';
  profilePanel.style.fontSize = '12px';
  profilePanel.style.backdropFilter = 'blur(8px)';
  container.appendChild(profilePanel);

  const profileAvatar = document.createElement('div');
  profileAvatar.textContent = 'P';
  profileAvatar.title = 'Profilbild';
  profileAvatar.style.display = 'flex';
  profileAvatar.style.alignItems = 'center';
  profileAvatar.style.justifyContent = 'center';
  profileAvatar.style.width = '34px';
  profileAvatar.style.height = '34px';
  profileAvatar.style.borderRadius = '12px';
  profileAvatar.style.background = 'linear-gradient(135deg, #fbbf24, #38bdf8)';
  profileAvatar.style.color = '#03111f';
  profileAvatar.style.fontWeight = '800';
  profileAvatar.style.boxShadow = '0 0 18px rgba(251, 191, 36, 0.28)';
  profilePanel.appendChild(profileAvatar);

  const profileStats = document.createElement('div');
  profileStats.style.display = 'flex';
  profileStats.style.flexDirection = 'column';
  profileStats.style.gap = '2px';
  profileStats.style.minWidth = '92px';
  profilePanel.appendChild(profileStats);

  const profileLevelNode = document.createElement('div');
  profileLevelNode.textContent = 'Level 1';
  profileLevelNode.style.fontWeight = '700';
  profileLevelNode.style.letterSpacing = '0.02em';
  profileStats.appendChild(profileLevelNode);

  const profileCreditsNode = document.createElement('div');
  profileCreditsNode.textContent = 'Credits: 0';
  profileCreditsNode.style.color = '#fbbf24';
  profileCreditsNode.style.fontVariantNumeric = 'tabular-nums';
  profileStats.appendChild(profileCreditsNode);

  function createProfilePanelButton(label) {
    const button = document.createElement('button');
    button.textContent = label;
    button.style.padding = '7px 9px';
    button.style.background = 'rgba(255,255,255,0.08)';
    button.style.color = 'white';
    button.style.border = '1px solid rgba(255,255,255,0.24)';
    button.style.borderRadius = '10px';
    button.style.cursor = 'pointer';
    button.style.fontSize = '12px';
    button.style.fontWeight = '700';
    return button;
  }

  const inventoryButton = createProfilePanelButton('Inventory');
  profilePanel.appendChild(inventoryButton);

  const fleetButton = createProfilePanelButton('Fleet');
  fleetButton.disabled = true;
  fleetButton.title = 'Fleet is disabled for now';
  fleetButton.style.cursor = 'not-allowed';
  fleetButton.style.opacity = '0.45';
  profilePanel.appendChild(fleetButton);

  const rightPanel = document.createElement('div');
  rightPanel.style.position = 'absolute';
  rightPanel.style.top = '70px';
  rightPanel.style.right = '10px';
  rightPanel.style.zIndex = '10';
  rightPanel.style.width = '280px';
  rightPanel.style.maxWidth = 'calc(100vw - 20px)';
  rightPanel.style.maxHeight = 'calc(100vh - 90px)';
  rightPanel.style.overflowY = 'auto';
  rightPanel.style.padding = '14px';
  rightPanel.style.background = 'rgba(3, 11, 20, 0.94)';
  rightPanel.style.border = '1px solid rgba(255,255,255,0.22)';
  rightPanel.style.borderRadius = '16px';
  rightPanel.style.boxShadow = '0 20px 44px rgba(0,0,0,0.38)';
  rightPanel.style.color = 'white';
  rightPanel.style.display = 'none';
  rightPanel.style.backdropFilter = 'blur(10px)';
  container.appendChild(rightPanel);

  const rightPanelHeader = document.createElement('div');
  rightPanelHeader.style.display = 'flex';
  rightPanelHeader.style.alignItems = 'center';
  rightPanelHeader.style.justifyContent = 'space-between';
  rightPanelHeader.style.marginBottom = '12px';
  rightPanel.appendChild(rightPanelHeader);

  const rightPanelTitle = document.createElement('div');
  rightPanelTitle.textContent = 'Inventory';
  rightPanelTitle.style.fontSize = '14px';
  rightPanelTitle.style.fontWeight = '800';
  rightPanelTitle.style.letterSpacing = '0.04em';
  rightPanelHeader.appendChild(rightPanelTitle);

  const rightPanelCloseButton = document.createElement('button');
  rightPanelCloseButton.textContent = 'Close';
  rightPanelCloseButton.style.padding = '5px 8px';
  rightPanelCloseButton.style.background = 'rgba(255,255,255,0.08)';
  rightPanelCloseButton.style.color = 'white';
  rightPanelCloseButton.style.border = '1px solid rgba(255,255,255,0.22)';
  rightPanelCloseButton.style.borderRadius = '8px';
  rightPanelCloseButton.style.cursor = 'pointer';
  rightPanelCloseButton.style.fontSize = '11px';
  rightPanelHeader.appendChild(rightPanelCloseButton);

  const rightPanelBody = document.createElement('div');
  rightPanelBody.style.fontSize = '12px';
  rightPanelBody.style.color = 'rgba(255,255,255,0.82)';
  rightPanelBody.style.lineHeight = '1.45';
  rightPanel.appendChild(rightPanelBody);

  const productionSection = document.createElement('div');
  productionSection.style.marginTop = '14px';
  productionSection.style.paddingTop = '12px';
  productionSection.style.borderTop = '1px solid rgba(255,255,255,0.14)';
  rightPanel.appendChild(productionSection);

  const productionTitle = document.createElement('div');
  productionTitle.textContent = 'Production Queue';
  productionTitle.style.fontSize = '13px';
  productionTitle.style.fontWeight = '800';
  productionTitle.style.marginBottom = '8px';
  productionSection.appendChild(productionTitle);

  const productionControls = document.createElement('div');
  productionControls.style.display = 'flex';
  productionControls.style.gap = '8px';
  productionControls.style.marginBottom = '10px';
  productionSection.appendChild(productionControls);

  const productionItemSelect = document.createElement('select');
  productionItemSelect.style.flex = '1';
  productionItemSelect.style.minWidth = '0';
  productionItemSelect.style.padding = '7px 8px';
  productionItemSelect.style.background = 'rgba(0,0,0,0.55)';
  productionItemSelect.style.color = 'white';
  productionItemSelect.style.border = '1px solid rgba(255,255,255,0.24)';
  productionItemSelect.style.borderRadius = '9px';
  for (const item of ITEM_DEFINITIONS) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = `${item.name} (${formatResourceCost(item.resourceCost)})`;
    productionItemSelect.appendChild(option);
  }
  productionControls.appendChild(productionItemSelect);

  const addProductionButton = document.createElement('button');
  addProductionButton.textContent = 'Add';
  addProductionButton.style.padding = '7px 10px';
  addProductionButton.style.background = 'rgba(251,191,36,0.18)';
  addProductionButton.style.color = '#fde68a';
  addProductionButton.style.border = '1px solid rgba(251,191,36,0.42)';
  addProductionButton.style.borderRadius = '9px';
  addProductionButton.style.cursor = 'pointer';
  addProductionButton.style.fontWeight = '800';
  productionControls.appendChild(addProductionButton);

  const productionInfo = document.createElement('div');
  productionInfo.style.fontSize = '11px';
  productionInfo.style.color = 'rgba(255,255,255,0.62)';
  productionInfo.style.marginBottom = '8px';
  productionSection.appendChild(productionInfo);

  const productionQueueList = document.createElement('div');
  productionQueueList.style.fontSize = '12px';
  productionQueueList.style.color = 'rgba(255,255,255,0.82)';
  productionSection.appendChild(productionQueueList);

  const territoryLoginRow = document.createElement('div');
  territoryLoginRow.style.display = 'flex';
  territoryLoginRow.style.alignItems = 'center';
  territoryLoginRow.style.gap = '8px';
  territoryLoginRow.style.marginBottom = '8px';
  uiContainer.appendChild(territoryLoginRow);

  // Territory mode button
  const territoryButton = document.createElement('button');
  territoryButton.textContent = 'Territory Mode: OFF';
  territoryButton.style.padding = '8px 12px';
  territoryButton.style.background = 'rgba(0,0,0,0.8)';
  territoryButton.style.color = 'white';
  territoryButton.style.border = '1px solid white';
  territoryButton.style.borderRadius = '4px';
  territoryButton.style.cursor = 'pointer';
  territoryButton.style.marginBottom = '0';
  territoryButton.style.display = 'block';
  territoryLoginRow.appendChild(territoryButton);

  const loginRow = document.createElement('div');
  loginRow.style.display = 'flex';
  loginRow.style.alignItems = 'center';
  loginRow.style.gap = '6px';
  loginRow.style.marginBottom = '0';
  territoryLoginRow.appendChild(loginRow);

  const usernameInput = document.createElement('input');
  usernameInput.type = 'text';
  usernameInput.placeholder = 'Username';
  usernameInput.style.padding = '7px 8px';
  usernameInput.style.background = 'rgba(0,0,0,0.8)';
  usernameInput.style.color = 'white';
  usernameInput.style.border = '1px solid rgba(255,255,255,0.8)';
  usernameInput.style.borderRadius = '4px';
  usernameInput.style.width = '128px';
  loginRow.appendChild(usernameInput);

  const saveUsernameButton = document.createElement('button');
  saveUsernameButton.textContent = 'Save';
  saveUsernameButton.style.padding = '7px 10px';
  saveUsernameButton.style.background = 'rgba(0,0,0,0.8)';
  saveUsernameButton.style.color = 'white';
  saveUsernameButton.style.border = '1px solid rgba(255,255,255,0.8)';
  saveUsernameButton.style.borderRadius = '4px';
  saveUsernameButton.style.cursor = 'pointer';
  loginRow.appendChild(saveUsernameButton);

  const loggedInAsLabel = document.createElement('div');
  loggedInAsLabel.style.color = 'rgba(255,255,255,0.75)';
  loggedInAsLabel.style.fontSize = '11px';
  loggedInAsLabel.style.marginBottom = '8px';
  loggedInAsLabel.textContent = 'Not logged in';
  uiContainer.appendChild(loggedInAsLabel);

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

  // Color picker
  const colorPicker = document.createElement('input');
  colorPicker.type = 'color';
  colorPicker.title = 'Territory color';
  colorPicker.style.width = '40px';
  colorPicker.style.height = '30px';
  colorPicker.style.cursor = 'pointer';
  colorPicker.style.marginBottom = '8px';
  colorPicker.style.display = 'none';
  colorPicker.style.border = '1px solid white';
  uiContainer.appendChild(colorPicker);

  const territoryBrushLabel = document.createElement('label');
  territoryBrushLabel.style.display = 'none';
  territoryBrushLabel.style.alignItems = 'center';
  territoryBrushLabel.style.gap = '6px';
  territoryBrushLabel.style.color = 'white';
  territoryBrushLabel.style.fontSize = '12px';
  territoryBrushLabel.style.marginBottom = '8px';
  territoryBrushLabel.style.cursor = 'pointer';

  const territoryBrushCheckbox = document.createElement('input');
  territoryBrushCheckbox.type = 'checkbox';
  territoryBrushCheckbox.style.cursor = 'pointer';

  territoryBrushLabel.appendChild(territoryBrushCheckbox);
  territoryBrushLabel.appendChild(document.createTextNode('Claim nearest 15 stars'));
  uiContainer.appendChild(territoryBrushLabel);

  const territoryMegaBrushLabel = document.createElement('label');
  territoryMegaBrushLabel.style.display = 'none';
  territoryMegaBrushLabel.style.alignItems = 'center';
  territoryMegaBrushLabel.style.gap = '6px';
  territoryMegaBrushLabel.style.color = 'white';
  territoryMegaBrushLabel.style.fontSize = '12px';
  territoryMegaBrushLabel.style.marginBottom = '8px';
  territoryMegaBrushLabel.style.cursor = 'pointer';

  const territoryMegaBrushCheckbox = document.createElement('input');
  territoryMegaBrushCheckbox.type = 'checkbox';
  territoryMegaBrushCheckbox.style.cursor = 'pointer';

  territoryMegaBrushLabel.appendChild(territoryMegaBrushCheckbox);
  territoryMegaBrushLabel.appendChild(document.createTextNode('Claim nearest 100 stars'));
  uiContainer.appendChild(territoryMegaBrushLabel);

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
  let localResourceTickTimeoutId = null;

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
  performanceGraphCheckbox.checked = true;
  performanceGraphCheckbox.style.marginRight = '6px';

  performanceGraphLabel.appendChild(performanceGraphCheckbox);
  performanceGraphLabel.appendChild(document.createTextNode('Show Performance Graph'));
  settingsPanel.appendChild(performanceGraphLabel);

  const performanceModeLabel = document.createElement('label');
  performanceModeLabel.style.display = 'block';
  performanceModeLabel.style.color = 'white';
  performanceModeLabel.style.marginBottom = '8px';
  performanceModeLabel.style.cursor = 'pointer';

  const performanceModeCheckbox = document.createElement('input');
  performanceModeCheckbox.type = 'checkbox';
  performanceModeCheckbox.checked = false;
  performanceModeCheckbox.style.marginRight = '6px';

  performanceModeLabel.appendChild(performanceModeCheckbox);
  performanceModeLabel.appendChild(document.createTextNode('Performance Mode'));
  settingsPanel.appendChild(performanceModeLabel);

  const populationTimingLabel = document.createElement('label');
  populationTimingLabel.style.display = 'block';
  populationTimingLabel.style.color = 'white';
  populationTimingLabel.style.marginBottom = '8px';
  populationTimingLabel.style.cursor = 'pointer';

  const populationTimingCheckbox = document.createElement('input');
  populationTimingCheckbox.type = 'checkbox';
  populationTimingCheckbox.checked = false;
  populationTimingCheckbox.style.marginRight = '6px';

  populationTimingLabel.appendChild(populationTimingCheckbox);
  populationTimingLabel.appendChild(document.createTextNode('Show Population Timing'));
  settingsPanel.appendChild(populationTimingLabel);

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
    currentPlayerId: null,
    currentTerritoryId: null,
    territoryRevision: 0,
    territoryBrushSize: 1,
    showResourceDebug: false,
    showPerformanceGraph: true,
    performanceMode: false,
    isCameraMoving: false,
    showPopulationTiming: false,
    playerState: null,
    cachedPlayerStates: new Map(),
    performanceHistory: [],
    lastFrameTimestamp: null,
    performanceGraphFrameId: null,
    hasPendingInfrastructureChanges: false,
    hasPendingTerritoryChanges: false,
    infrastructureBaselineByPlanetId: new Map(),
    infrastructureStatusMessage: '',
    onInfrastructureChanged: null,
    onSaveInfrastructureChanges: null,
    onCollectStarResources: null,
    onSetCapitalStar: null,
    onCameraMovementChanged: null,
    getInfrastructureBuildCost: null,
    canAffordInfrastructureUpgrade: null,
    invalidateRender: () => {},
  };
  const baselineState = captureBaselineState(state.galaxy);
  state.starSpatialIndex = createSpatialGrid(state.galaxy.stars, { cellSize: 400 });
  state.starsById = new Map(state.galaxy.stars.map((star) => [star.id, star]));
  state.starByPlanetId = new Map(
    state.galaxy.stars.flatMap((star) => (star.planets ?? []).map((planet) => [planet.id, star]))
  );

  seedLabel.textContent = `Galaxy Seed: ${state.galaxySeed}`;
  performancePanel.style.display = state.showPerformanceGraph ? 'block' : 'none';

  state.onCameraMovementChanged = () => {
    renderer.resize();
  };

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

  performanceModeCheckbox.addEventListener('change', () => {
    state.performanceMode = performanceModeCheckbox.checked;
    renderer.resize();
    state.invalidateRender();
  });

  populationTimingCheckbox.addEventListener('change', () => {
    state.showPopulationTiming = populationTimingCheckbox.checked;
    state.invalidateRender();
  });

  territoryBrushCheckbox.addEventListener('change', () => {
    if (territoryBrushCheckbox.checked) {
      territoryMegaBrushCheckbox.checked = false;
      state.territoryBrushSize = 15;
      return;
    }

    if (!territoryMegaBrushCheckbox.checked) {
      state.territoryBrushSize = 1;
    }
  });

  territoryMegaBrushCheckbox.addEventListener('change', () => {
    if (territoryMegaBrushCheckbox.checked) {
      territoryBrushCheckbox.checked = false;
      state.territoryBrushSize = 100;
      return;
    }

    if (!territoryBrushCheckbox.checked) {
      state.territoryBrushSize = 1;
    }
  });

  function updateTerritorySelector() {
    territorySelector.innerHTML = '';
    const visibleTerritories = state.currentPlayerId
      ? [[state.currentPlayerId, state.territories.get(state.currentPlayerId)]].filter(([, territory]) => territory)
      : [];

    for (const [id, territory] of visibleTerritories) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = `${territory.name} (${territory.stars.size})`;
      option.style.backgroundColor = territory.color;
      territorySelector.appendChild(option);
    }
    if (
      state.currentTerritoryId &&
      state.currentTerritoryId !== state.currentPlayerId
    ) {
      state.currentTerritoryId = null;
    }
    if (state.currentPlayerId && state.territories.has(state.currentPlayerId)) {
      state.currentTerritoryId = state.currentPlayerId;
    }
    if (state.currentTerritoryId) {
      territorySelector.value = state.currentTerritoryId;
    }
    syncTerritoryColorPicker();
  }

  function updateTerritoryControlVisibility() {
    const canEditOwnTerritory = state.territoryMode && Boolean(state.currentPlayerId);
    territorySelector.style.display = canEditOwnTerritory ? 'block' : 'none';
    colorPicker.style.display = canEditOwnTerritory ? 'block' : 'none';
    territoryBrushLabel.style.display = canEditOwnTerritory ? 'inline-flex' : 'none';
    territoryMegaBrushLabel.style.display = canEditOwnTerritory ? 'inline-flex' : 'none';
  }

  function normalizeTerritoryColor(color, fallback = '#4ecdc4') {
    const nextColor = String(color || '').trim();
    return /^#[0-9a-f]{6}$/i.test(nextColor) ? nextColor : fallback;
  }

  function syncTerritoryColorPicker() {
    const territory = getLoggedInTerritory();
    colorPicker.value = normalizeTerritoryColor(
      territory?.color,
      state.currentPlayerId ? getDefaultPlayerColor(state.currentPlayerId) : '#4ecdc4'
    );
  }

  function normalizeUsername(rawUsername) {
    return String(rawUsername || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function getStoredUsername() {
    try {
      return window.localStorage.getItem('spaceera.username') || '';
    } catch {
      return '';
    }
  }

  function storeUsername(username) {
    try {
      window.localStorage.setItem('spaceera.username', username);
    } catch {
      // Ignore localStorage issues; server state still works for the current session.
    }
  }

  function getDefaultPlayerColor(playerId) {
    let hash = 0;
    for (const char of playerId) {
      hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    }

    return colors[hash % colors.length];
  }

  function getLoggedInTerritory() {
    return state.currentPlayerId ? state.territories.get(state.currentPlayerId) ?? null : null;
  }

  function setLoggedInAs(playerId) {
    state.currentPlayerId = playerId;
    state.currentTerritoryId = playerId;
    loggedInAsLabel.textContent = playerId ? `Logged in as: ${playerId}` : 'Not logged in';
    usernameInput.value = playerId || '';
    syncTerritoryColorPicker();
    updateTerritoryControlVisibility();
  }

  function ensurePlayerTerritory(playerId, options = {}) {
    if (!playerId) {
      return null;
    }

    const existingTerritory = state.territories.get(playerId);
    const name = options.name?.trim() || existingTerritory?.name || playerId;
    const color = normalizeTerritoryColor(
      options.color || existingTerritory?.color,
      getDefaultPlayerColor(playerId)
    );
    const faction = options.faction?.trim() || existingTerritory?.faction || name;
    const territory = {
      id: playerId,
      name,
      color,
      faction,
      capitalStarId: existingTerritory?.capitalStarId ?? null,
      stars: existingTerritory?.stars ?? new Set(),
    };

    normalizeTerritoryCapital(territory);
    ensureTerritoryCapitalMinimumPopulation(territory);
    state.territories.set(playerId, territory);
    return territory;
  }

  function applyPlayerTerritoryRecord(playerState) {
    if (!playerState?.territory || playerState.playerId !== state.currentPlayerId) {
      return null;
    }

    const territory = ensurePlayerTerritory(state.currentPlayerId, {
      name: playerState.territory.name,
      color: playerState.territory.color,
      faction: playerState.territory.faction,
    });
    territory.capitalStarId = playerState.territory.capitalStarId ?? null;
    territory.stars = new Set(playerState.territory.stars ?? []);
    normalizeTerritoryCapital(territory);
    ensureTerritoryCapitalMinimumPopulation(territory);
    state.territories.set(state.currentPlayerId, territory);

    for (const starId of territory.stars) {
      const star = state.starsById.get(starId);
      if (star) {
        star.faction = territory.faction;
        star.owner = territory.faction;
      }
    }

    return territory;
  }

  function getRuntimeTerritoryRecord(territory) {
    return {
      id: territory.id,
      name: territory.name,
      color: territory.color,
      faction: territory.faction,
      capitalStarId: territory.capitalStarId ?? null,
      stars: Array.from(territory.stars ?? []),
    };
  }

  function normalizeTerritoryCapital(territory) {
    if (!territory) {
      return;
    }

    if (territory.capitalStarId && territory.stars.has(territory.capitalStarId)) {
      return;
    }

    territory.capitalStarId = territory.stars.size > 0
      ? territory.stars.values().next().value
      : null;
  }

  function ensureTerritoryCapitalMinimumPopulation(territory) {
    const capitalStar = territory?.capitalStarId
      ? state.starsById.get(territory.capitalStarId) ?? null
      : null;
    if (!capitalStar) {
      return false;
    }

    return ensureStarMinimumPopulation(capitalStar);
  }

  function normalizeAllTerritoryCapitals() {
    for (const territory of state.territories.values()) {
      normalizeTerritoryCapital(territory);
      ensureTerritoryCapitalMinimumPopulation(territory);
    }
  }

  function markTerritoryChangesDirty() {
    state.hasPendingTerritoryChanges = true;
  }

  async function flushPendingTerritoryChanges() {
    if (!state.hasPendingTerritoryChanges) {
      return;
    }

    await sync.pushState();
    state.hasPendingTerritoryChanges = false;

    if (state.currentPlayerId && state.playerState) {
      state.cachedPlayerStates.set(state.currentPlayerId, structuredClone(state.playerState));
    }
  }

  function markTerritoryRenderDataDirty() {
    state.territoryRevision += 1;
  }

  function captureCommittedInfrastructureState() {
    const baselineByPlanetId = new Map();

    for (const star of state.galaxy.stars) {
      for (const planet of star.planets ?? []) {
        baselineByPlanetId.set(planet.id, { ...planet.infrastructure });
      }
    }

    state.infrastructureBaselineByPlanetId = baselineByPlanetId;
  }

  function getCommittedInfrastructureLevel(planetId, infrastructureKey) {
    return Math.max(
      0,
      Math.floor(
        Number(state.infrastructureBaselineByPlanetId.get(planetId)?.[infrastructureKey]) || 0
      )
    );
  }

  function getCurrentInfrastructureLevel(planet, infrastructureKey) {
    return Math.max(0, Math.floor(Number(planet?.infrastructure?.[infrastructureKey]) || 0));
  }

  function getPendingInfrastructureCostDelta(planet, infrastructureKey, targetLevel) {
    return getInfrastructureUpgradeCostDelta(
      infrastructureKey,
      getCommittedInfrastructureLevel(planet.id, infrastructureKey),
      targetLevel
    );
  }

  state.getInfrastructureBuildCost = (planet, infrastructureKey, targetLevel = null) => {
    const currentLevel = Math.min(
      MAX_INFRASTRUCTURE_LEVEL,
      targetLevel ?? (getCurrentInfrastructureLevel(planet, infrastructureKey) + 1)
    );
    return getInfrastructureBuildCost(infrastructureKey, currentLevel);
  };

  state.canAffordInfrastructureUpgrade = (planet, infrastructureKey) => {
    if (!state.playerState || !planet) {
      return false;
    }

    const currentLevel = getCurrentInfrastructureLevel(planet, infrastructureKey);
    if (currentLevel >= MAX_INFRASTRUCTURE_LEVEL) {
      return false;
    }

    const nextLevel = currentLevel + 1;
    const pendingBefore = getPendingInfrastructureCostDelta(
      planet,
      infrastructureKey,
      currentLevel
    );
    const pendingAfter = getPendingInfrastructureCostDelta(planet, infrastructureKey, nextLevel);
    const deltaCost = createEmptyResources();

    for (const resourceKey of RESOURCE_KEYS) {
      deltaCost[resourceKey] = Math.max(
        0,
        (pendingAfter[resourceKey] ?? 0) - (pendingBefore[resourceKey] ?? 0)
      );
    }

    return canAffordInfrastructureCost(state.playerState.resources, deltaCost);
  };

  function setTerritoryCapital(territoryId, starId) {
    const territory = state.territories.get(territoryId);
    if (!territory || !territory.stars.has(starId)) {
      return false;
    }

    if (territory.capitalStarId === starId) {
      return false;
    }

    territory.capitalStarId = starId;
    ensureTerritoryCapitalMinimumPopulation(territory);
    return true;
  }

  function findTerritoryByStarId(starId) {
    for (const [territoryId, territory] of state.territories.entries()) {
      if (territory.stars.has(starId)) {
        return { territoryId, territory };
      }
    }

    return null;
  }

  function findClosestStarsToStar(centerStar, count) {
    return [...state.galaxy.stars]
      .sort((left, right) => {
        const leftDx = left.x - centerStar.x;
        const leftDy = left.y - centerStar.y;
        const rightDx = right.x - centerStar.x;
        const rightDy = right.y - centerStar.y;
        return leftDx * leftDx + leftDy * leftDy - (rightDx * rightDx + rightDy * rightDy);
      })
      .slice(0, count);
  }

  function claimStarForTerritory(star, territory) {
    const occupiedTerritory = findTerritoryByStarId(star.id);

    if (occupiedTerritory && occupiedTerritory.territory.id !== territory.id) {
      return false;
    }

    territory.stars.add(star.id);
    star.faction = territory.faction;
    star.owner = territory.faction;
    normalizeTerritoryCapital(territory);
    ensureTerritoryCapitalMinimumPopulation(territory);
    return true;
  }

  function claimClosestStarsForTerritory(centerStar, territory, count = 15) {
    const closestStars = findClosestStarsToStar(centerStar, count);

    for (const star of closestStars) {
      claimStarForTerritory(star, territory);
    }

    normalizeTerritoryCapital(territory);
    ensureTerritoryCapitalMinimumPopulation(territory);
  }

  const storedUsername = normalizeUsername(getStoredUsername());
  if (storedUsername) {
    setLoggedInAs(storedUsername);
    ensurePlayerTerritory(storedUsername);
  }
  updateTerritorySelector();
  updateTerritoryControlVisibility();
  captureCommittedInfrastructureState();

  function handleStateApplied() {
    normalizeAllTerritoryCapitals();
    if (state.currentPlayerId) {
      ensurePlayerTerritory(state.currentPlayerId);
      state.currentTerritoryId = state.currentPlayerId;
    }
    markTerritoryRenderDataDirty();
    updateTerritorySelector();
    updateTerritoryControlVisibility();
    syncCurrentTerritoryEnergyState();
    state.hasPendingInfrastructureChanges = false;
    state.infrastructureStatusMessage = '';
    captureCommittedInfrastructureState();
  }

  const sync = createMultiplayerSync({
    state,
    baselineState,
    onStateApplied: handleStateApplied,
  });

  async function loginAsUsername(rawUsername) {
    const playerId = normalizeUsername(rawUsername);
    if (!playerId) {
      loggedInAsLabel.textContent = 'Enter a username';
      return;
    }

    if (state.hasPendingTerritoryChanges || state.hasPendingInfrastructureChanges) {
      await sync.pushState();
      state.hasPendingTerritoryChanges = false;
      state.hasPendingInfrastructureChanges = false;
    }

    storeUsername(playerId);
    setLoggedInAs(playerId);
    ensurePlayerTerritory(playerId, {
      name: String(rawUsername || '').trim() || playerId,
      color: getLoggedInTerritory()?.color ?? getDefaultPlayerColor(playerId),
    });
    markTerritoryRenderDataDirty();
    updateTerritorySelector();
    updateTerritoryControlVisibility();
    await sync.pushState();
    await ensureCurrentPlayerStateLoaded();
    state.invalidateRender();
  }

  async function applyCurrentTerritoryColor(color, shouldSave = false) {
    if (!state.currentPlayerId) {
      return;
    }

    const territory = ensurePlayerTerritory(state.currentPlayerId, {
      color: normalizeTerritoryColor(color, getDefaultPlayerColor(state.currentPlayerId)),
    });
    colorPicker.value = territory.color;
    if (state.playerState) {
      state.playerState = {
        ...state.playerState,
        territory: getRuntimeTerritoryRecord(territory),
      };
    }

    markTerritoryRenderDataDirty();
    markTerritoryChangesDirty();
    updateTerritorySelector();
    renderPlayerResources();
    state.invalidateRender();

    if (shouldSave) {
      await sync.pushState();
      state.hasPendingTerritoryChanges = false;
      if (state.playerState) {
        state.cachedPlayerStates.set(state.currentPlayerId, structuredClone(state.playerState));
      }
    }
  }

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

  function formatWholeNumber(value) {
    return Math.round(Number(value) || 0).toLocaleString(undefined, {
      maximumFractionDigits: 0,
    });
  }

  function formatDurationPeriods(periods) {
    const safePeriods = Math.max(0, Number(periods) || 0);
    if (safePeriods <= 0) {
      return '0 periods';
    }

    return `${Math.ceil(safePeriods)} periods`;
  }

  function formatResourceCost(cost = {}) {
    return RESOURCE_KEYS
      .filter((resourceKey) => (Number(cost[resourceKey]) || 0) > 0)
      .map((resourceKey) => `${formatWholeNumber(cost[resourceKey])} ${resourceKey}`)
      .join(', ') || 'Free';
  }

  function canAffordResourceCost(resources = {}, cost = {}) {
    return RESOURCE_KEYS.every(
      (resourceKey) => (Number(resources[resourceKey]) || 0) >= (Number(cost[resourceKey]) || 0)
    );
  }

  function spendResourceCost(resources = {}, cost = {}) {
    const nextResources = cloneResources(resources);
    for (const resourceKey of RESOURCE_KEYS) {
      nextResources[resourceKey] = Math.max(
        0,
        (Number(nextResources[resourceKey]) || 0) - (Number(cost[resourceKey]) || 0)
      );
    }

    return nextResources;
  }

  function getTotalIndustryInfrastructure() {
    return getOwnedStarsForCurrentTerritory().reduce((sum, star) => {
      const starIndustry = (star.planets ?? []).reduce(
        (planetSum, planet) => planetSum + getEffectiveInfrastructureLevel(planet, 'industrial'),
        0
      );
      return sum + starIndustry;
    }, 0);
  }

  function getItemDefinition(itemId) {
    return ITEM_DEFINITIONS.find((item) => item.id === itemId) ?? null;
  }

  function createProductionQueueEntry(item, industryLevel) {
    const requiredIndustryPeriods = Math.max(1, Number(item.productionIndustryPeriods) || 1);
    const effectiveIndustry = Math.max(0, Number(industryLevel) || 0);
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      itemId: item.id,
      queuedAt: new Date().toISOString(),
      requiredIndustryPeriods,
      industryAtQueue: effectiveIndustry,
      estimatedPeriods: effectiveIndustry > 0 ? requiredIndustryPeriods / effectiveIndustry : null,
      resourceCost: cloneResources(item.resourceCost),
    };
  }

  function renderProductionQueue() {
    const queue = state.playerState?.productionQueue ?? [];
    const industryLevel = getTotalIndustryInfrastructure();
    productionInfo.textContent =
      industryLevel > 0
        ? `Industry: ${formatWholeNumber(industryLevel)} total. More industry makes production faster.`
        : 'Industry: 0. Queue can be planned, but production needs industrial infrastructure.';

    if (!state.playerState) {
      productionQueueList.textContent = 'Log in to use production.';
      addProductionButton.disabled = true;
      addProductionButton.style.opacity = '0.45';
      addProductionButton.style.cursor = 'not-allowed';
      return;
    }

    addProductionButton.disabled = false;
    addProductionButton.style.opacity = '1';
    addProductionButton.style.cursor = 'pointer';

    if (queue.length === 0) {
      productionQueueList.textContent = 'Queue is empty.';
      return;
    }

    productionQueueList.innerHTML = queue
      .map((entry, index) => {
        const item = getItemDefinition(entry.itemId);
        const estimatedPeriods = Number.isFinite(entry.estimatedPeriods)
          ? formatDurationPeriods(entry.estimatedPeriods)
          : 'Paused';
        const requiredIndustryPeriods =
          entry.requiredIndustryPeriods ?? entry.requiredIndustryHours ?? item?.productionIndustryPeriods ?? 0;
        return `
          <div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.1);">
            <div style="display:flex;justify-content:space-between;gap:12px;">
              <span>${index + 1}. ${item?.name ?? entry.itemId}</span>
              <strong>${estimatedPeriods}</strong>
            </div>
            <div style="font-size:11px;color:rgba(255,255,255,0.52);margin-top:2px;">
              ${formatWholeNumber(requiredIndustryPeriods)} industry-periods
            </div>
            <div style="font-size:11px;color:rgba(255,255,255,0.52);margin-top:2px;">
              Cost: ${formatResourceCost(entry.resourceCost ?? item?.resourceCost)}
            </div>
          </div>
        `;
      })
      .join('');
  }

  function renderInventoryPanel() {
    const items = state.playerState?.items ?? {};

    rightPanelTitle.textContent = 'Inventory';
    if (!state.playerState) {
      rightPanelBody.textContent = 'Log in to load your inventory.';
      renderProductionQueue();
      return;
    }

    rightPanelBody.innerHTML = ITEM_DEFINITIONS
      .map((item) => `
        <div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.1);">
          <div style="display:flex;justify-content:space-between;gap:12px;">
            <span title="${item.description}">${item.name}</span>
            <strong>${formatWholeNumber(items[item.id])}</strong>
          </div>
          <div style="font-size:11px;color:rgba(255,255,255,0.52);margin-top:2px;">
            Cost: ${formatResourceCost(item.resourceCost)}
          </div>
        </div>
      `)
      .join('');
    renderProductionQueue();
  }

  function toggleRightPanel(panelName) {
    if (panelName !== 'inventory') {
      return;
    }

    const shouldOpen = rightPanel.style.display === 'none';
    rightPanel.style.display = shouldOpen ? 'block' : 'none';
    if (shouldOpen) {
      renderInventoryPanel();
    }
  }

  async function addSelectedItemToProductionQueue() {
    if (!state.playerState) {
      renderInventoryPanel();
      return;
    }

    const item = getItemDefinition(productionItemSelect.value);
    if (!item) {
      return;
    }

    const resourceCost = cloneResources(item.resourceCost);
    if (!canAffordResourceCost(state.playerState.resources, resourceCost)) {
      productionInfo.textContent = `Not enough resources. Need: ${formatResourceCost(resourceCost)}`;
      return;
    }

    const queueEntry = createProductionQueueEntry(item, getTotalIndustryInfrastructure());
    state.playerState = {
      ...state.playerState,
      resources: spendResourceCost(state.playerState.resources, resourceCost),
      productionQueue: [
        ...(state.playerState.productionQueue ?? []),
        queueEntry,
      ],
    };
    state.cachedPlayerStates.set(state.currentPlayerId, structuredClone(state.playerState));
    renderInventoryPanel();
    state.invalidateRender();
    await sync.pushState();
  }

  function renderTopResourceBar() {
    syncCurrentTerritoryEnergyState();
    const resources = state.playerState?.resources ?? {};
    const production = state.playerState?.hourlyProduction ?? {};
    const playerLevel = Math.max(1, Math.floor(Number(state.playerState?.level) || 1));
    const energyOutput = state.playerState?.energyOutput ?? 0;
    const energyConsumption = state.playerState?.energyConsumption ?? 0;
    const energyDeficit = state.playerState?.energyDeficit ?? 0;
    const periodLabel = state.playerState?.resourceUpdateInterval === 'hour' ? 'h' : 'min';

    profileLevelNode.textContent = `Level ${formatWholeNumber(playerLevel)}`;
    profileCreditsNode.textContent = `Credits: ${formatWholeNumber(resources.Credits)}`;
    profileCreditsNode.style.opacity = state.playerState ? '1' : '0.65';
    if (rightPanel.style.display !== 'none') {
      renderInventoryPanel();
    }

    for (const resource of RESOURCE_DISPLAY) {
      const amountNode = resourceBadgeAmounts.get(resource.key);
      const productionNode = resourceBadgeProduction.get(resource.key);
      if (!amountNode) {
        continue;
      }

      amountNode.textContent = formatWholeNumber(resources[resource.key]);
      amountNode.style.opacity = state.playerState ? '1' : '0.65';
      if (productionNode) {
        productionNode.textContent = `Production: ${formatWholeNumber(production[resource.key])}/${periodLabel}`;
      }
    }

    if (energyOutputNode) {
      energyOutputNode.textContent = `Output: ${formatWholeNumber(energyOutput)}/${periodLabel}`;
      energyOutputNode.style.opacity = state.playerState ? '1' : '0.65';
    }

    if (energyConsumptionNode) {
      energyConsumptionNode.textContent =
        energyDeficit > 0
          ? `Need: ${formatWholeNumber(energyConsumption)}/${periodLabel}  Offline: ${formatWholeNumber(state.playerState?.inactiveInfrastructureCount)}`
          : `Use: ${formatWholeNumber(energyConsumption)}/${periodLabel}`;
      energyConsumptionNode.style.color =
        energyDeficit > 0 ? '#fca5a5' : 'rgba(255,255,255,0.82)';
      energyConsumptionNode.style.opacity = state.playerState ? '1' : '0.65';
    }

    if (energyStatusBadge) {
      energyStatusBadge.style.borderColor =
        energyDeficit > 0 ? 'rgba(248, 113, 113, 0.55)' : 'rgba(255, 209, 102, 0.34)';
      energyStatusBadge.style.boxShadow =
        energyDeficit > 0 ? '0 0 0 1px rgba(248, 113, 113, 0.12)' : 'none';
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

  function syncCurrentTerritoryEnergyState(ownedStars = getOwnedStarsForCurrentTerritory()) {
    clearInfrastructurePowerState(state.galaxy.stars);

    if (!state.currentTerritoryId) {
      if (state.playerState) {
        state.playerState = {
          ...state.playerState,
          energyOutput: 0,
          energyConsumption: 0,
          activeEnergyConsumption: 0,
          energyDeficit: 0,
          inactiveInfrastructureCount: 0,
        };
      }

      return {
        output: 0,
        consumption: 0,
        activeConsumption: 0,
        deficit: 0,
        inactiveInfrastructureCount: 0,
      };
    }

    const territory = state.territories.get(state.currentTerritoryId);
    const energyState = calculateAndApplyTerritoryEnergyState({
      ownedStars,
      capitalStarId: territory?.capitalStarId ?? null,
    });

    if (state.playerState) {
      state.playerState = {
        ...state.playerState,
        energyOutput: energyState.output,
        energyConsumption: energyState.consumption,
        activeEnergyConsumption: energyState.activeConsumption,
        energyDeficit: energyState.deficit,
        inactiveInfrastructureCount: energyState.inactiveInfrastructureCount,
      };
    }

    return energyState;
  }

  function calculateLocalPeriodProductionFromPools(systemPools, ownedStars) {
    syncCurrentTerritoryEnergyState(ownedStars);
    const periodProduction = createEmptyResources();
    const capitalStarId = state.territories.get(state.currentTerritoryId)?.capitalStarId ?? null;
    const systemPoolCapacities = calculateSystemPoolCapacitiesForStars(ownedStars, capitalStarId);

    for (const star of ownedStars) {
      const poolEntry = systemPools[star.id] ?? createEmptySystemPool();
      sumResources(
        periodProduction,
        addResourcesToSystemPool(
          { resources: cloneResources(poolEntry.resources) },
          getLocalPeriodProductionForStar(star, capitalStarId),
          systemPoolCapacities[star.id] ?? 0
        )
      );
    }

    periodProduction.Credits += getDirectPopulationCreditsForOwnedStars(ownedStars);

    return periodProduction;
  }

  function settleLocalSystemPools(nowMs = Date.now()) {
    if (!state.playerState || !state.currentTerritoryId) {
      return false;
    }

    const ownedStars = getOwnedStarsForCurrentTerritory();
    syncCurrentTerritoryEnergyState(ownedStars);
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
    const capitalStarId = state.territories.get(state.currentTerritoryId)?.capitalStarId ?? null;
    const systemPoolCapacities = calculateSystemPoolCapacitiesForStars(ownedStars, capitalStarId);
    const populationChanged = settleOwnedStarPopulations(ownedStars, completedIntervals, capitalStarId);
    const nextResources = cloneResources(state.playerState.resources);
    nextResources.Credits += getDirectPopulationCreditsForOwnedStars(ownedStars, completedIntervals);
    for (let intervalIndex = 0; intervalIndex < completedIntervals; intervalIndex++) {
      for (const star of ownedStars) {
        const poolEntry = systemPools[star.id] ?? createEmptySystemPool();
        systemPools[star.id] = poolEntry;
        addResourcesToSystemPool(
          poolEntry,
          getLocalPeriodProductionForStar(star, capitalStarId),
          systemPoolCapacities[star.id] ?? 0
        );
      }
    }

    state.playerState = {
      ...state.playerState,
      resources: nextResources,
      systemPools,
      systemPoolCapacities,
      hourlyProduction: calculateLocalPeriodProductionFromPools(systemPools, ownedStars),
      completedHours: (state.playerState.completedHours ?? 0) + completedIntervals,
      lastResourceUpdate: new Date(Math.floor(nowMs / intervalMs) * intervalMs).toISOString(),
    };

    return populationChanged || completedIntervals > 0;
  }

  function updateLocalPlayerProduction() {
    if (!state.playerState || !state.currentTerritoryId) {
      return;
    }

    const ownedStars = getOwnedStarsForCurrentTerritory();
    syncCurrentTerritoryEnergyState(ownedStars);
    const ownedStarIds = new Set(ownedStars.map((star) => star.id));
    const systemPools = cloneSystemPools(state.playerState.systemPools, ownedStarIds);
    const capitalStarId = state.territories.get(state.currentTerritoryId)?.capitalStarId ?? null;
    const periodProduction = calculateLocalPeriodProductionFromPools(systemPools, ownedStars);

    state.playerState = {
      ...state.playerState,
      systemPools,
      systemPoolCapacities: calculateSystemPoolCapacitiesForStars(ownedStars, capitalStarId),
      hourlyProduction: periodProduction,
    };
  }

  function collectLocalStarSystemPool(starId) {
    if (!state.playerState || !state.currentTerritoryId) {
      return false;
    }

    const ownedStars = getOwnedStarsForCurrentTerritory();
    syncCurrentTerritoryEnergyState(ownedStars);
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
      systemPoolCapacities:
        state.playerState.systemPoolCapacities ??
        calculateSystemPoolCapacitiesForStars(
          ownedStars,
          state.territories.get(state.currentTerritoryId)?.capitalStarId ?? null
        ),
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
    const capitalStar = activeTerritory?.capitalStarId
      ? state.starsById.get(activeTerritory.capitalStarId) ?? null
      : null;
    const energyOutput = playerState.energyOutput ?? 0;
    const energyConsumption = playerState.energyConsumption ?? 0;
    const inactiveInfrastructureCount = playerState.inactiveInfrastructureCount ?? 0;
    const updateInterval = playerState.resourceUpdateInterval === 'minute' ? 'min' : 'h';
    const resourceLines = Object.entries(playerState.resources || {})
      .map(([resourceName, amount]) => `${resourceName}: ${formatWholeNumber(amount)}`)
      .join(' | ');
    const periodLines = Object.entries(playerState.hourlyProduction || {})
      .filter(([, amount]) => amount > 0)
      .map(([resourceName, amount]) => `${resourceName}: ${formatWholeNumber(amount)}/${updateInterval}`)
      .join(' | ');
    const productionStatus = ownedStarCount === 0
      ? 'No owned stars'
      : periodLines || 'No production infrastructure';

    resourcePanel.innerHTML = `
      <strong>${playerState.playerName || playerState.playerId}</strong><br>
      Owned stars: ${ownedStarCount}<br>
      Capital: ${capitalStar?.name ?? 'None'}<br>
      Energy: ${formatWholeNumber(energyOutput)}/${updateInterval} output, ${formatWholeNumber(energyConsumption)}/${updateInterval} demand${inactiveInfrastructureCount > 0 ? `, ${formatWholeNumber(inactiveInfrastructureCount)} offline` : ''}<br>
      Resources: ${resourceLines || 'None'}<br>
      Production (/${updateInterval}): ${productionStatus}<br>
      Build status: ${state.infrastructureStatusMessage || 'Ready'}<br>
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
    if (!state.currentPlayerId) {
      clearInfrastructurePowerState(state.galaxy.stars);
      state.playerState = null;
      renderPlayerResources();
      startLocalResourceTicker();
      return;
    }

    try {
      const playerId = state.currentPlayerId;
      const response = await sync.fetchPlayerState(playerId);
      const territory = applyPlayerTerritoryRecord(response.player) ?? state.territories.get(playerId);
      state.playerState = {
        ...response.player,
        playerName: territory?.name ?? response.player.playerId,
      };
      state.cachedPlayerStates.set(playerId, structuredClone(state.playerState));
      state.infrastructureStatusMessage = '';
      captureCommittedInfrastructureState();
      syncCurrentTerritoryEnergyState();
      renderPlayerResources();
      startLocalResourceTicker();
      state.invalidateRender();
    } catch (error) {
      console.warn('Failed to fetch authoritative player resources.', error);
      resourcePanel.textContent = sync.isLocalServerUnavailable()
        ? 'Resource server offline. Start `npm run dev:server` for authoritative resource production.'
        : 'Failed to load player resources from server.';
    }
  }

  function hydrateCurrentPlayerStateFromCache() {
    if (!state.currentPlayerId) {
      return false;
    }

    const cachedPlayerState = state.cachedPlayerStates.get(state.currentPlayerId);
    if (!cachedPlayerState) {
      return false;
    }

    const territory = applyPlayerTerritoryRecord(cachedPlayerState) ?? state.territories.get(state.currentPlayerId);
    state.playerState = {
      ...structuredClone(cachedPlayerState),
      playerName: territory?.name ?? cachedPlayerState.playerName ?? cachedPlayerState.playerId,
    };
    state.infrastructureStatusMessage = '';
    syncCurrentTerritoryEnergyState();
    renderPlayerResources();
    startLocalResourceTicker();
    return true;
  }

  async function ensureCurrentPlayerStateLoaded() {
    if (hydrateCurrentPlayerStateFromCache()) {
      state.invalidateRender();
      return;
    }

    await refreshCurrentPlayerState();
  }

  state.onInfrastructureChanged = (planet, infrastructureKey, delta) => {
    if (!planet || !infrastructureKey || !delta) {
      return false;
    }

    const currentLevel = getCurrentInfrastructureLevel(planet, infrastructureKey);
    const nextLevel = Math.min(MAX_INFRASTRUCTURE_LEVEL, Math.max(0, currentLevel + delta));
    if (nextLevel === currentLevel) {
      if (delta > 0 && currentLevel >= MAX_INFRASTRUCTURE_LEVEL) {
        state.infrastructureStatusMessage = `${infrastructureKey} is already at max level ${MAX_INFRASTRUCTURE_LEVEL}`;
        renderPlayerResources();
        state.invalidateRender();
      }
      return false;
    }

    settleLocalSystemPools();
    if (!state.playerState) {
      state.infrastructureStatusMessage = 'Player resources are not loaded yet';
      renderPlayerResources();
      state.invalidateRender();
      return false;
    }

    const pendingBefore = getPendingInfrastructureCostDelta(planet, infrastructureKey, currentLevel);
    const pendingAfter = getPendingInfrastructureCostDelta(planet, infrastructureKey, nextLevel);

    if (delta > 0) {
      const extraCost = createEmptyResources();
      for (const resourceKey of RESOURCE_KEYS) {
        extraCost[resourceKey] = Math.max(
          0,
          (pendingAfter[resourceKey] ?? 0) - (pendingBefore[resourceKey] ?? 0)
        );
      }

      if (!canAffordInfrastructureCost(state.playerState.resources, extraCost)) {
        state.infrastructureStatusMessage = `Not enough resources for ${infrastructureKey}: ${formatInfrastructureCost(extraCost)}`;
        renderPlayerResources();
        state.invalidateRender();
        return false;
      }

      state.playerState = {
        ...state.playerState,
        resources: applyInfrastructureCost(state.playerState.resources, extraCost, 'spend'),
      };
      state.infrastructureStatusMessage = `Queued ${infrastructureKey} upgrade for ${formatInfrastructureCost(extraCost)}`;
    } else if (delta < 0) {
      const refund = createEmptyResources();
      for (const resourceKey of RESOURCE_KEYS) {
        refund[resourceKey] = Math.max(
          0,
          (pendingBefore[resourceKey] ?? 0) - (pendingAfter[resourceKey] ?? 0)
        );
      }

      state.playerState = {
        ...state.playerState,
        resources: applyInfrastructureCost(state.playerState.resources, refund, 'refund'),
      };
      state.infrastructureStatusMessage =
        refund && formatInfrastructureCost(refund)
          ? `Reverted pending ${infrastructureKey} cost: ${formatInfrastructureCost(refund)}`
          : `Reduced ${infrastructureKey} to level ${nextLevel}`;
    }

    planet.infrastructure[infrastructureKey] = nextLevel;

    const owningStar = state.starByPlanetId.get(planet.id) ?? null;
    if (owningStar) {
      const capitalStarId = state.territories.get(state.currentTerritoryId)?.capitalStarId ?? null;
      settleStarPopulation(owningStar, 0, getCapitalBonusMultiplier(owningStar.id, capitalStarId));
    }

    updateLocalPlayerProduction();
    state.hasPendingInfrastructureChanges = true;
    renderPlayerResources();
    state.invalidateRender();
    return true;
  };

  state.onSaveInfrastructureChanges = async () => {
    if (!state.hasPendingInfrastructureChanges) {
      return;
    }

    await sync.pushState();
    state.hasPendingInfrastructureChanges = false;
    state.infrastructureStatusMessage = 'Infrastructure saved';
    captureCommittedInfrastructureState();
    if (state.currentPlayerId && state.playerState) {
      state.cachedPlayerStates.set(state.currentPlayerId, structuredClone(state.playerState));
    }
    state.invalidateRender();
  };

  state.onCollectStarResources = async (starId) => {
    settleLocalSystemPools();
    collectLocalStarSystemPool(starId);
    renderPlayerResources();
    state.invalidateRender();

    if (!state.currentPlayerId) {
      return;
    }

    try {
      const territory = state.territories.get(state.currentPlayerId);
      const response = await sync.collectStarSystemPool(state.currentPlayerId, starId);
      state.playerState = {
        ...response.player,
        playerName: territory?.name ?? response.player.playerId,
      };
      state.cachedPlayerStates.set(state.currentPlayerId, structuredClone(state.playerState));
      syncCurrentTerritoryEnergyState();
      renderPlayerResources();
      state.invalidateRender();
    } catch (error) {
      console.warn('Failed to collect star system pool.', error);
      await refreshCurrentPlayerState();
    }
  };

  state.onSetCapitalStar = async (starId) => {
    if (!state.currentPlayerId || state.currentTerritoryId !== state.currentPlayerId) {
      return;
    }

    if (!setTerritoryCapital(state.currentPlayerId, starId)) {
      return;
    }

    markTerritoryRenderDataDirty();
    markTerritoryChangesDirty();
    updateLocalPlayerProduction();
    renderPlayerResources();
    state.invalidateRender();
  };

  function startLocalResourceTicker() {
    if (localResourceTickTimeoutId !== null) {
      window.clearTimeout(localResourceTickTimeoutId);
      localResourceTickTimeoutId = null;
    }

    const intervalMs = getPlayerIntervalMs(state.playerState);
    const nowMs = Date.now();
    const nextTickAtMs = Math.floor(nowMs / intervalMs) * intervalMs + intervalMs;
    const delayMs = Math.max(250, nextTickAtMs - nowMs);

    localResourceTickTimeoutId = window.setTimeout(async () => {
      localResourceTickTimeoutId = null;

      if (settleLocalSystemPools()) {
        await sync.pushState();
        renderPlayerResources();
        state.invalidateRender();
      }

      startLocalResourceTicker();
    }, delayMs);
  }

  resetGalaxyButton.addEventListener('click', async () => {
    if (await sync.resetRemoteState()) {
      window.location.reload();
    }
  });

  clearDatabaseButton.addEventListener('click', async () => {
    if (await sync.resetRemoteState()) {
      window.location.reload();
    }
  });

  saveUsernameButton.addEventListener('click', () => {
    void loginAsUsername(usernameInput.value);
  });

  usernameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      void loginAsUsername(usernameInput.value);
    }
  });

  inventoryButton.addEventListener('click', () => {
    toggleRightPanel('inventory');
  });

  rightPanelCloseButton.addEventListener('click', () => {
    rightPanel.style.display = 'none';
  });

  addProductionButton.addEventListener('click', () => {
    void addSelectedItemToProductionQueue();
  });

  colorPicker.addEventListener('input', () => {
    void applyCurrentTerritoryColor(colorPicker.value);
  });

  colorPicker.addEventListener('change', () => {
    void applyCurrentTerritoryColor(colorPicker.value, true);
  });

  territoryButton.addEventListener('click', async () => {
    const nextTerritoryMode = !state.territoryMode;

    if (!nextTerritoryMode) {
      await flushPendingTerritoryChanges();
    }

    state.territoryMode = nextTerritoryMode;
    territoryButton.textContent = state.territoryMode ? 'Territory Mode: ON' : 'Territory Mode: OFF';
    territoryButton.style.background = state.territoryMode ? 'rgba(255,100,100,0.8)' : 'rgba(0,0,0,0.8)';
    updateTerritoryControlVisibility();
  });

  territorySelector.addEventListener('change', async (e) => {
    state.currentTerritoryId = state.currentPlayerId && e.target.value === state.currentPlayerId
      ? state.currentPlayerId
      : null;
    await ensureCurrentPlayerStateLoaded();
    state.invalidateRender();
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
        if (state.territoryMode && state.currentPlayerId && state.currentTerritoryId === state.currentPlayerId) {
          const occupiedTerritory = findTerritoryByStarId(closest.id);
          const territory = state.territories.get(state.currentPlayerId);

          if (territory && state.territoryBrushSize > 1) {
            claimClosestStarsForTerritory(closest, territory, state.territoryBrushSize);
            markTerritoryRenderDataDirty();
            markTerritoryChangesDirty();
            updateTerritorySelector();
            updateLocalPlayerProduction();
            renderPlayerResources();
            state.invalidateRender();
          } else if (occupiedTerritory?.territory.id === state.currentPlayerId) {
            occupiedTerritory.territory.stars.delete(closest.id);
            normalizeTerritoryCapital(occupiedTerritory.territory);
            ensureTerritoryCapitalMinimumPopulation(occupiedTerritory.territory);
            closest.faction = 'Unclaimed';
            closest.owner = 'Unclaimed';
            markTerritoryRenderDataDirty();
            markTerritoryChangesDirty();
            updateTerritorySelector();
            updateLocalPlayerProduction();
            renderPlayerResources();
            state.invalidateRender();
          } else if (territory) {
              territory.stars.add(closest.id);
              normalizeTerritoryCapital(territory);
              closest.faction = territory.faction;
              closest.owner = territory.faction;
              markTerritoryRenderDataDirty();
              markTerritoryChangesDirty();
              updateTerritorySelector();
              updateLocalPlayerProduction();
              renderPlayerResources();
              state.invalidateRender();
          }
        } else {
          state.selection.selectedStarId = closest.id;
          void ensureCurrentPlayerStateLoaded();
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
      await ensureCurrentPlayerStateLoaded();
      startLocalResourceTicker();
      if (state.showPerformanceGraph) {
        startPerformanceGraphLoop();
      }
      renderTopResourceBar();
      renderer.resize();
      loop.start();
      loop.invalidate();
      window.addEventListener('resize', renderer.resize);
    },
  };
}
