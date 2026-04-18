import { cloneResources, createEmptyResources, RESOURCE_KEYS } from './resourceEconomy.js';

export const MAX_INFRASTRUCTURE_LEVEL = 15;

const INFRASTRUCTURE_BASE_COSTS = {
  farming: { Credits: 4 },
  waterExtraction: { Credits: 4 },
  mining: { Credits: 5 },
  gasExtraction: { Credits: 5 },
  energy: { Credits: 6 },
  cities: { Credits: 6 },
  industrial: { Credits: 6 },
  defense: { Credits: 6 },
  orbitalPopulation: { Credits: 7 },
};

function sanitizeCostShape(cost = {}) {
  const sanitized = createEmptyResources();

  for (const resourceKey of RESOURCE_KEYS) {
    sanitized[resourceKey] = Math.max(0, Math.round(Number(cost[resourceKey]) || 0));
  }

  return sanitized;
}

function getLevelMultiplier(nextLevel) {
  const safeLevel = Math.max(1, Math.floor(Number(nextLevel) || 1));
  return 1 + Math.pow(safeLevel - 1, 2.4) * 0.85;
}

export function getInfrastructureBuildCost(infrastructureKey, nextLevel) {
  const safeLevel = Math.min(MAX_INFRASTRUCTURE_LEVEL, Math.max(1, Math.floor(Number(nextLevel) || 1)));
  const baseCost = sanitizeCostShape(INFRASTRUCTURE_BASE_COSTS[infrastructureKey]);
  const multiplier = getLevelMultiplier(safeLevel);
  const scaledCost = createEmptyResources();

  for (const resourceKey of RESOURCE_KEYS) {
    scaledCost[resourceKey] = Math.ceil(baseCost[resourceKey] * multiplier);
  }

  return scaledCost;
}

export function getInfrastructureUpgradeCostDelta(infrastructureKey, committedLevel, targetLevel) {
  const safeCommittedLevel = Math.max(0, Math.floor(Number(committedLevel) || 0));
  const safeTargetLevel = Math.min(
    MAX_INFRASTRUCTURE_LEVEL,
    Math.max(0, Math.floor(Number(targetLevel) || 0))
  );
  const totalCost = createEmptyResources();

  if (safeTargetLevel <= safeCommittedLevel) {
    return totalCost;
  }

  for (let level = safeCommittedLevel + 1; level <= safeTargetLevel; level++) {
    const levelCost = getInfrastructureBuildCost(infrastructureKey, level);
    for (const resourceKey of RESOURCE_KEYS) {
      totalCost[resourceKey] += levelCost[resourceKey];
    }
  }

  return totalCost;
}

export function canAffordInfrastructureCost(resources, cost) {
  return RESOURCE_KEYS.every((resourceKey) => (resources?.[resourceKey] ?? 0) >= (cost?.[resourceKey] ?? 0));
}

export function applyInfrastructureCost(resources, cost, direction = 'spend') {
  const nextResources = cloneResources(resources);
  const multiplier = direction === 'refund' ? 1 : -1;

  for (const resourceKey of RESOURCE_KEYS) {
    nextResources[resourceKey] += (cost?.[resourceKey] ?? 0) * multiplier;
  }

  return nextResources;
}

export function formatInfrastructureCost(cost) {
  return RESOURCE_KEYS
    .filter((resourceKey) => (cost?.[resourceKey] ?? 0) > 0)
    .map((resourceKey) => `${cost[resourceKey]} ${resourceKey}`)
    .join(', ');
}
