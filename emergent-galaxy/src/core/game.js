import { createCamera, screenToWorld } from '../camera/camera.js';
import { attachCameraControls } from '../camera/controls.js';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { generateGalaxy } from '../galaxy/galaxyGenerator.js';
import { createRenderer } from '../render/renderer.js';
import { createSelection } from '../interaction/selection.js';
import { RightSideMenu } from '../ui/RightSideMenu.jsx';
import { captureBaselineState, serializeGameState } from './galaxyState.js';
import { getCapitalBonusMultiplier } from './capitalBonuses.js';
import { createLoop } from './loop.js';
import { MULTIPLAYER_GALAXY_SEED } from './multiplayerConfig.js';
import { createMultiplayerSync } from './multiplayerSync.js';
import {
  calculateAndApplyTerritoryEnergyState,
  clearInfrastructurePowerState,
  getEffectiveInfrastructureLevel,
} from './energy.js';
import {
  BASE_PLAYER_RESOURCE_PRODUCTION_PER_PERIOD,
  RESOURCE_STANDARD_PRICES,
} from './economyConfig.js';
import {
  cloneItemInventory,
  getItemDefinition,
  getItemStorageSize,
  ITEM_DEFINITIONS,
  MINIMUM_ITEM_CRAFT_TIME_RATIO,
} from './itemDefinitions.js';
import {
  applyInfrastructureCost,
  canAffordInfrastructureCost,
  formatInfrastructureCost,
  getInfrastructureBuildCost,
  getInfrastructureUpgradeCostDelta,
  MAX_INFRASTRUCTURE_LEVEL,
} from './infrastructureCosts.js';
import {
  calculatePlanetPopulationCap,
  calculateStarDevelopment,
  ensureStarMinimumPopulation,
  recalculateStarDerivedStats,
  settleStarPopulation,
} from './population.js';
import { getWeightedResourceAmount } from './systemPools.js';
import { createSpatialGrid } from '../utils/spatialGrid.js';
import { calculateShipRuntime, getShipHullDefinition } from './shipClass.js';
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
  { key: 'Metals', icon: 'M', color: '#a8b5c7', iconPath: '/icons/metal.png' },
  { key: 'Food', icon: 'F', color: '#86efac', iconPath: '/icons/food.png' },
  { key: 'Rare Earth Elements', icon: 'R', color: '#c4b5fd', iconPath: '/icons/rare.png' },
  { key: 'Uranium', icon: 'U', color: '#bef264', iconPath: '/icons/uranium.png' },
];
const RESOURCE_KEYS = ['Credits', ...RESOURCE_DISPLAY.map((resource) => resource.key)];
const RESOURCE_UPDATE_INTERVALS_MS = {
  hour: 60 * 60 * 1000,
  minute: 60 * 1000,
};
const BASE_PRODUCTION_OFFLINE_PERIOD_CAP = 10;
const PERFORMANCE_GRAPH_REDRAW_INTERVAL_MS = 250;
const PROFILE_BANNER_URL = '/top-banner.png';
const BLUR_TERRITORIES_STORAGE_KEY = 'spaceera.blurTerritories';
const COLONY_KIT_ITEM_ID = 'colony-kit';
const COLONY_STARTING_POPULATION = 50000;
const COLONY_BASE_INFRASTRUCTURE_KEYS = ['industrial', 'energy', 'storage', 'defense'];
const COLONY_MINED_RESOURCE_NAMES = new Set(['Rare Earth Elements', 'Metals', 'Uranium']);

function readStoredBoolean(key, fallbackValue = false) {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallbackValue : value === 'true';
  } catch {
    return fallbackValue;
  }
}

function writeStoredBoolean(key, value) {
  try {
    window.localStorage.setItem(key, value ? 'true' : 'false');
  } catch {
    // Ignore localStorage issues; the setting still applies for this session.
  }
}

function applyResourceIconStyles(node, resource, size = 16, mode = 'badge') {
  node.textContent = resource.iconPath ? '' : resource.icon;
  node.style.display = 'inline-flex';
  node.style.alignItems = 'center';
  node.style.justifyContent = 'center';
  node.style.width = `${size}px`;
  node.style.height = `${size}px`;
  node.style.flex = '0 0 auto';

  if (resource.iconPath) {
    node.style.backgroundImage = `url(${resource.iconPath})`;
    node.style.backgroundPosition = 'center';
    node.style.backgroundRepeat = 'no-repeat';
    node.style.backgroundSize = `${Math.max(12, size - 2)}px ${Math.max(12, size - 2)}px`;
    node.style.color = 'transparent';
  } else {
    node.style.backgroundImage = '';
    node.style.color = resource.color;
  }

  if (mode === 'badge') {
    node.style.borderRadius = '999px';
    node.style.backgroundColor = resource.iconPath ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.08)';
    node.style.fontWeight = '800';
    node.style.fontSize = `${Math.max(11, size - 4)}px`;
    node.style.lineHeight = '1';
  } else {
    node.style.borderRadius = '0';
    node.style.backgroundColor = 'transparent';
    node.style.fontWeight = '800';
    node.style.fontSize = `${Math.max(11, size - 3)}px`;
    node.style.lineHeight = '1';
  }
}

