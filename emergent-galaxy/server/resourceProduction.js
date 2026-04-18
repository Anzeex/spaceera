import { generateGalaxy } from '../src/galaxy/galaxyGenerator.js';
import {
  applyStoredState,
  captureBaselineState,
  serializeGameState,
} from '../src/core/galaxyState.js';
import {
  applyCapitalBaseProduction,
  applyResourceMultiplier,
  getCapitalBonusMultiplier,
} from '../src/core/capitalBonuses.js';
import {
  POPULATION_CREDITS_PER_PERSON,
  RESOURCE_PRODUCTION_PER_INFRASTRUCTURE_LEVEL,
  STARTING_PLAYER_RESOURCES,
} from '../src/core/economyConfig.js';
import { calculateAndApplyTerritoryEnergyState, getEffectiveInfrastructureLevel } from '../src/core/energy.js';
import {
  cloneItemInventory,
  cloneSystemItemInventories,
  createEmptyItemInventory,
} from '../src/core/itemDefinitions.js';
import {
  applyRuntimeStateToPlayerRecord,
  createPlayerRecord,
  normalizePlayerRecord,
  playerRecordToRuntimeState,
  syncPlayerTerritoryRecord,
} from '../src/core/playerRecord.js';
import { ensureStarMinimumPopulation, settleStarPopulation } from '../src/core/population.js';
import { calculateSystemPoolCapacityFromProduction, getWeightedResourceAmount, RESOURCE_STORAGE_WEIGHTS } from '../src/core/systemPools.js';

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const RESOURCE_UPDATE_PRESETS = {
  hour: {
    key: 'hour',
    label: 'hour',
    ms: HOUR_MS,
  },
  minute: {
    key: 'minute',
    label: 'minute',
    ms: MINUTE_MS,
  },
};
const ACTIVE_RESOURCE_UPDATE_PRESET = RESOURCE_UPDATE_PRESETS.hour;
// Switch back to minute updates by changing the line above to:
// const ACTIVE_RESOURCE_UPDATE_PRESET = RESOURCE_UPDATE_PRESETS.minute;

const RESOURCE_KEYS = [
  'Credits',
  'Metals',
  'Gas',
  'Food',
  'Rare Earth Elements',
  'Uranium',
  'Water',
];
const RESOURCE_INFRASTRUCTURE_MAP = {
  Food: 'farming',
  Water: 'waterExtraction',
  Gas: 'gasExtraction',
};
const baselineGalaxyCache = new Map();
const baselineStateCache = new Map();

function createEmptyResources() {
  return Object.fromEntries(RESOURCE_KEYS.map((resource) => [resource, 0]));
}

function getPopulationCreditsForPlanet(planet) {
  return Math.floor(Math.max(0, planet.population ?? 0) * POPULATION_CREDITS_PER_PERSON);
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

function getPoolResources(poolEntry) {
  if (!poolEntry) {
    return createEmptyResources();
  }

  if (poolEntry.resources) {
    return cloneResources(poolEntry.resources);
  }

  return cloneResources(poolEntry);
}

function getPoolUsedCapacity(resources) {
  return getWeightedResourceAmount(resources);
}

function normalizeSystemPools(existingPools, ownedStarIds) {
  const normalizedPools = {};

  for (const starId of ownedStarIds) {
    normalizedPools[starId] = {
      resources: getPoolResources(existingPools?.[starId]),
    };
  }

  return normalizedPools;
}

function normalizeSystemItemInventories(existingItemInventories, ownedStarIds) {
  return cloneSystemItemInventories(existingItemInventories, ownedStarIds);
}

function createServerStateContainer(seed, storedState) {
  let baselineGalaxy = baselineGalaxyCache.get(seed);
  if (!baselineGalaxy) {
    baselineGalaxy = generateGalaxy({ seed });
    baselineGalaxyCache.set(seed, baselineGalaxy);
  }

  const galaxy = structuredClone(baselineGalaxy);
  const state = {
    galaxy,
    territories: new Map(),
    currentTerritoryId: null,
  };

  applyStoredState(state, storedState);
  return state;
}

function getBaselineState(seed) {
  let baselineState = baselineStateCache.get(seed);
  if (!baselineState) {
    let baselineGalaxy = baselineGalaxyCache.get(seed);
    if (!baselineGalaxy) {
      baselineGalaxy = generateGalaxy({ seed });
      baselineGalaxyCache.set(seed, baselineGalaxy);
    }

    baselineState = captureBaselineState(baselineGalaxy);
    baselineStateCache.set(seed, baselineState);
  }

  return baselineState;
}

function getCompletedIntervalCount(lastResourceUpdateMs, nowMs) {
  return Math.max(
    0,
    Math.floor(nowMs / ACTIVE_RESOURCE_UPDATE_PRESET.ms) -
      Math.floor(lastResourceUpdateMs / ACTIVE_RESOURCE_UPDATE_PRESET.ms)
  );
}

function getLatestCompletedIntervalStart(nowMs) {
  return Math.floor(nowMs / ACTIVE_RESOURCE_UPDATE_PRESET.ms) * ACTIVE_RESOURCE_UPDATE_PRESET.ms;
}

function getProductionPerIntervalForPlanet(planet) {
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

    const infrastructureLevel = getEffectiveInfrastructureLevel(planet, infrastructureKey);
    if (infrastructureLevel <= 0 || resource.abundance <= 0) {
      continue;
    }

    production[resource.name] +=
      infrastructureLevel * (RESOURCE_PRODUCTION_PER_INFRASTRUCTURE_LEVEL[resource.name] ?? 1);
  }

  return production;
}

