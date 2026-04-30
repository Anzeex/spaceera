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
import { RESOURCE_STANDARD_PRICES } from './economyConfig.js';
import {
  getItemDefinition,
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
  ensureStarMinimumPopulation,
  settleStarPopulation,
} from './population.js';
import { getWeightedResourceAmount } from './systemPools.js';
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
  { key: 'Metals', icon: 'M', color: '#a8b5c7' },
  { key: 'Food', icon: 'F', color: '#86efac' },
  { key: 'Rare Earth Elements', icon: 'R', color: '#c4b5fd' },
  { key: 'Uranium', icon: 'U', color: '#bef264' },
];
const RESOURCE_KEYS = RESOURCE_DISPLAY.map((resource) => resource.key);
const RESOURCE_UPDATE_INTERVALS_MS = {
  hour: 60 * 60 * 1000,
  minute: 60 * 1000,
};
const TOP_BANNER_URL = '/top-banner.png';

export function createGame(container, galaxyOptions = {}) {
  const persistentSeed = galaxyOptions.seed ?? MULTIPLAYER_GALAXY_SEED;
  const resolvedGalaxyOptions = {
    ...galaxyOptions,
    seed: persistentSeed,
  };

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
    icon.textContent = resource.icon;
    icon.style.display = 'inline-flex';
    icon.style.alignItems = 'center';
    icon.style.justifyContent = 'center';
    icon.style.width = '16px';
    icon.style.height = '16px';
    icon.style.borderRadius = '999px';
    icon.style.background = 'rgba(255,255,255,0.08)';
    icon.style.color = resource.color;
    icon.style.fontSize = '10px';
    icon.style.fontWeight = '700';
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
    `linear-gradient(180deg, rgba(8, 13, 27, 0.78), rgba(5, 8, 22, 0.72)), url(${TOP_BANNER_URL})`;
  profilePanel.style.backgroundSize = 'cover';
  profilePanel.style.backgroundPosition = 'center';
  profilePanel.style.backgroundRepeat = 'no-repeat';
  profilePanel.style.borderLeft = '1px solid rgba(148,163,184,0.18)';
  profilePanel.style.borderBottom = '0';
  profilePanel.style.borderRadius = '0';
  profilePanel.style.boxShadow = '-18px 0 42px rgba(0,0,0,0.24)';
  profilePanel.style.color = '#e8efff';
  profilePanel.style.fontSize = '12px';
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
  profileAvatar.style.width = '36px';
  profileAvatar.style.height = '36px';
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
  profileLevelRing.style.width = '42px';
  profileLevelRing.style.height = '42px';
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
  profileLevelNode.style.fontSize = '14px';
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
  profileCreditsNode.style.fontSize = '12px';
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
  profileGemsNode.style.fontSize = '10px';
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
    resourceIconNode.textContent = resource.icon;
    resourceIconNode.style.color = resource.color;
    resourceIconNode.style.fontSize = '10px';
    resourceIconNode.style.fontWeight = '800';
    resourceIconNode.style.lineHeight = '1';

    const resourceAmountNode = document.createElement('span');
    resourceAmountNode.textContent = '0';
    resourceAmountNode.style.color = '#e8efff';
    resourceAmountNode.style.fontVariantNumeric = 'tabular-nums';
    resourceAmountNode.style.fontSize = '10px';
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
  floatingEnergyBox.style.right = '14px';
  floatingEnergyBox.style.transform = 'translateY(-50%)';
  floatingEnergyBox.style.zIndex = '34';
  floatingEnergyBox.style.display = 'flex';
  floatingEnergyBox.style.alignItems = 'center';
  floatingEnergyBox.style.gap = '6px';
  floatingEnergyBox.style.width = '46%';
  floatingEnergyBox.style.minWidth = 'unset';
  floatingEnergyBox.style.maxWidth = '190px';
  floatingEnergyBox.style.aspectRatio = '8 / 1';
  floatingEnergyBox.style.padding = '2px 8px';
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
  profileEnergyIconNode.style.fontSize = '10px';
  profileEnergyIconNode.style.fontWeight = '800';
  profileEnergyIconNode.style.lineHeight = '1';
  profileEnergyIconNode.style.flex = '0 0 auto';
  floatingEnergyBox.appendChild(profileEnergyIconNode);

  const profileEnergyUsageNode = document.createElement('div');
  profileEnergyUsageNode.textContent = '0';
  profileEnergyUsageNode.style.color = 'rgba(232,239,255,0.88)';
  profileEnergyUsageNode.style.fontVariantNumeric = 'tabular-nums';
  profileEnergyUsageNode.style.fontSize = '10px';
  profileEnergyUsageNode.style.fontWeight = '800';
  profileEnergyUsageNode.style.whiteSpace = 'nowrap';
  floatingEnergyBox.appendChild(profileEnergyUsageNode);

  const profileEnergyBarTrack = document.createElement('div');
  profileEnergyBarTrack.style.position = 'relative';
  profileEnergyBarTrack.style.flex = '1 1 auto';
  profileEnergyBarTrack.style.minWidth = '72px';
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
  profileEnergyMaxNode.style.fontSize = '9px';
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
  objectivesButton.style.fontSize = '15px';
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
  notificationButton.style.fontSize = '15px';
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
  panelNavBar.style.gap = '8px';
  panelNavBar.style.width = sidePanelWidth;
  panelNavBar.style.boxSizing = 'border-box';
  panelNavBar.style.padding = '12px 14px';
  panelNavBar.style.background = 'linear-gradient(180deg, rgba(8, 13, 27, 0.68), rgba(5, 8, 22, 0.68))';
  panelNavBar.style.borderLeft = '1px solid rgba(148,163,184,0.18)';
  panelNavBar.style.borderTop = '1px solid rgba(148,163,184,0.1)';
  panelNavBar.style.boxShadow = '-18px 0 42px rgba(0,0,0,0.24)';
  panelNavBar.style.backdropFilter = 'blur(16px)';
  container.appendChild(panelNavBar);

  function createProfilePanelButton(label, icon) {
    const button = document.createElement('button');
    button.title = label;
    button.setAttribute('aria-label', label);
    button.style.display = 'flex';
    button.style.flexDirection = 'column';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.gap = '5px';
    button.style.flex = '1 1 0';
    button.style.minWidth = '0';
    button.style.padding = '4px 0 2px';
    button.style.background = 'rgba(255,255,255,0.05)';
    button.style.color = '#e8efff';
    button.style.border = '1px solid rgba(148,163,184,0.16)';
    button.style.borderRadius = '14px';
    button.style.cursor = 'pointer';

    const iconNode = document.createElement('span');
    iconNode.textContent = icon;
    iconNode.style.fontSize = '16px';
    iconNode.style.fontWeight = '800';
    iconNode.style.lineHeight = '1';

    const labelNode = document.createElement('span');
    labelNode.textContent = label;
    labelNode.style.fontSize = '10px';
    labelNode.style.fontWeight = '700';
    labelNode.style.lineHeight = '1';
    labelNode.style.whiteSpace = 'nowrap';
    labelNode.style.opacity = '0.82';

    button.appendChild(iconNode);
    button.appendChild(labelNode);
    return button;
  }

  const inventoryButton = createProfilePanelButton('Inventory', '▦');
  panelNavBar.appendChild(inventoryButton);

  const productionButton = createProfilePanelButton('Production', '⚙');
  panelNavBar.appendChild(productionButton);

  const marketButton = createProfilePanelButton('Market', '$');
  panelNavBar.appendChild(marketButton);

  const allianceButton = createProfilePanelButton('Alliance', '◆');
  panelNavBar.appendChild(allianceButton);

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
  settingsPanel.style.minWidth = '150px';
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
    showResourceDebug: false,
    showPerformanceGraph: true,
    performanceMode: false,
    isCameraMoving: false,
    showPopulationTiming: false,
    playerState: null,
    cachedPlayerStates: new Map(),
    viewedProfileState: null,
    viewedProfileLoading: false,
    viewedProfileErrorMessage: '',
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
    getSerializablePlayerState: null,
    getSerializableGalaxyState: null,
    useReactSystemPanel: true,
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

  state.getSerializablePlayerState = () => {
    const playerId = state.currentPlayerId ?? state.currentTerritoryId;
    if (!playerId || !state.playerState) {
      return null;
    }

    if (state.playerState.playerId && state.playerState.playerId !== playerId) {
      return null;
    }

    const { playerName, ...playerState } = state.playerState;
    const territory = state.territories.get(playerId);
    const serializableResources = state.hasPendingInfrastructureChanges
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

  state.getSerializableGalaxyState = (serializableBaselineState) => {
    const nextState = serializeGameState(state, serializableBaselineState);
    if (!state.hasPendingInfrastructureChanges) {
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
        `${formatProductionRate(industryLevel)} PC/period` +
        (usedProduction > 0 ? ` | In use: ${formatProductionRate(usedProduction)} PC/period` : ''),
      entries: queue.map((entry, index) => {
        const allocation = productionAllocation.entries[index];
        const item = allocation?.item ?? getItemDefinition(entry.itemId);
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
      const ownedStars = territory
        ? Array.from(territory.stars ?? [])
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
        energyOutput: targetPlayerState?.energyOutput ?? 0,
        activeEnergyConsumption: targetPlayerState?.activeEnergyConsumption ?? 0,
        inactiveInfrastructureCount: targetPlayerState?.inactiveInfrastructureCount ?? 0,
      };
    }

  function getPlayerSummaryViewModel() {
      return getPlayerSummaryViewModelForPlayerState(state.playerState, state.currentPlayerId);
    }

    function renderRightSideMenu() {
      const selectedStar = state.starsById?.get(state.selection.selectedStarId) ?? null;
      const selectedTerritory = selectedStar
        ? findTerritoryByStarId(selectedStar.id)?.territory ?? null
        : null;
    const productionView = getProductionViewModel();

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
        onAddProduction: () => {
          void addSelectedItemToProductionQueue();
        },
        productionInfoText: state.playerState ? productionView.infoText : 'Log in to use production.',
        productionEntries: state.playerState ? productionView.entries : [],
        selectedStar,
        selectedTerritory,
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
          onSelectPlanet: () => {
            abandonPendingInfrastructureChanges();
          },
          onInspectTerritoryProfile: (territory) => {
            void openViewedProfile(territory);
          },
          onCloseSelectedSystem: () => {
            abandonPendingInfrastructureChanges();
            state.selection.selectedStarId = null;
            if (rightPanel.dataset.panel === 'system') {
              rightPanel.dataset.panel = 'inventory';
          }
          state.invalidateRender();
        },
        onClose: () => setRightPanelOpen(false),
      })
    );
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

    const previousPlayerState = state.playerState;
    if (state.hasPendingTerritoryChanges || state.hasPendingInfrastructureChanges) {
      await sync.pushState();
      state.hasPendingTerritoryChanges = false;
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

  function renderItemIcon(item, size = 24) {
    const icon = item?.icon ?? {};
    const color = icon.color ?? '#93a4bd';
    const background = icon.background ?? 'linear-gradient(135deg, #0b1220, #334155)';
    const symbol = icon.symbol ?? '?';

    return `
      <span
        title="${item?.name ?? 'Item'}"
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
      >${symbol}</span>
    `;
  }

  function renderItemNameWithIcon(item, iconSize = 24) {
    return `
      <span style="display:inline-flex;align-items:center;gap:8px;min-width:0;">
        ${renderItemIcon(item, iconSize)}
        <span title="${item.description}" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.name}</span>
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
          <strong style="font-variant-numeric:tabular-nums;">${formatWholeNumber(items[item.id])}</strong>
        </div>
      `)
      .join('');
  }

  function renderOwnedItemCount(itemId) {
    const ownedCount = state.playerState?.items?.[itemId] ?? 0;
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
          <strong>${formatWholeNumber(selectedItem.productionCost)} PC</strong>
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
            <span>${formatWholeNumber(item.productionCost)} PC</span>
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

  function getTotalIndustryInfrastructure() {
    return getOwnedStarsForCurrentTerritory().reduce((sum, star) => {
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

  function getMinimumCraftPeriods(productionCost) {
    return Math.max(
      1,
      Math.ceil(Math.max(1, Number(productionCost) || 1) * MINIMUM_ITEM_CRAFT_TIME_RATIO)
    );
  }

  function calculateProductionAllocation(queue, industryLevel) {
    let remainingProduction = Math.max(0, Number(industryLevel) || 0);
    const entries = queue.map((entry) => {
      const item = getItemDefinition(entry.itemId);
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

  function advanceProductionQueue(playerState, completedPeriods, industryLevel) {
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
    let changed = false;

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
        .filter((entry) => {
          if (entry.remainingProductionCost > 0) {
            return true;
          }

          items[entry.itemId] = (Number(items[entry.itemId]) || 0) + 1;
          changed = true;
          return false;
        });
    }

    return {
      changed,
      items,
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
      `${formatProductionRate(industryLevel)} PC/period` +
      (usedProduction > 0 ? ` | In use: ${formatProductionRate(usedProduction)} PC/period` : '');

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
        const item = allocation?.item ?? getItemDefinition(entry.itemId);
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
        return `
          <div style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.1);">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
              <span style="display:flex;align-items:center;gap:8px;min-width:0;">
                <span style="color:rgba(255,255,255,0.52);font-size:11px;width:14px;text-align:right;">${index + 1}.</span>
                ${item ? renderItemNameWithIcon(item, 22) : entry.itemId}
              </span>
              <strong style="color:${isCrafting ? '#93a4bd' : 'rgba(255,255,255,0.58)'};">${isCrafting ? estimatedPeriods : 'Waiting'}</strong>
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

  function setPanelButtonActive(button, isActive) {
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
      rightPanel.dataset.panel = panelName;
      setRightPanelOpen(true);
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
        case 'production':
          renderProductionPanel();
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
    setPanelButtonActive(marketButton, isOpen && rightPanel.dataset.panel === 'market');
    setPanelButtonActive(allianceButton, isOpen && rightPanel.dataset.panel === 'alliance');
    setPanelButtonActive(objectivesButton, isOpen && rightPanel.dataset.panel === 'objectives');
    renderRightSideMenu();
  }

  function toggleRightPanel(panelName) {
    const activePanel = rightPanel.dataset.panel ?? 'inventory';
    if (activePanel === 'system' && panelName !== 'system') {
      abandonPendingInfrastructureChanges();
    }
    const shouldOpen = rightPanel.dataset.open !== 'true' || activePanel !== panelName;
    rightPanel.dataset.panel = panelName;
    setRightPanelOpen(shouldOpen);
  }

  async function addSelectedItemToProductionQueue() {
    if (!state.playerState) {
      renderProductionPanel();
      return;
    }

    const item = getItemDefinition(selectedProductionItemId);
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
    const productionState = advanceProductionQueue(
      state.playerState,
      completedIntervals,
      getTotalIndustryInfrastructure()
    );

    state.playerState = {
      ...state.playerState,
      resources: nextResources,
      items: productionState.items,
      productionQueue: productionState.productionQueue,
      systemPools,
      systemPoolCapacities,
      hourlyProduction: calculateLocalPeriodProductionFromPools(systemPools, ownedStars),
      completedHours: (state.playerState.completedHours ?? 0) + completedIntervals,
      lastResourceUpdate: new Date(Math.floor(nowMs / intervalMs) * intervalMs).toISOString(),
    };

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
          if (state.selection.selectedStarId && state.selection.selectedStarId !== closest.id) {
            abandonPendingInfrastructureChanges();
          }
          state.selection.selectedStarId = closest.id;
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
    renderRightSideMenu();
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



