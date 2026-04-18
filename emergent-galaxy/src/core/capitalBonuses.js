export const CAPITAL_SYSTEM_BONUS_MULTIPLIER = 1.1;
export const CAPITAL_SYSTEM_BASE_RESOURCE_PRODUCTION = 1;

export function getCapitalBonusMultiplier(starId, capitalStarId) {
  return starId && capitalStarId && starId === capitalStarId
    ? CAPITAL_SYSTEM_BONUS_MULTIPLIER
    : 1;
}

export function applyResourceMultiplier(resources, multiplier = 1) {
  if (multiplier === 1) {
    return resources;
  }

  const nextResources = {};
  for (const [resource, amount] of Object.entries(resources ?? {})) {
    nextResources[resource] = Math.round((Number(amount) || 0) * multiplier * 10) / 10;
  }

  return nextResources;
}

export function applyCapitalBaseProduction(resources, starId, capitalStarId, resourceKeys = []) {
  if (!(starId && capitalStarId && starId === capitalStarId)) {
    return resources;
  }

  const nextResources = { ...(resources ?? {}) };

  for (const resourceKey of resourceKeys) {
    nextResources[resourceKey] =
      (Number(nextResources[resourceKey]) || 0) + CAPITAL_SYSTEM_BASE_RESOURCE_PRODUCTION;
  }

  return nextResources;
}
