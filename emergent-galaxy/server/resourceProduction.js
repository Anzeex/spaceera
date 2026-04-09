import { generateGalaxy } from '../src/galaxy/galaxyGenerator.js';
import {
  applyStoredState,
  captureBaselineState,
  serializeGameState,
} from '../src/core/galaxyState.js';
import { settleStarPopulation } from '../src/core/population.js';

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
const ACTIVE_RESOURCE_UPDATE_PRESET = RESOURCE_UPDATE_PRESETS.minute;
// Switch back to hourly updates by changing the line above to:
// const ACTIVE_RESOURCE_UPDATE_PRESET = RESOURCE_UPDATE_PRESETS.hour;

const RESOURCE_KEYS = [
  'Credits',
  'Metals',
  'Gas',
  'Food',
  'Rare Earth Elements',
  'Uranium',
  'Water',
];
const SYSTEM_POOL_CAPACITY = 500;
const POPULATION_CREDITS_PER_PERSON = 0.001;
const RESOURCE_STORAGE_WEIGHTS = {
  Credits: 0,
  Metals: 1,
  Gas: 1,
  Food: 1,
  Water: 1,
  'Rare Earth Elements': 2,
  Uranium: 3,
};

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
  return RESOURCE_KEYS.reduce(
    (sum, resource) => sum + (resources[resource] ?? 0) * (RESOURCE_STORAGE_WEIGHTS[resource] ?? 1),
    0
  );
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

    const infrastructureLevel = planet.infrastructure?.[infrastructureKey] ?? 0;
    if (infrastructureLevel <= 0 || resource.abundance <= 0) {
      continue;
    }

    production[resource.name] += infrastructureLevel;
  }

  return production;
}

function getProductionPerIntervalForStar(star) {
  const production = createEmptyResources();

  for (const planet of star.planets ?? []) {
    sumResources(production, getProductionPerIntervalForPlanet(planet));
  }

  return production;
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

function addResourcesToSystemPool(poolEntry, production) {
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

    const remainingCapacity = Math.max(0, SYSTEM_POOL_CAPACITY - usedCapacity);
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

function projectResourcesIntoSystemPool(poolEntry, production) {
  return addResourcesToSystemPool(
    { resources: cloneResources(poolEntry.resources) },
    production
  );
}

function getOwnedStarsForPlayer(seed, storedState, playerId) {
  const hydratedState = createServerStateContainer(seed, storedState);
  const territory = hydratedState.territories.get(playerId);

  if (!territory) {
    return [];
  }

  const ownedStarIds = territory.stars;
  return hydratedState.galaxy.stars.filter((star) => ownedStarIds.has(star.id));
}

export function advanceGalaxyPopulation({ seed, storedState, playerId, lastResourceUpdate, nowMs }) {
  const lastResourceUpdateMs = Date.parse(lastResourceUpdate);
  const safeLastResourceUpdateMs = Number.isFinite(lastResourceUpdateMs)
    ? lastResourceUpdateMs
    : nowMs;
  const completedIntervals = getCompletedIntervalCount(safeLastResourceUpdateMs, nowMs);

  if (completedIntervals <= 0) {
    return storedState;
  }

  const hydratedState = createServerStateContainer(seed, storedState);
  const territory = hydratedState.territories.get(playerId);
  if (!territory) {
    return storedState;
  }

  const ownedStars = hydratedState.galaxy.stars.filter((star) => territory.stars.has(star.id));
  let changed = false;
  for (const star of ownedStars) {
    changed = settleStarPopulation(star, completedIntervals) || changed;
  }

  if (!changed) {
    return storedState;
  }

  return serializeGameState(hydratedState, getBaselineState(seed));
}

function settleSystemPoolsForElapsedIntervals(systemPools, ownedStars, completedIntervals) {
  for (let intervalIndex = 0; intervalIndex < completedIntervals; intervalIndex++) {
    for (const star of ownedStars) {
      const poolEntry = systemPools[star.id] ?? createEmptySystemPool();
      systemPools[star.id] = poolEntry;
      addResourcesToSystemPool(poolEntry, getProductionPerIntervalForStar(star));
    }
  }
}

function calculatePeriodProductionForPlayer(ownedStars, systemPools) {
  const periodProduction = createEmptyResources();

  for (const star of ownedStars) {
    const poolEntry = systemPools[star.id] ?? createEmptySystemPool();
    sumResources(periodProduction, projectResourcesIntoSystemPool(poolEntry, getProductionPerIntervalForStar(star)));
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
  return {
    playerId,
    resources: createEmptyResources(),
    hourlyProduction: createEmptyResources(),
    systemPools: {},
    systemPoolCapacity: SYSTEM_POOL_CAPACITY,
    completedHours: 0,
    resourceUpdateInterval: ACTIVE_RESOURCE_UPDATE_PRESET.key,
    lastResourceUpdate: new Date(getLatestCompletedIntervalStart(nowMs)).toISOString(),
  };
}

export function updatePlayerResources({ seed, storedState, playerId, existingPlayerState, nowMs }) {
  const basePlayerState = existingPlayerState ?? createInitialPlayerState(playerId, nowMs);
  const lastResourceUpdateMs = Date.parse(basePlayerState.lastResourceUpdate);
  const safeLastResourceUpdateMs = Number.isFinite(lastResourceUpdateMs)
    ? lastResourceUpdateMs
    : nowMs;
  const completedHours = getCompletedIntervalCount(safeLastResourceUpdateMs, nowMs);
  const ownedStars = getOwnedStarsForPlayer(seed, storedState, playerId);
  const systemPools = normalizeSystemPools(
    basePlayerState.systemPools,
    new Set(ownedStars.map((star) => star.id))
  );
  settleSystemPoolsForElapsedIntervals(systemPools, ownedStars, completedHours);
  const periodProduction = calculatePeriodProductionForPlayer(ownedStars, systemPools);
  const nextResources = {
    ...cloneResources(basePlayerState.resources),
  };
  nextResources.Credits += getDirectPopulationCreditsForOwnedStars(ownedStars, completedHours);

  return {
    playerId,
    resources: nextResources,
    hourlyProduction: periodProduction,
    systemPools,
    systemPoolCapacity: SYSTEM_POOL_CAPACITY,
    completedHours,
    resourceUpdateInterval: ACTIVE_RESOURCE_UPDATE_PRESET.key,
    lastResourceUpdate: new Date(
      completedHours > 0 ? getLatestCompletedIntervalStart(nowMs) : safeLastResourceUpdateMs
    ).toISOString(),
  };
}

export function collectPlayerSystemPool({ seed, storedState, playerId, existingPlayerState, starId, nowMs }) {
  const updatedPlayerState = updatePlayerResources({
    seed,
    storedState,
    playerId,
    existingPlayerState,
    nowMs,
  });

  const ownedStars = getOwnedStarsForPlayer(seed, storedState, playerId);
  if (!ownedStars.some((star) => star.id === starId)) {
    return updatedPlayerState;
  }

  return collectSystemPoolResources(updatedPlayerState, starId);
}
