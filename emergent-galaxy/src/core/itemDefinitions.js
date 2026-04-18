export const ITEM_DEFINITIONS = [
  {
    id: 'colony-kit',
    name: 'Colony Kit',
    category: 'expansion',
    description: 'Used to establish a full colony on a viable world.',
    productionIndustryPeriods: 18,
    resourceCost: {
      Credits: 120,
      Metals: 45,
      Food: 30,
      Water: 20,
    },
  },
  {
    id: 'terraforming-kit',
    name: 'Terraforming Kit',
    category: 'planetary',
    description: 'Used to prepare harsh worlds for future development.',
    productionIndustryPeriods: 30,
    resourceCost: {
      Credits: 220,
      Metals: 80,
      Gas: 45,
      'Rare Earth Elements': 10,
      Water: 60,
    },
  },
  {
    id: 'outpost-kit',
    name: 'Outpost Kit',
    category: 'expansion',
    description: 'Used to establish a specialized outpost such as mining or logistics.',
    productionIndustryPeriods: 12,
    resourceCost: {
      Credits: 90,
      Metals: 60,
      Food: 20,
      Water: 15,
    },
  },
  {
    id: 'defense-kit',
    name: 'Defense Kit',
    category: 'military',
    description: 'Used to reduce or resist hostile pressure in a system.',
    productionIndustryPeriods: 10,
    resourceCost: {
      Credits: 100,
      Metals: 70,
      Uranium: 4,
    },
  },
];

export const ITEM_IDS = ITEM_DEFINITIONS.map((item) => item.id);

export function createEmptyItemInventory() {
  return Object.fromEntries(ITEM_IDS.map((itemId) => [itemId, 0]));
}

export function cloneItemInventory(source = {}) {
  return {
    ...createEmptyItemInventory(),
    ...source,
  };
}

export function createEmptySystemItemInventory() {
  return {
    items: createEmptyItemInventory(),
  };
}

export function cloneSystemItemInventories(systemItemInventories = {}, ownedStarIds = null) {
  const nextSystemItemInventories = {};
  const starIds = ownedStarIds ? Array.from(ownedStarIds) : Object.keys(systemItemInventories);

  for (const starId of starIds) {
    nextSystemItemInventories[starId] = {
      items: cloneItemInventory(systemItemInventories?.[starId]?.items ?? systemItemInventories?.[starId]),
    };
  }

  return nextSystemItemInventories;
}