function getProductionPerIntervalForStar(star, capitalStarId = null) {
  const production = createEmptyResources();

  for (const planet of star.planets ?? []) {
    sumResources(production, getProductionPerIntervalForPlanet(planet));
  }

  const capitalAdjustedProduction = applyCapitalBaseProduction(
    production,
    star.id,
    capitalStarId,
    RESOURCE_KEYS
  );

  return applyResourceMultiplier(
    capitalAdjustedProduction,
    getCapitalBonusMultiplier(star.id, capitalStarId)
  );
}

function getDirectPopulationCreditsForStar(star) {
  return (star.planets ?? []).reduce((sum, planet) => sum + getPopulationCreditsForPlanet(planet), 0);
}

function getDirectPopulationCreditsForOwnedStars(ownedStars, multiplier = 1) {
  return ownedStars.reduce(
    (sum, star) => sum + getDirectPopulationCreditsForStar(star) * multiplier,
    0
  );
}

function sumResources(target, source, multiplier = 1) {
  for (const key of RESOURCE_KEYS) {
    target[key] = (target[key] ?? 0) + (source[key] ?? 0) * multiplier;
  }

  return target;
}

function addResourcesToSystemPool(poolEntry, production, capacity) {
  const nextPoolResources = cloneResources(poolEntry.resources);
  const acceptedProduction = createEmptyResources();
  let usedCapacity = getPoolUsedCapacity(nextPoolResources);

  for (const resource of RESOURCE_KEYS) {
    const amount = production[resource] ?? 0;
    if (amount <= 0) {
      continue;
    }

    const weight = RESOURCE_STORAGE_WEIGHTS[resource] ?? 1;
    if (weight <= 0) {
      nextPoolResources[resource] += amount;
      acceptedProduction[resource] += amount;
      continue;
    }

    const remainingCapacity = Math.max(0, capacity - usedCapacity);
    if (remainingCapacity < weight) {
      continue;
    }

    const acceptedAmount = Math.min(amount, Math.floor(remainingCapacity / weight));
    if (acceptedAmount <= 0) {
      continue;
    }

    nextPoolResources[resource] += acceptedAmount;
    acceptedProduction[resource] += acceptedAmount;
    usedCapacity += acceptedAmount * weight;
  }

  poolEntry.resources = nextPoolResources;
  return acceptedProduction;
}

function projectResourcesIntoSystemPool(poolEntry, production, capacity) {
  return addResourcesToSystemPool(
    { resources: cloneResources(poolEntry.resources) },
    production,
    capacity
  );
}

function calculateSystemPoolCapacitiesForStars(ownedStars, capitalStarId = null) {
  return Object.fromEntries(
    ownedStars.map((star) => [
      star.id,
      calculateSystemPoolCapacityFromProduction(getProductionPerIntervalForStar(star, capitalStarId)),
    ])
  );
}

