import { generateGalaxy } from '../src/galaxy/galaxyGenerator.js';
import { applyStoredState } from '../src/core/galaxyState.js';

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

function createEmptyResources() {
  return Object.fromEntries(RESOURCE_KEYS.map((resource) => [resource, 0]));
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

function getCompletedHourCount(lastResourceUpdateMs, nowMs) {
  return Math.max(
    0,
    Math.floor(nowMs / HOUR_MS) - Math.floor(lastResourceUpdateMs / HOUR_MS)
  );
}

function getLatestCompletedHourStart(nowMs) {
  return Math.floor(nowMs / HOUR_MS) * HOUR_MS;
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

function getProductionPerHourForPlanet(planet) {
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

    const hourlyOutput = Math.max(1, Math.round(resource.abundance / 20)) * infrastructureLevel;
    production[resource.name] += hourlyOutput;
  }

  return production;
}

function sumResources(target, source, multiplier = 1) {
  for (const key of RESOURCE_KEYS) {
    target[key] = (target[key] ?? 0) + (source[key] ?? 0) * multiplier;
  }

  return target;
}

function scaleResources(source, factor) {
  const scaled = createEmptyResources();

  for (const key of RESOURCE_KEYS) {
    scaled[key] = (source[key] ?? 0) * factor;
  }

  return scaled;
}

function calculateHourlyProductionForPlayer(seed, storedState, playerId) {
  const hydratedState = createServerStateContainer(seed, storedState);
  const territory = hydratedState.territories.get(playerId);

  if (!territory) {
    return createEmptyResources();
  }

  const ownedStarIds = territory.stars;
  const hourlyProduction = createEmptyResources();

  for (const star of hydratedState.galaxy.stars) {
    if (!ownedStarIds.has(star.id)) {
      continue;
    }

    for (const planet of star.planets) {
      sumResources(hourlyProduction, getProductionPerHourForPlanet(planet));
    }
  }

  return hourlyProduction;
}

export function createInitialPlayerState(playerId, nowMs) {
  return {
    playerId,
    resources: createEmptyResources(),
    hourlyProduction: createEmptyResources(),
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
  const hourlyProduction = calculateHourlyProductionForPlayer(seed, storedState, playerId);
  const productionPerInterval = scaleResources(
    hourlyProduction,
    ACTIVE_RESOURCE_UPDATE_PRESET.ms / HOUR_MS
  );
  const nextResources = {
    ...createEmptyResources(),
    ...(basePlayerState.resources ?? {}),
  };

  if (completedHours > 0) {
    sumResources(nextResources, productionPerInterval, completedHours);
  }

  return {
    playerId,
    resources: nextResources,
    hourlyProduction,
    completedHours,
    resourceUpdateInterval: ACTIVE_RESOURCE_UPDATE_PRESET.key,
    lastResourceUpdate: new Date(
      completedHours > 0 ? getLatestCompletedIntervalStart(nowMs) : safeLastResourceUpdateMs
    ).toISOString(),
  };
}