export function createGame(container, galaxyOptions = {}) {
  const persistentSeed = galaxyOptions.seed ?? MULTIPLAYER_GALAXY_SEED;
  const resolvedGalaxyOptions = {
    ...galaxyOptions,
    seed: persistentSeed,
  };
  const initialShowBlurTerritories = readStoredBoolean(BLUR_TERRITORIES_STORAGE_KEY, false);

  const canvas = document.createElement('canvas');
  container.appendChild(canvas);

  const sidePanelWidth = 'clamp(310px, 17vw, 400px)';

  // Create UI container
  const uiContainer = document.createElement('div');
  uiContainer.style.position = 'absolute';
  uiContainer.style.top = '10px';
  uiContainer.style.left = '10px';
  uiContainer.style.zIndex = '10';
  container.appendChild(uiContainer);

  const resourceTopBar = document.createElement('div');
  resourceTopBar.style.position = 'absolute';
  resourceTopBar.style.top = '34px';
  resourceTopBar.style.left = '50%';
  resourceTopBar.style.transform = 'translateX(-50%)';
  resourceTopBar.style.zIndex = '16';
  resourceTopBar.style.display = 'flex';
  resourceTopBar.style.flexWrap = 'wrap';
  resourceTopBar.style.justifyContent = 'center';
  resourceTopBar.style.alignItems = 'stretch';
  resourceTopBar.style.gap = '0';
  resourceTopBar.style.padding = '7px 12px 8px';
  resourceTopBar.style.maxWidth = 'min(860px, calc(100vw - 32px))';
  resourceTopBar.style.background = 'linear-gradient(180deg, rgba(11, 18, 32, 0.95), rgba(6, 10, 22, 0.9))';
  resourceTopBar.style.border = '1px solid rgba(148,163,184,0.18)';
  resourceTopBar.style.borderRadius = '16px';
  resourceTopBar.style.boxShadow = '0 18px 36px rgba(0,0,0,0.28)';
  resourceTopBar.style.backdropFilter = 'blur(16px)';
  resourceTopBar.style.display = 'none';
  container.appendChild(resourceTopBar);

  const resourceBadgeAmounts = new Map();
  const resourceBadgeProduction = new Map();
  const resourceBadgeTooltipProduction = new Map();
  const topBarResourceAmountNodes = new Map();
  let energyStatusBadge = null;
  let energyMaxNode = null;
  let energyOutputNode = null;
  let energyConsumptionNode = null;
  for (const [index, resource] of RESOURCE_DISPLAY.entries()) {
    const badge = document.createElement('div');
    badge.style.position = 'relative';
    badge.style.display = 'flex';
    badge.style.flexDirection = 'column';
    badge.style.justifyContent = 'center';
    badge.style.gap = '3px';
    badge.style.minWidth = '92px';
    badge.style.padding = '0 12px';
    badge.style.borderRight =
      index < RESOURCE_DISPLAY.length - 1 ? '1px solid rgba(148,163,184,0.14)' : '0';
    badge.style.color = 'white';
    badge.style.fontSize = '12px';
    badge.style.lineHeight = '1';

    const amountRow = document.createElement('div');
    amountRow.style.display = 'flex';
    amountRow.style.alignItems = 'center';
    amountRow.style.gap = '7px';

    const icon = document.createElement('span');
    applyResourceIconStyles(icon, resource, 16, 'badge');
    icon.style.border = `1px solid ${resource.color}44`;
    icon.style.boxShadow = `0 0 12px ${resource.color}22`;

    const amount = document.createElement('span');
    amount.textContent = '0';
    amount.style.fontVariantNumeric = 'tabular-nums';
    amount.style.fontSize = '14px';
    amount.style.fontWeight = '800';
    amount.style.letterSpacing = '0.01em';

    const visibleProduction = document.createElement('span');
    visibleProduction.textContent = '+0';
    visibleProduction.style.fontSize = '10px';
    visibleProduction.style.fontWeight = '700';
    visibleProduction.style.color = 'rgba(134, 239, 172, 0.88)';
    visibleProduction.style.fontVariantNumeric = 'tabular-nums';

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

    amountRow.appendChild(icon);
    amountRow.appendChild(amount);
    badge.appendChild(amountRow);
    badge.appendChild(visibleProduction);
    badge.appendChild(tooltip);
    resourceTopBar.appendChild(badge);
    resourceBadgeAmounts.set(resource.key, amount);
    resourceBadgeProduction.set(resource.key, visibleProduction);
    resourceBadgeTooltipProduction.set(resource.key, tooltipProduction);
  }

  energyStatusBadge = document.createElement('div');
  energyStatusBadge.style.position = 'relative';
  energyStatusBadge.style.display = 'flex';
  energyStatusBadge.style.flexDirection = 'column';
  energyStatusBadge.style.justifyContent = 'center';
  energyStatusBadge.style.gap = '3px';
  energyStatusBadge.style.minWidth = '126px';
  energyStatusBadge.style.padding = '0 0 0 12px';
  energyStatusBadge.style.marginLeft = '12px';
  energyStatusBadge.style.borderLeft = '1px solid rgba(148,163,184,0.14)';
  energyStatusBadge.style.color = 'white';

  const energyTitleNode = document.createElement('span');
  energyTitleNode.textContent = 'Energy';
  energyTitleNode.style.fontSize = '10px';
  energyTitleNode.style.fontWeight = '700';
  energyTitleNode.style.letterSpacing = '0.06em';
  energyTitleNode.style.textTransform = 'uppercase';
  energyTitleNode.style.color = 'rgba(255,255,255,0.72)';

  energyMaxNode = document.createElement('span');
  energyMaxNode.textContent = 'Max: 0';
  energyMaxNode.style.fontSize = '14px';
  energyMaxNode.style.fontWeight = '700';
  energyMaxNode.style.color = '#93a4bd';

  energyOutputNode = document.createElement('span');
  energyOutputNode.textContent = 'Usage: 0';
  energyOutputNode.style.fontSize = '11px';
  energyOutputNode.style.color = 'rgba(255,255,255,0.82)';

  energyConsumptionNode = document.createElement('span');
  energyConsumptionNode.textContent = 'Demand: 0';
  energyConsumptionNode.style.fontSize = '11px';
  energyConsumptionNode.style.color = 'rgba(255,255,255,0.6)';

  energyStatusBadge.appendChild(energyTitleNode);
  energyStatusBadge.appendChild(energyMaxNode);
  energyStatusBadge.appendChild(energyOutputNode);
  energyStatusBadge.appendChild(energyConsumptionNode);
  resourceTopBar.appendChild(energyStatusBadge);

  const profilePanel = document.createElement('div');
  profilePanel.style.position = 'absolute';
  profilePanel.style.top = '0';
  profilePanel.style.right = '0';
  profilePanel.style.zIndex = '35';
  profilePanel.style.display = 'flex';
  profilePanel.style.alignItems = 'center';
  profilePanel.style.gap = '10px';
  profilePanel.style.width = sidePanelWidth;
  profilePanel.style.boxSizing = 'border-box';
  profilePanel.style.padding = '12px 14px';
  profilePanel.style.backgroundImage =
    `linear-gradient(180deg, rgba(8, 13, 27, 0.78), rgba(5, 8, 22, 0.72)), url(${PROFILE_BANNER_URL})`;
  profilePanel.style.backgroundSize = 'cover';
  profilePanel.style.backgroundPosition = 'center top';
  profilePanel.style.backgroundRepeat = 'no-repeat';
  profilePanel.style.borderLeft = '1px solid rgba(148,163,184,0.18)';
  profilePanel.style.borderBottom = '0';
  profilePanel.style.borderRadius = '0';
  profilePanel.style.boxShadow = '-18px 0 42px rgba(0,0,0,0.24)';
  profilePanel.style.color = '#e8efff';
  profilePanel.style.fontSize = '13px';
  profilePanel.style.backdropFilter = 'blur(16px)';
  container.appendChild(profilePanel);

  const profileAvatarWrap = document.createElement('div');
  profileAvatarWrap.style.position = 'relative';
  profileAvatarWrap.style.flex = '0 0 auto';
  profilePanel.appendChild(profileAvatarWrap);

  const profileAvatar = document.createElement('button');
  profileAvatar.type = 'button';
  profileAvatar.title = 'Profile menu';
  profileAvatar.setAttribute('aria-label', 'Open profile menu');
  profileAvatar.style.display = 'flex';
  profileAvatar.style.position = 'relative';
  profileAvatar.style.alignItems = 'center';
  profileAvatar.style.justifyContent = 'center';
  profileAvatar.style.width = '38px';
  profileAvatar.style.height = '38px';
  profileAvatar.style.borderRadius = '999px';
  profileAvatar.style.background = 'linear-gradient(135deg, #93a4bd, #7c8faa)';
  profileAvatar.style.color = '#07111f';
  profileAvatar.style.fontWeight = '800';
  profileAvatar.style.border = '0';
  profileAvatar.style.cursor = 'pointer';
  profileAvatar.style.padding = '0';
  profileAvatar.style.backgroundSize = 'cover';
  profileAvatar.style.backgroundPosition = 'center 24%';
  profileAvatar.style.backgroundRepeat = 'no-repeat';
  profileAvatar.style.overflow = 'hidden';
  profileAvatar.style.boxShadow = '0 10px 24px rgba(0, 0, 0, 0.26)';
  profileAvatarWrap.appendChild(profileAvatar);

  const profileAvatarText = document.createElement('span');
  profileAvatarText.textContent = 'P';
  profileAvatarText.style.position = 'relative';
  profileAvatarText.style.zIndex = '1';
  profileAvatarText.style.fontSize = '14px';
  profileAvatarText.style.pointerEvents = 'none';
  profileAvatar.appendChild(profileAvatarText);

  const profileAvatarImage = document.createElement('img');
  profileAvatarImage.alt = 'Profile avatar';
  profileAvatarImage.style.position = 'absolute';
  profileAvatarImage.style.inset = '0';
  profileAvatarImage.style.width = '100%';
  profileAvatarImage.style.height = '100%';
  profileAvatarImage.style.borderRadius = '999px';
  profileAvatarImage.style.objectFit = 'cover';
  profileAvatarImage.style.objectPosition = 'center';
  profileAvatarImage.style.display = 'none';
  profileAvatarImage.style.pointerEvents = 'none';
  profileAvatar.appendChild(profileAvatarImage);

  const profileDropdown = document.createElement('div');
  profileDropdown.style.position = 'absolute';
  profileDropdown.style.top = 'calc(100% + 10px)';
  profileDropdown.style.left = '0';
  profileDropdown.style.minWidth = '156px';
  profileDropdown.style.padding = '8px';
  profileDropdown.style.background = 'linear-gradient(180deg, rgba(8, 13, 27, 0.78), rgba(5, 8, 22, 0.78))';
  profileDropdown.style.border = '1px solid rgba(148,163,184,0.18)';
  profileDropdown.style.borderRadius = '16px';
  profileDropdown.style.boxShadow = '0 18px 42px rgba(0,0,0,0.28)';
  profileDropdown.style.display = 'none';
  profileDropdown.style.zIndex = '40';
  profileDropdown.style.backdropFilter = 'blur(16px)';
  profileAvatarWrap.appendChild(profileDropdown);

  const profileLevelRing = document.createElement('div');
  profileLevelRing.title = 'Level progress';
  profileLevelRing.style.display = 'flex';
  profileLevelRing.style.alignItems = 'center';
  profileLevelRing.style.justifyContent = 'center';
  profileLevelRing.style.width = '44px';
  profileLevelRing.style.height = '44px';
  profileLevelRing.style.borderRadius = '999px';
  profileLevelRing.style.flex = '0 0 auto';
  profileLevelRing.style.background = 'conic-gradient(#93a4bd 0deg, rgba(255,255,255,0.1) 0deg)';
  profileLevelRing.style.boxShadow = '0 10px 24px rgba(0, 0, 0, 0.24)';
  profilePanel.appendChild(profileLevelRing);

  const profileLevelNode = document.createElement('div');
  profileLevelNode.textContent = '1';
  profileLevelNode.style.display = 'flex';
  profileLevelNode.style.alignItems = 'center';
  profileLevelNode.style.justifyContent = 'center';
  profileLevelNode.style.width = '30px';
  profileLevelNode.style.height = '30px';
  profileLevelNode.style.borderRadius = '999px';
  profileLevelNode.style.background = 'rgba(8, 13, 27, 0.96)';
  profileLevelNode.style.color = '#e8efff';
  profileLevelNode.style.fontWeight = '900';
  profileLevelNode.style.fontSize = '15px';
  profileLevelNode.style.fontVariantNumeric = 'tabular-nums';
  profileLevelRing.appendChild(profileLevelNode);

  const profileStats = document.createElement('div');
  profileStats.style.display = 'grid';
  profileStats.style.gridTemplateColumns = 'minmax(56px, 0.9fr) minmax(0, 1fr) minmax(0, 1fr)';
  profileStats.style.columnGap = '8px';
  profileStats.style.rowGap = '5px';
  profileStats.style.flex = '1 1 180px';
  profileStats.style.minWidth = '0';
  profileStats.style.alignItems = 'center';
  profileStats.style.justifyContent = 'center';
  profileStats.style.alignContent = 'center';
  profileStats.style.textAlign = 'left';
  profilePanel.appendChild(profileStats);

  const profileCreditsNode = document.createElement('div');
  profileCreditsNode.innerHTML = '$ 0';
  profileCreditsNode.style.color = '#d8c38a';
  profileCreditsNode.style.fontVariantNumeric = 'tabular-nums';
  profileCreditsNode.style.display = 'grid';
  profileCreditsNode.style.gridTemplateColumns = '10px auto';
  profileCreditsNode.style.justifyContent = 'start';
  profileCreditsNode.style.columnGap = '4px';
  profileCreditsNode.style.whiteSpace = 'nowrap';
  profileCreditsNode.style.overflow = 'hidden';
  profileCreditsNode.style.textOverflow = 'ellipsis';
  profileCreditsNode.style.fontSize = '13px';
  profileCreditsNode.style.fontWeight = '800';
  profileCreditsNode.style.width = '100%';
  profileCreditsNode.style.minWidth = '0';
  profileCreditsNode.style.gridColumn = '1';
  profileCreditsNode.style.gridRow = '1';
  profileStats.appendChild(profileCreditsNode);

  const profileGemsNode = document.createElement('div');
  profileGemsNode.innerHTML = '◆ 0';
  profileGemsNode.style.color = '#b4bfd6';
  profileGemsNode.style.fontVariantNumeric = 'tabular-nums';
  profileGemsNode.style.display = 'grid';
  profileGemsNode.style.gridTemplateColumns = '10px auto';
  profileGemsNode.style.justifyContent = 'start';
  profileGemsNode.style.columnGap = '4px';
  profileGemsNode.style.whiteSpace = 'nowrap';
  profileGemsNode.style.overflow = 'hidden';
  profileGemsNode.style.textOverflow = 'ellipsis';
  profileGemsNode.style.fontSize = '11px';
  profileGemsNode.style.fontWeight = '800';
  profileGemsNode.style.width = '100%';
  profileGemsNode.style.minWidth = '0';
  profileGemsNode.style.gridColumn = '1';
  profileGemsNode.style.gridRow = '2';
  profileStats.appendChild(profileGemsNode);

  const profileEnergyStats = profileStats;

  for (const [index, resource] of RESOURCE_DISPLAY.entries()) {
    const resourceNode = document.createElement('div');
    resourceNode.title = resource.key;
    resourceNode.style.display = 'grid';
    resourceNode.style.gridTemplateColumns = '10px auto';
    resourceNode.style.alignItems = 'center';
    resourceNode.style.columnGap = '4px';
    resourceNode.style.width = '100%';
    resourceNode.style.minWidth = '0';
    resourceNode.style.padding = '0';
    resourceNode.style.gridColumn = index % 2 === 0 ? String(2 + (index / 2)) : String(2 + ((index - 1) / 2));
    resourceNode.style.gridRow = index % 2 === 0 ? '1' : '2';

    const resourceIconNode = document.createElement('span');
    applyResourceIconStyles(resourceIconNode, resource, 11, 'inline');

    const resourceAmountNode = document.createElement('span');
    resourceAmountNode.textContent = '0';
    resourceAmountNode.style.color = '#e8efff';
    resourceAmountNode.style.fontVariantNumeric = 'tabular-nums';
    resourceAmountNode.style.fontSize = '11px';
    resourceAmountNode.style.fontWeight = '800';
    resourceAmountNode.style.whiteSpace = 'nowrap';

    resourceNode.appendChild(resourceIconNode);
    resourceNode.appendChild(resourceAmountNode);
    profileEnergyStats.appendChild(resourceNode);
    topBarResourceAmountNodes.set(resource.key, resourceAmountNode);
  }

  const floatingEnergyBox = document.createElement('div');
  floatingEnergyBox.style.position = 'absolute';
  floatingEnergyBox.style.top = '100%';
  floatingEnergyBox.style.right = '48px';
  floatingEnergyBox.style.transform = 'translateY(-50%)';
  floatingEnergyBox.style.zIndex = '34';
  floatingEnergyBox.style.display = 'flex';
  floatingEnergyBox.style.alignItems = 'center';
  floatingEnergyBox.style.gap = '6px';
  floatingEnergyBox.style.width = 'fit-content';
  floatingEnergyBox.style.minWidth = '0';
  floatingEnergyBox.style.maxWidth = 'none';
  floatingEnergyBox.style.aspectRatio = 'auto';
  floatingEnergyBox.style.padding = '2px 6px 2px 8px';
  floatingEnergyBox.style.background = 'linear-gradient(180deg, rgba(16, 23, 38, 0.82), rgba(7, 12, 24, 0.78))';
  floatingEnergyBox.style.border = '1px solid rgba(158, 176, 204, 0.18)';
  floatingEnergyBox.style.borderRadius = '4px';
  floatingEnergyBox.style.boxShadow = '0 14px 28px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.06)';
  floatingEnergyBox.style.backdropFilter = 'blur(14px)';
  profilePanel.appendChild(floatingEnergyBox);

  const profileEnergyIconNode = document.createElement('div');
  profileEnergyIconNode.textContent = 'E';
  profileEnergyIconNode.title = 'Energy';
  profileEnergyIconNode.style.display = 'inline-flex';
  profileEnergyIconNode.style.alignItems = 'center';
  profileEnergyIconNode.style.justifyContent = 'center';
  profileEnergyIconNode.style.width = '16px';
  profileEnergyIconNode.style.height = '16px';
  profileEnergyIconNode.style.color = '#d7e1f2';
  profileEnergyIconNode.style.fontSize = '11px';
  profileEnergyIconNode.style.fontWeight = '800';
  profileEnergyIconNode.style.lineHeight = '1';
  profileEnergyIconNode.style.flex = '0 0 auto';
  floatingEnergyBox.appendChild(profileEnergyIconNode);

  const profileEnergyUsageNode = document.createElement('div');
  profileEnergyUsageNode.textContent = '0';
  profileEnergyUsageNode.style.color = 'rgba(232,239,255,0.88)';
  profileEnergyUsageNode.style.fontVariantNumeric = 'tabular-nums';
  profileEnergyUsageNode.style.fontSize = '11px';
  profileEnergyUsageNode.style.fontWeight = '800';
  profileEnergyUsageNode.style.whiteSpace = 'nowrap';
  floatingEnergyBox.appendChild(profileEnergyUsageNode);

  const profileEnergyBarTrack = document.createElement('div');
  profileEnergyBarTrack.style.position = 'relative';
  profileEnergyBarTrack.style.flex = '0 0 56px';
  profileEnergyBarTrack.style.minWidth = '56px';
  profileEnergyBarTrack.style.maxWidth = '56px';
  profileEnergyBarTrack.style.height = '3px';
  profileEnergyBarTrack.style.borderRadius = '0';
  profileEnergyBarTrack.style.background = 'rgba(255,255,255,0.12)';
  profileEnergyBarTrack.style.border = '0';
  profileEnergyBarTrack.style.overflow = 'hidden';
  profileEnergyBarTrack.style.boxShadow = 'none';
  floatingEnergyBox.appendChild(profileEnergyBarTrack);

  const profileEnergyBarFill = document.createElement('div');
  profileEnergyBarFill.style.height = '100%';
  profileEnergyBarFill.style.width = '0%';
  profileEnergyBarFill.style.borderRadius = '0';
  profileEnergyBarFill.style.background = 'linear-gradient(90deg, #8ea0b8, #d6e0f2)';
  profileEnergyBarFill.style.boxShadow = '0 0 10px rgba(147,164,189,0.18)';
  profileEnergyBarTrack.appendChild(profileEnergyBarFill);

  const profileEnergyMaxNode = document.createElement('div');
  profileEnergyMaxNode.textContent = '0';
  profileEnergyMaxNode.style.color = 'rgba(190, 202, 224, 0.84)';
  profileEnergyMaxNode.style.fontVariantNumeric = 'tabular-nums';
  profileEnergyMaxNode.style.fontSize = '10px';
  profileEnergyMaxNode.style.fontWeight = '800';
  profileEnergyMaxNode.style.whiteSpace = 'nowrap';
  floatingEnergyBox.appendChild(profileEnergyMaxNode);

  const topActionGroup = document.createElement('div');
  topActionGroup.style.display = 'flex';
  topActionGroup.style.alignItems = 'center';
  topActionGroup.style.gap = '4px';
  topActionGroup.style.flex = '0 0 auto';
  profilePanel.appendChild(topActionGroup);

  const objectivesButton = document.createElement('button');
  objectivesButton.type = 'button';
  objectivesButton.textContent = '◎';
  objectivesButton.title = 'Objectives';
  objectivesButton.setAttribute('aria-label', 'Objectives');
  objectivesButton.style.display = 'inline-flex';
  objectivesButton.style.alignItems = 'center';
  objectivesButton.style.justifyContent = 'center';
  objectivesButton.style.width = '34px';
  objectivesButton.style.height = '34px';
  objectivesButton.style.padding = '0';
  objectivesButton.style.marginLeft = '0';
  objectivesButton.style.background = 'rgba(255,255,255,0.05)';
  objectivesButton.style.color = '#e8efff';
  objectivesButton.style.border = '1px solid rgba(148,163,184,0.18)';
  objectivesButton.style.borderRadius = '14px';
  objectivesButton.style.cursor = 'pointer';
  objectivesButton.style.fontSize = '16px';
  objectivesButton.style.fontWeight = '800';
  objectivesButton.style.lineHeight = '1';
  objectivesButton.style.flex = '0 0 auto';
  topActionGroup.appendChild(objectivesButton);

  const notificationButton = document.createElement('button');
  notificationButton.type = 'button';
  notificationButton.textContent = '🔔';
  notificationButton.title = 'Notifications';
  notificationButton.setAttribute('aria-label', 'Notifications');
  notificationButton.style.display = 'inline-flex';
  notificationButton.style.alignItems = 'center';
  notificationButton.style.justifyContent = 'center';
  notificationButton.style.width = '34px';
  notificationButton.style.height = '34px';
  notificationButton.style.padding = '0';
  notificationButton.style.marginLeft = '0';
  notificationButton.style.background = 'rgba(255,255,255,0.05)';
  notificationButton.style.color = '#e8efff';
  notificationButton.style.border = '1px solid rgba(148,163,184,0.18)';
  notificationButton.style.borderRadius = '14px';
  notificationButton.style.cursor = 'pointer';
  notificationButton.style.fontSize = '16px';
  notificationButton.style.lineHeight = '1';
  notificationButton.style.flex = '0 0 auto';
  topActionGroup.appendChild(notificationButton);

  const panelNavBar = document.createElement('div');
  panelNavBar.style.position = 'absolute';
  panelNavBar.style.right = '0';
  panelNavBar.style.bottom = '0';
  panelNavBar.style.zIndex = '35';
  panelNavBar.style.display = 'flex';
  panelNavBar.style.alignItems = 'stretch';
  panelNavBar.style.justifyContent = 'space-between';
  panelNavBar.style.gap = '10px';
  panelNavBar.style.width = sidePanelWidth;
  panelNavBar.style.boxSizing = 'border-box';
  panelNavBar.style.padding = '8px 14px';
  panelNavBar.style.background = 'linear-gradient(180deg, rgba(8, 13, 27, 0.68), rgba(5, 8, 22, 0.68))';
  panelNavBar.style.borderLeft = '1px solid rgba(148,163,184,0.18)';
  panelNavBar.style.borderTop = '1px solid rgba(148,163,184,0.1)';
  panelNavBar.style.boxShadow = '-18px 0 42px rgba(0,0,0,0.24)';
  panelNavBar.style.backdropFilter = 'blur(16px)';
  container.appendChild(panelNavBar);

  const panelNavItems = document.createElement('div');
  panelNavItems.style.display = 'flex';
  panelNavItems.style.alignItems = 'stretch';
  panelNavItems.style.justifyContent = 'space-between';
  panelNavItems.style.gap = '8px';
  panelNavItems.style.flex = '1 1 auto';
  panelNavItems.style.minWidth = '0';
  panelNavBar.appendChild(panelNavItems);

  const panelNavControls = document.createElement('div');
  panelNavControls.style.position = 'absolute';
  panelNavControls.style.right = '14px';
  panelNavControls.style.bottom = '52px';
  panelNavControls.style.zIndex = '36';
  panelNavControls.style.display = 'none';
  panelNavControls.style.alignItems = 'center';
  panelNavControls.style.justifyContent = 'flex-end';
  panelNavControls.style.gap = '8px';
  panelNavControls.style.padding = '2px 7px';
  panelNavControls.style.borderRadius = '7px';
  panelNavControls.style.background = 'rgba(3, 7, 18, 0.36)';
  panelNavControls.style.border = '1px solid rgba(148,163,184,0.16)';
  panelNavControls.style.backdropFilter = 'blur(12px)';
  panelNavControls.style.boxShadow = '0 12px 28px rgba(0,0,0,0.28)';
  panelNavControls.style.pointerEvents = 'auto';
  container.appendChild(panelNavControls);

  function setBottomNavVisual(button, isActive = false) {
    const isHovered = button.dataset.hovered === 'true';
    button.dataset.active = isActive ? 'true' : 'false';
    button.style.background = 'transparent';
    button.style.border = '0';
    button.style.boxShadow = 'none';
    button.style.color = isActive || isHovered ? '#ffffff' : 'rgba(232,239,255,0.68)';
    button.style.opacity = button.disabled ? '0.3' : isActive || isHovered ? '1' : '0.78';
  }

  function attachBottomNavHover(button) {
    button.addEventListener('mouseenter', () => {
      button.dataset.hovered = 'true';
      setBottomNavVisual(button, button.dataset.active === 'true');
    });
    button.addEventListener('mouseleave', () => {
      button.dataset.hovered = 'false';
      setBottomNavVisual(button, button.dataset.active === 'true');
    });
  }

  function createProfilePanelButton(label, icon) {
    const button = document.createElement('button');
    button.title = label;
    button.setAttribute('aria-label', label);
    button.dataset.bottomNav = 'true';
    button.dataset.active = 'false';
    button.dataset.hovered = 'false';
    button.style.display = 'flex';
    button.style.flexDirection = 'column';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.gap = '5px';
    button.style.flex = '1 1 0';
    button.style.minWidth = '0';
    button.style.padding = '4px 0 2px';
    button.style.background = 'transparent';
    button.style.color = 'rgba(232,239,255,0.68)';
    button.style.border = '0';
    button.style.borderRadius = '0';
    button.style.cursor = 'pointer';
    button.style.transition = 'opacity 140ms ease, color 140ms ease';

    const iconNode = document.createElement('span');
    iconNode.textContent = icon;
    iconNode.style.fontSize = '19px';
    iconNode.style.fontWeight = '800';
    iconNode.style.lineHeight = '1';

    const labelNode = document.createElement('span');
    labelNode.textContent = label;
    labelNode.style.fontSize = '10.5px';
    labelNode.style.fontWeight = '700';
    labelNode.style.lineHeight = '1';
    labelNode.style.whiteSpace = 'nowrap';
    labelNode.style.opacity = '0.82';

    button.appendChild(iconNode);
    button.appendChild(labelNode);
    attachBottomNavHover(button);
    setBottomNavVisual(button, false);
    return button;
  }

  const inventoryButton = createProfilePanelButton('Inventory', '▦');
  panelNavItems.appendChild(inventoryButton);

  const productionButton = createProfilePanelButton('Production', '⚙');
  panelNavItems.appendChild(productionButton);

  const shipDesignerButton = createProfilePanelButton('Ships', 'S');
  panelNavItems.appendChild(shipDesignerButton);

  const marketButton = createProfilePanelButton('Market', '$');
  panelNavItems.appendChild(marketButton);

  const allianceButton = createProfilePanelButton('Alliance', '◆');
  panelNavItems.appendChild(allianceButton);

  function createPanelControlButton(label, icon) {
    const button = document.createElement('button');
    button.type = 'button';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.dataset.bottomNav = 'true';
    button.dataset.active = 'false';
    button.dataset.hovered = 'false';
    button.style.display = 'inline-flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.width = '22px';
    button.style.height = '26px';
    button.style.padding = '0';
    button.style.background = 'transparent';
    button.style.border = '0';
    button.style.borderRadius = '0';
    button.style.color = 'rgba(232,239,255,0.78)';
    button.style.cursor = 'pointer';
    button.style.fontSize = '22px';
    button.style.fontWeight = '400';
    button.style.lineHeight = '1';
    button.style.transition = 'opacity 140ms ease, color 140ms ease';
    button.textContent = icon;
    attachBottomNavHover(button);
    setBottomNavVisual(button, false);
    return button;
  }

  const panelBackButton = createPanelControlButton('Back', '‹');
  panelNavControls.appendChild(panelBackButton);

  const panelCloseButton = createPanelControlButton('Close', '×');
  panelNavControls.appendChild(panelCloseButton);

  const rightPanel = document.createElement('div');
  rightPanel.style.position = 'absolute';
  rightPanel.style.top = '0';
  rightPanel.style.right = '0';
  rightPanel.style.bottom = '0';
  rightPanel.style.zIndex = '25';
  rightPanel.style.width = sidePanelWidth;
  rightPanel.style.maxWidth = '100vw';
  rightPanel.style.height = '100vh';
  rightPanel.style.boxSizing = 'border-box';
  rightPanel.style.overflow = 'hidden';
  rightPanel.style.padding = '0';
  rightPanel.style.background = 'transparent';
  rightPanel.style.borderLeft = '0';
  rightPanel.style.borderTop = '0';
  rightPanel.style.borderRight = '0';
  rightPanel.style.borderBottom = '0';
  rightPanel.style.borderRadius = '0';
  rightPanel.style.boxShadow = 'none';
  rightPanel.style.color = '#e8efff';
  rightPanel.style.opacity = '0';
  rightPanel.style.pointerEvents = 'none';
  rightPanel.style.transform = 'translateX(100%)';
  rightPanel.style.transition = 'transform 180ms ease-out, opacity 180ms ease-out';
  rightPanel.style.backdropFilter = 'none';
  container.appendChild(rightPanel);
  const rightPanelRoot = createRoot(rightPanel);

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
  rightPanelCloseButton.textContent = 'x';
  rightPanelCloseButton.title = 'Close';
  rightPanelCloseButton.setAttribute('aria-label', 'Close panel');
  rightPanelCloseButton.style.display = 'inline-flex';
  rightPanelCloseButton.style.alignItems = 'center';
  rightPanelCloseButton.style.justifyContent = 'center';
  rightPanelCloseButton.style.width = '20px';
  rightPanelCloseButton.style.height = '24px';
  rightPanelCloseButton.style.padding = '0';
  rightPanelCloseButton.style.background = 'transparent';
  rightPanelCloseButton.style.color = 'rgba(255,255,255,0.72)';
  rightPanelCloseButton.style.border = '0';
  rightPanelCloseButton.style.borderRadius = '0';
  rightPanelCloseButton.style.cursor = 'pointer';
  rightPanelCloseButton.style.fontSize = '18px';
  rightPanelCloseButton.style.fontWeight = '300';
  rightPanelCloseButton.style.lineHeight = '1';
  rightPanelHeader.appendChild(rightPanelCloseButton);

  const rightPanelBody = document.createElement('div');
  rightPanelBody.style.fontSize = '12px';
  rightPanelBody.style.color = 'rgba(255,255,255,0.82)';
  rightPanelBody.style.lineHeight = '1.45';
  rightPanel.appendChild(rightPanelBody);

  const productionSection = document.createElement('div');
  productionSection.style.display = 'none';
  productionSection.style.marginTop = '0';
  productionSection.style.paddingTop = '0';
  productionSection.style.borderTop = '0';
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

  let selectedProductionItemId = ITEM_DEFINITIONS[0]?.id ?? null;
  let rightSideMenuHasRendered = false;
  let rightSideMenuPendingAfterMotion = false;
  let lastPerformanceGraphDrawAt = 0;

  const productionDropdown = document.createElement('div');
  productionDropdown.style.position = 'relative';
  productionDropdown.style.flex = '1';
  productionDropdown.style.minWidth = '0';
  productionControls.appendChild(productionDropdown);

  const productionDropdownButton = document.createElement('button');
  productionDropdownButton.type = 'button';
  productionDropdownButton.style.width = '100%';
  productionDropdownButton.style.padding = '8px 10px';
  productionDropdownButton.style.background = '#07111f';
  productionDropdownButton.style.color = 'white';
  productionDropdownButton.style.border = '1px solid rgba(125,211,252,0.34)';
  productionDropdownButton.style.borderRadius = '10px';
  productionDropdownButton.style.boxShadow = 'inset 0 0 0 1px rgba(255,255,255,0.04), 0 8px 18px rgba(0,0,0,0.22)';
  productionDropdownButton.style.cursor = 'pointer';
  productionDropdownButton.style.fontSize = '12px';
  productionDropdownButton.style.fontWeight = '700';
  productionDropdownButton.style.textAlign = 'left';
  productionDropdown.appendChild(productionDropdownButton);

  const productionDropdownMenu = document.createElement('div');
  productionDropdownMenu.style.position = 'absolute';
  productionDropdownMenu.style.top = 'calc(100% + 6px)';
  productionDropdownMenu.style.left = '0';
  productionDropdownMenu.style.right = '0';
  productionDropdownMenu.style.zIndex = '30';
  productionDropdownMenu.style.display = 'none';
  productionDropdownMenu.style.maxHeight = '420px';
  productionDropdownMenu.style.overflowY = 'auto';
  productionDropdownMenu.style.padding = '6px';
  productionDropdownMenu.style.background = 'rgba(8, 13, 27, 0.78)';
  productionDropdownMenu.style.border = '1px solid rgba(125,211,252,0.34)';
  productionDropdownMenu.style.borderRadius = '12px';
  productionDropdownMenu.style.boxShadow = '0 18px 36px rgba(0,0,0,0.42)';
  productionDropdown.appendChild(productionDropdownMenu);

  const addProductionButton = document.createElement('button');
  addProductionButton.textContent = 'Add';
  addProductionButton.style.padding = '7px 10px';
  addProductionButton.style.background = 'rgba(148,163,184,0.18)';
  addProductionButton.style.color = '#e8efff';
  addProductionButton.style.border = '1px solid rgba(148,163,184,0.42)';
  addProductionButton.style.borderRadius = '14px';
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
  resourcePanel.style.background = 'rgba(26,23,19,0.94)';
  resourcePanel.style.color = '#e8efff';
  resourcePanel.style.border = '1px solid rgba(148,163,184,0.18)';
  resourcePanel.style.borderRadius = '16px';
  resourcePanel.style.marginTop = '8px';
  resourcePanel.style.maxWidth = '280px';
  resourcePanel.style.fontSize = '12px';
  resourcePanel.style.display = 'none';
  resourcePanel.textContent = 'No player resources loaded yet.';
  uiContainer.appendChild(resourcePanel);

  const performancePanel = document.createElement('div');
  performancePanel.style.position = 'absolute';
  performancePanel.style.left = '10px';
  performancePanel.style.bottom = '10px';
  performancePanel.style.width = '240px';
  performancePanel.style.padding = '8px';
  performancePanel.style.background = 'linear-gradient(180deg, rgba(19,22,26,0.94), rgba(26,23,19,0.94))';
  performancePanel.style.color = '#e8efff';
  performancePanel.style.border = '1px solid rgba(148,163,184,0.18)';
  performancePanel.style.borderRadius = '18px';
  performancePanel.style.boxShadow = '0 18px 42px rgba(0,0,0,0.28)';
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
  performanceStats.style.lineHeight = '1.35';
  performanceStats.style.whiteSpace = 'pre-line';
  performanceStats.textContent = 'FPS: -- | Frame: -- ms | Load: --\nLoading: -- s';
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
  settingsContainer.style.bottom = '168px';
  settingsContainer.style.left = '10px';
  settingsContainer.style.zIndex = '10';
  container.appendChild(settingsContainer);

  // Settings button
  const settingsButton = document.createElement('button');
  settingsButton.textContent = '⚙️ Settings';
  settingsButton.style.padding = '8px 12px';
  settingsButton.style.background = 'rgba(26,23,19,0.9)';
  settingsButton.style.color = '#e8efff';
  settingsButton.style.border = '1px solid rgba(148,163,184,0.18)';
  settingsButton.style.borderRadius = '12px';
  settingsButton.style.cursor = 'pointer';
  settingsButton.style.marginBottom = '8px';
  settingsButton.style.display = 'block';
  settingsContainer.appendChild(settingsButton);

  // Settings panel
  const settingsPanel = document.createElement('div');
  settingsPanel.style.background = 'linear-gradient(180deg, rgba(19,22,26,0.96), rgba(26,23,19,0.96))';
  settingsPanel.style.border = '1px solid rgba(148,163,184,0.18)';
  settingsPanel.style.borderRadius = '18px';
  settingsPanel.style.padding = '12px';
  settingsPanel.style.width = '260px';
  settingsPanel.style.maxHeight = 'min(78vh, 760px)';
  settingsPanel.style.overflowY = 'auto';
  settingsPanel.style.display = 'none';
  settingsPanel.style.marginBottom = '8px';
  settingsPanel.style.boxShadow = '0 18px 42px rgba(0,0,0,0.28)';
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

  const blurTerritoriesLabel = document.createElement('label');
  blurTerritoriesLabel.style.display = 'block';
  blurTerritoriesLabel.style.color = 'white';
  blurTerritoriesLabel.style.marginBottom = '8px';
  blurTerritoriesLabel.style.cursor = 'pointer';

  const blurTerritoriesCheckbox = document.createElement('input');
  blurTerritoriesCheckbox.type = 'checkbox';
  blurTerritoriesCheckbox.checked = initialShowBlurTerritories;
  blurTerritoriesCheckbox.style.marginRight = '6px';

  blurTerritoriesLabel.appendChild(blurTerritoriesCheckbox);
  blurTerritoriesLabel.appendChild(document.createTextNode('Blur Territories'));
  settingsPanel.appendChild(blurTerritoriesLabel);

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
  resetGalaxyButton.style.background = 'rgba(127, 29, 29, 0.9)';
  resetGalaxyButton.style.color = 'white';
  resetGalaxyButton.style.border = '1px solid rgba(255,255,255,0.35)';
  resetGalaxyButton.style.borderRadius = '12px';
  resetGalaxyButton.style.cursor = 'pointer';
  resetGalaxyButton.style.width = '100%';
  resetGalaxyButton.style.marginBottom = '8px';
  settingsPanel.appendChild(resetGalaxyButton);

  const clearDatabaseButton = document.createElement('button');
  clearDatabaseButton.textContent = 'Clear Database';
  clearDatabaseButton.style.padding = '8px 12px';
  clearDatabaseButton.style.background = 'rgba(30, 64, 175, 0.9)';
  clearDatabaseButton.style.color = 'white';
  clearDatabaseButton.style.border = '1px solid rgba(255,255,255,0.35)';
  clearDatabaseButton.style.borderRadius = '12px';
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
    selectedPlanetId: null,
    isApplyingDeepLink: false,
    showResourceDebug: false,
    showPerformanceGraph: true,
    performanceMode: false,
    isCameraMoving: false,
    showBlurTerritories: initialShowBlurTerritories,
    showPopulationTiming: false,
    playerState: null,
    suppressCanvasClick: false,
    cachedPlayerStates: new Map(),
    loadingOwnerProfileIds: new Set(),
    attemptedOwnerProfileIds: new Set(),
    viewedProfileState: null,
    viewedProfileLoading: false,
    viewedProfileErrorMessage: '',
    performanceHistory: [],
    lastFrameTimestamp: null,
    performanceGraphFrameId: null,
    loadingTimeMs: null,
    hasPendingInfrastructureChanges: false,
    hasPendingTerritoryChanges: false,
    infrastructureBaselineByPlanetId: new Map(),
    infrastructureStatusMessage: '',
    onInfrastructureChanged: null,
    onSaveInfrastructureChanges: null,
    onCollectStarResources: null,
    onSetCapitalStar: null,
    onCameraMovementChanged: null,
    onMoveMissionCalculateRoute: null,
    onMoveMissionCommitMove: null,
    onMoveMissionCancel: null,
    onMoveMissionOpenFleet: null,
    onAttackMissionConfirm: null,
    onAttackMissionCancel: null,
    onTradeMissionCommit: null,
    onTradeMissionCancel: null,
    onTradeRouteOpenFleet: null,
    onPiracyZoneOpenFleet: null,
    handleTradeMissionPointerDown: null,
    handleTradeMissionPointerMove: null,
    handleTradeMissionPointerUp: null,
    handleTradeMissionPointerCancel: null,
    handleMoveMissionPointerDown: null,
    handleMoveMissionPointerMove: null,
    handleMoveMissionPointerUp: null,
    handleMoveMissionPointerCancel: null,
    getInfrastructureBuildCost: null,
    canAffordInfrastructureUpgrade: null,
    getSerializablePlayerState: null,
    getSerializableGalaxyState: null,
    useReactSystemPanel: true,
    moveMission: null,
    moveMissions: [],
    attackMission: null,
    tradeMission: null,
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
    if (!state.isCameraMoving && rightSideMenuPendingAfterMotion) {
      rightSideMenuPendingAfterMotion = false;
      renderRightSideMenu({ force: true });
    }
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

  blurTerritoriesCheckbox.addEventListener('change', () => {
    state.showBlurTerritories = blurTerritoriesCheckbox.checked;
    writeStoredBoolean(BLUR_TERRITORIES_STORAGE_KEY, state.showBlurTerritories);
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
        avatarImageUrl: options.avatarImageUrl ?? existingTerritory?.avatarImageUrl ?? '',
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
        avatarImageUrl: playerState.territory.avatarImageUrl ?? playerState.profileImageUrl ?? '',
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
        avatarImageUrl: territory.avatarImageUrl ?? '',
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

    const territoryRevisionAtSaveStart = state.territoryRevision;
    await sync.pushState();
    if (state.territoryRevision === territoryRevisionAtSaveStart) {
      state.hasPendingTerritoryChanges = false;
    }

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

  function getPendingInfrastructureResourceDelta() {
    const totalDelta = createEmptyResources();

    for (const star of state.galaxy.stars) {
      for (const planet of star.planets ?? []) {
        const committedInfrastructure = state.infrastructureBaselineByPlanetId.get(planet.id) ?? {};
        const currentInfrastructure = planet.infrastructure ?? {};
        const infrastructureKeys = new Set([
          ...Object.keys(committedInfrastructure),
          ...Object.keys(currentInfrastructure),
        ]);

        for (const infrastructureKey of infrastructureKeys) {
          const committedLevel = Math.max(
            0,
            Math.floor(Number(committedInfrastructure[infrastructureKey]) || 0)
          );
          const currentLevel = Math.max(
            0,
            Math.floor(Number(currentInfrastructure[infrastructureKey]) || 0)
          );

          if (currentLevel === committedLevel) {
            continue;
          }

          const deltaCost =
            currentLevel > committedLevel
              ? getInfrastructureUpgradeCostDelta(infrastructureKey, committedLevel, currentLevel)
              : getInfrastructureUpgradeCostDelta(infrastructureKey, currentLevel, committedLevel);

          for (const resourceKey of RESOURCE_KEYS) {
            totalDelta[resourceKey] +=
              (deltaCost[resourceKey] ?? 0) * (currentLevel > committedLevel ? -1 : 1);
          }
        }
      }
    }

    return totalDelta;
  }

  function getCommittedPlayerResources() {
    const currentResources = cloneResources(state.playerState?.resources);
    const pendingDelta = getPendingInfrastructureResourceDelta();

    for (const resourceKey of RESOURCE_KEYS) {
      currentResources[resourceKey] -= pendingDelta[resourceKey] ?? 0;
    }

    return currentResources;
  }

  function revertPendingInfrastructureChanges() {
    if (!state.hasPendingInfrastructureChanges) {
      return false;
    }

    for (const star of state.galaxy.stars) {
      for (const planet of star.planets ?? []) {
        const committedInfrastructure = state.infrastructureBaselineByPlanetId.get(planet.id);
        if (!committedInfrastructure) {
          continue;
        }

        planet.infrastructure = { ...committedInfrastructure };
      }

      recalculateStarDerivedStats(star);
    }

    if (state.playerState) {
      state.playerState = {
        ...state.playerState,
        resources: getCommittedPlayerResources(),
      };
    }

    state.hasPendingInfrastructureChanges = false;
    state.infrastructureStatusMessage = '';
    updateLocalPlayerProduction();
    renderPlayerResources();
    state.invalidateRender();
    return true;
  }

  function abandonPendingInfrastructureChanges() {
    return revertPendingInfrastructureChanges();
  }

  state.getSerializablePlayerState = ({ includePendingInfrastructure = false } = {}) => {
    const playerId = state.currentPlayerId ?? state.currentTerritoryId;
    if (!playerId || !state.playerState) {
      return null;
    }

    if (state.playerState.playerId && state.playerState.playerId !== playerId) {
      return null;
    }

    const { playerName, ...playerState } = state.playerState;
    const territory = state.territories.get(playerId);
    const serializableResources = state.hasPendingInfrastructureChanges && !includePendingInfrastructure
      ? getCommittedPlayerResources()
      : cloneResources(playerState.resources);

    return {
      ...playerState,
      playerId,
      resources: serializableResources,
      territory: territory
        ? {
            id: territory.id,
            name: territory.name,
            color: territory.color,
            faction: territory.faction,
            capitalStarId: territory.capitalStarId ?? null,
            stars: Array.from(territory.stars ?? []),
          }
        : playerState.territory ?? null,
    };
  };

  state.getSerializableGalaxyState = (
    serializableBaselineState,
    { includePendingInfrastructure = false } = {}
  ) => {
    const nextState = serializeGameState(state, serializableBaselineState);
    if (!state.hasPendingInfrastructureChanges || includePendingInfrastructure) {
      return nextState;
    }

    for (const [starId, starDiff] of Object.entries(nextState.starOverrides ?? {})) {
      if (!starDiff.planets) {
        continue;
      }

      for (const [planetId, planetDiff] of Object.entries(starDiff.planets)) {
        if (!planetDiff.infrastructure) {
          continue;
        }

        const committedInfrastructure = state.infrastructureBaselineByPlanetId.get(planetId) ?? {};

        for (const infrastructureKey of Object.keys(planetDiff.infrastructure)) {
          const currentLevel = Math.max(
            0,
            Math.floor(
              Number(state.starsById.get(starId)?.planets?.find((planet) => planet.id === planetId)?.infrastructure?.[infrastructureKey]) || 0
            )
          );
          const committedLevel = Math.max(
            0,
            Math.floor(Number(committedInfrastructure[infrastructureKey]) || 0)
          );

          if (currentLevel !== committedLevel) {
            delete planetDiff.infrastructure[infrastructureKey];
          }
        }

        if (Object.keys(planetDiff.infrastructure).length === 0) {
          delete planetDiff.infrastructure;
        }

        if (Object.keys(planetDiff).length === 0) {
          delete starDiff.planets[planetId];
        }
      }

      if (Object.keys(starDiff.planets).length === 0) {
        delete starDiff.planets;
      }

      if ('development' in starDiff) {
        const star = state.starsById.get(starId);
        const baselineDevelopment = serializableBaselineState.stars.get(starId)?.development ?? 0;
        const committedDevelopment = star
          ? calculateStarDevelopment({
              ...star,
              planets: (star.planets ?? []).map((planet) => ({
                ...planet,
                infrastructure: state.infrastructureBaselineByPlanetId.get(planet.id) ?? planet.infrastructure,
              })),
            })
          : baselineDevelopment;

        if (committedDevelopment !== baselineDevelopment) {
          starDiff.development = committedDevelopment;
        } else {
          delete starDiff.development;
        }
      }

      if (Object.keys(starDiff).length === 0) {
        delete nextState.starOverrides[starId];
      }
    }

    return nextState;
  };

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

  const LINKABLE_PANEL_NAMES = new Set([
    'inventory',
    'profile',
    'skills',
    'production',
    'ship-designer',
    'market',
    'alliance',
    'objectives',
    'system',
  ]);
  const SHIP_PANEL_VIEWS = new Set(['designer', 'fleet', 'mission']);

  function getShipPanelView() {
    const view = rightPanel.dataset.shipView ?? 'fleet';
    return SHIP_PANEL_VIEWS.has(view) ? view : 'fleet';
  }

  function setShipPanelView(view) {
    rightPanel.dataset.shipView = SHIP_PANEL_VIEWS.has(view) ? view : 'fleet';
  }

  function getShipPanelShipId() {
    return rightPanel.dataset.shipId ?? '';
  }

  function setShipPanelShipId(shipId) {
    if (shipId) {
      rightPanel.dataset.shipId = shipId;
      return;
    }

    delete rightPanel.dataset.shipId;
  }

  function getShipFleetModelKey(ship) {
    return String(ship?.templateId ?? ship?.id ?? ship?.name ?? ship?.type ?? '');
  }

  function getShipFleetPosition(ship) {
    return ship?.position ?? ship?.starId ?? null;
  }

  function getInventoryItemCount(items = {}, itemId) {
    return Math.max(0, Math.floor(Number(items?.[itemId]) || 0));
  }

  function hasInventoryItems(items = {}) {
    return Object.values(items ?? {}).some((value) => (Number(value) || 0) > 0);
  }

  function cloneShipCargoItems(ship = {}) {
    return cloneItemInventory(ship?.cargo?.items ?? ship?.cargoItems);
  }

  function getItemInventoryStorageUsed(items = {}) {
    return Object.entries(items ?? {}).reduce(
      (sum, [itemId, count]) => sum + getInventoryItemCount(items, itemId) * getItemStorageSize(itemId),
      0
    );
  }

  function getShipCargoCapacity(ship = {}) {
    const shipCount = Math.max(1, Math.floor(Number(ship?.count) || 1));
    return Math.max(0, Number(ship?.traits?.cargoCapacity) || 0) * shipCount;
  }

  function setShipCargoItems(ship, items = {}) {
    const nextShip = { ...ship };
    const cargoItems = cloneItemInventory(items);
    delete nextShip.cargoItems;

    if (hasInventoryItems(cargoItems)) {
      nextShip.cargo = {
        ...(ship?.cargo ?? {}),
        items: cargoItems,
      };
    } else {
      delete nextShip.cargo;
    }

    return nextShip;
  }

  function addItemInventoryCounts(target, source = {}) {
    for (const [itemId] of Object.entries(source ?? {})) {
      target[itemId] = getInventoryItemCount(target, itemId) + getInventoryItemCount(source, itemId);
    }
    return target;
  }

  function getShipStackKey(ship) {
    const position = getShipFleetPosition(ship);
    return [
      getShipFleetModelKey(ship),
      position ?? '',
      ship?.moveMissionId ?? '',
      position === 'Trading' ? ship?.tradeRouteId ?? '' : '',
      position === 'Piracy' ? ship?.piracyMissionId ?? '' : '',
    ].join('::');
  }

  function mergeShipStackRecords(left, right) {
    const mergedCargoItems = cloneShipCargoItems(left);
    addItemInventoryCounts(mergedCargoItems, cloneShipCargoItems(right));

    return setShipCargoItems(
      {
        ...left,
        count:
          Math.max(1, Math.floor(Number(left?.count) || 1)) +
          Math.max(1, Math.floor(Number(right?.count) || 1)),
      },
      mergedCargoItems
    );
  }

  function compactFleetShips(ships = []) {
    const compactedShips = [];
    const compactedByKey = new Map();

    for (const ship of ships ?? []) {
      if (!ship) {
        continue;
      }

      const normalizedShip = setShipCargoItems(
        {
          ...ship,
          count: Math.max(1, Math.floor(Number(ship.count) || 1)),
        },
        cloneShipCargoItems(ship)
      );
      const stackKey = getShipStackKey(normalizedShip);
      const existingShip = compactedByKey.get(stackKey);

      if (existingShip) {
        const mergedShip = mergeShipStackRecords(existingShip, normalizedShip);
        const existingIndex = compactedShips.indexOf(existingShip);
        if (existingIndex >= 0) {
          compactedShips[existingIndex] = mergedShip;
        }
        compactedByKey.set(stackKey, mergedShip);
      } else {
        compactedByKey.set(stackKey, normalizedShip);
        compactedShips.push(normalizedShip);
      }
    }

    return compactedShips;
  }

  function isSameFleetPosition(left, right) {
    if (left == null || right == null) {
      return left == null && right == null;
    }

    return String(left) === String(right);
  }

  function setHighlightedFleetShip(ship) {
    const modelKey = getShipFleetModelKey(ship);
    if (!modelKey) {
      delete rightPanel.dataset.fleetHighlightModelKey;
      delete rightPanel.dataset.fleetHighlightPosition;
      delete rightPanel.dataset.fleetHighlightMoveMissionId;
      delete rightPanel.dataset.fleetHighlightTradeRouteId;
      delete rightPanel.dataset.fleetHighlightPiracyMissionId;
      delete rightPanel.dataset.fleetHighlightToken;
      return;
    }

    rightPanel.dataset.fleetHighlightModelKey = modelKey;
    rightPanel.dataset.fleetHighlightPosition = getShipFleetPosition(ship) ?? '__unknown__';
    rightPanel.dataset.fleetHighlightToken = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (ship?.moveMissionId) {
      rightPanel.dataset.fleetHighlightMoveMissionId = ship.moveMissionId;
    } else {
      delete rightPanel.dataset.fleetHighlightMoveMissionId;
    }
    if (ship?.tradeRouteId) {
      rightPanel.dataset.fleetHighlightTradeRouteId = ship.tradeRouteId;
    } else {
      delete rightPanel.dataset.fleetHighlightTradeRouteId;
    }
    if (ship?.piracyMissionId) {
      rightPanel.dataset.fleetHighlightPiracyMissionId = ship.piracyMissionId;
    } else {
      delete rightPanel.dataset.fleetHighlightPiracyMissionId;
    }
  }

  function getHighlightedFleetShip() {
    const modelKey = rightPanel.dataset.fleetHighlightModelKey;
    if (!modelKey) {
      return null;
    }

    const storedPosition = rightPanel.dataset.fleetHighlightPosition;
    return {
      modelKey,
      position: storedPosition === '__unknown__' ? null : storedPosition ?? null,
      moveMissionId: rightPanel.dataset.fleetHighlightMoveMissionId ?? null,
      tradeRouteId: rightPanel.dataset.fleetHighlightTradeRouteId ?? null,
      piracyMissionId: rightPanel.dataset.fleetHighlightPiracyMissionId ?? null,
      highlightToken: rightPanel.dataset.fleetHighlightToken ?? null,
    };
  }

  function encodeShipMissionPart(value) {
    return encodeURIComponent(value == null ? '__none__' : String(value));
  }

  function getShipStackMissionId(ship) {
    return [
      'ship-stack',
      encodeShipMissionPart(getShipFleetModelKey(ship)),
      encodeShipMissionPart(getShipFleetPosition(ship)),
      encodeShipMissionPart(ship?.moveMissionId ?? null),
      encodeShipMissionPart(ship?.tradeRouteId ?? null),
    ].join(':');
  }

  function getStarDistance(left, right) {
    const dx = (left?.x ?? 0) - (right?.x ?? 0);
    const dy = (left?.y ?? 0) - (right?.y ?? 0);
    return Math.hypot(dx, dy);
  }

  function formatMoveDistance(lightYears) {
    const value = Math.max(0, Number(lightYears) || 0);
    if (value >= 10000) {
      return `${Math.round(value).toLocaleString('en-US')} ly`;
    }

    if (value >= 1000) {
      return `${Math.round(value / 10) * 10} ly`;
    }

    return `${Math.max(1, Math.round(value))} ly`;
  }

  function formatMoveTravelDays(days) {
    const value = Math.max(0, Number(days) || 0);
    if (value >= 365) {
      const years = value / 365;
      return `${years >= 10 ? Math.round(years) : years.toFixed(1)} years`;
    }

    if (value >= 2) {
      return `${Math.round(value)} days`;
    }

    return `${Math.max(1, Math.round(value * 24))} hours`;
  }

  function formatMoveRealDuration(durationMs) {
    const seconds = Math.max(1, Math.round((Number(durationMs) || 0) / 1000));
    if (seconds >= 3600) {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.round((seconds % 3600) / 60);
      return minutes > 0 ? `${hours}h ${minutes}m real time` : `${hours}h real time`;
    }

    if (seconds >= 60) {
      return `${Math.round(seconds / 60)}m real time`;
    }

    return `${seconds}s real time`;
  }

  const moveRouteNeighborCache = new Map();
  const moveRouteCache = new Map();
  const moveRouteEdgeClearCache = new Map();
  const MAX_DIRECT_MOVE_ROUTE_DISTANCE = 900;
  const MAX_REFINED_MOVE_ROUTE_STARS = 512;
  const MAX_MOVE_ROUTE_REFINEMENT_DEPTH = 24;
  const GALAXY_RADIUS_LIGHT_YEARS = 50000;
  const GALAXY_RADIUS_WORLD_UNITS = 18000;
  const LIGHT_YEARS_PER_WORLD_UNIT = GALAXY_RADIUS_LIGHT_YEARS / GALAXY_RADIUS_WORLD_UNITS;
  const BASE_MOVE_LIGHT_YEARS_PER_DAY = 12;
  const MOVE_LIGHT_YEARS_PER_DAY_PER_SPEED = 7;
  const MOVE_REAL_MS_PER_TRAVEL_DAY = 1000;
  const MIN_MOVE_TRAVEL_DURATION_MS = 1200;
  const MAX_TRADE_ROUTE_LIGHT_YEARS = 5000;
  const MAX_TRADE_ROUTE_SHIPS = 3;
  const TRADE_MIN_DISTANCE_MULTIPLIER = 0.25;
  const TRADE_REVENUE_MULTIPLIER = 0.18;
  const PIRACY_RADIUS_LIGHT_YEARS = 1000;
  const PIRACY_MIN_EFFICIENCY = 0.04;
  const PIRACY_MAX_EFFICIENCY = 0.65;

  function pushRouteHeap(heap, node) {
    heap.push(node);
    let index = heap.length - 1;

    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (heap[parentIndex].score <= node.score) {
        break;
      }

      heap[index] = heap[parentIndex];
      index = parentIndex;
    }

    heap[index] = node;
  }

  function popRouteHeap(heap) {
    if (!heap.length) {
      return null;
    }

    const first = heap[0];
    const last = heap.pop();
    if (heap.length && last) {
      let index = 0;

      while (true) {
        const leftIndex = index * 2 + 1;
        const rightIndex = leftIndex + 1;
        if (leftIndex >= heap.length) {
          break;
        }

        const smallerChildIndex =
          rightIndex < heap.length && heap[rightIndex].score < heap[leftIndex].score
            ? rightIndex
            : leftIndex;

        if (heap[smallerChildIndex].score >= last.score) {
          break;
        }

        heap[index] = heap[smallerChildIndex];
        index = smallerChildIndex;
      }

      heap[index] = last;
    }

    return first;
  }

  function getMoveRouteEdgeKey(leftStarId, rightStarId) {
    return String(leftStarId) < String(rightStarId)
      ? `${leftStarId}|${rightStarId}`
      : `${rightStarId}|${leftStarId}`;
  }

  function getMoveRouteRangeCandidates(minX, minY, maxX, maxY) {
    if (state.starSpatialIndex) {
      return state.starSpatialIndex.queryRange(minX, minY, maxX, maxY);
    }

    return state.galaxy?.stars ?? [];
  }

  function findMoveRouteIntermediateStar(fromStar, toStar, excludedIds = new Set()) {
    if (!fromStar || !toStar) {
      return null;
    }

    const dx = toStar.x - fromStar.x;
    const dy = toStar.y - fromStar.y;
    const segmentDistanceSq = dx * dx + dy * dy;
    if (segmentDistanceSq <= 0) {
      return null;
    }

    const centerX = (fromStar.x + toStar.x) / 2;
    const centerY = (fromStar.y + toStar.y) / 2;
    const radius = Math.sqrt(segmentDistanceSq) / 2;
    const radiusSq = radius * radius;
    const candidates = getMoveRouteRangeCandidates(centerX - radius, centerY - radius, centerX + radius, centerY + radius);
    let bestStar = null;
    let bestScore = Infinity;

    for (const candidate of candidates) {
      if (
        candidate.id === fromStar.id ||
        candidate.id === toStar.id ||
        excludedIds.has(candidate.id)
      ) {
        continue;
      }

      const centerDx = candidate.x - centerX;
      const centerDy = candidate.y - centerY;
      if (centerDx * centerDx + centerDy * centerDy > radiusSq * 0.995) {
        continue;
      }

      const projection = ((candidate.x - fromStar.x) * dx + (candidate.y - fromStar.y) * dy) / segmentDistanceSq;
      if (projection <= 0.04 || projection >= 0.96) {
        continue;
      }

      const projectedX = fromStar.x + dx * projection;
      const projectedY = fromStar.y + dy * projection;
      const perpendicularDx = candidate.x - projectedX;
      const perpendicularDy = candidate.y - projectedY;
      const perpendicularDistanceSq = perpendicularDx * perpendicularDx + perpendicularDy * perpendicularDy;
      const fromDistanceSq = (candidate.x - fromStar.x) ** 2 + (candidate.y - fromStar.y) ** 2;
      const toDistanceSq = (candidate.x - toStar.x) ** 2 + (candidate.y - toStar.y) ** 2;
      const longestHopSq = Math.max(fromDistanceSq, toDistanceSq);

      if (longestHopSq >= segmentDistanceSq * 0.98) {
        continue;
      }

      const balancePenalty = Math.abs(0.5 - projection) * segmentDistanceSq * 0.08;
      const score = longestHopSq + perpendicularDistanceSq * 0.35 + balancePenalty;
      if (score < bestScore) {
        bestScore = score;
        bestStar = candidate;
      }
    }

    return bestStar;
  }

  function isMoveRouteEdgeClear(fromStar, toStar) {
    if (!fromStar || !toStar) {
      return false;
    }

    const edgeKey = getMoveRouteEdgeKey(fromStar.id, toStar.id);
    if (moveRouteEdgeClearCache.has(edgeKey)) {
      return moveRouteEdgeClearCache.get(edgeKey);
    }

    const clear = !findMoveRouteIntermediateStar(
      fromStar,
      toStar,
      new Set([fromStar.id, toStar.id])
    );
    moveRouteEdgeClearCache.set(edgeKey, clear);
    return clear;
  }

  function pushUniqueRouteId(path, starId) {
    if (!starId) {
      return;
    }

    if (path[path.length - 1] !== starId) {
      path.push(starId);
    }
  }

  function appendRefinedMoveRouteSegment(path, fromStarId, toStarId, usedIds, depth = 0) {
    if (path.length >= MAX_REFINED_MOVE_ROUTE_STARS) {
      pushUniqueRouteId(path, toStarId);
      usedIds.add(toStarId);
      return;
    }

    const fromStar = state.starsById?.get(fromStarId);
    const toStar = state.starsById?.get(toStarId);
    if (!fromStar || !toStar || depth >= MAX_MOVE_ROUTE_REFINEMENT_DEPTH) {
      pushUniqueRouteId(path, toStarId);
      usedIds.add(toStarId);
      return;
    }

    const excludedIds = new Set(usedIds);
    excludedIds.add(fromStarId);
    excludedIds.add(toStarId);
    const intermediateStar = findMoveRouteIntermediateStar(fromStar, toStar, excludedIds);
    if (!intermediateStar) {
      pushUniqueRouteId(path, toStarId);
      usedIds.add(toStarId);
      return;
    }

    usedIds.add(intermediateStar.id);
    appendRefinedMoveRouteSegment(path, fromStarId, intermediateStar.id, usedIds, depth + 1);
    appendRefinedMoveRouteSegment(path, intermediateStar.id, toStarId, usedIds, depth + 1);
  }

  function refineMoveRoutePath(routeStarIds) {
    const compactRoute = [];
    for (const starId of routeStarIds ?? []) {
      if (starId && compactRoute[compactRoute.length - 1] !== starId) {
        compactRoute.push(starId);
      }
    }

    if (compactRoute.length <= 2) {
      const fromStar = state.starsById?.get(compactRoute[0]);
      const toStar = state.starsById?.get(compactRoute[1]);
      if (compactRoute.length < 2 || isMoveRouteEdgeClear(fromStar, toStar)) {
        return compactRoute;
      }
    }

    if (compactRoute.length <= 1) {
      return compactRoute;
    }

    const refinedRoute = [compactRoute[0]];
    const usedIds = new Set(compactRoute);

    for (let index = 0; index < compactRoute.length - 1; index += 1) {
      appendRefinedMoveRouteSegment(
        refinedRoute,
        compactRoute[index],
        compactRoute[index + 1],
        usedIds
      );
    }

    return refinedRoute;
  }

  function getMoveRouteNeighbors(starId, nearestCount = 14) {
    const cacheKey = `${nearestCount}:${starId}`;
    if (moveRouteNeighborCache.has(cacheKey)) {
      return moveRouteNeighborCache.get(cacheKey);
    }

    const star = state.starsById?.get(starId);
    if (!star || !state.starSpatialIndex) {
      return [];
    }

    let radius = 500;
    let candidates = [];

    while (radius <= 14000) {
      candidates = state.starSpatialIndex.queryRange(
        star.x - radius,
        star.y - radius,
        star.x + radius,
        star.y + radius
      ).filter((candidate) => candidate.id !== star.id);

      if (candidates.length >= nearestCount) {
        break;
      }

      radius *= 1.7;
    }

    const sortedCandidates = candidates
      .map((candidate) => {
        const dx = candidate.x - star.x;
        const dy = candidate.y - star.y;
        const distanceSq = dx * dx + dy * dy;
        return {
          id: candidate.id,
          distance: Math.sqrt(distanceSq),
          distanceSq,
        };
      })
      .sort((left, right) => left.distanceSq - right.distanceSq);

    const neighbors = [];
    for (const candidate of sortedCandidates) {
      const candidateStar = state.starsById?.get(candidate.id);
      if (!isMoveRouteEdgeClear(star, candidateStar)) {
        continue;
      }

      neighbors.push({ id: candidate.id, distance: candidate.distance });
      if (neighbors.length >= nearestCount) {
        break;
      }
    }

    moveRouteNeighborCache.set(cacheKey, neighbors);
    return neighbors;
  }

  function findNearestStarToWorldPoint(worldPoint) {
    let nearestStar = null;
    let nearestDistanceSq = Infinity;

    for (const star of state.galaxy?.stars ?? []) {
      const dx = star.x - worldPoint.x;
      const dy = star.y - worldPoint.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq < nearestDistanceSq) {
        nearestDistanceSq = distanceSq;
        nearestStar = star;
      }
    }

    return nearestStar;
  }

  function findNearestRouteStarToWorldPoint(worldPoint, excludedIds = new Set()) {
    if (!worldPoint) {
      return null;
    }

    let candidates = [];
    let radius = 600;

    if (state.starSpatialIndex) {
      while (radius <= 18000) {
        candidates = state.starSpatialIndex
          .queryRange(worldPoint.x - radius, worldPoint.y - radius, worldPoint.x + radius, worldPoint.y + radius)
          .filter((star) => !excludedIds.has(star.id));

        if (candidates.length) {
          break;
        }

        radius *= 1.8;
      }
    }

    if (!candidates.length) {
      candidates = (state.galaxy?.stars ?? []).filter((star) => !excludedIds.has(star.id));
    }

    let nearestStar = null;
    let nearestDistanceSq = Infinity;
    for (const star of candidates) {
      const dx = star.x - worldPoint.x;
      const dy = star.y - worldPoint.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq < nearestDistanceSq) {
        nearestStar = star;
        nearestDistanceSq = distanceSq;
      }
    }

    return nearestStar;
  }

  function buildInterpolatedMoveRoute(startStarId, destinationStarId) {
    const startStar = state.starsById?.get(startStarId);
    const destinationStar = state.starsById?.get(destinationStarId);
    if (!startStar || !destinationStar) {
      return [];
    }

    const distance = getStarDistance(startStar, destinationStar);
    const stepCount = Math.max(2, Math.min(240, Math.ceil(distance / 650)));
    const path = [startStarId];
    const pathIds = new Set(path);

    for (let step = 1; step < stepCount; step += 1) {
      const progress = step / stepCount;
      const worldPoint = {
        x: startStar.x + (destinationStar.x - startStar.x) * progress,
        y: startStar.y + (destinationStar.y - startStar.y) * progress,
      };
      const routeStar = findNearestRouteStarToWorldPoint(worldPoint, new Set([...pathIds, destinationStarId]));
      if (!routeStar || pathIds.has(routeStar.id) || routeStar.id === destinationStarId) {
        continue;
      }

      path.push(routeStar.id);
      pathIds.add(routeStar.id);
    }

    path.push(destinationStarId);
    return path;
  }

  function runAStarRoute(startStarId, destinationStarId, nearestCount) {
    const destinationStar = state.starsById.get(destinationStarId);
    if (!destinationStar) {
      return [];
    }

    if (!startStarId || !destinationStarId) {
      return [];
    }

    if (startStarId === destinationStarId) {
      return [startStarId];
    }

    const openHeap = [];
    const cameFrom = new Map();
    const gScore = new Map([[startStarId, 0]]);
    const visited = new Set();
    const maxIterations = Math.max(1, state.galaxy?.stars?.length ?? 1);
    let iterations = 0;

    pushRouteHeap(openHeap, {
      id: startStarId,
      score: getStarDistance(state.starsById.get(startStarId), destinationStar),
    });

    while (openHeap.length && iterations < maxIterations) {
      iterations += 1;
      const current = popRouteHeap(openHeap);
      const currentId = current?.id;
      if (!currentId || visited.has(currentId)) {
        continue;
      }

      visited.add(currentId);

      if (!currentId) {
        break;
      }

      if (currentId === destinationStarId) {
        const path = [currentId];
        while (cameFrom.has(path[0])) {
          path.unshift(cameFrom.get(path[0]));
        }
        return path;
      }

      for (const neighbor of getMoveRouteNeighbors(currentId, nearestCount)) {
        if (visited.has(neighbor.id)) {
          continue;
        }

        const tentativeGScore = (gScore.get(currentId) ?? Infinity) + neighbor.distance;
        if (tentativeGScore >= (gScore.get(neighbor.id) ?? Infinity)) {
          continue;
        }

        cameFrom.set(neighbor.id, currentId);
        gScore.set(neighbor.id, tentativeGScore);
        pushRouteHeap(openHeap, {
          id: neighbor.id,
          score: tentativeGScore + getStarDistance(state.starsById.get(neighbor.id), destinationStar),
        });
      }
    }

    return [];
  }

  function calculateAStarRoute(startStarId, destinationStarId) {
    if (!startStarId || !destinationStarId) {
      return [];
    }

    if (startStarId === destinationStarId) {
      return [startStarId];
    }

    const routeCacheKey = `${startStarId}->${destinationStarId}`;
    if (moveRouteCache.has(routeCacheKey)) {
      return [...moveRouteCache.get(routeCacheKey)];
    }

    const startStar = state.starsById?.get(startStarId);
    const destinationStar = state.starsById?.get(destinationStarId);
    const directRouteDistance = getStarDistance(startStar, destinationStar);

    for (const nearestCount of [14, 24, 40, 64, 96]) {
      const path = runAStarRoute(startStarId, destinationStarId, nearestCount);
      const refinedPath = refineMoveRoutePath(path);
      const isLongDirectRoute = refinedPath.length === 2 && directRouteDistance > MAX_DIRECT_MOVE_ROUTE_DISTANCE;
      if (refinedPath.length > 1 && !isLongDirectRoute) {
        moveRouteCache.set(routeCacheKey, refinedPath);
        return [...refinedPath];
      }
    }

    const interpolatedPath = refineMoveRoutePath(buildInterpolatedMoveRoute(startStarId, destinationStarId));
    moveRouteCache.set(routeCacheKey, interpolatedPath);
    return [...interpolatedPath];
  }

  function getRouteDistanceWorldUnits(routeStarIds) {
    const stars = (routeStarIds ?? []).map((id) => state.starsById?.get(id)).filter(Boolean);
    let distance = 0;

    for (let index = 0; index < stars.length - 1; index += 1) {
      distance += getStarDistance(stars[index], stars[index + 1]);
    }

    return distance;
  }

  function getShipMoveSpeedRating(ship) {
    const storedSpeed = Number(ship?.runtime?.speed);
    if (Number.isFinite(storedSpeed) && storedSpeed > 0) {
      return storedSpeed;
    }

    const traits = ship?.traits ?? {};
    const hull = getShipHullDefinition(ship?.hullId) ?? null;
    const runtime = calculateShipRuntime(traits, ship?.modules ?? [], {
      hullWeight: hull?.hullWeight ?? 5,
    });
    const calculatedSpeed = Number(runtime.speed);
    if (Number.isFinite(calculatedSpeed) && calculatedSpeed > 0) {
      return calculatedSpeed;
    }

    return Math.max(1, Number(traits.thrust) || 1);
  }

  function calculateMoveTravelPlan(ship, routeStarIds) {
    const distanceWorldUnits = getRouteDistanceWorldUnits(routeStarIds);
    const distanceLightYears = distanceWorldUnits * LIGHT_YEARS_PER_WORLD_UNIT;
    const speedRating = getShipMoveSpeedRating(ship);
    const speedLightYearsPerDay = BASE_MOVE_LIGHT_YEARS_PER_DAY + speedRating * MOVE_LIGHT_YEARS_PER_DAY_PER_SPEED;
    const travelDays = distanceLightYears / Math.max(1, speedLightYearsPerDay);
    const realTravelDurationMs = Math.max(MIN_MOVE_TRAVEL_DURATION_MS, travelDays * MOVE_REAL_MS_PER_TRAVEL_DAY);

    return {
      distanceWorldUnits,
      distanceLightYears,
      speedRating,
      speedLightYearsPerDay,
      travelDays,
      realTravelDurationMs,
      travelSummary: {
        distanceText: formatMoveDistance(distanceLightYears),
        travelTimeText: formatMoveTravelDays(travelDays),
        speedText: `${Math.round(speedLightYearsPerDay)} ly/day`,
        realTimeText: formatMoveRealDuration(realTravelDurationMs),
      },
    };
  }

  let cameraFocusAnimationId = 0;

  function focusCameraOnStar(star) {
    if (!star) {
      return;
    }

    cameraFocusAnimationId += 1;
    const animationId = cameraFocusAnimationId;
    const startedAt = performance.now();
    const durationMs = 720;
    const startX = state.camera.x;
    const startY = state.camera.y;
    const startZoom = state.camera.zoom;
    const targetZoom = Math.min(state.camera.maxZoom, Math.max(startZoom * 1.16, startZoom + 0.07));

    state.isCameraMoving = true;
    state.onCameraMovementChanged?.(true);

    function animateCamera(now) {
      if (animationId !== cameraFocusAnimationId) {
        return;
      }

      const t = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      state.camera.x = startX + (star.x - startX) * eased;
      state.camera.y = startY + (star.y - startY) * eased;
      state.camera.zoom = startZoom + (targetZoom - startZoom) * eased;
      state.invalidateRender();

      if (t < 1) {
        requestAnimationFrame(animateCamera);
        return;
      }

      state.isCameraMoving = false;
      state.onCameraMovementChanged?.(false);
      state.invalidateRender();
    }

    requestAnimationFrame(animateCamera);
  }

  function applyMoveMissionShipMetadata(ship, metadata = {}) {
    const nextShip = {
      ...ship,
      ...(metadata ?? {}),
    };

    if (nextShip.position !== 'Moving') {
      delete nextShip.moveMissionId;
      delete nextShip.moveOriginStarId;
      delete nextShip.moveDestinationStarId;
      delete nextShip.moveArrivesAtMs;
    }

    if (nextShip.position !== 'Trading') {
      delete nextShip.tradeRouteId;
      delete nextShip.tradeOriginStarId;
      delete nextShip.tradeDestinationStarId;
      delete nextShip.tradeOriginName;
      delete nextShip.tradeDestinationName;
      delete nextShip.tradeRevenueCredits;
      delete nextShip.tradeDistanceLightYears;
    }

    if (nextShip.position !== 'Piracy') {
      delete nextShip.piracyMissionId;
      delete nextShip.piracyCenterStarId;
      delete nextShip.piracyCenterName;
      delete nextShip.piracyTerritoryId;
      delete nextShip.piracyTerritoryName;
      delete nextShip.piracyRadiusLightYears;
      delete nextShip.piracyEfficiency;
      delete nextShip.piracyStolenCredits;
      delete nextShip.piracyAffectedRouteCount;
    }

    return nextShip;
  }

  function moveShipStackToPosition(ships, ship, destinationPosition, options = {}) {
    const modelKey = getShipFleetModelKey(ship);
    const originPosition = options.originPosition ?? getShipFleetPosition(ship);
    const sourceMoveMissionId = Object.prototype.hasOwnProperty.call(options, 'sourceMoveMissionId')
      ? options.sourceMoveMissionId
      : ship?.moveMissionId ?? null;
    const sourceTradeRouteId = Object.prototype.hasOwnProperty.call(options, 'sourceTradeRouteId')
      ? options.sourceTradeRouteId
      : ship?.tradeRouteId ?? null;
    const destinationMoveMissionId = options.destinationMoveMissionId ?? null;
    const destinationTradeRouteId = options.destinationTradeRouteId ?? options.destinationMetadata?.tradeRouteId ?? null;
    const sourcePiracyMissionId = Object.prototype.hasOwnProperty.call(options, 'sourcePiracyMissionId')
      ? options.sourcePiracyMissionId
      : ship?.piracyMissionId ?? null;
    const destinationPiracyMissionId = options.destinationPiracyMissionId ?? options.destinationMetadata?.piracyMissionId ?? null;
    const destinationMetadata = options.destinationMetadata ?? {};
    const allowCreateFallback = options.allowCreateFallback !== false;
    const moveCount = Math.max(1, Math.floor(Number(ship.count) || 1));
    let remainingToMove = moveCount;
    const nextShips = [];
    let movedShip = null;
    let movedCountTotal = 0;
    const sourceShips = compactFleetShips(ships ?? []);

    for (const entry of sourceShips) {
      const entryMatches =
        getShipFleetModelKey(entry) === modelKey &&
        isSameFleetPosition(getShipFleetPosition(entry), originPosition) &&
        (!sourceMoveMissionId || entry.moveMissionId === sourceMoveMissionId) &&
        (!sourceTradeRouteId || entry.tradeRouteId === sourceTradeRouteId) &&
        (!sourcePiracyMissionId || entry.piracyMissionId === sourcePiracyMissionId) &&
        remainingToMove > 0;

      if (!entryMatches) {
        nextShips.push(entry);
        continue;
      }

      const entryCount = Math.max(1, Math.floor(Number(entry.count) || 1));
      const movedCount = Math.min(entryCount, remainingToMove);
      const entryCargoItems = cloneShipCargoItems(entry);
      if (hasInventoryItems(entryCargoItems) && movedCount < entryCount) {
        nextShips.push(entry);
        continue;
      }

      remainingToMove -= movedCount;
      movedCountTotal += movedCount;
      const movedEntry = applyMoveMissionShipMetadata(
        {
          ...entry,
          position: destinationPosition,
          count: movedCount,
        },
        {
          ...destinationMetadata,
          moveMissionId: destinationMoveMissionId ?? destinationMetadata.moveMissionId,
          tradeRouteId: destinationTradeRouteId ?? destinationMetadata.tradeRouteId,
          piracyMissionId: destinationPiracyMissionId ?? destinationMetadata.piracyMissionId,
        }
      );
      movedShip = movedShip ? mergeShipStackRecords(movedShip, movedEntry) : movedEntry;

      if (entryCount > movedCount) {
        nextShips.push({
          ...entry,
          count: entryCount - movedCount,
        });
      }
    }

    if (!movedShip && allowCreateFallback) {
      movedCountTotal = moveCount;
      movedShip = applyMoveMissionShipMetadata(
        {
          ...ship,
          position: destinationPosition,
          count: moveCount,
        },
        {
          ...destinationMetadata,
          moveMissionId: destinationMoveMissionId ?? destinationMetadata.moveMissionId,
          tradeRouteId: destinationTradeRouteId ?? destinationMetadata.tradeRouteId,
          piracyMissionId: destinationPiracyMissionId ?? destinationMetadata.piracyMissionId,
        }
      );
    }

    if (!movedShip) {
      return { ships: nextShips, movedCount: 0 };
    }

    const existingDestinationShip = nextShips.find(
      (entry) =>
        getShipFleetModelKey(entry) === modelKey &&
        isSameFleetPosition(getShipFleetPosition(entry), destinationPosition) &&
        (!destinationMoveMissionId || entry.moveMissionId === destinationMoveMissionId) &&
        (!destinationTradeRouteId || entry.tradeRouteId === destinationTradeRouteId) &&
        (!destinationPiracyMissionId || entry.piracyMissionId === destinationPiracyMissionId)
    );

    if (existingDestinationShip) {
      const mergedDestinationShip = mergeShipStackRecords(existingDestinationShip, movedShip);
      Object.assign(existingDestinationShip, mergedDestinationShip);
    } else {
      nextShips.push(movedShip);
    }

    return { ships: compactFleetShips(nextShips), movedCount: movedCountTotal };
  }

  function moveShipInventoryToDestination(ship, destinationStarId, options = {}) {
    if (!state.playerState || !ship || !destinationStarId) {
      return;
    }

    const moveResult = moveShipStackToPosition(state.playerState.ships ?? [], ship, destinationStarId, {
      originPosition: options.originPosition,
      sourceMoveMissionId: options.sourceMoveMissionId,
    });

    state.playerState = {
      ...state.playerState,
      ships: moveResult.ships,
    };
    state.cachedPlayerStates.set(state.currentPlayerId, structuredClone(state.playerState));
    void sync.pushState();
  }

  function getStationedShipCountAtStar(ship, starId) {
    if (!state.playerState || !ship || !starId) {
      return 0;
    }

    const modelKey = getShipFleetModelKey(ship);
    if (!modelKey) {
      return 0;
    }

    return (state.playerState.ships ?? []).reduce((count, fleetShip) => {
      if (
        getShipFleetModelKey(fleetShip) === modelKey &&
        isSameFleetPosition(getShipFleetPosition(fleetShip), starId)
      ) {
        return count + Math.max(1, Math.floor(Number(fleetShip.count) || 1));
      }

      return count;
    }, 0);
  }

  function canShipAttackStar(ship, starId) {
    if (!state.currentPlayerId || !state.playerState || !ship || !starId) {
      return false;
    }

    if (getShipFleetPosition(ship) === 'Moving') {
      return false;
    }

    const occupiedTerritory = findTerritoryByStarId(starId);
    if (!occupiedTerritory || occupiedTerritory.territoryId === state.currentPlayerId) {
      return false;
    }

    const requiredShipCount = Math.max(1, Math.floor(Number(ship.count) || 1));
    return getStationedShipCountAtStar(ship, starId) >= requiredShipCount;
  }

  function getMissionFleetShipIndex(ship, sourceShips = []) {
    if (!ship) {
      return -1;
    }

    const modelKey = getShipFleetModelKey(ship);
    const position = getShipFleetPosition(ship);
    return sourceShips.findIndex(
      (entry) =>
        getShipFleetModelKey(entry) === modelKey &&
        isSameFleetPosition(getShipFleetPosition(entry), position) &&
        (!ship.moveMissionId || entry.moveMissionId === ship.moveMissionId) &&
        (!ship.tradeRouteId || entry.tradeRouteId === ship.tradeRouteId)
    );
  }

  function hasMissionShipCargoItem(ship, itemId, count = 1) {
    if (!state.playerState || !ship || !itemId) {
      return false;
    }

    const sourceShips = compactFleetShips(state.playerState.ships ?? []);
    const shipIndex = getMissionFleetShipIndex(ship, sourceShips);
    if (shipIndex < 0) {
      return false;
    }

    return getInventoryItemCount(cloneShipCargoItems(sourceShips[shipIndex]), itemId) >= count;
  }

  function consumeMissionShipCargoItem(ship, itemId, count = 1) {
    if (!state.playerState || !ship || !itemId) {
      return { ok: false, message: 'No ship selected for this mission.' };
    }

    const sourceShips = compactFleetShips(state.playerState.ships ?? []);
    const shipIndex = getMissionFleetShipIndex(ship, sourceShips);
    if (shipIndex < 0) {
      return { ok: false, message: 'Mission ship could not be found.' };
    }

    const sourceShip = sourceShips[shipIndex];
    const cargoItems = cloneShipCargoItems(sourceShip);
    const availableCount = getInventoryItemCount(cargoItems, itemId);
    if (availableCount < count) {
      const itemName = getItemDefinition(itemId)?.name ?? itemId;
      return { ok: false, message: `${itemName} is not loaded on this ship.` };
    }

    cargoItems[itemId] = availableCount - count;
    const updatedShip = setShipCargoItems(sourceShip, cargoItems);
    const nextShips = sourceShips.map((entry, index) => (index === shipIndex ? updatedShip : entry));

    return {
      ok: true,
      ships: compactFleetShips(nextShips),
      ship: updatedShip,
    };
  }

  function isUncolonizedStar(star) {
    return Boolean(
      star &&
      !findTerritoryByStarId(star.id) &&
      (!star.owner || star.owner === 'Unclaimed')
    );
  }

  function getBestColonizationPlanet(star) {
    const planets = Array.isArray(star?.planets) ? star.planets : [];
    if (!planets.length) {
      return null;
    }

    return planets.reduce((best, planet) => {
      const bestHabitability = Number(best?.habitability) || 0;
      const planetHabitability = Number(planet?.habitability) || 0;
      return planetHabitability > bestHabitability ? planet : best;
    }, planets[0]);
  }

  function applyColonyKitToPlanet(planet) {
    if (!planet) {
      return;
    }

    const infrastructure = {
      ...(planet.infrastructure ?? {}),
    };

    for (const infrastructureKey of COLONY_BASE_INFRASTRUCTURE_KEYS) {
      infrastructure[infrastructureKey] = infrastructure[infrastructureKey] ?? 0;
    }

    if (!('cities' in infrastructure) && !('orbitalPopulation' in infrastructure)) {
      infrastructure[planet.type === 'Gas Giant' ? 'orbitalPopulation' : 'cities'] = 0;
    }

    if ((planet.prominentResources ?? []).some((resource) => COLONY_MINED_RESOURCE_NAMES.has(resource.name))) {
      infrastructure.mining = infrastructure.mining ?? 0;
    }

    if ((planet.prominentResources ?? []).some((resource) => resource.name === 'Food' && resource.abundance > 0)) {
      infrastructure.farming = infrastructure.farming ?? 0;
    }

    for (const infrastructureKey of Object.keys(infrastructure)) {
      infrastructure[infrastructureKey] = Math.max(
        1,
        Math.floor(Number(infrastructure[infrastructureKey]) || 0)
      );
    }

    planet.infrastructure = infrastructure;
    planet.population = COLONY_STARTING_POPULATION;
  }

  function canShipColonizeStar(ship, starId) {
    if (!state.currentPlayerId || !state.playerState || !ship || !starId) {
      return false;
    }

    if (getShipFleetPosition(ship) === 'Moving' || getShipFleetPosition(ship) !== starId) {
      return false;
    }

    const targetStar = state.starsById?.get(starId);
    if (!isUncolonizedStar(targetStar) || !getBestColonizationPlanet(targetStar)) {
      return false;
    }

    const requiredShipCount = Math.max(1, Math.floor(Number(ship.count) || 1));
    return (
      getStationedShipCountAtStar(ship, starId) >= requiredShipCount &&
      hasMissionShipCargoItem(ship, COLONY_KIT_ITEM_ID)
    );
  }

  function isCurrentPlayerOwnedStar(starId) {
    if (!state.currentPlayerId || !starId) {
      return false;
    }

    return findTerritoryByStarId(starId)?.territoryId === state.currentPlayerId;
  }

  function getPlayerTotalItemCount(itemId) {
    let total = getInventoryItemCount(state.playerState?.items, itemId);

    for (const ship of state.playerState?.ships ?? []) {
      total += getInventoryItemCount(cloneShipCargoItems(ship), itemId);
    }

    return total;
  }

  function updateMissionShipCargo(ship, updater) {
    if (!state.playerState || !ship) {
      return { ok: false, message: 'No ship selected for cargo.' };
    }

    const modelKey = getShipFleetModelKey(ship);
    const position = getShipFleetPosition(ship);
    const selectedCount = Math.max(1, Math.floor(Number(ship.count) || 1));
    const sourceShips = compactFleetShips(state.playerState.ships ?? []);
    const shipIndex = sourceShips.findIndex(
      (entry) =>
        getShipFleetModelKey(entry) === modelKey &&
        isSameFleetPosition(getShipFleetPosition(entry), position) &&
        (!ship.moveMissionId || entry.moveMissionId === ship.moveMissionId)
    );

    if (shipIndex < 0) {
      return { ok: false, message: 'Cargo ship stack could not be found.' };
    }

    const sourceShip = sourceShips[shipIndex];
    const sourceCount = Math.max(1, Math.floor(Number(sourceShip.count) || 1));
    if (selectedCount !== sourceCount) {
      return { ok: false, message: 'Cargo uses the whole ship stack. Start Cargo without selecting individual ships.' };
    }

    const updateResult = updater(cloneShipCargoItems(sourceShip), sourceShip);
    if (!updateResult?.ok) {
      return updateResult ?? { ok: false, message: 'Cargo transfer failed.' };
    }

    const updatedShip = setShipCargoItems(sourceShip, updateResult.items);
    const nextShips = sourceShips.map((entry, index) => (index === shipIndex ? updatedShip : entry));

    return {
      ok: true,
      ships: compactFleetShips(nextShips),
      ship: updatedShip,
      message: updateResult.message ?? 'Cargo updated.',
    };
  }

  function handleCargoItemTransfer({ ship, reserveItems: nextReserveSource, cargoItems: nextCargoSource } = {}) {
    if (!state.playerState || !state.currentPlayerId) {
      return { ok: false, message: 'Log in to use cargo.' };
    }

    const starId = getShipFleetPosition(ship);
    if (!starId || starId === 'Moving') {
      return { ok: false, message: 'Cargo requires a stationed ship.' };
    }

    const star = state.starsById?.get(starId);
    if (!star || !isCurrentPlayerOwnedStar(starId)) {
      return { ok: false, message: 'Cargo transfers require one of your systems.' };
    }

    const reserveItems = cloneItemInventory(state.playerState.items);
    const currentCargoItems = cloneShipCargoItems(ship);
    const nextReserveItems = cloneItemInventory(nextReserveSource);
    const nextCargoItems = cloneItemInventory(nextCargoSource);

    if (getItemInventoryStorageUsed(nextCargoItems) > getShipCargoCapacity(ship)) {
      return { ok: false, message: 'Cargo exceeds this ship stack storage.' };
    }

    let hasChanges = false;
    for (const item of ITEM_DEFINITIONS) {
      const itemId = item.id;
      const currentTotal =
        getInventoryItemCount(reserveItems, itemId) +
        getInventoryItemCount(currentCargoItems, itemId);
      const nextTotal =
        getInventoryItemCount(nextReserveItems, itemId) +
        getInventoryItemCount(nextCargoItems, itemId);

      if (currentTotal !== nextTotal) {
        return { ok: false, message: `${item.name} counts changed before cargo could be saved.` };
      }

      hasChanges = hasChanges ||
        getInventoryItemCount(reserveItems, itemId) !== getInventoryItemCount(nextReserveItems, itemId) ||
        getInventoryItemCount(currentCargoItems, itemId) !== getInventoryItemCount(nextCargoItems, itemId);
    }

    if (!hasChanges) {
      return { ok: false, message: 'No cargo changes to save.' };
    }

    const transferResult = updateMissionShipCargo(ship, () => {
      return {
        ok: true,
        items: nextCargoItems,
        message: `Cargo saved at ${star.name}.`,
      };
    });

    if (!transferResult.ok) {
      return transferResult;
    }

    state.playerState = {
      ...state.playerState,
      items: nextReserveItems,
      ships: transferResult.ships,
    };
    renderPlayerResources();
    state.invalidateRender();
    cacheAndSyncPlayerState();

    return {
      ok: true,
      message: transferResult.message,
      ship: transferResult.ship,
    };
  }

  function getStarDistanceLightYears(left, right) {
    return getStarDistance(left, right) * LIGHT_YEARS_PER_WORLD_UNIT;
  }

  function getCurrentPlayerOwnedTradeStars() {
    if (!state.currentPlayerId) {
      return [];
    }

    const territory = state.territories.get(state.currentPlayerId);
    const ownedStarIds = territory?.stars ?? new Set();
    return state.galaxy.stars.filter((star) => ownedStarIds.has(star.id));
  }

  function isForeignPlayerTradeStar(star) {
    if (!star || !state.currentPlayerId) {
      return false;
    }

    const occupiedTerritory = findTerritoryByStarId(star.id);
    return Boolean(
      occupiedTerritory &&
      occupiedTerritory.territoryId !== state.currentPlayerId
    );
  }

  function getForeignPlayerTradeStars() {
    return state.galaxy.stars.filter((star) => isForeignPlayerTradeStar(star));
  }

  function getTradeRoutePairKey(originStarId, destinationStarId) {
    return [originStarId, destinationStarId].filter(Boolean).sort().join('|');
  }

  function getTradeRouteId(originStarId, destinationStarId) {
    const pairKey = getTradeRoutePairKey(originStarId, destinationStarId);
    return pairKey ? `trade:${pairKey}` : '';
  }

  function getActiveTradeRouteShipCount(originStarId, destinationStarId, excludeTradeRouteId = null) {
    const pairKey = getTradeRoutePairKey(originStarId, destinationStarId);
    if (!pairKey) {
      return 0;
    }

    return (state.playerState?.ships ?? []).reduce((count, ship) => {
      if (getShipFleetPosition(ship) !== 'Trading') {
        return count;
      }

      if (excludeTradeRouteId && ship.tradeRouteId === excludeTradeRouteId) {
        return count;
      }

      const shipPairKey = getTradeRoutePairKey(ship.tradeOriginStarId, ship.tradeDestinationStarId);
      if (shipPairKey !== pairKey) {
        return count;
      }

      return count + Math.max(1, Math.floor(Number(ship.count) || 1));
    }, 0);
  }

  function calculateTradeRouteMetrics(originStar, destinationStar) {
    const distanceLightYears = getStarDistanceLightYears(originStar, destinationStar);
    const originDevelopment = calculateStarDevelopment(originStar);
    const destinationDevelopment = calculateStarDevelopment(destinationStar);
    const distanceRatio = Math.max(
      0,
      Math.min(1, distanceLightYears / MAX_TRADE_ROUTE_LIGHT_YEARS)
    );
    const distanceMultiplier = Math.max(
      TRADE_MIN_DISTANCE_MULTIPLIER,
      1 - distanceRatio * (1 - TRADE_MIN_DISTANCE_MULTIPLIER)
    );
    const developmentScore = Math.sqrt(
      Math.max(0, originDevelopment) * Math.max(0, destinationDevelopment)
    );
    const credits = Math.max(
      0,
      Math.round(developmentScore * distanceMultiplier * TRADE_REVENUE_MULTIPLIER)
    );

    return {
      valid: Boolean(
        originStar &&
        destinationStar &&
        isCurrentPlayerOwnedStar(originStar.id) &&
        isForeignPlayerTradeStar(destinationStar) &&
        distanceLightYears <= MAX_TRADE_ROUTE_LIGHT_YEARS
      ),
      credits,
      distanceLightYears,
      distanceText: formatMoveDistance(distanceLightYears),
      maxDistanceText: formatMoveDistance(MAX_TRADE_ROUTE_LIGHT_YEARS),
      originDevelopment,
      destinationDevelopment,
      distanceMultiplier,
    };
  }

  function createTradeRoutePlan(originStar, destinationStar) {
    if (!originStar || !destinationStar) {
      return null;
    }

    const metrics = calculateTradeRouteMetrics(originStar, destinationStar);
    return {
      originStar,
      destinationStar,
      metrics,
      score: metrics.valid
        ? metrics.credits * 100000 - metrics.distanceLightYears
        : -Infinity,
    };
  }

  function findBestTradeRoute(preferredOriginStarId = null) {
    const ownedStars = getCurrentPlayerOwnedTradeStars();
    const foreignStars = getForeignPlayerTradeStars();
    if (!ownedStars.length || !foreignStars.length) {
      return null;
    }

    const preferredOrigin = preferredOriginStarId
      ? ownedStars.find((star) => star.id === preferredOriginStarId)
      : null;
    const originStars = preferredOrigin ? [preferredOrigin] : ownedStars;
    let bestPlan = null;

    for (const originStar of originStars) {
      for (const destinationStar of foreignStars) {
        const plan = createTradeRoutePlan(originStar, destinationStar);
        if (!plan?.metrics.valid) {
          continue;
        }

        if (!bestPlan || plan.score > bestPlan.score) {
          bestPlan = plan;
        }
      }
    }

    if (bestPlan || !preferredOrigin) {
      return bestPlan;
    }

    return findBestTradeRoute(null);
  }

  function applyTradeRoutePlanToMission(mission, plan, message = '') {
    return {
      ...mission,
      status: plan?.metrics.valid ? 'ready' : 'invalid',
      originStarId: plan?.originStar?.id ?? mission.originStarId,
      destinationStarId: plan?.destinationStar?.id ?? mission.destinationStarId,
      originMarkerWorld: plan?.originStar
        ? { x: plan.originStar.x, y: plan.originStar.y }
        : mission.originMarkerWorld,
      destinationMarkerWorld: plan?.destinationStar
        ? { x: plan.destinationStar.x, y: plan.destinationStar.y }
        : mission.destinationMarkerWorld,
      metrics: plan?.metrics ?? mission.metrics ?? null,
      message,
      draggingEndpoint: null,
    };
  }

  function startTradeMission(ship) {
    if (!state.currentPlayerId || !state.playerState) {
      return { ok: false, message: 'Log in to plan trade routes.' };
    }

    if (Math.max(1, Math.floor(Number(ship?.count) || 1)) > MAX_TRADE_ROUTE_SHIPS) {
      return { ok: false, message: `Trade routes can use max ${MAX_TRADE_ROUTE_SHIPS} ships.` };
    }

    if (getShipFleetPosition(ship) === 'Moving') {
      return { ok: false, message: 'Trade requires a ship that is not moving.' };
    }

    const preferredOriginStarId = isCurrentPlayerOwnedStar(getShipFleetPosition(ship))
      ? getShipFleetPosition(ship)
      : null;
    const plan = findBestTradeRoute(preferredOriginStarId);
    if (!plan) {
      return {
        ok: false,
        message: `No trade route found within ${formatMoveDistance(MAX_TRADE_ROUTE_LIGHT_YEARS)}.`,
      };
    }

    state.tradeMission = applyTradeRoutePlanToMission(
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        active: true,
        ship: structuredClone(ship),
        missionShipId: getShipPanelShipId(),
      },
      plan
    );
    state.selection.selectedStarId = plan.originStar.id;
    state.selectedPlanetId = null;
    setRightPanelOpen(false);
    focusCameraOnStar(plan.originStar);
    state.invalidateRender();
    return { ok: true };
  }

  function getTradeEndpointCandidates(endpoint, otherStarId = null) {
    const otherStar = otherStarId ? state.starsById.get(otherStarId) : null;
    const candidates = endpoint === 'origin'
      ? getCurrentPlayerOwnedTradeStars()
      : getForeignPlayerTradeStars();

    return candidates.filter((star) => {
      if (!star || star.id === otherStarId) {
        return false;
      }

      return !otherStar ||
        getStarDistanceLightYears(star, otherStar) <= MAX_TRADE_ROUTE_LIGHT_YEARS;
    });
  }

  function findClosestTradeEndpointStar(worldPoint, endpoint, otherStarId = null) {
    const candidates = getTradeEndpointCandidates(endpoint, otherStarId);
    if (!candidates.length) {
      return null;
    }

    let closest = null;
    let closestDistSq = Infinity;
    for (const star of candidates) {
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

  function updateTradeMissionEndpointFromWorld(endpoint, worldPoint) {
    const tradeMission = state.tradeMission;
    if (!tradeMission?.active) {
      return false;
    }

    const otherStarId = endpoint === 'origin'
      ? tradeMission.destinationStarId
      : tradeMission.originStarId;
    const selectedStar = findClosestTradeEndpointStar(worldPoint, endpoint, otherStarId);
    if (!selectedStar) {
      const currentPlan = createTradeRoutePlan(
        state.starsById.get(tradeMission.originStarId),
        state.starsById.get(tradeMission.destinationStarId)
      );
      state.tradeMission = applyTradeRoutePlanToMission(
        tradeMission,
        currentPlan,
        endpoint === 'origin'
          ? 'No owned system in range of that partner.'
          : 'No partner system within 5,000 ly.'
      );
      state.invalidateRender();
      return false;
    }

    const originStar = endpoint === 'origin'
      ? selectedStar
      : state.starsById.get(tradeMission.originStarId);
    const destinationStar = endpoint === 'destination'
      ? selectedStar
      : state.starsById.get(tradeMission.destinationStarId);
    const plan = createTradeRoutePlan(originStar, destinationStar);
    state.tradeMission = applyTradeRoutePlanToMission(tradeMission, plan);
    state.selection.selectedStarId = originStar?.id ?? state.selection.selectedStarId;
    state.invalidateRender();
    return true;
  }

  function cancelTradeMission() {
    state.tradeMission = null;
    rightPanel.dataset.panel = 'ship-designer';
    setRightPanelOpen(true);
    state.invalidateRender();
  }

  function commitTradeMission() {
    const tradeMission = state.tradeMission;
    if (!tradeMission?.active || !state.playerState) {
      return;
    }

    if (Math.max(1, Math.floor(Number(tradeMission.ship?.count) || 1)) > MAX_TRADE_ROUTE_SHIPS) {
      state.tradeMission = {
        ...tradeMission,
        message: `Trade routes can use max ${MAX_TRADE_ROUTE_SHIPS} ships.`,
      };
      state.invalidateRender();
      return;
    }

    const originStar = state.starsById.get(tradeMission.originStarId);
    const destinationStar = state.starsById.get(tradeMission.destinationStarId);
    const plan = createTradeRoutePlan(originStar, destinationStar);
    if (!plan?.metrics.valid || plan.metrics.credits <= 0) {
      state.tradeMission = {
        ...tradeMission,
        metrics: plan?.metrics ?? tradeMission.metrics,
        message: plan?.metrics.valid
          ? 'This route needs more development to be profitable.'
          : 'Trade routes must stay within 5,000 ly.',
      };
      state.invalidateRender();
      return;
    }

    const routeShipCount = Math.max(1, Math.floor(Number(tradeMission.ship?.count) || 1));
    const tradeRouteId = getTradeRouteId(originStar.id, destinationStar.id);
    const sourceTradeRouteId = tradeMission.ship?.tradeRouteId ?? null;
    const existingRouteShipCount = getActiveTradeRouteShipCount(
      originStar.id,
      destinationStar.id,
      sourceTradeRouteId === tradeRouteId ? sourceTradeRouteId : null
    );

    if (existingRouteShipCount + routeShipCount > MAX_TRADE_ROUTE_SHIPS) {
      state.tradeMission = {
        ...tradeMission,
        metrics: plan.metrics,
        message: `Trade routes can use max ${MAX_TRADE_ROUTE_SHIPS} ships.`,
      };
      state.invalidateRender();
      return;
    }

    const moveResult = moveShipStackToPosition(state.playerState.ships ?? [], tradeMission.ship, 'Trading', {
      originPosition: getShipFleetPosition(tradeMission.ship),
      sourceMoveMissionId: tradeMission.ship?.moveMissionId ?? null,
      sourceTradeRouteId,
      destinationTradeRouteId: tradeRouteId,
      allowCreateFallback: false,
      destinationMetadata: {
        tradeRouteId,
        tradeOriginStarId: originStar.id,
        tradeDestinationStarId: destinationStar.id,
        tradeOriginName: originStar.name,
        tradeDestinationName: destinationStar.name,
        tradeRevenueCredits: plan.metrics.credits,
        tradeDistanceLightYears: plan.metrics.distanceLightYears,
      },
    });

    if (moveResult.movedCount <= 0) {
      state.tradeMission = {
        ...tradeMission,
        metrics: plan.metrics,
        message: 'Could not assign that ship to this route.',
      };
      state.invalidateRender();
      return;
    }

    const tradingShip = {
      ...tradeMission.ship,
      position: 'Trading',
      count: moveResult.movedCount,
      tradeRouteId,
      tradeOriginStarId: originStar.id,
      tradeDestinationStarId: destinationStar.id,
      tradeOriginName: originStar.name,
      tradeDestinationName: destinationStar.name,
      tradeRevenueCredits: plan.metrics.credits,
      tradeDistanceLightYears: plan.metrics.distanceLightYears,
    };

    state.playerState = {
      ...state.playerState,
      ships: moveResult.ships,
      resources: {
        ...cloneResources(state.playerState.resources),
        Credits: (Number(state.playerState.resources?.Credits) || 0) + plan.metrics.credits,
      },
    };
    state.tradeMission = null;
    setHighlightedFleetShip(tradingShip);
    setShipPanelView('fleet');
    setShipPanelShipId('');
    renderPlayerResources();
    cacheAndSyncPlayerState();
    rightPanel.dataset.panel = 'ship-designer';
    setRightPanelOpen(true);
    state.invalidateRender();
  }

  function cancelTradeRoute(ship) {
    if (!state.playerState || !ship || getShipFleetPosition(ship) !== 'Trading') {
      return { ok: false, message: 'No active trade route selected.' };
    }

    const originStarId = ship.tradeOriginStarId;
    const originStar = state.starsById?.get(originStarId);
    if (!originStar) {
      return { ok: false, message: 'Trade origin could not be found.' };
    }

    const moveResult = moveShipStackToPosition(state.playerState.ships ?? [], ship, originStar.id, {
      originPosition: 'Trading',
      sourceMoveMissionId: ship.moveMissionId ?? null,
      sourceTradeRouteId: ship.tradeRouteId ?? null,
      allowCreateFallback: false,
    });

    if (moveResult.movedCount <= 0) {
      return { ok: false, message: 'Could not cancel that trade route.' };
    }

    const returnedShip = {
      ...ship,
      position: originStar.id,
      count: moveResult.movedCount,
    };
    delete returnedShip.tradeRouteId;
    delete returnedShip.tradeOriginStarId;
    delete returnedShip.tradeDestinationStarId;
    delete returnedShip.tradeOriginName;
    delete returnedShip.tradeDestinationName;
    delete returnedShip.tradeRevenueCredits;
    delete returnedShip.tradeDistanceLightYears;

    state.playerState = {
      ...state.playerState,
      ships: moveResult.ships,
    };
    setHighlightedFleetShip(returnedShip);
    setShipPanelView('fleet');
    setShipPanelShipId('');
    cacheAndSyncPlayerState();
    renderRightSideMenu({ force: true });
    state.invalidateRender();

    return {
      ok: true,
      message: `Trade cancelled. ${ship.name ?? ship.type ?? 'Ship'} returned to ${originStar.name}.`,
      ship: returnedShip,
    };
  }

  function getShipTraitValue(ship, traitKey) {
    return Math.max(0, Number(ship?.traits?.[traitKey]) || 0);
  }

  function calculatePiracyEfficiency(pirateShip, tradeShip) {
    const piratePower =
      getShipTraitValue(pirateShip, 'combatPower') * 1.4 +
      getShipMoveSpeedRating(pirateShip);
    const tradeDefense =
      getShipTraitValue(tradeShip, 'defense') * 1.15 +
      getShipMoveSpeedRating(tradeShip) +
      getShipTraitValue(tradeShip, 'stealth') * 1.2;
    const rawEfficiency = piratePower / Math.max(1, piratePower + tradeDefense);
    return Math.max(PIRACY_MIN_EFFICIENCY, Math.min(PIRACY_MAX_EFFICIENCY, rawEfficiency));
  }

  function isTradeRouteInPiracyRadius(tradeShip, centerStar) {
    const radiusWorldUnits = PIRACY_RADIUS_LIGHT_YEARS / LIGHT_YEARS_PER_WORLD_UNIT;
    const originStar = state.starsById?.get(tradeShip.tradeOriginStarId);
    const destinationStar = state.starsById?.get(tradeShip.tradeDestinationStarId);
    return [originStar, destinationStar].filter(Boolean).some(
      (star) => getStarDistance(star, centerStar) <= radiusWorldUnits
    );
  }

  function calculatePiracyRaidSummary(pirateShip, centerStar) {
    let stolenCredits = 0;
    let affectedRouteCount = 0;
    let weightedEfficiency = 0;

    for (const tradeShip of state.playerState?.ships ?? []) {
      if (getShipFleetPosition(tradeShip) !== 'Trading' || !isTradeRouteInPiracyRadius(tradeShip, centerStar)) {
        continue;
      }

      const efficiency = calculatePiracyEfficiency(pirateShip, tradeShip);
      const routeRevenue = Math.max(0, Math.round(Number(tradeShip.tradeRevenueCredits) || 0));
      const stolenFromRoute = Math.max(0, Math.round(routeRevenue * efficiency));
      if (stolenFromRoute <= 0) {
        continue;
      }

      stolenCredits += stolenFromRoute;
      affectedRouteCount += 1;
      weightedEfficiency += efficiency;
    }

    return {
      stolenCredits,
      affectedRouteCount,
      efficiency: affectedRouteCount > 0
        ? weightedEfficiency / affectedRouteCount
        : calculatePiracyEfficiency(pirateShip, {}),
    };
  }

  function startPiracyMission(ship) {
    if (!state.currentPlayerId || !state.playerState) {
      return { ok: false, message: 'Log in to start piracy.' };
    }

    const targetStarId = getShipFleetPosition(ship);
    const targetStar = state.starsById?.get(targetStarId);
    const occupiedTerritory = targetStar ? findTerritoryByStarId(targetStar.id) : null;
    if (!targetStar || !occupiedTerritory || occupiedTerritory.territoryId === state.currentPlayerId) {
      return { ok: false, message: 'Piracy must be placed in another territory.' };
    }

    const missionId = `piracy:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const raidSummary = calculatePiracyRaidSummary(ship, targetStar);
    const moveResult = moveShipStackToPosition(state.playerState.ships ?? [], ship, 'Piracy', {
      originPosition: targetStar.id,
      sourceMoveMissionId: ship.moveMissionId ?? null,
      sourceTradeRouteId: ship.tradeRouteId ?? null,
      allowCreateFallback: false,
      destinationMetadata: {
        piracyMissionId: missionId,
        piracyCenterStarId: targetStar.id,
        piracyCenterName: targetStar.name,
        piracyTerritoryId: occupiedTerritory.territoryId,
        piracyTerritoryName: occupiedTerritory.territory.name,
        piracyRadiusLightYears: PIRACY_RADIUS_LIGHT_YEARS,
        piracyEfficiency: raidSummary.efficiency,
        piracyStolenCredits: raidSummary.stolenCredits,
        piracyAffectedRouteCount: raidSummary.affectedRouteCount,
      },
    });

    if (moveResult.movedCount <= 0) {
      return { ok: false, message: 'Could not assign that ship to piracy.' };
    }

    const piracyShip = {
      ...ship,
      position: 'Piracy',
      count: moveResult.movedCount,
      piracyMissionId: missionId,
      piracyCenterStarId: targetStar.id,
      piracyCenterName: targetStar.name,
      piracyTerritoryId: occupiedTerritory.territoryId,
      piracyTerritoryName: occupiedTerritory.territory.name,
      piracyRadiusLightYears: PIRACY_RADIUS_LIGHT_YEARS,
      piracyEfficiency: raidSummary.efficiency,
      piracyStolenCredits: raidSummary.stolenCredits,
      piracyAffectedRouteCount: raidSummary.affectedRouteCount,
    };

    state.playerState = {
      ...state.playerState,
      ships: moveResult.ships,
      resources: {
        ...cloneResources(state.playerState.resources),
        Credits: (Number(state.playerState.resources?.Credits) || 0) + raidSummary.stolenCredits,
      },
    };
    setHighlightedFleetShip(piracyShip);
    setShipPanelView('fleet');
    setShipPanelShipId('');
    renderPlayerResources();
    cacheAndSyncPlayerState();
    rightPanel.dataset.panel = 'ship-designer';
    setRightPanelOpen(true);
    state.invalidateRender();

    return {
      ok: true,
      message: raidSummary.stolenCredits > 0
        ? `Piracy stole ${formatWholeNumber(raidSummary.stolenCredits)} Credits.`
        : 'Piracy zone established.',
      ship: piracyShip,
    };
  }

  function cancelPiracyMission(ship) {
    if (!state.playerState || !ship || getShipFleetPosition(ship) !== 'Piracy') {
      return { ok: false, message: 'No active piracy mission selected.' };
    }

    const centerStar = state.starsById?.get(ship.piracyCenterStarId);
    if (!centerStar) {
      return { ok: false, message: 'Piracy center could not be found.' };
    }

    const moveResult = moveShipStackToPosition(state.playerState.ships ?? [], ship, centerStar.id, {
      originPosition: 'Piracy',
      sourceMoveMissionId: ship.moveMissionId ?? null,
      sourcePiracyMissionId: ship.piracyMissionId ?? null,
      allowCreateFallback: false,
    });

    if (moveResult.movedCount <= 0) {
      return { ok: false, message: 'Could not cancel that piracy mission.' };
    }

    const returnedShip = {
      ...ship,
      position: centerStar.id,
      count: moveResult.movedCount,
    };
    delete returnedShip.piracyMissionId;
    delete returnedShip.piracyCenterStarId;
    delete returnedShip.piracyCenterName;
    delete returnedShip.piracyTerritoryId;
    delete returnedShip.piracyTerritoryName;
    delete returnedShip.piracyRadiusLightYears;
    delete returnedShip.piracyEfficiency;
    delete returnedShip.piracyStolenCredits;
    delete returnedShip.piracyAffectedRouteCount;

    state.playerState = {
      ...state.playerState,
      ships: moveResult.ships,
    };
    setHighlightedFleetShip(returnedShip);
    setShipPanelView('fleet');
    setShipPanelShipId('');
    cacheAndSyncPlayerState();
    renderRightSideMenu({ force: true });
    state.invalidateRender();

    return { ok: true, message: `Piracy cancelled. ${ship.name ?? ship.type ?? 'Ship'} returned to ${centerStar.name}.` };
  }

  function startAttackMission(ship) {
    const targetStarId = getShipFleetPosition(ship);
    const targetStar = state.starsById?.get(targetStarId);
    const occupiedTerritory = targetStar ? findTerritoryByStarId(targetStar.id) : null;
    if (!targetStar || !occupiedTerritory || !canShipAttackStar(ship, targetStar.id)) {
      return;
    }

    state.attackMission = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      active: true,
      status: 'ready',
      ship: structuredClone(ship),
      targetStarId: targetStar.id,
      targetStarName: targetStar.name,
      defenderTerritoryId: occupiedTerritory.territoryId,
      defenderName: occupiedTerritory.territory.name,
      message: '',
    };
    state.selection.selectedStarId = targetStar.id;
    state.selectedPlanetId = null;
    setRightPanelOpen(false);
    focusCameraOnStar(targetStar);
    state.invalidateRender();
  }

  function commitColonizationMission(ship) {
    if (!state.currentPlayerId || !state.playerState) {
      return { ok: false, message: 'Log in to colonize systems.' };
    }

    if (state.hasPendingInfrastructureChanges) {
      return { ok: false, message: 'Save or cancel pending infrastructure changes before colonizing.' };
    }

    const targetStarId = getShipFleetPosition(ship);
    if (!targetStarId || targetStarId === 'Moving') {
      return { ok: false, message: 'Colonization requires a stationed ship.' };
    }

    const targetStar = state.starsById?.get(targetStarId);
    if (!targetStar) {
      return { ok: false, message: 'Colonization target could not be found.' };
    }

    if (!isUncolonizedStar(targetStar)) {
      return { ok: false, message: 'Colonization requires an unclaimed system.' };
    }

    const targetPlanet = getBestColonizationPlanet(targetStar);
    if (!targetPlanet) {
      return { ok: false, message: 'This system has no planet to colonize.' };
    }

    const colonyKitName = getItemDefinition(COLONY_KIT_ITEM_ID)?.name ?? 'Colony Kit';
    if (!hasMissionShipCargoItem(ship, COLONY_KIT_ITEM_ID)) {
      return { ok: false, message: `${colonyKitName} must be loaded on this ship.` };
    }

    if (!canShipColonizeStar(ship, targetStar.id)) {
      return { ok: false, message: 'This ship cannot colonize that system.' };
    }

    const territory = ensurePlayerTerritory(state.currentPlayerId);
    if (!territory) {
      return { ok: false, message: 'Player territory could not be prepared.' };
    }

    const cargoResult = consumeMissionShipCargoItem(ship, COLONY_KIT_ITEM_ID);
    if (!cargoResult.ok) {
      return cargoResult;
    }

    territory.stars.add(targetStar.id);
    targetStar.faction = territory.faction;
    targetStar.owner = territory.faction;
    applyColonyKitToPlanet(targetPlanet);
    recalculateStarDerivedStats(targetStar);
    normalizeTerritoryCapital(territory);

    state.playerState = {
      ...state.playerState,
      ships: cargoResult.ships,
      territory: getRuntimeTerritoryRecord(territory),
      playerName: territory.name ?? state.playerState.playerName,
    };

    state.cachedPlayerStates.set(state.currentPlayerId, structuredClone(state.playerState));
    markTerritoryRenderDataDirty();
    markTerritoryChangesDirty();
    updateTerritorySelector();
    updateLocalPlayerProduction();
    renderPlayerResources();
    state.selection.selectedStarId = targetStar.id;
    state.selectedPlanetId = targetPlanet.id;
    focusCameraOnStar(targetStar);
    pushRightPanelHistory('system');
    rightPanel.dataset.panel = 'system';
    setRightPanelOpen(true);
    state.invalidateRender();

    const territoryRevisionAtSaveStart = state.territoryRevision;
    void sync.pushState().then(() => {
      if (state.territoryRevision === territoryRevisionAtSaveStart) {
        state.hasPendingTerritoryChanges = false;
      }
      if (state.currentPlayerId && state.playerState) {
        state.cachedPlayerStates.set(state.currentPlayerId, structuredClone(state.playerState));
      }
    });

    return {
      ok: true,
      message: `${targetStar.name} colonized on ${targetPlanet.name}.`,
      star: targetStar,
      planet: targetPlanet,
    };
  }

  function startMoveMission(ship) {
    const originStarId = getShipFleetPosition(ship);
    const originStar = state.starsById?.get(originStarId);
    if (!originStar) {
      return;
    }

    state.moveMission = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      active: true,
      status: 'placing',
      ship: structuredClone(ship),
      missionShipId: getShipPanelShipId(),
      originStarId,
      markerWorld: { x: originStar.x, y: originStar.y },
      destinationStarId: null,
      routeStarIds: [],
      routeRevealStartedAt: null,
      travelSummary: null,
      showDestinationDialog: false,
      dragging: false,
    };
    setRightPanelOpen(false);
    focusCameraOnStar(originStar);
    state.invalidateRender();
  }

  function setMoveMissionDestinationFromWorld(worldPoint) {
    if (!state.moveMission?.active) {
      return;
    }

    const destinationStar = findClosestStarNearPoint(worldPoint, 90) ?? findNearestStarToWorldPoint(worldPoint);
    if (!destinationStar) {
      return;
    }

    state.moveMission = {
      ...state.moveMission,
      status: 'ready',
      markerWorld: { x: destinationStar.x, y: destinationStar.y },
      destinationStarId: destinationStar.id,
      routeStarIds: [],
      routeRevealStartedAt: null,
      travelSummary: null,
      showDestinationDialog: true,
      dragging: false,
    };
    state.invalidateRender();
  }

  function calculateMoveMissionRoute() {
    const moveMission = state.moveMission;
    if (!moveMission?.active || !moveMission.destinationStarId) {
      return;
    }

    const routeStarIds = calculateAStarRoute(moveMission.originStarId, moveMission.destinationStarId);
    const travelPlan = calculateMoveTravelPlan(moveMission.ship, routeStarIds);

    state.moveMission = {
      ...moveMission,
      ...travelPlan,
      routeStarIds,
      routeRevealStartedAt: performance.now(),
      showDestinationDialog: true,
    };
    state.invalidateRender();
  }

  function cancelMoveMission() {
    const missionShipId = state.moveMission?.missionShipId ?? '';
    state.moveMission = null;
    setShipPanelView('mission');
    setShipPanelShipId(missionShipId);
    rightPanel.dataset.panel = 'ship-designer';
    setRightPanelOpen(true);
    state.invalidateRender();
  }

  function cancelAttackMission() {
    state.attackMission = null;
    rightPanel.dataset.panel = 'ship-designer';
    setRightPanelOpen(true);
    state.invalidateRender();
  }

  function updateCachedTerritoryForPlayer(territoryId, territory) {
    const cachedPlayerState = state.cachedPlayerStates.get(territoryId);
    if (!cachedPlayerState) {
      return;
    }

    state.cachedPlayerStates.set(territoryId, {
      ...cachedPlayerState,
      territory: territory ? getRuntimeTerritoryRecord(territory) : null,
    });
  }

  async function commitAttackMission() {
    const attackMission = state.attackMission;
    if (!attackMission?.active || !attackMission.targetStarId || !state.currentPlayerId) {
      return;
    }

    if (!canShipAttackStar(attackMission.ship, attackMission.targetStarId)) {
      state.attackMission = {
        ...attackMission,
        message: 'Attack requires a stationed ship in an enemy system.',
      };
      state.invalidateRender();
      return;
    }

    const targetStar = state.starsById?.get(attackMission.targetStarId);
    const defender = findTerritoryByStarId(attackMission.targetStarId);
    const attackerTerritory = ensurePlayerTerritory(state.currentPlayerId);
    if (!targetStar || !defender || !attackerTerritory || defender.territoryId === attackerTerritory.id) {
      state.attackMission = null;
      state.invalidateRender();
      return;
    }

    defender.territory.stars.delete(targetStar.id);
    normalizeTerritoryCapital(defender.territory);
    ensureTerritoryCapitalMinimumPopulation(defender.territory);

    attackerTerritory.stars.add(targetStar.id);
    targetStar.faction = attackerTerritory.faction;
    targetStar.owner = attackerTerritory.faction;
    normalizeTerritoryCapital(attackerTerritory);
    ensureTerritoryCapitalMinimumPopulation(attackerTerritory);

    updateCachedTerritoryForPlayer(defender.territoryId, defender.territory);
    updateCachedTerritoryForPlayer(attackerTerritory.id, attackerTerritory);

    if (state.playerState) {
      state.playerState = {
        ...state.playerState,
        territory: getRuntimeTerritoryRecord(attackerTerritory),
        playerName: attackerTerritory.name ?? state.playerState.playerName,
      };
    }

    state.attackMission = null;
    markTerritoryRenderDataDirty();
    markTerritoryChangesDirty();
    updateTerritorySelector();
    updateLocalPlayerProduction();
    renderPlayerResources();
    state.invalidateRender();

    const territoryRevisionAtSaveStart = state.territoryRevision;
    await sync.pushState();
    if (state.territoryRevision === territoryRevisionAtSaveStart) {
      state.hasPendingTerritoryChanges = false;
    }
    if (state.currentPlayerId && state.playerState) {
      state.cachedPlayerStates.set(state.currentPlayerId, structuredClone(state.playerState));
    }
  }

  function interpolateRoutePoint(routeStarIds, progress) {
    const stars = routeStarIds.map((id) => state.starsById.get(id)).filter(Boolean);
    if (!stars.length) {
      return null;
    }

    if (stars.length === 1) {
      return { x: stars[0].x, y: stars[0].y };
    }

    const segments = [];
    let totalDistance = 0;
    for (let index = 0; index < stars.length - 1; index++) {
      const distance = getStarDistance(stars[index], stars[index + 1]);
      segments.push({ from: stars[index], to: stars[index + 1], distance });
      totalDistance += distance;
    }

    let remainingDistance = totalDistance * Math.max(0, Math.min(1, progress));
    for (const segment of segments) {
      if (remainingDistance > segment.distance) {
        remainingDistance -= segment.distance;
        continue;
      }

      const localProgress = segment.distance > 0 ? remainingDistance / segment.distance : 1;
      return {
        x: segment.from.x + (segment.to.x - segment.from.x) * localProgress,
        y: segment.from.y + (segment.to.y - segment.from.y) * localProgress,
      };
    }

    const lastStar = stars[stars.length - 1];
    return { x: lastStar.x, y: lastStar.y };
  }

  function createMovingShipRecord(ship, missionId, originStarId, destinationStarId, arrivesAtMs) {
    return applyMoveMissionShipMetadata(
      {
        ...ship,
        position: 'Moving',
      },
      {
        moveMissionId: missionId,
        moveOriginStarId: originStarId,
        moveDestinationStarId: destinationStarId,
        moveArrivesAtMs: arrivesAtMs,
      }
    );
  }

  function createMoveMissionRecord(moveMission, routeStarIds, travelPlan, startedAtMs, arrivesAtMs) {
    const originStar = state.starsById?.get(moveMission.originStarId);
    const movingShip = createMovingShipRecord(
      moveMission.ship,
      moveMission.id,
      moveMission.originStarId,
      moveMission.destinationStarId,
      arrivesAtMs
    );

    return {
      ...moveMission,
      ...travelPlan,
      active: true,
      status: 'moving',
      ship: movingShip,
      markerWorld: originStar ? { x: originStar.x, y: originStar.y } : moveMission.markerWorld,
      routeStarIds,
      routeRevealStartedAt: null,
      showDestinationDialog: false,
      dragging: false,
      travelStartedAtMs: startedAtMs,
      travelArrivesAtMs: arrivesAtMs,
    };
  }

  function cacheAndSyncPlayerState({ syncState = true } = {}) {
    if (state.currentPlayerId && state.playerState) {
      state.cachedPlayerStates.set(state.currentPlayerId, structuredClone(state.playerState));
    }

    if (syncState) {
      void sync.pushState();
    }
  }

  function getRenderedMoveMissions() {
    return Array.isArray(state.moveMissions) ? state.moveMissions : [];
  }

  function upsertRenderedMoveMission(mission) {
    if (!mission?.id) {
      return;
    }

    const existingMissions = getRenderedMoveMissions();
    const existingIndex = existingMissions.findIndex((entry) => entry.id === mission.id);
    if (existingIndex >= 0) {
      state.moveMissions = existingMissions.map((entry, index) => (
        index === existingIndex ? { ...entry, ...mission } : entry
      ));
      return;
    }

    state.moveMissions = [...existingMissions, mission];
  }

  function removeRenderedMoveMission(missionId) {
    if (!missionId) {
      return;
    }

    state.moveMissions = getRenderedMoveMissions().filter((mission) => mission.id !== missionId);
  }

  function persistMoveMissionStart(mission) {
    if (!state.playerState || !mission?.ship) {
      return false;
    }

    const moveResult = moveShipStackToPosition(state.playerState.ships ?? [], mission.ship, 'Moving', {
      originPosition: mission.originStarId,
      sourceMoveMissionId: null,
      destinationMoveMissionId: mission.id,
      allowCreateFallback: false,
      destinationMetadata: {
        moveMissionId: mission.id,
        moveOriginStarId: mission.originStarId,
        moveDestinationStarId: mission.destinationStarId,
        moveArrivesAtMs: mission.travelArrivesAtMs,
      },
    });
    if (moveResult.movedCount <= 0) {
      return false;
    }

    const persistedMission = {
      ...mission,
      ship: {
        ...mission.ship,
        count: moveResult.movedCount,
      },
    };
    const nextMoveMissions = [
      ...(state.playerState.activeMoveMissions ?? []).filter((entry) => entry.id !== persistedMission.id),
      persistedMission,
    ];

    state.playerState = {
      ...state.playerState,
      ships: moveResult.ships,
      activeMoveMissions: nextMoveMissions,
    };
    renderPlayerResources();
    cacheAndSyncPlayerState();
    return persistedMission;
  }

  function removeActiveMoveMission(missionId) {
    if (!state.playerState || !missionId) {
      return;
    }

    state.playerState = {
      ...state.playerState,
      activeMoveMissions: (state.playerState.activeMoveMissions ?? []).filter((mission) => mission.id !== missionId),
    };
  }

  function completeMoveMission(mission, { syncState = true, showArrived = true } = {}) {
    if (!mission?.destinationStarId) {
      return;
    }

    if (state.playerState) {
      const movingShip = createMovingShipRecord(
        mission.ship,
        mission.id,
        mission.originStarId,
        mission.destinationStarId,
        mission.travelArrivesAtMs
      );
      let moveResult = moveShipStackToPosition(state.playerState.ships ?? [], movingShip, mission.destinationStarId, {
        originPosition: 'Moving',
        sourceMoveMissionId: mission.id,
        allowCreateFallback: false,
      });

      if (moveResult.movedCount <= 0) {
        moveResult = moveShipStackToPosition(state.playerState.ships ?? [], mission.ship, mission.destinationStarId, {
          originPosition: mission.originStarId,
          sourceMoveMissionId: null,
          allowCreateFallback: false,
        });
      }

      state.playerState = {
        ...state.playerState,
        ships: moveResult.ships,
      };
      removeActiveMoveMission(mission.id);
      renderPlayerResources();
      cacheAndSyncPlayerState({ syncState });
    }

    const destinationStar = state.starsById.get(mission.destinationStarId);
    if (showArrived) {
      const arrivedMission = {
        ...mission,
        status: 'arrived',
        markerWorld: destinationStar ? { x: destinationStar.x, y: destinationStar.y } : mission.markerWorld,
      };
      upsertRenderedMoveMission(arrivedMission);
      state.invalidateRender();

      const completedAnimationId = arrivedMission.animationId;
      window.setTimeout(() => {
        const currentMission = getRenderedMoveMissions().find((entry) => entry.id === mission.id);
        if (currentMission?.animationId === completedAnimationId) {
          removeRenderedMoveMission(mission.id);
          state.invalidateRender();
        }
      }, 1200);
      return;
    }

    removeRenderedMoveMission(mission.id);
    state.invalidateRender();
  }

  function normalizePersistedMoveMission(mission) {
    if (!mission?.id || !mission.originStarId || !mission.destinationStarId) {
      return null;
    }

    const routeStarIds = mission.routeStarIds?.length
      ? mission.routeStarIds
      : calculateAStarRoute(mission.originStarId, mission.destinationStarId);
    const travelPlan = calculateMoveTravelPlan(mission.ship, routeStarIds);
    const startedAtMs = Number(mission.travelStartedAtMs) || Date.now();
    const durationMs = Math.max(
      1,
      Number(mission.realTravelDurationMs) ||
        Number(mission.travelArrivesAtMs) - startedAtMs ||
        travelPlan.realTravelDurationMs
    );
    const arrivesAtMs = Number(mission.travelArrivesAtMs) || startedAtMs + durationMs;
    const progress = Math.min(1, Math.max(0, (Date.now() - startedAtMs) / durationMs));
    const markerWorld = interpolateRoutePoint(routeStarIds, progress) ?? mission.markerWorld;

    return {
      ...mission,
      ...travelPlan,
      active: true,
      status: 'moving',
      routeStarIds,
      markerWorld,
      routeRevealStartedAt: null,
      showDestinationDialog: false,
      dragging: false,
      realTravelDurationMs: durationMs,
      travelStartedAtMs: startedAtMs,
      travelArrivesAtMs: arrivesAtMs,
    };
  }

  function runMoveMissionAnimation(mission) {
    if (!mission?.id) {
      return;
    }

    const animationId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    upsertRenderedMoveMission({
      ...mission,
      animationId,
    });

    function animateMove() {
      const currentMission = getRenderedMoveMissions().find((entry) => entry.id === mission.id);
      if (currentMission?.animationId !== animationId || currentMission?.id !== mission.id) {
        return;
      }

      const durationMs = Math.max(1, Number(currentMission.realTravelDurationMs) || 1);
      const startedAtMs = Number(currentMission.travelStartedAtMs) || Date.now();
      const progress = Math.min(1, (Date.now() - startedAtMs) / durationMs);
      const markerWorld = interpolateRoutePoint(currentMission.routeStarIds, progress);
      if (markerWorld) {
        upsertRenderedMoveMission({
          ...currentMission,
          markerWorld,
        });
      }
      state.invalidateRender();

      if (progress < 1) {
        requestAnimationFrame(animateMove);
        return;
      }

      completeMoveMission(getRenderedMoveMissions().find((entry) => entry.id === mission.id) ?? currentMission);
    }

    requestAnimationFrame(animateMove);
  }

  function ensureMoveMissionShipIsMarkedMoving(mission) {
    if (!state.playerState || !mission?.ship) {
      return { mission, changed: false };
    }

    const modelKey = getShipFleetModelKey(mission.ship);
    const hasMovingStack = (state.playerState.ships ?? []).some(
      (ship) =>
        getShipFleetModelKey(ship) === modelKey &&
        getShipFleetPosition(ship) === 'Moving' &&
        ship.moveMissionId === mission.id
    );

    if (hasMovingStack) {
      return { mission, changed: false };
    }

    const moveResult = moveShipStackToPosition(state.playerState.ships ?? [], mission.ship, 'Moving', {
      originPosition: mission.originStarId,
      sourceMoveMissionId: null,
      destinationMoveMissionId: mission.id,
      allowCreateFallback: false,
      destinationMetadata: {
        moveMissionId: mission.id,
        moveOriginStarId: mission.originStarId,
        moveDestinationStarId: mission.destinationStarId,
        moveArrivesAtMs: mission.travelArrivesAtMs,
      },
    });

    if (moveResult.movedCount <= 0) {
      return { mission, changed: false };
    }

    const repairedMission = {
      ...mission,
      ship: {
        ...mission.ship,
        count: moveResult.movedCount,
      },
    };
    state.playerState = {
      ...state.playerState,
      ships: moveResult.ships,
    };

    return { mission: repairedMission, changed: true };
  }

  function restorePersistedMoveMissions() {
    if (!state.playerState) {
      return;
    }

    const activeMissions = (state.playerState.activeMoveMissions ?? [])
      .map((mission) => normalizePersistedMoveMission(mission))
      .filter(Boolean);

    if (!activeMissions.length) {
      state.moveMissions = [];
      return;
    }

    const nowMs = Date.now();
    const pendingMissions = [];
    let changedAny = false;

    for (let mission of activeMissions) {
      if (Number(mission.travelArrivesAtMs) <= nowMs) {
        completeMoveMission(mission, { syncState: false, showArrived: false });
        changedAny = true;
      } else {
        const repaired = ensureMoveMissionShipIsMarkedMoving(mission);
        mission = repaired.mission;
        changedAny = changedAny || repaired.changed;
        pendingMissions.push(mission);
      }
    }

    state.playerState = {
      ...state.playerState,
      activeMoveMissions: pendingMissions,
    };

    state.moveMissions = [];
    for (const mission of pendingMissions) {
      runMoveMissionAnimation(mission);
    }

    if (changedAny) {
      renderPlayerResources();
      cacheAndSyncPlayerState();
    }
  }

  function commitMoveMission() {
    const moveMission = state.moveMission;
    if (!moveMission?.active || !moveMission.destinationStarId || moveMission.status === 'moving') {
      return;
    }

    const routeStarIds = moveMission.routeStarIds?.length
      ? moveMission.routeStarIds
      : calculateAStarRoute(moveMission.originStarId, moveMission.destinationStarId);
    const travelPlan = calculateMoveTravelPlan(moveMission.ship, routeStarIds);
    const durationMs = travelPlan.realTravelDurationMs;
    const startedAtMs = Date.now();
    const arrivesAtMs = startedAtMs + durationMs;
    const mission = createMoveMissionRecord(moveMission, routeStarIds, travelPlan, startedAtMs, arrivesAtMs);

    const persistedMission = persistMoveMissionStart(mission);
    if (!persistedMission) {
      console.warn('Move mission could not start because the source ship stack was not found.', mission);
      state.moveMission = {
        ...moveMission,
        routeStarIds,
        ...travelPlan,
        status: 'ready',
        showDestinationDialog: true,
        routeRevealStartedAt: null,
      };
      state.invalidateRender();
      return;
    }

    state.moveMission = null;
    runMoveMissionAnimation(persistedMission);
  }

  function getDeepLinkParams() {
    const hash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;
    return new URLSearchParams(hash);
  }

  function writeDeepLink({ replace = false } = {}) {
    if (state.isApplyingDeepLink) {
      return;
    }

    const isOpen = rightPanel.dataset.open === 'true';
    const activePanel = rightPanel.dataset.panel ?? 'inventory';
    const params = new URLSearchParams();

    if (isOpen && LINKABLE_PANEL_NAMES.has(activePanel)) {
      params.set('panel', activePanel);
      if (activePanel === 'profile') {
        const viewedPlayerId = state.viewedProfileState?.playerId ?? state.currentPlayerId ?? '';
        if (viewedPlayerId) {
          params.set('player', viewedPlayerId);
        }
      }
      if (activePanel === 'system' && state.selection.selectedStarId) {
        params.set('star', state.selection.selectedStarId);
        if (state.selectedPlanetId) {
          params.set('planet', state.selectedPlanetId);
        }
      }
      if (activePanel === 'ship-designer') {
        params.set('view', getShipPanelView());
        if (getShipPanelView() === 'mission' && getShipPanelShipId()) {
          params.set('ship', getShipPanelShipId());
        }
      }
    }

    const nextUrl = params.toString()
      ? `${window.location.pathname}${window.location.search}#${params.toString()}`
      : `${window.location.pathname}${window.location.search}`;

    if (replace) {
      window.history.replaceState(null, '', nextUrl);
    } else {
      window.history.pushState(null, '', nextUrl);
    }
  }

  function applyDeepLink() {
    const params = getDeepLinkParams();
    const panelName = params.get('panel');

    if (!panelName || !LINKABLE_PANEL_NAMES.has(panelName)) {
      if (!window.location.hash && rightPanel.dataset.open === 'true') {
        state.isApplyingDeepLink = true;
        setRightPanelOpen(false);
        state.isApplyingDeepLink = false;
        state.invalidateRender();
      }
      return false;
    }

    state.isApplyingDeepLink = true;

    if (panelName === 'system') {
      const starId = params.get('star');
      const star = starId ? state.starsById.get(starId) : null;

      if (star) {
        state.selection.selectedStarId = star.id;
        const planetId = params.get('planet');
        state.selectedPlanetId = star.planets?.some((planet) => planet.id === planetId) ? planetId : null;
        rightPanel.dataset.panel = 'system';
        setRightPanelOpen(true);
        void ensureCurrentPlayerStateLoaded();
      }
    } else if (panelName === 'profile') {
      const linkedPlayerId = params.get('player')?.trim() || state.currentPlayerId;

      if (linkedPlayerId && linkedPlayerId !== state.currentPlayerId) {
        const linkedTerritory = getProfileLinkTerritory(linkedPlayerId);
        void openViewedProfile(linkedTerritory);
      } else {
        clearViewedProfile();
        rightPanel.dataset.panel = 'profile';
        setRightPanelOpen(true);
      }
    } else {
      state.selectedPlanetId = null;
      if (rightPanel.dataset.panel === 'system') {
        abandonPendingInfrastructureChanges();
      }
      if (panelName === 'ship-designer') {
        setShipPanelView(params.get('view') ?? 'fleet');
        setShipPanelShipId(params.get('ship') ?? '');
      }
      rightPanel.dataset.panel = panelName;
      setRightPanelOpen(true);
    }

    state.isApplyingDeepLink = false;
    state.invalidateRender();
    return true;
  }

  function getProductionViewModel() {
    const queue = state.playerState?.productionQueue ?? [];
    const industryLevel = getTotalIndustryInfrastructure();
    const productionAllocation = calculateProductionAllocation(queue, industryLevel);
    const intervalMs = getPlayerIntervalMs(state.playerState);
    const lastResourceUpdateMs = Date.parse(state.playerState?.lastResourceUpdate);
    const currentPeriodProgress = Number.isFinite(lastResourceUpdateMs)
      ? Math.min(1, Math.max(0, (Date.now() - lastResourceUpdateMs) / intervalMs))
      : 0;
    const usedProduction = Math.max(0, industryLevel - productionAllocation.unusedProduction);

    return {
      infoText:
        `Available production: ${formatProductionRate(productionAllocation.unusedProduction)} / ` +
        `${formatProductionRate(industryLevel)} Industry/period` +
        (usedProduction > 0 ? ` | In use: ${formatProductionRate(usedProduction)} Industry/period` : ''),
      entries: queue.map((entry, index) => {
        const allocation = productionAllocation.entries[index];
        const item = getProductionEntryDisplayItem(entry, allocation?.item);
        const estimatedPeriods = Number.isFinite(allocation?.estimatedPeriods)
          ? formatDurationPeriods(allocation.estimatedPeriods)
          : 'Paused';
        const productionCost = allocation?.productionCost ?? getProductionCostForEntry(entry, item);
        const remainingProductionCost = allocation?.remainingProductionCost ?? productionCost;
        const completedProduction = allocation?.completedProductionCost ?? Math.max(0, productionCost - remainingProductionCost);
        const projectedProduction = Math.min(
          productionCost,
          completedProduction + (allocation?.allocatedProduction ?? 0) * currentPeriodProgress
        );
        const progressPercent = productionCost > 0
          ? Math.min(100, Math.max(0, (projectedProduction / productionCost) * 100))
          : 0;
        const isCrafting = (allocation?.allocatedProduction ?? 0) > 0;
        const maxProductionForItem = productionCost / getMinimumCraftPeriods(productionCost);
        const efficiencyPercent = maxProductionForItem > 0
          ? Math.min(100, Math.max(0, ((allocation?.allocatedProduction ?? 0) / maxProductionForItem) * 100))
          : 0;

        return {
          id: entry.id ?? `${entry.itemId}-${index}`,
          itemId: entry.itemId,
          item,
          statusText: isCrafting ? estimatedPeriods : 'Waiting',
          progressPercent,
          efficiencyPercent: formatWholeNumber(efficiencyPercent),
        };
      }),
    };
  }

  function getPlayerSummaryViewModelForPlayerState(targetPlayerState, targetTerritoryId = targetPlayerState?.playerId ?? null) {
      const territory = targetTerritoryId
        ? state.territories.get(targetTerritoryId)
        : null;
      const ownedStarIds = territory?.stars ?? targetPlayerState?.territory?.stars ?? [];
      const ownedStars = ownedStarIds
        ? Array.from(ownedStarIds)
          .map((starId) => state.starsById.get(starId))
          .filter(Boolean)
      : [];

    let planetsTotal = 0;
    let planetsFull = 0;

    for (const star of ownedStars) {
      for (const planet of star.planets ?? []) {
        planetsTotal += 1;
        const cap = calculatePlanetPopulationCap(planet);
        if (cap > 0 && Math.max(0, planet.population ?? 0) >= cap) {
          planetsFull += 1;
        }
      }
    }

      const readySystems = ownedStars.reduce((count, star) => {
        const poolResources = targetPlayerState?.systemPools?.[star.id]?.resources ?? {};
        return count + (getWeightedResourceAmount(poolResources) > 0 ? 1 : 0);
      }, 0);

      return {
        ownedSystems: ownedStars.length,
        planetsTotal,
        planetsFull,
        readySystems,
        productionPerPeriod: getTotalIndustryInfrastructureForStars(ownedStars),
        energyOutput: targetPlayerState?.energyOutput ?? 0,
        activeEnergyConsumption: targetPlayerState?.activeEnergyConsumption ?? 0,
        inactiveInfrastructureCount: targetPlayerState?.inactiveInfrastructureCount ?? 0,
    };
  }

  function getTerritoryProfileImageUrl(territory) {
    if (!territory?.id) {
      return '';
    }

    if (territory.id === state.currentPlayerId) {
      return state.playerState?.profileImageUrl
        ?? state.playerState?.territory?.avatarImageUrl
        ?? territory.avatarImageUrl
        ?? '';
    }

    const cachedProfile = state.cachedPlayerStates.get(territory.id);
    return cachedProfile?.profileImageUrl
      ?? cachedProfile?.territory?.avatarImageUrl
      ?? territory.avatarImageUrl
      ?? '';
  }

  function getProfileLinkTerritory(playerId) {
    const existingTerritory = state.territories.get(playerId);
    if (existingTerritory) {
      return existingTerritory;
    }

    const cachedProfile = state.cachedPlayerStates.get(playerId);
    const cachedTerritory = cachedProfile?.territory;
    const name = cachedTerritory?.name ?? cachedProfile?.playerName ?? playerId;

    return {
      id: playerId,
      name,
      color: normalizeTerritoryColor(cachedTerritory?.color, getDefaultPlayerColor(playerId)),
      faction: cachedTerritory?.faction ?? name,
      avatarImageUrl: cachedProfile?.profileImageUrl ?? cachedTerritory?.avatarImageUrl ?? '',
      capitalStarId: cachedTerritory?.capitalStarId ?? null,
      stars: new Set(cachedTerritory?.stars ?? []),
    };
  }

  async function preloadTerritoryProfileImage(territory) {
    if (
      !territory?.id
      || territory.id === state.currentPlayerId
      || state.loadingOwnerProfileIds.has(territory.id)
      || state.attemptedOwnerProfileIds.has(territory.id)
    ) {
      return;
    }

    const cachedProfile = state.cachedPlayerStates.get(territory.id);
    if (cachedProfile?.profileImageUrl || cachedProfile?.territory?.avatarImageUrl) {
      return;
    }

    state.loadingOwnerProfileIds.add(territory.id);
    state.attemptedOwnerProfileIds.add(territory.id);
    try {
      const response = await sync.fetchPlayerState(territory.id);
      const profileImageUrl = response.player?.profileImageUrl ?? response.player?.territory?.avatarImageUrl ?? '';
      const fetchedPlayerState = {
        ...response.player,
        playerName: territory.name ?? response.player.playerId,
        profileImageUrl,
        territory: {
          ...getRuntimeTerritoryRecord(territory),
          avatarImageUrl: profileImageUrl || territory.avatarImageUrl || '',
        },
      };
      state.cachedPlayerStates.set(territory.id, structuredClone(fetchedPlayerState));
      if (profileImageUrl) {
        territory.avatarImageUrl = profileImageUrl;
      }
      state.invalidateRender();
    } catch (error) {
      // Owner avatars are nice-to-have; keep the system panel usable if the profile server is unavailable.
    } finally {
      state.loadingOwnerProfileIds.delete(territory.id);
    }
  }

  function getPlayerSummaryViewModel() {
      return getPlayerSummaryViewModelForPlayerState(state.playerState, state.currentPlayerId);
    }

    function renderRightSideMenu({ force = false } = {}) {
      if (!force && state.isCameraMoving && rightSideMenuHasRendered) {
        rightSideMenuPendingAfterMotion = true;
        return;
      }

      const selectedStar = state.starsById?.get(state.selection.selectedStarId) ?? null;
      const selectedTerritory = selectedStar
        ? findTerritoryByStarId(selectedStar.id)?.territory ?? null
        : null;
    const productionView = getProductionViewModel();
    const selectedOwnerProfileImageUrl = getTerritoryProfileImageUrl(selectedTerritory);

    if (selectedTerritory) {
      void preloadTerritoryProfileImage(selectedTerritory);
    }

    rightPanelRoot.render(
      React.createElement(RightSideMenu, {
        isOpen: rightPanel.dataset.open === 'true',
          activePanel: rightPanel.dataset.panel ?? 'inventory',
            playerState: state.playerState,
            playerSummary: getPlayerSummaryViewModel(),
            viewedProfileState: state.viewedProfileState,
            viewedProfileSummary: state.viewedProfileState
              ? getPlayerSummaryViewModelForPlayerState(
                  state.viewedProfileState,
                  state.viewedProfileState.playerId ?? state.viewedProfileState.territory?.id ?? null
                )
              : null,
            viewedProfileLoading: state.viewedProfileLoading,
            viewedProfileErrorMessage: state.viewedProfileErrorMessage,
          onProfileImageUpload: async (profileImageDataUrl) => {
              if (!state.currentPlayerId || !state.playerState) {
                return;
              }

            const uploadResponse = await sync.uploadProfileImage(state.currentPlayerId, profileImageDataUrl);
            const profileImageUrl = uploadResponse?.imageUrl ?? '';

            const territory = ensurePlayerTerritory(state.currentPlayerId, {
              avatarImageUrl: profileImageUrl,
            });
            state.playerState = {
              ...state.playerState,
              profileImageUrl,
              territory: territory ? getRuntimeTerritoryRecord(territory) : state.playerState.territory,
            };
            state.cachedPlayerStates.set(state.currentPlayerId, structuredClone(state.playerState));
            if (state.viewedProfileState?.playerId === state.currentPlayerId) {
              state.viewedProfileState = structuredClone(state.playerState);
            }
            state.invalidateRender();
            await sync.pushState();
          },
        resourceDisplay: RESOURCE_DISPLAY,
        itemDefinitions: ITEM_DEFINITIONS,
        selectedProductionItemId,
        onSelectedProductionItemIdChange: (itemId) => {
          selectedProductionItemId = itemId;
          state.invalidateRender();
        },
        onAddProduction: (productionTarget) => {
          void addSelectedItemToProductionQueue(productionTarget);
        },
        onRemoveProductionEntry: (entryId) => {
          void removeProductionQueueEntry(entryId);
        },
        productionInfoText: state.playerState ? productionView.infoText : 'Log in to use production.',
        productionEntries: state.playerState ? productionView.entries : [],
        shipTemplates: state.playerState?.shipTemplates ?? [],
        shipView: getShipPanelView(),
        shipId: getShipPanelShipId(),
        highlightedFleetShip: getHighlightedFleetShip(),
        onShipViewChange: (view, shipId = '') => {
          const previousSnapshot = getRightPanelSnapshot();
          if (
            view === 'mission' &&
            previousSnapshot.panel === 'ship-designer' &&
            previousSnapshot.shipView !== 'mission'
          ) {
            pushRightPanelSnapshot(previousSnapshot);
          }

          if (view === 'mission') {
            setHighlightedFleetShip(null);
          }

          setShipPanelView(view);
          setShipPanelShipId(view === 'mission' ? shipId : '');
          renderRightSideMenu();
          writeDeepLink();
        },
        onMissionAction: (missionId, ship) => {
          if (missionId === 'move-ship') {
            startMoveMission(ship);
          } else if (missionId === 'attack-system') {
            startAttackMission(ship);
          } else if (missionId === 'colonization') {
            return commitColonizationMission(ship);
          } else if (missionId === 'trade') {
            return startTradeMission(ship);
          } else if (missionId === 'piracy') {
            return startPiracyMission(ship);
          }
          return undefined;
        },
        onCancelTradeRoute: (ship) => cancelTradeRoute(ship),
        onCancelPiracyMission: (ship) => cancelPiracyMission(ship),
        onCargoTransfer: handleCargoItemTransfer,
        stars: state.galaxy?.stars ?? [],
        onCreateShipTemplate: (template) => {
          if (!state.playerState) {
            return;
          }

          state.playerState = {
            ...state.playerState,
            shipTemplates: [
              template,
              ...(state.playerState.shipTemplates ?? []),
            ],
          };
          state.cachedPlayerStates.set(state.currentPlayerId, structuredClone(state.playerState));
          state.invalidateRender();
          void sync.pushState();
        },
        onDeleteShipTemplate: (templateId) => {
          if (!state.playerState) {
            return;
          }

          state.playerState = {
            ...state.playerState,
            shipTemplates: (state.playerState.shipTemplates ?? []).filter((template) => template.id !== templateId),
          };
          state.cachedPlayerStates.set(state.currentPlayerId, structuredClone(state.playerState));
          state.invalidateRender();
          void sync.pushState();
        },
        selectedStar,
        selectedTerritory,
        selectedOwnerProfileImageUrl,
        selectedPlanetId: state.selectedPlanetId,
        currentTerritoryId: state.currentTerritoryId,
        hasPendingInfrastructureChanges: state.hasPendingInfrastructureChanges,
        infrastructureStatusMessage: state.infrastructureStatusMessage,
        showPopulationTiming: state.showPopulationTiming,
        getBuildCost: state.getInfrastructureBuildCost,
        canAffordUpgrade: state.canAffordInfrastructureUpgrade,
        onCollectResources: state.onCollectStarResources,
        onSetCapital: state.onSetCapitalStar,
        onInfrastructureChanged: state.onInfrastructureChanged,
        onSaveInfrastructureChanges: () => {
          void state.onSaveInfrastructureChanges?.();
        },
          onOpenFleetShip: (ship) => {
            setHighlightedFleetShip(ship);
            setShipPanelView('fleet');
            setShipPanelShipId('');
            openRightPanelWithHistory('ship-designer');
            writeDeepLink({ replace: true });
            state.invalidateRender();
          },
          onOpenStarSystem: (starId) => {
            const star = state.starsById?.get(starId);
            if (!star) {
              return;
            }

            abandonPendingInfrastructureChanges();
            focusCameraOnStar(star);
            pushRightPanelHistory('system');
            state.selection.selectedStarId = star.id;
            state.selectedPlanetId = null;
            rightPanel.dataset.panel = 'system';
            setRightPanelOpen(true);
            writeDeepLink({ replace: true });
            state.invalidateRender();
          },
          onSelectPlanet: (planetId) => {
            abandonPendingInfrastructureChanges();
            state.selectedPlanetId = planetId;
            writeDeepLink({ replace: true });
          },
          onInspectTerritoryProfile: (territory) => {
            void openViewedProfile(territory);
          },
          onCloseSelectedSystem: () => {
            abandonPendingInfrastructureChanges();
            state.selection.selectedStarId = null;
            state.selectedPlanetId = null;
            if (rightPanel.dataset.panel === 'system') {
              rightPanel.dataset.panel = 'inventory';
          }
          writeDeepLink({ replace: true });
          state.invalidateRender();
        },
        onClose: () => setRightPanelOpen(false),
      })
    );
    rightSideMenuHasRendered = true;
    rightSideMenuPendingAfterMotion = false;
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
      const territory = state.territories.get(state.currentPlayerId);
      if (territory && state.playerState) {
        state.playerState = {
          ...state.playerState,
          territory: getRuntimeTerritoryRecord(territory),
          playerName: territory.name ?? state.playerState.playerName,
        };
        state.cachedPlayerStates.set(state.currentPlayerId, structuredClone(state.playerState));
      }
    }
    markTerritoryRenderDataDirty();
    updateTerritorySelector();
    updateTerritoryControlVisibility();
    syncCurrentTerritoryEnergyState();
    updateLocalPlayerProduction();
    renderPlayerResources();
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

    const previousPlayerState = state.playerState;
    if (state.hasPendingTerritoryChanges || state.hasPendingInfrastructureChanges) {
      const territoryRevisionAtSaveStart = state.territoryRevision;
      await sync.pushState();
      if (state.territoryRevision === territoryRevisionAtSaveStart) {
        state.hasPendingTerritoryChanges = false;
      }
      revertPendingInfrastructureChanges();
    }
    if (state.currentPlayerId && previousPlayerState?.playerId === state.currentPlayerId) {
      state.cachedPlayerStates.set(state.currentPlayerId, structuredClone(previousPlayerState));
    }

    storeUsername(playerId);
    setLoggedInAs(playerId);
    state.playerState = null;
    state.infrastructureStatusMessage = '';
    ensurePlayerTerritory(playerId, {
      name: String(rawUsername || '').trim() || playerId,
      color: getLoggedInTerritory()?.color ?? getDefaultPlayerColor(playerId),
    });
    markTerritoryRenderDataDirty();
    updateTerritorySelector();
    updateTerritoryControlVisibility();
    renderPlayerResources();
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
      const territoryRevisionAtSaveStart = state.territoryRevision;
      await sync.pushState();
      if (state.territoryRevision === territoryRevisionAtSaveStart) {
        state.hasPendingTerritoryChanges = false;
      }
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

  function formatCompactNumber(value) {
    const number = Math.round(Number(value) || 0);
    const absolute = Math.abs(number);
    const units = [
      { threshold: 1_000_000_000_000, suffix: 'T' },
      { threshold: 1_000_000_000, suffix: 'B' },
      { threshold: 1_000_000, suffix: 'M' },
      { threshold: 1_000, suffix: 'K' },
    ];

    for (const unit of units) {
      if (absolute >= unit.threshold) {
        const compact = number / unit.threshold;
        const formatted = compact >= 100
          ? Math.round(compact).toString()
          : compact >= 10
            ? compact.toFixed(1)
            : compact.toFixed(2);
        return `${formatted.replace(/\.0+$|(\.\d*[1-9])0+$/, '$1')}${unit.suffix}`;
      }
    }

    return number.toString();
  }

  function renderCompactNumber(value) {
    const compact = formatCompactNumber(value);
    const suffixMatch = compact.match(/^(.+?)([KMBT])$/);
    if (!suffixMatch) {
      return compact;
    }

    return `${suffixMatch[1]}<span style="color:rgba(255,255,255,0.78);font-size:0.96em;font-weight:850;">${suffixMatch[2]}</span>`;
  }

  function formatElapsedResourceTime(durationMs) {
    const totalMinutes = Math.max(0, Math.floor((Number(durationMs) || 0) / 60000));
    if (totalMinutes < 1) {
      return 'less than a minute';
    }

    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    const parts = [];

    if (days > 0) {
      parts.push(`${days}d`);
    }
    if (hours > 0) {
      parts.push(`${hours}h`);
    }
    if (minutes > 0 && parts.length < 2) {
      parts.push(`${minutes}m`);
    }

    return parts.slice(0, 2).join(' ');
  }

  function getBaseProductionGain(periods) {
    const cappedPeriods = Math.min(
      BASE_PRODUCTION_OFFLINE_PERIOD_CAP,
      Math.max(0, Math.floor(Number(periods) || 0))
    );
    return addBasePlayerResourceProduction(createEmptyResources(), cappedPeriods);
  }

  function appendResourceGainPill(parent, resource, amount) {
    if (amount <= 0) {
      return;
    }

    const pill = document.createElement('div');
    pill.style.display = 'inline-flex';
    pill.style.alignItems = 'center';
    pill.style.gap = '4px';
    pill.style.padding = '2px 5px';
    pill.style.border = '1px solid rgba(148,163,184,0.14)';
    pill.style.borderRadius = '4px';
    pill.style.background = 'rgba(255,255,255,0.045)';
    pill.style.color = '#e8efff';
    pill.style.fontSize = '10px';
    pill.style.fontWeight = '850';
    pill.style.fontVariantNumeric = 'tabular-nums';

    const icon = document.createElement('span');
    if (resource.key === 'Credits') {
      icon.textContent = '$';
      icon.style.color = '#cbd5e1';
      icon.style.fontWeight = '900';
      icon.style.width = '10px';
      icon.style.textAlign = 'center';
    } else {
      applyResourceIconStyles(icon, resource, 12, 'inline');
    }

    const value = document.createElement('span');
    value.innerHTML = `+${renderCompactNumber(amount)}`;

    pill.appendChild(icon);
    pill.appendChild(value);
    parent.appendChild(pill);
  }

  function showBaseProductionGainNotice({ periods, resources, elapsedMs = 0, offline = false }) {
    const gainedEntries = [
      { key: 'Credits' },
      ...RESOURCE_DISPLAY,
    ].filter((resource) => (Number(resources?.[resource.key]) || 0) > 0);

    if (!gainedEntries.length) {
      return;
    }

    if (!offline) {
      const floatNumbers = document.createElement('div');
      floatNumbers.style.position = 'absolute';
      floatNumbers.style.top = '64px';
      floatNumbers.style.right = '54px';
      floatNumbers.style.zIndex = '76';
      floatNumbers.style.display = 'flex';
      floatNumbers.style.alignItems = 'center';
      floatNumbers.style.gap = '7px';
      floatNumbers.style.pointerEvents = 'none';
      floatNumbers.style.color = '#86efac';
      floatNumbers.style.fontSize = '11px';
      floatNumbers.style.fontWeight = '900';
      floatNumbers.style.fontVariantNumeric = 'tabular-nums';
      floatNumbers.style.textShadow = '0 0 10px rgba(134,239,172,0.42), 0 1px 2px rgba(0,0,0,0.55)';
      floatNumbers.style.opacity = '0';
      floatNumbers.style.transform = 'translateY(4px)';
      floatNumbers.style.transition = 'opacity 180ms ease, transform 900ms ease';

      for (const resource of gainedEntries) {
        const value = document.createElement('span');
        value.textContent = `+${formatCompactNumber(resources[resource.key])}`;
        floatNumbers.appendChild(value);
      }

      container.appendChild(floatNumbers);
      requestAnimationFrame(() => {
        floatNumbers.style.opacity = '1';
        floatNumbers.style.transform = 'translateY(-8px)';
      });
      window.setTimeout(() => {
        floatNumbers.style.opacity = '0';
        floatNumbers.style.transform = 'translateY(-16px)';
        window.setTimeout(() => floatNumbers.remove(), 260);
      }, 900);
      return;
    }

    const overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.inset = '0';
    overlay.style.zIndex = '90';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.padding = '20px';
    overlay.style.boxSizing = 'border-box';
    overlay.style.background = 'rgba(3, 7, 18, 0.42)';
    overlay.style.backdropFilter = 'blur(3px)';
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 180ms ease';

    const notice = document.createElement('div');
    notice.style.width = 'min(420px, calc(100vw - 40px))';
    notice.style.boxSizing = 'border-box';
    notice.style.padding = '16px 18px';
    notice.style.background = 'linear-gradient(180deg, rgba(8,13,27,0.94), rgba(5,8,22,0.9))';
    notice.style.border = '1px solid rgba(125,211,252,0.3)';
    notice.style.borderRadius = '8px';
    notice.style.boxShadow = '0 24px 70px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.06)';
    notice.style.backdropFilter = 'blur(16px)';
    notice.style.color = '#e8efff';
    notice.style.fontSize = '12px';
    notice.style.pointerEvents = 'auto';
    notice.style.transform = 'translateY(8px) scale(0.985)';
    notice.style.transition = 'transform 180ms ease';

    const title = document.createElement('div');
    title.textContent = 'Offline base production';
    title.style.color = '#bae6fd';
    title.style.fontSize = '15px';
    title.style.fontWeight = '900';
    notice.appendChild(title);

    const body = document.createElement('div');
    body.textContent =
      `Away for ${formatElapsedResourceTime(elapsedMs)}. Awarded ${formatWholeNumber(Math.min(periods, BASE_PRODUCTION_OFFLINE_PERIOD_CAP))}/${BASE_PRODUCTION_OFFLINE_PERIOD_CAP} stored periods.`;
    body.style.marginTop = '6px';
    body.style.color = 'rgba(232,239,255,0.7)';
    body.style.fontSize = '12px';
    body.style.lineHeight = '1.45';
    notice.appendChild(body);

    const resourceRow = document.createElement('div');
    resourceRow.style.display = 'grid';
    resourceRow.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
    resourceRow.style.gap = '6px';
    resourceRow.style.marginTop = '14px';
    for (const resource of gainedEntries) {
      appendResourceGainPill(resourceRow, resource, Number(resources[resource.key]) || 0);
    }
    notice.appendChild(resourceRow);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.textContent = 'OK';
    closeButton.style.display = 'inline-flex';
    closeButton.style.alignItems = 'center';
    closeButton.style.justifyContent = 'center';
    closeButton.style.width = '100%';
    closeButton.style.height = '30px';
    closeButton.style.marginTop = '16px';
    closeButton.style.border = '1px solid rgba(125,211,252,0.34)';
    closeButton.style.borderRadius = '5px';
    closeButton.style.background = 'rgba(125,211,252,0.13)';
    closeButton.style.color = '#bae6fd';
    closeButton.style.fontSize = '12px';
    closeButton.style.fontWeight = '900';
    closeButton.style.cursor = 'pointer';
    notice.appendChild(closeButton);

    const closeNotice = () => {
      overlay.style.opacity = '0';
      notice.style.transform = 'translateY(8px) scale(0.985)';
      window.setTimeout(() => overlay.remove(), 200);
    };
    closeButton.addEventListener('click', closeNotice);
    overlay.appendChild(notice);
    container.appendChild(overlay);
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      notice.style.transform = 'translateY(0) scale(1)';
    });
  }

  function getPlayerLevelProgress(playerState) {
    if (!playerState) {
      return 0;
    }

    const level = Math.max(1, Math.floor(Number(playerState.level) || 1));
    const rawExperience = Number(playerState.xp ?? playerState.experience);
    const rawCurrentLevelExperience = Number(playerState.currentLevelXp ?? playerState.levelXp);
    const rawNextLevelExperience = Number(playerState.nextLevelXp ?? playerState.xpToNextLevel);

    if (Number.isFinite(rawCurrentLevelExperience) && Number.isFinite(rawNextLevelExperience) && rawNextLevelExperience > 0) {
      return Math.min(1, Math.max(0, rawCurrentLevelExperience / rawNextLevelExperience));
    }

    if (Number.isFinite(rawExperience)) {
      const levelBase = Math.max(1, level * 100);
      return Math.min(1, Math.max(0, (rawExperience % levelBase) / levelBase));
    }

    return Math.min(1, Math.max(0, ((Number(playerState.completedHours) || 0) % 100) / 100));
  }

  function formatProductionRate(value) {
    return (Math.round((Number(value) || 0) * 10) / 10).toLocaleString(undefined, {
      maximumFractionDigits: 1,
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

  function formatResourceCostVertical(cost = {}) {
    const costEntries = RESOURCE_KEYS
      .filter((resourceKey) => (Number(cost[resourceKey]) || 0) > 0)
      .map((resourceKey) => `
        <div style="display:flex;justify-content:space-between;gap:12px;">
          <span>${resourceKey}</span>
          <strong>${formatWholeNumber(cost[resourceKey])}</strong>
        </div>
      `)
      .join('');

    return costEntries || '<div>Free</div>';
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[character]));
  }

  function renderItemIcon(item, size = 24) {
    const icon = item?.icon ?? {};
    const color = icon.color ?? '#93a4bd';
    const background = icon.background ?? 'linear-gradient(135deg, #0b1220, #334155)';
    const symbol = icon.symbol ?? '?';

    return `
      <span
        title="${escapeHtml(item?.name ?? 'Item')}"
        style="
          display:inline-flex;
          align-items:center;
          justify-content:center;
          flex:0 0 auto;
          width:${size}px;
          height:${size}px;
          border-radius:7px;
          background:${background};
          color:white;
          border:1px solid ${color}88;
          box-shadow:0 0 14px ${color}44, inset 0 1px 0 rgba(255,255,255,0.24);
          font-size:${Math.max(11, Math.round(size * 0.48))}px;
          font-weight:900;
          line-height:1;
        "
      >${escapeHtml(symbol)}</span>
    `;
  }

  function renderItemNameWithIcon(item, iconSize = 24) {
    return `
      <span style="display:inline-flex;align-items:center;gap:8px;min-width:0;">
        ${renderItemIcon(item, iconSize)}
        <span title="${escapeHtml(item.description)}" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(item.name)}</span>
      </span>
    `;
  }

  function renderPanelSection(title, content, options = {}) {
    return `
      <section style="padding:${options.compact ? '8px 0 10px' : '10px 0 14px'};border-bottom:1px solid rgba(255,255,255,0.1);">
        <div style="font-size:11px;font-weight:900;letter-spacing:0.08em;text-transform:uppercase;color:${options.color ?? 'rgba(255,255,255,0.62)'};margin-bottom:8px;">
          ${title}
        </div>
        <div style="display:flex;flex-direction:column;gap:${options.gap ?? 6}px;">
          ${content}
        </div>
      </section>
    `;
  }

  function renderInventoryResourceRows(resources = {}) {
    return RESOURCE_DISPLAY
      .map((resource) => `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:5px 0;">
          <span style="display:flex;align-items:center;gap:8px;min-width:0;">
            <span style="
              display:inline-flex;
              align-items:center;
              justify-content:center;
              flex:0 0 auto;
              width:22px;
              height:22px;
              border-radius:999px;
              background:${resource.color};
              color:#03111f;
              font-size:11px;
              font-weight:900;
              box-shadow:0 0 12px ${resource.color}55;
            ">${resource.icon}</span>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${resource.key}</span>
          </span>
          <span style="display:flex;flex-direction:column;align-items:flex-end;gap:1px;white-space:nowrap;">
            <strong title="${formatWholeNumber(resources[resource.key])}" style="font-variant-numeric:tabular-nums;">${renderCompactNumber(resources[resource.key])}</strong>
          </span>
        </div>
      `)
      .join('');
  }

  function renderShipInventoryRows(ships = []) {
    if (!Array.isArray(ships) || ships.length === 0) {
      return '<div style="color:rgba(255,255,255,0.48);font-size:12px;">No ships.</div>';
    }

    return ships
      .map((ship) => `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 0;">
          <span>${ship.name ?? ship.type ?? 'Ship'}</span>
          <strong style="font-variant-numeric:tabular-nums;">${formatWholeNumber(ship.count ?? 1)}</strong>
        </div>
      `)
      .join('');
  }

  function renderSpecialItemRows(items = {}) {
    return ITEM_DEFINITIONS
      .map((item) => `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 0;">
          ${renderItemNameWithIcon(item, 28)}
          <span style="display:flex;flex-direction:column;align-items:flex-end;gap:1px;">
            <strong style="font-variant-numeric:tabular-nums;">${formatWholeNumber(getPlayerTotalItemCount(item.id))}</strong>
            <small style="color:rgba(255,255,255,0.46);font-size:10px;">${formatWholeNumber(getItemStorageSize(item.id))} space</small>
          </span>
        </div>
      `)
      .join('');
  }

  function renderOwnedItemCount(itemId) {
    const ownedCount = getPlayerTotalItemCount(itemId);
    return `<span style="color:rgba(255,255,255,0.38);font-size:11px;font-weight:800;font-variant-numeric:tabular-nums;">${formatWholeNumber(ownedCount)}</span>`;
  }

  function renderProductionDropdown() {
    const selectedItem = getItemDefinition(selectedProductionItemId) ?? ITEM_DEFINITIONS[0] ?? null;
    productionDropdownButton.innerHTML = selectedItem
      ? `
        <span style="display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;">
          <span style="display:flex;align-items:center;gap:8px;min-width:0;">
            ${renderItemNameWithIcon(selectedItem, 22)}
            ${renderOwnedItemCount(selectedItem.id)}
          </span>
          <strong>${formatWholeNumber(selectedItem.productionCost)} Industry</strong>
        </span>
      `
      : 'No craftable items';

    productionDropdownMenu.innerHTML = ITEM_DEFINITIONS
      .map((item) => `
        <button
          type="button"
          data-item-id="${item.id}"
          style="
            width:100%;
            margin:0 0 6px 0;
            padding:9px 10px;
            background:${item.id === selectedProductionItemId ? 'rgba(148,163,184,0.18)' : 'rgba(255,255,255,0.055)'};
            color:white;
            border:1px solid ${item.id === selectedProductionItemId ? 'rgba(148,163,184,0.5)' : 'rgba(255,255,255,0.12)'};
            border-radius:14px;
            cursor:pointer;
            text-align:left;
          "
        >
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;font-weight:800;">
            <span style="display:flex;align-items:center;gap:8px;min-width:0;">
              ${renderItemNameWithIcon(item, 26)}
              ${renderOwnedItemCount(item.id)}
            </span>
            <span>${formatWholeNumber(item.productionCost)} Industry</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:2px;margin-top:6px;font-size:11px;color:rgba(255,255,255,0.76);">
            ${formatResourceCostVertical(item.resourceCost)}
          </div>
        </button>
      `)
      .join('');

    for (const optionButton of productionDropdownMenu.querySelectorAll('button[data-item-id]')) {
      optionButton.addEventListener('click', () => {
        selectedProductionItemId = optionButton.dataset.itemId;
        productionDropdownMenu.style.display = 'none';
        renderProductionDropdown();
      });
    }
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

  function refundResourceCost(resources = {}, cost = {}) {
    const nextResources = cloneResources(resources);
    for (const resourceKey of RESOURCE_KEYS) {
      nextResources[resourceKey] =
        (Number(nextResources[resourceKey]) || 0) + (Number(cost[resourceKey]) || 0);
    }

    return nextResources;
  }

  function getTotalIndustryInfrastructure() {
    return getTotalIndustryInfrastructureForStars(getOwnedStarsForCurrentTerritory());
  }

  function getTotalIndustryInfrastructureForStars(stars = []) {
    return stars.reduce((sum, star) => {
      const starIndustry = (star.planets ?? []).reduce(
        (planetSum, planet) => planetSum + getEffectiveInfrastructureLevel(planet, 'industrial'),
        0
      );
      return sum + starIndustry;
    }, 0);
  }

  function getProductionCostForEntry(entry, item = getItemDefinition(entry?.itemId)) {
    return Math.max(
      0,
      Number(
        entry?.productionCost ??
          entry?.requiredIndustryPeriods ??
          entry?.requiredIndustryHours ??
          item?.productionCost
      ) || 0
    );
  }

  function getProductionEntryDisplayItem(entry, item = getItemDefinition(entry?.itemId)) {
    if (item) {
      return item;
    }

    if (entry?.targetType !== 'ship-template') {
      return null;
    }

    return {
      id: entry.itemId ?? entry.id ?? 'ship-template',
      name: entry.itemName ?? entry.shipTemplate?.name ?? 'Ship Template',
      description: entry.shipTemplate?.hullName
        ? `${entry.shipTemplate.hullName} ship template`
        : 'Ship template',
      icon: {
        symbol: 'S',
        color: '#ffd9c2',
        background: 'linear-gradient(135deg, #4b2819, #c97442)',
      },
    };
  }

  function createShipInventoryEntryFromProduction(entry, defaultPosition = null) {
    const template = entry.shipTemplate ?? {};
    const templateId = template.id ?? entry.itemId ?? entry.id;
    return {
      id: templateId,
      templateId,
      name: template.name ?? entry.itemName ?? 'Ship Template',
      hullId: template.hullId ?? null,
      hullName: template.hullName ?? null,
      modules: Array.isArray(template.modules)
        ? template.modules.map((module) => ({ ...module }))
        : [],
      traits: { ...(template.traits ?? {}) },
      runtime: { ...(template.runtime ?? {}) },
      position: entry.position ?? defaultPosition ?? null,
      count: 1,
    };
  }

  function addCompletedShipToInventory(ships, entry, defaultPosition = null) {
    const completedShip = createShipInventoryEntryFromProduction(entry, defaultPosition);
    const nextShips = Array.isArray(ships)
      ? ships.map((ship) => ({
        ...ship,
        modules: Array.isArray(ship.modules)
          ? ship.modules.map((module) => ({ ...module }))
          : [],
        traits: { ...(ship.traits ?? {}) },
        runtime: { ...(ship.runtime ?? {}) },
        position: ship.position ?? defaultPosition ?? null,
      }))
      : [];
    const existingShip = nextShips.find(
      (ship) =>
        (ship.templateId === completedShip.templateId || ship.id === completedShip.templateId) &&
        (ship.position ?? null) === (completedShip.position ?? null)
    );

    if (existingShip) {
      existingShip.count = (Number(existingShip.count) || 0) + 1;
      return nextShips;
    }

    return [...nextShips, completedShip];
  }

  function getMinimumCraftPeriods(productionCost) {
    return Math.max(
      1,
      Math.ceil(Math.max(1, Number(productionCost) || 1) * MINIMUM_ITEM_CRAFT_TIME_RATIO)
    );
  }

  function calculateProductionAllocation(queue, industryLevel) {
    let remainingProduction = Math.max(0, Number(industryLevel) || 0);
    const entries = queue.map((entry) => {
      const item = getProductionEntryDisplayItem(entry);
      const productionCost = getProductionCostForEntry(entry, item);
      const completedProductionCost = Math.min(
        productionCost,
        Math.max(
          0,
          Number(entry.completedProductionCost ?? productionCost - (entry.remainingProductionCost ?? productionCost)) || 0
        )
      );
      const remainingProductionCost = Math.max(
        0,
        Number(entry.remainingProductionCost ?? productionCost - completedProductionCost) || 0
      );
      const maxProductionForItem = productionCost / getMinimumCraftPeriods(productionCost);
      const allocatedProduction = Math.min(
        remainingProduction,
        maxProductionForItem,
        remainingProductionCost
      );
      remainingProduction = Math.max(0, remainingProduction - allocatedProduction);

      return {
        entry,
        item,
        productionCost,
        completedProductionCost,
        remainingProductionCost,
        allocatedProduction,
        estimatedPeriods: allocatedProduction > 0
          ? Math.ceil(remainingProductionCost / allocatedProduction)
          : null,
      };
    });

    return {
      entries,
      unusedProduction: remainingProduction,
    };
  }

  function createProductionQueueEntry(item, industryLevel) {
    const productionCost = Math.max(1, Number(item.productionCost) || 1);
    const effectiveIndustry = Math.max(0, Number(industryLevel) || 0);
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      itemId: item.id,
      queuedAt: new Date().toISOString(),
      productionCost,
      completedProductionCost: 0,
      remainingProductionCost: productionCost,
      industryAtQueue: effectiveIndustry,
      estimatedPeriods: null,
      resourceCost: cloneResources(item.resourceCost),
    };
  }

  function createShipTemplateProductionQueueEntry(productionTarget, industryLevel) {
    const template = productionTarget.template;
    const productionCost = Math.max(1, Number(productionTarget.productionCost) || 1);
    const effectiveIndustry = Math.max(0, Number(industryLevel) || 0);
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      itemId: productionTarget.id,
      targetType: 'ship-template',
      itemName: template.name,
      queuedAt: new Date().toISOString(),
      productionCost,
      completedProductionCost: 0,
      remainingProductionCost: productionCost,
      industryAtQueue: effectiveIndustry,
      estimatedPeriods: null,
      resourceCost: cloneResources(productionTarget.resourceCost),
      shipTemplate: structuredClone(template),
    };
  }

  function advanceProductionQueue(playerState, completedPeriods, industryLevel, defaultShipPosition = null) {
    let productionQueue = (playerState.productionQueue ?? []).map((entry) => ({
      ...entry,
      productionCost: getProductionCostForEntry(entry),
      completedProductionCost: Math.min(
        getProductionCostForEntry(entry),
        Math.max(
          0,
          Number(
            entry.completedProductionCost ??
              getProductionCostForEntry(entry) - (entry.remainingProductionCost ?? getProductionCostForEntry(entry))
          ) || 0
        )
      ),
      remainingProductionCost: Math.max(
        0,
        Number(
          entry.remainingProductionCost ??
            getProductionCostForEntry(entry) - (entry.completedProductionCost ?? 0)
        ) || 0
      ),
    }));
    const items = { ...(playerState.items ?? {}) };
    let ships = Array.isArray(playerState.ships)
      ? playerState.ships.map((ship) => ({
          ...ship,
          traits: { ...(ship.traits ?? {}) },
          position: ship.position ?? defaultShipPosition ?? null,
        }))
      : [];
    let changed = false;
    const completeReadyEntries = () => {
      productionQueue = productionQueue.flatMap((entry) => {
        if (entry.remainingProductionCost > 0) {
          const nextEntry = { ...entry };
          delete nextEntry.storageBlocked;
          return [nextEntry];
        }

      if (entry.targetType === 'ship-template') {
        ships = addCompletedShipToInventory(ships, entry, defaultShipPosition);
          changed = true;
          return [];
        }

        items[entry.itemId] = (Number(items[entry.itemId]) || 0) + 1;
        changed = true;
        return [];
      });
    };

    completeReadyEntries();

    for (let periodIndex = 0; periodIndex < completedPeriods; periodIndex++) {
      const allocation = calculateProductionAllocation(productionQueue, industryLevel);
      if (allocation.entries.every((entry) => entry.allocatedProduction <= 0)) {
        break;
      }

      productionQueue = allocation.entries
        .map(({ entry, allocatedProduction }) => ({
          ...entry,
          completedProductionCost: Math.min(
            Number(entry.productionCost) || 0,
            (Number(entry.completedProductionCost) || 0) + allocatedProduction
          ),
          remainingProductionCost: Math.max(
            0,
            (Number(entry.remainingProductionCost) || 0) - allocatedProduction
          ),
        }))
      completeReadyEntries();
    }

    return {
      changed,
      items,
      ships,
      productionQueue,
    };
  }

  function renderProductionQueue() {
    const queue = state.playerState?.productionQueue ?? [];
    const industryLevel = getTotalIndustryInfrastructure();
    const productionAllocation = calculateProductionAllocation(queue, industryLevel);
    renderProductionDropdown();
    const intervalMs = getPlayerIntervalMs(state.playerState);
    const lastResourceUpdateMs = Date.parse(state.playerState?.lastResourceUpdate);
    const currentPeriodProgress = Number.isFinite(lastResourceUpdateMs)
      ? Math.min(1, Math.max(0, (Date.now() - lastResourceUpdateMs) / intervalMs))
      : 0;
    const usedProduction = Math.max(0, industryLevel - productionAllocation.unusedProduction);
    productionInfo.textContent =
      `Available production: ${formatProductionRate(productionAllocation.unusedProduction)} / ` +
      `${formatProductionRate(industryLevel)} Industry/period` +
      (usedProduction > 0 ? ` | In use: ${formatProductionRate(usedProduction)} Industry/period` : '');

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
        const allocation = productionAllocation.entries[index];
        const item = getProductionEntryDisplayItem(entry, allocation?.item);
        const estimatedPeriods = Number.isFinite(allocation?.estimatedPeriods)
          ? formatDurationPeriods(allocation.estimatedPeriods)
          : 'Paused';
        const productionCost = allocation?.productionCost ?? getProductionCostForEntry(entry, item);
        const remainingProductionCost = allocation?.remainingProductionCost ?? productionCost;
        const completedProduction = allocation?.completedProductionCost ?? Math.max(0, productionCost - remainingProductionCost);
        const projectedProduction = Math.min(
          productionCost,
          completedProduction + (allocation?.allocatedProduction ?? 0) * currentPeriodProgress
        );
        const progressPercent = productionCost > 0
          ? Math.min(100, Math.max(0, (projectedProduction / productionCost) * 100))
          : 0;
        const isCrafting = (allocation?.allocatedProduction ?? 0) > 0;
        const statusText = isCrafting ? estimatedPeriods : 'Waiting';
        const maxProductionForItem = productionCost / getMinimumCraftPeriods(productionCost);
        const efficiencyPercent = maxProductionForItem > 0
          ? Math.min(100, Math.max(0, ((allocation?.allocatedProduction ?? 0) / maxProductionForItem) * 100))
          : 0;
        return `
          <div style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.1);">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
              <span style="display:flex;align-items:center;gap:8px;min-width:0;">
                <span style="color:rgba(255,255,255,0.52);font-size:11px;width:14px;text-align:right;">${index + 1}.</span>
                ${item ? renderItemNameWithIcon(item, 22) : entry.itemId}
              </span>
              <strong style="color:${isCrafting ? '#93a4bd' : 'rgba(255,255,255,0.58)'};">${statusText}</strong>
            </div>
            <div style="height:8px;background:rgba(255,255,255,0.08);border-radius:999px;overflow:hidden;margin-top:7px;border:1px solid rgba(255,255,255,0.08);">
              <div style="height:100%;width:${progressPercent}%;background:linear-gradient(90deg,#7c8faa,#9da8bd);box-shadow:0 0 12px rgba(148,163,184,0.18);"></div>
            </div>
            <div style="font-size:11px;color:rgba(255,255,255,0.52);margin-top:2px;">
              Efficiency: ${formatWholeNumber(efficiencyPercent)}%
            </div>
          </div>
        `;
      })
      .join('');
  }

  function renderInventoryPanel() {
    rightPanel.dataset.panel = 'inventory';
    renderRightSideMenu();
  }

  function renderProductionPanel() {
    rightPanel.dataset.panel = 'production';
    renderRightSideMenu();
  }

  function renderShipDesignerPanel() {
    rightPanel.dataset.panel = 'ship-designer';
    renderRightSideMenu();
  }

  function renderMarketPanel() {
    rightPanel.dataset.panel = 'market';
    renderRightSideMenu();
  }

  function renderAlliancePanel() {
    rightPanel.dataset.panel = 'alliance';
    renderRightSideMenu();
  }

  function renderObjectivesPanel() {
    rightPanel.dataset.panel = 'objectives';
    renderRightSideMenu();
  }

  const panelHistory = [];

  function getRightPanelSnapshot() {
    return {
      panel: rightPanel.dataset.panel ?? 'inventory',
      shipView: getShipPanelView(),
      shipId: getShipPanelShipId(),
      selectedStarId: state.selection.selectedStarId ?? null,
      selectedPlanetId: state.selectedPlanetId ?? null,
    };
  }

  function pushRightPanelHistory(nextPanel) {
    if (rightPanel.dataset.open !== 'true') {
      return;
    }

    const snapshot = getRightPanelSnapshot();
    if (snapshot.panel === nextPanel) {
      return;
    }

    panelHistory.push(snapshot);
    if (panelHistory.length > 24) {
      panelHistory.shift();
    }
  }

  function pushRightPanelSnapshot(snapshot) {
    if (rightPanel.dataset.open !== 'true' || !snapshot) {
      return;
    }

    panelHistory.push(snapshot);
    if (panelHistory.length > 24) {
      panelHistory.shift();
    }
    updatePanelHistoryControls();
  }

  function updatePanelHistoryControls() {
    panelNavControls.style.display = rightPanel.dataset.open === 'true' ? 'flex' : 'none';
    panelBackButton.disabled = panelHistory.length === 0 || rightPanel.dataset.open !== 'true';
    panelCloseButton.disabled = rightPanel.dataset.open !== 'true';
    setBottomNavVisual(panelBackButton, false);
    setBottomNavVisual(panelCloseButton, false);
  }

  function restoreRightPanelSnapshot(snapshot) {
    if (!snapshot) {
      return;
    }

    if ((rightPanel.dataset.panel ?? 'inventory') === 'system' && snapshot.panel !== 'system') {
      abandonPendingInfrastructureChanges();
    }

    rightPanel.dataset.panel = snapshot.panel;
    setShipPanelView(snapshot.shipView ?? 'fleet');
    setShipPanelShipId(snapshot.shipId ?? '');
    state.selection.selectedStarId = snapshot.panel === 'system' ? snapshot.selectedStarId : null;
    state.selectedPlanetId = snapshot.panel === 'system' ? snapshot.selectedPlanetId : null;
    setRightPanelOpen(true);
    state.invalidateRender();
  }

  function goBackRightPanel() {
    restoreRightPanelSnapshot(panelHistory.pop());
  }

  function openRightPanelWithHistory(panelName, { pushHistory = true } = {}) {
    const activePanel = rightPanel.dataset.panel ?? 'inventory';
    if (pushHistory) {
      pushRightPanelHistory(panelName);
    }

    if (activePanel === 'system' && panelName !== 'system') {
      abandonPendingInfrastructureChanges();
    }

    if (
      panelName === 'ship-designer' &&
      (activePanel !== 'ship-designer' || rightPanel.dataset.open !== 'true' || getShipPanelView() === 'mission')
    ) {
      setShipPanelView('fleet');
      setShipPanelShipId('');
    }

    rightPanel.dataset.panel = panelName;
    setRightPanelOpen(true);
  }

  function setPanelButtonActive(button, isActive) {
    if (button.dataset.bottomNav === 'true') {
      setBottomNavVisual(button, isActive);
      return;
    }

    button.style.background = isActive ? 'rgba(148,163,184,0.18)' : 'rgba(255,255,255,0.05)';
    button.style.borderColor = isActive ? 'rgba(148,163,184,0.46)' : 'rgba(148,163,184,0.16)';
    button.style.color = '#e8efff';
  }

  function setProfileDropdownOpen(isOpen) {
    profileDropdown.style.display = isOpen ? 'block' : 'none';
    profileAvatar.style.boxShadow = isOpen
      ? '0 0 0 1px rgba(148,163,184,0.42), 0 10px 24px rgba(0, 0, 0, 0.26)'
      : '0 10px 24px rgba(0, 0, 0, 0.26)';
  }

    function openRightPanel(panelName) {
      openRightPanelWithHistory(panelName);
    }

    function clearViewedProfile() {
      state.viewedProfileState = null;
      state.viewedProfileLoading = false;
      state.viewedProfileErrorMessage = '';
    }

    async function openViewedProfile(territory) {
      if (!territory?.id) {
        return;
      }

      if ((rightPanel.dataset.panel ?? 'inventory') === 'system') {
        abandonPendingInfrastructureChanges();
      }

      if (territory.id === state.currentPlayerId) {
        clearViewedProfile();
        openRightPanel('profile');
        state.invalidateRender();
        return;
      }

      const cachedProfile = state.cachedPlayerStates.get(territory.id) ?? null;
      state.viewedProfileState = cachedProfile
        ? {
            ...structuredClone(cachedProfile),
            territory: territory ? getRuntimeTerritoryRecord(territory) : cachedProfile.territory,
          }
        : {
            playerId: territory.id,
            playerName: territory.name ?? territory.id,
            territory: getRuntimeTerritoryRecord(territory),
            level: 1,
            xp: 0,
            gems: 0,
            profileImageUrl: territory.avatarImageUrl ?? '',
          };
      state.viewedProfileLoading = true;
      state.viewedProfileErrorMessage = '';
      openRightPanel('profile');
      state.invalidateRender();

      try {
        const response = await sync.fetchPlayerState(territory.id);
        const fetchedPlayerState = {
          ...response.player,
          playerName: territory.name ?? response.player.playerId,
          territory: territory ? getRuntimeTerritoryRecord(territory) : response.player.territory,
          profileImageUrl: response.player.profileImageUrl ?? territory.avatarImageUrl ?? '',
        };
        state.cachedPlayerStates.set(territory.id, structuredClone(fetchedPlayerState));
        state.viewedProfileState = fetchedPlayerState;
        state.viewedProfileLoading = false;
        state.viewedProfileErrorMessage = '';
      } catch (error) {
        state.viewedProfileLoading = false;
        state.viewedProfileErrorMessage = 'Profile could not be loaded.';
      }

      state.invalidateRender();
    }

  function addProfileDropdownAction(label, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.style.display = 'block';
    button.style.width = '100%';
    button.style.padding = '10px 12px';
    button.style.margin = '0 0 4px 0';
    button.style.background = 'rgba(255,255,255,0.03)';
    button.style.color = '#e8efff';
    button.style.border = '1px solid rgba(148,163,184,0.12)';
    button.style.borderRadius = '12px';
    button.style.cursor = 'pointer';
    button.style.textAlign = 'left';
    button.style.fontSize = '12px';
    button.style.fontWeight = '700';
    button.addEventListener('click', () => {
      setProfileDropdownOpen(false);
      onClick();
    });
    profileDropdown.appendChild(button);
  }

    addProfileDropdownAction('Profile', () => {
      clearViewedProfile();
      openRightPanel('profile');
    });
  addProfileDropdownAction('Inventory', () => openRightPanel('inventory'));
  addProfileDropdownAction('Skills', () => openRightPanel('skills'));
  addProfileDropdownAction('Settings', () => {
    settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none';
  });

    function renderActiveRightPanel() {
      switch (rightPanel.dataset.panel) {
        case 'profile':
          renderRightSideMenu();
          break;
        case 'skills':
          renderRightSideMenu();
          break;
        case 'production':
          renderProductionPanel();
          break;
      case 'ship-designer':
        renderShipDesignerPanel();
        break;
      case 'system':
        renderRightSideMenu();
        break;
      case 'market':
        renderMarketPanel();
        break;
      case 'alliance':
        renderAlliancePanel();
        break;
      case 'objectives':
        renderObjectivesPanel();
        break;
      case 'inventory':
      default:
        renderInventoryPanel();
        break;
    }
  }

  function setRightPanelOpen(isOpen) {
    const activePanel = rightPanel.dataset.panel ?? 'inventory';
    if (!isOpen && activePanel === 'system') {
      abandonPendingInfrastructureChanges();
    }

    rightPanel.dataset.open = isOpen ? 'true' : 'false';
    rightPanel.style.opacity = isOpen ? '1' : '0';
    rightPanel.style.pointerEvents = isOpen ? 'auto' : 'none';
    rightPanel.style.transform = isOpen ? 'translateX(0)' : 'translateX(100%)';
    setPanelButtonActive(inventoryButton, isOpen && rightPanel.dataset.panel === 'inventory');
    setPanelButtonActive(productionButton, isOpen && rightPanel.dataset.panel === 'production');
    setPanelButtonActive(shipDesignerButton, isOpen && rightPanel.dataset.panel === 'ship-designer');
    setPanelButtonActive(marketButton, isOpen && rightPanel.dataset.panel === 'market');
    setPanelButtonActive(allianceButton, isOpen && rightPanel.dataset.panel === 'alliance');
    setPanelButtonActive(objectivesButton, isOpen && rightPanel.dataset.panel === 'objectives');
    updatePanelHistoryControls();
    renderRightSideMenu();
    writeDeepLink({ replace: !isOpen });
  }

  function toggleRightPanel(panelName) {
    const activePanel = rightPanel.dataset.panel ?? 'inventory';
    if (activePanel === 'system' && panelName !== 'system') {
      abandonPendingInfrastructureChanges();
    }
    const shouldOpen = rightPanel.dataset.open !== 'true' || activePanel !== panelName;
    if (shouldOpen && activePanel !== panelName) {
      pushRightPanelHistory(panelName);
    }
    if (
      panelName === 'ship-designer' &&
      (activePanel !== 'ship-designer' || rightPanel.dataset.open !== 'true' || getShipPanelView() === 'mission')
    ) {
      setShipPanelView('fleet');
      setShipPanelShipId('');
    }
    rightPanel.dataset.panel = panelName;
    setRightPanelOpen(shouldOpen);
  }

  async function addSelectedItemToProductionQueue(productionTarget = null) {
    if (!state.playerState) {
      renderProductionPanel();
      return;
    }

    const item = productionTarget?.type === 'item'
      ? getItemDefinition(productionTarget.itemId)
      : getItemDefinition(selectedProductionItemId);
    const isShipTemplate = productionTarget?.type === 'ship-template' && productionTarget.template;
    const targetDefinition = isShipTemplate ? productionTarget : item;

    if (!targetDefinition) {
      return;
    }

    const resourceCost = cloneResources(targetDefinition.resourceCost);
    if (!canAffordResourceCost(state.playerState.resources, resourceCost)) {
      productionInfo.textContent = `Not enough resources. Need: ${formatResourceCost(resourceCost)}`;
      return;
    }

    const queueEntry = isShipTemplate
      ? createShipTemplateProductionQueueEntry(productionTarget, getTotalIndustryInfrastructure())
      : createProductionQueueEntry(item, getTotalIndustryInfrastructure());
    state.playerState = {
      ...state.playerState,
      resources: spendResourceCost(state.playerState.resources, resourceCost),
      productionQueue: [
        ...(state.playerState.productionQueue ?? []),
        queueEntry,
      ],
    };
    state.cachedPlayerStates.set(state.currentPlayerId, structuredClone(state.playerState));
    renderProductionPanel();
    state.invalidateRender();
    await sync.pushState();
  }

  async function removeProductionQueueEntry(entryId) {
    if (!state.playerState || !entryId) {
      renderProductionPanel();
      return;
    }

    const existingQueue = state.playerState.productionQueue ?? [];
    const entryToRemove = existingQueue.find((entry) => entry.id === entryId);
    if (!entryToRemove) {
      return;
    }

    state.playerState = {
      ...state.playerState,
      resources: refundResourceCost(state.playerState.resources, cloneResources(entryToRemove.resourceCost)),
      productionQueue: existingQueue.filter((entry) => entry.id !== entryId),
    };
    state.cachedPlayerStates.set(state.currentPlayerId, structuredClone(state.playerState));
    renderProductionPanel();
    state.invalidateRender();
    await sync.pushState();
  }

  function renderTopResourceBar() {
    syncCurrentTerritoryEnergyState();
    const resources = state.playerState?.resources ?? {};
    const profileImageUrl = state.playerState?.profileImageUrl ?? '';
    const territoryName =
      state.playerState?.territory?.name ?? state.playerState?.playerName ?? state.playerState?.playerId ?? 'P';
    const playerLevel = Math.max(1, Math.floor(Number(state.playerState?.level) || 1));
    const levelProgress = getPlayerLevelProgress(state.playerState);
    const gems = Number(state.playerState?.gems ?? state.playerState?.premiumCurrency ?? 0) || 0;
    const energyOutput = state.playerState?.energyOutput ?? 0;
    const energyConsumption = state.playerState?.energyConsumption ?? 0;
    const activeEnergyConsumption = state.playerState?.activeEnergyConsumption ?? 0;
    const energyDeficit = state.playerState?.energyDeficit ?? 0;
      const periodLabel = state.playerState?.resourceUpdateInterval === 'hour' ? 'h' : 'min';

      profileAvatarText.textContent = String(territoryName).trim().charAt(0).toUpperCase() || 'P';
      profileAvatarText.style.display = profileImageUrl ? 'none' : 'block';
      profileAvatar.style.background = 'linear-gradient(135deg, #93a4bd, #7c8faa)';
      profileAvatarImage.style.display = profileImageUrl ? 'block' : 'none';
      profileAvatarImage.src = profileImageUrl || '';

      profileLevelNode.textContent = formatCompactNumber(playerLevel);
    profileLevelRing.style.background =
      `conic-gradient(#93a4bd 0deg ${Math.round(levelProgress * 360)}deg, rgba(255,255,255,0.1) ${Math.round(levelProgress * 360)}deg 360deg)`;
    profileLevelRing.title = `Level ${formatWholeNumber(playerLevel)} - ${Math.round(levelProgress * 100)}% to next`;
    profileCreditsNode.innerHTML = `<span title="Credits" style="text-align:center;">$</span><span>${renderCompactNumber(resources.Credits)}</span>`;
    profileCreditsNode.style.opacity = state.playerState ? '1' : '0.65';
    profileGemsNode.innerHTML = `<span title="Gems" style="text-align:center;">◆</span><span>${renderCompactNumber(gems)}</span>`;
    profileGemsNode.style.opacity = state.playerState ? '1' : '0.65';
    const energyFillRatio = energyOutput > 0
      ? Math.max(0, Math.min(1, activeEnergyConsumption / energyOutput))
      : 0;
    profileEnergyUsageNode.textContent = renderCompactNumber(activeEnergyConsumption);
    profileEnergyUsageNode.style.opacity = state.playerState ? '1' : '0.65';
    profileEnergyUsageNode.style.color = energyDeficit > 0 ? '#fca5a5' : 'rgba(232,239,255,0.76)';
    profileEnergyBarTrack.title = `${formatWholeNumber(activeEnergyConsumption)} / ${formatWholeNumber(energyOutput)} energy`;
    profileEnergyBarFill.style.width = `${Math.round(energyFillRatio * 100)}%`;
    profileEnergyBarFill.style.background = energyDeficit > 0
      ? 'linear-gradient(90deg, #b35d5d, #fca5a5)'
      : 'linear-gradient(90deg, #7c8faa, #9da8bd)';
    profileEnergyMaxNode.textContent = renderCompactNumber(energyOutput);
    profileEnergyMaxNode.style.opacity = state.playerState ? '1' : '0.65';
    if (rightPanel.dataset.open === 'true') {
      renderActiveRightPanel();
    }

    for (const resource of RESOURCE_DISPLAY) {
      const amountNode = topBarResourceAmountNodes.get(resource.key);
      if (!amountNode) {
        continue;
      }

      amountNode.innerHTML = renderCompactNumber(resources[resource.key]);
      amountNode.style.opacity = state.playerState ? '1' : '0.65';
    }

    if (energyMaxNode) {
      energyMaxNode.textContent = `Max: ${formatWholeNumber(energyOutput)}/${periodLabel}`;
      energyMaxNode.style.opacity = state.playerState ? '1' : '0.65';
    }

    if (energyOutputNode) {
      energyOutputNode.textContent = `Usage: ${formatWholeNumber(activeEnergyConsumption)}/${periodLabel}`;
      energyOutputNode.style.opacity = state.playerState ? '1' : '0.65';
    }

    if (energyConsumptionNode) {
      energyConsumptionNode.textContent =
        energyDeficit > 0
          ? `Demand: ${formatWholeNumber(energyConsumption)}/${periodLabel}  Offline: ${formatWholeNumber(state.playerState?.inactiveInfrastructureCount)}`
          : `Demand: ${formatWholeNumber(energyConsumption)}/${periodLabel}`;
      energyConsumptionNode.style.color =
        energyDeficit > 0 ? '#fca5a5' : 'rgba(255,255,255,0.82)';
      energyConsumptionNode.style.opacity = state.playerState ? '1' : '0.65';
    }

    if (energyStatusBadge) {
      energyStatusBadge.style.borderLeftColor =
        energyDeficit > 0 ? 'rgba(248, 113, 113, 0.55)' : 'rgba(148,163,184,0.14)';
      energyStatusBadge.style.boxShadow =
        energyDeficit > 0 ? '0 0 0 1px rgba(248, 113, 113, 0.12)' : 'none';
    }
  }

  function getPlayerIntervalMs(playerState) {
    return RESOURCE_UPDATE_INTERVALS_MS[playerState?.resourceUpdateInterval] ?? RESOURCE_UPDATE_INTERVALS_MS.minute;
  }

  function addBasePlayerResourceProduction(resources, multiplier = 1) {
    sumResources(resources, BASE_PLAYER_RESOURCE_PRODUCTION_PER_PERIOD, multiplier);
    return resources;
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
    addBasePlayerResourceProduction(periodProduction);

    return periodProduction;
  }

  function settleLocalSystemPools(nowMs = Date.now(), options = {}) {
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
    const migratedBaseResourcePool = cloneResources(state.playerState.baseResourcePool);
    sumResources(nextResources, migratedBaseResourcePool);
    const baseProductionPeriods = Math.min(BASE_PRODUCTION_OFFLINE_PERIOD_CAP, completedIntervals);
    const baseProductionGain = getBaseProductionGain(baseProductionPeriods);
    sumResources(nextResources, baseProductionGain);
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
    const productionState = advanceProductionQueue(
      state.playerState,
      completedIntervals,
      getTotalIndustryInfrastructure(),
      state.territories.get(state.currentTerritoryId)?.capitalStarId ?? null
    );

    state.playerState = {
      ...state.playerState,
      resources: nextResources,
      items: productionState.items,
      ships: productionState.ships,
      productionQueue: productionState.productionQueue,
      systemPools,
      baseResourcePool: createEmptyResources(),
      systemPoolCapacities,
      hourlyProduction: calculateLocalPeriodProductionFromPools(systemPools, ownedStars),
      completedHours: (state.playerState.completedHours ?? 0) + completedIntervals,
      lastResourceUpdate: new Date(Math.floor(nowMs / intervalMs) * intervalMs).toISOString(),
    };

    if (options.showBaseProductionGain && baseProductionPeriods > 0) {
      showBaseProductionGainNotice({
        periods: baseProductionPeriods,
        resources: baseProductionGain,
        offline: false,
      });
    }

    return populationChanged || productionState.changed || completedIntervals > 0;
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

  function formatLoadingTime(durationMs) {
    if (!Number.isFinite(durationMs)) {
      return '-- s';
    }

    const seconds = durationMs / 1000;
    return `${seconds < 10 ? seconds.toFixed(2) : seconds.toFixed(1)} s`;
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

    const loadingText = formatLoadingTime(state.loadingTimeMs);

    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    for (const y of [16, 33, 50]) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    if (!samples.length) {
      performanceStats.textContent = `FPS: -- | Frame: -- ms | Load: --\nLoading: ${loadingText}`;
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
      `FPS: ${averageFps.toFixed(1)} | Frame: ${averageFrameMs.toFixed(1)} ms | Load: ${loadPercent.toFixed(0)}%\nLoading: ${loadingText}`;

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
    if (state.loadingTimeMs === null) {
      state.loadingTimeMs = now;
    }

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

    if (state.showPerformanceGraph && now - lastPerformanceGraphDrawAt >= PERFORMANCE_GRAPH_REDRAW_INTERVAL_MS) {
      lastPerformanceGraphDrawAt = now;
      drawPerformanceGraph();
    }
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

    lastPerformanceGraphDrawAt = now;
    drawPerformanceGraph();
    state.performanceGraphFrameId = window.setTimeout(
      samplePerformanceGraphFrame,
      PERFORMANCE_GRAPH_REDRAW_INTERVAL_MS
    );
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
    state.performanceGraphFrameId = window.setTimeout(
      samplePerformanceGraphFrame,
      PERFORMANCE_GRAPH_REDRAW_INTERVAL_MS
    );
  }

  function stopPerformanceGraphLoop() {
    if (state.performanceGraphFrameId !== null) {
      window.clearTimeout(state.performanceGraphFrameId);
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
      const completedPeriods = Math.max(0, Math.floor(Number(state.playerState.completedHours) || 0));
      const baseProductionPeriods = Math.min(BASE_PRODUCTION_OFFLINE_PERIOD_CAP, completedPeriods);
      const intervalMs = getPlayerIntervalMs(state.playerState);
      restorePersistedMoveMissions();
      state.cachedPlayerStates.set(playerId, structuredClone(state.playerState));
      state.infrastructureStatusMessage = '';
      captureCommittedInfrastructureState();
      syncCurrentTerritoryEnergyState();
      renderPlayerResources();
      if (baseProductionPeriods > 0) {
        showBaseProductionGainNotice({
          periods: completedPeriods,
          resources: getBaseProductionGain(baseProductionPeriods),
          elapsedMs: completedPeriods * intervalMs,
          offline: true,
        });
      }
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
    restorePersistedMoveMissions();
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

    const saved = await sync.pushState({ includePendingInfrastructure: true });
    if (!saved) {
      state.infrastructureStatusMessage = 'Failed to save infrastructure';
      renderPlayerResources();
      state.invalidateRender();
      return;
    }

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

    const territory = state.territories.get(state.currentPlayerId) ?? null;
    if (territory && state.playerState) {
      state.playerState = {
        ...state.playerState,
        territory: getRuntimeTerritoryRecord(territory),
      };
    }

    markTerritoryRenderDataDirty();
    markTerritoryChangesDirty();
    updateLocalPlayerProduction();
    renderPlayerResources();
    state.invalidateRender();

    const territoryRevisionAtSaveStart = state.territoryRevision;
    await sync.pushState();
    if (state.territoryRevision === territoryRevisionAtSaveStart) {
      state.hasPendingTerritoryChanges = false;
    }
    if (state.currentPlayerId && state.playerState) {
      state.cachedPlayerStates.set(state.currentPlayerId, structuredClone(state.playerState));
    }
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

      if (settleLocalSystemPools(Date.now(), { showBaseProductionGain: true })) {
        await sync.pushState();
        renderPlayerResources();
        state.invalidateRender();
      }

      startLocalResourceTicker();
    }, delayMs);
  }

  resetGalaxyButton.addEventListener('click', async () => {
    if (await sync.resetGalaxyMapState()) {
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

  profileAvatar.addEventListener('click', (event) => {
    event.stopPropagation();
    setProfileDropdownOpen(profileDropdown.style.display === 'none');
  });

  document.addEventListener('click', (event) => {
    if (!profileAvatarWrap.contains(event.target)) {
      setProfileDropdownOpen(false);
    }
  });

  inventoryButton.addEventListener('click', () => {
    setProfileDropdownOpen(false);
    toggleRightPanel('inventory');
  });

  productionButton.addEventListener('click', () => {
    setProfileDropdownOpen(false);
    toggleRightPanel('production');
  });

  shipDesignerButton.addEventListener('click', () => {
    setProfileDropdownOpen(false);
    if (rightPanel.dataset.open !== 'true' || getShipPanelView() === 'mission') {
      setShipPanelView('fleet');
      setShipPanelShipId('');
    }
    toggleRightPanel('ship-designer');
  });

  marketButton.addEventListener('click', () => {
    setProfileDropdownOpen(false);
    toggleRightPanel('market');
  });

  allianceButton.addEventListener('click', () => {
    setProfileDropdownOpen(false);
    toggleRightPanel('alliance');
  });

  objectivesButton.addEventListener('click', () => {
    setProfileDropdownOpen(false);
    toggleRightPanel('objectives');
  });

  rightPanelCloseButton.addEventListener('click', () => {
    setRightPanelOpen(false);
  });

  panelBackButton.addEventListener('click', () => {
    goBackRightPanel();
  });

  panelCloseButton.addEventListener('click', () => {
    setRightPanelOpen(false);
  });

  addProductionButton.addEventListener('click', () => {
    void addSelectedItemToProductionQueue();
  });

  productionDropdownButton.addEventListener('click', () => {
    productionDropdownMenu.style.display =
      productionDropdownMenu.style.display === 'none' ? 'block' : 'none';
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
    if (state.suppressCanvasClick) {
      state.suppressCanvasClick = false;
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;

    if (state.moveMission?.active || state.attackMission?.active || state.tradeMission?.active) {
      return;
    }

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
          if (state.selection.selectedStarId && state.selection.selectedStarId !== closest.id) {
            abandonPendingInfrastructureChanges();
          }
          pushRightPanelHistory('system');
          state.selection.selectedStarId = closest.id;
          state.selectedPlanetId = null;
          rightPanel.dataset.panel = 'system';
          setRightPanelOpen(true);
          void ensureCurrentPlayerStateLoaded();
          state.invalidateRender();
        }
      }
    } else {
      if (!state.territoryMode) {
        abandonPendingInfrastructureChanges();
        state.selection.selectedStarId = null;
        state.selectedPlanetId = null;
        writeDeepLink({ replace: true });
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

  state.onMoveMissionCalculateRoute = calculateMoveMissionRoute;
  state.onMoveMissionCommitMove = commitMoveMission;
  state.onMoveMissionCancel = cancelMoveMission;
  state.onAttackMissionConfirm = () => {
    void commitAttackMission();
  };
  state.onAttackMissionCancel = cancelAttackMission;
  state.onTradeMissionCommit = commitTradeMission;
  state.onTradeMissionCancel = cancelTradeMission;
  state.onMoveMissionOpenFleet = (ship, missionId = null) => {
    if (ship) {
      setHighlightedFleetShip({
        ...ship,
        moveMissionId: missionId ?? ship.moveMissionId,
      });
    }
    setShipPanelView('fleet');
    setShipPanelShipId('');
    openRightPanelWithHistory('ship-designer');
    state.invalidateRender();
  };
  state.onTradeRouteOpenFleet = (ship, routeId = null) => {
    if (ship) {
      setHighlightedFleetShip({
        ...ship,
        position: 'Trading',
        tradeRouteId: routeId ?? ship.tradeRouteId,
      });
    }
    setShipPanelView('fleet');
    setShipPanelShipId('');
    openRightPanelWithHistory('ship-designer');
    writeDeepLink({ replace: true });
    renderRightSideMenu({ force: true });
    state.invalidateRender();
  };
  state.onPiracyZoneOpenFleet = (ship) => {
    if (ship) {
      setHighlightedFleetShip({
        ...ship,
        position: 'Piracy',
      });
    }
    setShipPanelView('fleet');
    setShipPanelShipId('');
    openRightPanelWithHistory('ship-designer');
    writeDeepLink({ replace: true });
    renderRightSideMenu({ force: true });
    state.invalidateRender();
  };
  state.handleTradeMissionPointerDown = (event) => {
    const tradeMission = state.tradeMission;
    if (!tradeMission?.active) {
      return false;
    }

    const rect = canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    const endpoints = [
      {
        key: 'origin',
        point: tradeMission.originMarkerWorld ?? state.starsById.get(tradeMission.originStarId),
      },
      {
        key: 'destination',
        point: tradeMission.destinationMarkerWorld ?? state.starsById.get(tradeMission.destinationStarId),
      },
    ];

    let closestEndpoint = null;
    let closestDistanceSq = Infinity;
    for (const endpoint of endpoints) {
      if (!endpoint.point) {
        continue;
      }

      const endpointScreen = {
        x: (endpoint.point.x - state.camera.x) * state.camera.zoom + rect.width / 2,
        y: (endpoint.point.y - state.camera.y) * state.camera.zoom + rect.height / 2,
      };
      const dx = endpointScreen.x - screenX;
      const dy = endpointScreen.y - screenY;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq < closestDistanceSq) {
        closestDistanceSq = distanceSq;
        closestEndpoint = endpoint.key;
      }
    }

    if (!closestEndpoint || closestDistanceSq > 26 * 26) {
      return false;
    }

    state.tradeMission = {
      ...tradeMission,
      draggingEndpoint: closestEndpoint,
      message: '',
    };
    state.suppressCanvasClick = true;
    canvas.setPointerCapture(event.pointerId);
    state.invalidateRender();
    return true;
  };

  state.handleTradeMissionPointerMove = (event) => {
    if (!state.tradeMission?.active || !state.tradeMission.draggingEndpoint) {
      return false;
    }

    const rect = canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    const worldPoint = screenToWorld(state.camera, { width: rect.width, height: rect.height }, screenX, screenY);
    const markerKey = state.tradeMission.draggingEndpoint === 'origin'
      ? 'originMarkerWorld'
      : 'destinationMarkerWorld';

    state.tradeMission = {
      ...state.tradeMission,
      [markerKey]: worldPoint,
      message: '',
    };
    state.suppressCanvasClick = true;
    state.invalidateRender();
    return true;
  };

  state.handleTradeMissionPointerUp = (event) => {
    if (!state.tradeMission?.active || !state.tradeMission.draggingEndpoint) {
      return false;
    }

    const endpoint = state.tradeMission.draggingEndpoint;
    const rect = canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    const worldPoint = screenToWorld(state.camera, { width: rect.width, height: rect.height }, screenX, screenY);
    updateTradeMissionEndpointFromWorld(endpoint, worldPoint);
    state.suppressCanvasClick = true;
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }
    return true;
  };

  state.handleTradeMissionPointerCancel = () => {
    if (!state.tradeMission?.active || !state.tradeMission.draggingEndpoint) {
      return false;
    }

    const originStar = state.starsById.get(state.tradeMission.originStarId);
    const destinationStar = state.starsById.get(state.tradeMission.destinationStarId);
    state.tradeMission = applyTradeRoutePlanToMission(
      state.tradeMission,
      createTradeRoutePlan(originStar, destinationStar)
    );
    state.suppressCanvasClick = true;
    state.invalidateRender();
    return true;
  };

  state.handleMoveMissionPointerDown = (event) => {
    const moveMission = state.moveMission;
    if (!moveMission?.active || moveMission.status === 'moving') {
      return false;
    }

    const rect = canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    const markerWorld = moveMission.markerWorld;
    const markerScreen = {
      x: (markerWorld.x - state.camera.x) * state.camera.zoom + rect.width / 2,
      y: (markerWorld.y - state.camera.y) * state.camera.zoom + rect.height / 2,
    };
    const dx = markerScreen.x - screenX;
    const dy = markerScreen.y - screenY;

    if (dx * dx + dy * dy > 24 * 24) {
      return false;
    }

    state.moveMission = {
      ...moveMission,
      dragging: true,
      status: 'placing',
      routeStarIds: [],
      routeRevealStartedAt: null,
      travelSummary: null,
      showDestinationDialog: false,
      destinationStarId: null,
    };
    state.suppressCanvasClick = true;
    canvas.setPointerCapture(event.pointerId);
    state.invalidateRender();
    return true;
  };

  state.handleMoveMissionPointerMove = (event) => {
    if (!state.moveMission?.dragging) {
      return false;
    }

    const rect = canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    const worldPoint = screenToWorld(state.camera, { width: rect.width, height: rect.height }, screenX, screenY);
    state.moveMission = {
      ...state.moveMission,
      markerWorld: worldPoint,
      routeStarIds: [],
      routeRevealStartedAt: null,
      travelSummary: null,
      destinationStarId: null,
      showDestinationDialog: false,
    };
    state.suppressCanvasClick = true;
    state.invalidateRender();
    return true;
  };

  state.handleMoveMissionPointerUp = (event) => {
    if (!state.moveMission?.dragging) {
      return false;
    }

    const rect = canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    const worldPoint = screenToWorld(state.camera, { width: rect.width, height: rect.height }, screenX, screenY);
    setMoveMissionDestinationFromWorld(worldPoint);
    state.suppressCanvasClick = true;
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }
    return true;
  };

  state.handleMoveMissionPointerCancel = () => {
    if (!state.moveMission?.dragging) {
      return false;
    }

    state.moveMission = {
      ...state.moveMission,
      dragging: false,
    };
    state.suppressCanvasClick = true;
    state.invalidateRender();
    return true;
  };

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
    renderRightSideMenu();
    recordPerformance(performance.now() - renderStart);
  });
  state.invalidateRender = () => loop.invalidate();

  return {
    start() {
      renderTopResourceBar();
      applyDeepLink();
      renderer.resize();
      if (state.showPerformanceGraph) {
        startPerformanceGraphLoop();
      }
      loop.start();
      loop.invalidate();
      window.addEventListener('resize', renderer.resize);
      window.addEventListener('hashchange', applyDeepLink);
      window.addEventListener('popstate', applyDeepLink);

      void (async () => {
        try {
          await sync.start();
          await ensureCurrentPlayerStateLoaded();
          startLocalResourceTicker();
          renderTopResourceBar();
          applyDeepLink();
          renderer.resize();
          loop.invalidate();
        } catch (error) {
          console.warn('Failed to finish async startup.', error);
        }
      })();
    },
  };
}