function getOwnedStarsForPlayer(seed, storedState, playerId) {
  const hydratedState = createServerStateContainer(seed, storedState);
  const territory = hydratedState.territories.get(playerId);

  if (!territory) {
    return { territory: null, ownedStars: [] };
  }

  const ownedStarIds = territory.stars;
  return {
    territory,
    ownedStars: hydratedState.galaxy.stars.filter((star) => ownedStarIds.has(star.id)),
  };
}

export function advanceGalaxyPopulation({ seed, storedState, playerId, lastResourceUpdate, nowMs }) {
  const lastResourceUpdateMs = Date.parse(lastResourceUpdate);
  const safeLastResourceUpdateMs = Number.isFinite(lastResourceUpdateMs)
    ? lastResourceUpdateMs
    : nowMs;
  const completedIntervals = getCompletedIntervalCount(safeLastResourceUpdateMs, nowMs);

  const hydratedState = createServerStateContainer(seed, storedState);
  const territory = hydratedState.territories.get(playerId);
  if (!territory) {
    return storedState;
  }

  const ownedStars = hydratedState.galaxy.stars.filter((star) => territory.stars.has(star.id));
  calculateAndApplyTerritoryEnergyState({
    ownedStars,
    capitalStarId: territory.capitalStarId ?? null,
  });
  let changed = false;
  if (completedIntervals > 0) {
    for (const star of ownedStars) {
      changed =
        settleStarPopulation(
          star,
          completedIntervals,
          getCapitalBonusMultiplier(star.id, territory.capitalStarId ?? null)
        ) || changed;
    }
  }

  const capitalStar = territory.capitalStarId
    ? hydratedState.galaxy.stars.find((star) => star.id === territory.capitalStarId)
    : null;
  if (capitalStar) {
    changed = ensureStarMinimumPopulation(capitalStar) || changed;
  }

  if (!changed) {
    return storedState;
  }

  return serializeGameState(hydratedState, getBaselineState(seed));
}

function settleSystemPoolsForElapsedIntervals(
  systemPools,
  ownedStars,
  completedIntervals,
  capitalStarId = null,
  systemPoolCapacities = {}
) {
  for (let intervalIndex = 0; intervalIndex < completedIntervals; intervalIndex++) {
    for (const star of ownedStars) {
      const poolEntry = systemPools[star.id] ?? createEmptySystemPool();
      systemPools[star.id] = poolEntry;
      addResourcesToSystemPool(
        poolEntry,
        getProductionPerIntervalForStar(star, capitalStarId),
        systemPoolCapacities[star.id] ?? 0
      );
    }
  }
}

function calculatePeriodProductionForPlayer(
  ownedStars,
  systemPools,
  capitalStarId = null,
  systemPoolCapacities = {}
) {
  const periodProduction = createEmptyResources();

  for (const star of ownedStars) {
    const poolEntry = systemPools[star.id] ?? createEmptySystemPool();
    sumResources(
      periodProduction,
      projectResourcesIntoSystemPool(
        poolEntry,
        getProductionPerIntervalForStar(star, capitalStarId),
        systemPoolCapacities[star.id] ?? 0
      )
    );
  }

  periodProduction.Credits += getDirectPopulationCreditsForOwnedStars(ownedStars);

  return periodProduction;
}

function collectSystemPoolResources(playerState, starId) {
  const poolEntry = playerState.systemPools?.[starId];
  if (!poolEntry) {
    return playerState;
  }

  const nextResources = cloneResources(playerState.resources);
  sumResources(nextResources, poolEntry.resources);

  return {
    ...playerState,
    resources: nextResources,
    systemPools: {
      ...playerState.systemPools,
      [starId]: createEmptySystemPool(),
    },
  };
}

