import {
  applyCapitalBaseProduction,
  applyResourceMultiplier,
  getCapitalBonusMultiplier,
} from './capitalBonuses.js';
import {
  POPULATION_CREDITS_PER_PERSON,
  RESOURCE_PRODUCTION_PER_INFRASTRUCTURE_LEVEL,
} from './economyConfig.js';
import { getEffectiveInfrastructureLevel } from './energy.js';
import { ensureStarMinimumPopulation, settleStarPopulation } from './population.js';
import {
  calculateSystemPoolCapacityFromProduction,
  getWeightedResourceAmount,
  RESOURCE_STORAGE_WEIGHTS,
} from './systemPools.js';

export const RESOURCE_DISPLAY = [
  { key: 'Credits', icon: '$', color: '#fbbf24' },
  { key: 'Metals', icon: 'âš™', color: '#a8b5c7' },
  { key: 'Gas', icon: 'â˜', color: '#7dd3fc' },
  { key: 'Food', icon: 'ðŸŒ¿', color: '#86efac' },
  { key: 'Rare Earth Elements', icon: 'âœ¦', color: '#c4b5fd' },
  { key: 'Uranium', icon: 'â˜¢', color: '#bef264' },
  { key: 'Water', icon: 'ðŸ’§', color: '#60a5fa' },
];

export const RESOURCE_KEYS = RESOURCE_DISPLAY.map((resource) => resource.key);

const RESOURCE_INFRASTRUCTURE_MAP = {
  Food: 'farming',
  Water: 'waterExtraction',
  Gas: 'gasExtraction',
};

export function createEmptyResources() {
  return Object.fromEntries(RESOURCE_KEYS.map((resource) => [resource, 0]));
}

export function getPopulationCreditsForPlanet(planet) {
  return Math.floor(Math.max(0, planet.population ?? 0) * POPULATION_CREDITS_PER_PERSON);
}

export function getLocalPeriodProductionForPlanet(planet) {
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

export function sumResources(target, source) {
  for (const resource of RESOURCE_KEYS) {
    target[resource] = (target[resource] ?? 0) + (source[resource] ?? 0);
  }

  return target;
}

export function cloneResources(source = {}) {
  return {
    ...createEmptyResources(),
    ...source,
  };
}

export function createEmptySystemPool() {
  return {
    resources: createEmptyResources(),
  };
}

export function cloneSystemPools(systemPools = {}, ownedStarIds = null) {
  const nextSystemPools = {};
  const starIds = ownedStarIds ? Array.from(ownedStarIds) : Object.keys(systemPools);

  for (const starId of starIds) {
    nextSystemPools[starId] = {
      resources: cloneResources(systemPools?.[starId]?.resources ?? systemPools?.[starId]),
    };
  }

  return nextSystemPools;
}

export function getSystemPoolUsedCapacity(poolEntry) {
  const resources = poolEntry?.resources ?? createEmptyResources();
  return getWeightedResourceAmount(resources);
}

export function addResourcesToSystemPool(poolEntry, production, capacity) {
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

    const remainingCapacity = Math.max(0, capacity - usedCapacity);
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

export function getLocalPeriodProductionForStar(star, capitalStarId = null) {
  const production = createEmptyResources();

  for (const planet of star.planets ?? []) {
    sumResources(production, getLocalPeriodProductionForPlanet(planet));
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

export function calculateSystemPoolCapacitiesForStars(ownedStars, capitalStarId = null) {
  return Object.fromEntries(
    ownedStars.map((star) => [
      star.id,
      calculateSystemPoolCapacityFromProduction(getLocalPeriodProductionForStar(star, capitalStarId)),
    ])
  );
}

export function getDirectPopulationCreditsForStar(star) {
  return (star.planets ?? []).reduce((sum, planet) => sum + getPopulationCreditsForPlanet(planet), 0);
}

export function getDirectPopulationCreditsForOwnedStars(ownedStars, multiplier = 1) {
  return ownedStars.reduce(
    (sum, star) => sum + getDirectPopulationCreditsForStar(star) * multiplier,
    0
  );
}

export function settleOwnedStarPopulations(ownedStars, completedIntervals, capitalStarId = null) {
  let changed = false;

  for (const star of ownedStars) {
    changed =
      settleStarPopulation(
        star,
        completedIntervals,
        getCapitalBonusMultiplier(star.id, capitalStarId)
      ) || changed;
    if (star.id === capitalStarId) {
      changed = ensureStarMinimumPopulation(star) || changed;
    }
  }

  return changed;
}
