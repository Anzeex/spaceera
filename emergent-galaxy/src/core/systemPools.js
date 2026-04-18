export const POOL_FILL_PERIODS = 12;

export const RESOURCE_STORAGE_WEIGHTS = {
  Credits: 0,
  Metals: 1,
  Gas: 1,
  Food: 1,
  Water: 1,
  'Rare Earth Elements': 2,
  Uranium: 3,
};

export function getWeightedResourceAmount(resources = {}) {
  return Object.entries(resources).reduce(
    (sum, [resource, amount]) => sum + (Number(amount) || 0) * (RESOURCE_STORAGE_WEIGHTS[resource] ?? 1),
    0
  );
}

export function calculateSystemPoolCapacityFromProduction(production = {}) {
  return getWeightedResourceAmount(production) * POOL_FILL_PERIODS;
}