export function createInitialPlayerState(playerId, nowMs) {
  return createPlayerRecord(playerId, nowMs, {
    economy: {
      resources: cloneResources(STARTING_PLAYER_RESOURCES),
      hourlyProduction: createEmptyResources(),
      completedHours: 0,
      resourceUpdateInterval: ACTIVE_RESOURCE_UPDATE_PRESET.key,
      lastResourceUpdate: new Date(getLatestCompletedIntervalStart(nowMs)).toISOString(),
    },
    inventory: {
      items: createEmptyItemInventory(),
    },
    logistics: {
      systemPools: {},
      systemItemInventories: {},
      systemPoolCapacities: {},
      productionQueue: [],
    },
    status: {
      energyOutput: 0,
      energyConsumption: 0,
      activeEnergyConsumption: 0,
      energyDeficit: 0,
      inactiveInfrastructureCount: 0,
    },
  });
}

export function updatePlayerResources({ seed, storedState, playerId, existingPlayerState, nowMs }) {
  const basePlayerRecord = normalizePlayerRecord(
    existingPlayerState ?? createInitialPlayerState(playerId, nowMs),
    playerId,
    nowMs
  );
  const basePlayerState = playerRecordToRuntimeState(basePlayerRecord);
  const lastResourceUpdateMs = Date.parse(basePlayerState.lastResourceUpdate);
  const safeLastResourceUpdateMs = Number.isFinite(lastResourceUpdateMs)
    ? lastResourceUpdateMs
    : nowMs;
  const completedHours = getCompletedIntervalCount(safeLastResourceUpdateMs, nowMs);
  const { territory, ownedStars } = getOwnedStarsForPlayer(seed, storedState, playerId);
  const energyState = calculateAndApplyTerritoryEnergyState({
    ownedStars,
    capitalStarId: territory?.capitalStarId ?? null,
  });
  const systemPools = normalizeSystemPools(
    basePlayerState.systemPools,
    new Set(ownedStars.map((star) => star.id))
  );
  const systemItemInventories = normalizeSystemItemInventories(
    basePlayerState.systemItemInventories,
    new Set(ownedStars.map((star) => star.id))
  );
  const systemPoolCapacities = calculateSystemPoolCapacitiesForStars(
    ownedStars,
    territory?.capitalStarId ?? null
  );
  settleSystemPoolsForElapsedIntervals(
    systemPools,
    ownedStars,
    completedHours,
    territory?.capitalStarId ?? null,
    systemPoolCapacities
  );
  const periodProduction = calculatePeriodProductionForPlayer(
    ownedStars,
    systemPools,
    territory?.capitalStarId ?? null,
    systemPoolCapacities
  );
  const nextResources = {
    ...cloneResources(basePlayerState.resources),
  };
  nextResources.Credits += getDirectPopulationCreditsForOwnedStars(ownedStars, completedHours);

  const nextRuntimeState = {
    ...basePlayerState,
    playerId,
    items: cloneItemInventory(basePlayerState.items),
    resources: nextResources,
    hourlyProduction: periodProduction,
    systemPools,
    systemItemInventories,
    systemPoolCapacities,
    energyOutput: energyState.output,
    energyConsumption: energyState.consumption,
    activeEnergyConsumption: energyState.activeConsumption,
    energyDeficit: energyState.deficit,
    inactiveInfrastructureCount: energyState.inactiveInfrastructureCount,
    completedHours,
    resourceUpdateInterval: ACTIVE_RESOURCE_UPDATE_PRESET.key,
    lastResourceUpdate: new Date(
      completedHours > 0 ? getLatestCompletedIntervalStart(nowMs) : safeLastResourceUpdateMs
    ).toISOString(),
  };

  return syncPlayerTerritoryRecord(
    applyRuntimeStateToPlayerRecord(basePlayerRecord, nextRuntimeState, nowMs),
    territory
  );
}

export function collectPlayerSystemPool({ seed, storedState, playerId, existingPlayerState, starId, nowMs }) {
  const updatedPlayerRecord = updatePlayerResources({
    seed,
    storedState,
    playerId,
    existingPlayerState,
    nowMs,
  });
  const updatedPlayerState = playerRecordToRuntimeState(updatedPlayerRecord);

  const { ownedStars } = getOwnedStarsForPlayer(seed, storedState, playerId);
  if (!ownedStars.some((star) => star.id === starId)) {
    return updatedPlayerRecord;
  }

  const collectedRuntimeState = collectSystemPoolResources(updatedPlayerState, starId);
  return applyRuntimeStateToPlayerRecord(updatedPlayerRecord, collectedRuntimeState, nowMs);
}
