export const MINIMUM_ITEM_CRAFT_TIME_RATIO = 0.2;

export const ITEM_DEFINITIONS = [
  {
    id: 'colony-kit',
    name: 'Colony Kit',
    icon: {
      symbol: 'C',
      color: '#86efac',
      background: 'linear-gradient(135deg, #14532d, #22c55e)',
    },
    category: 'expansion',
    description: 'Used to establish a full colony on a viable world.',
    productionCost: 48,
    storageSize: 5,
    resourceCost: {
      Credits: 120,
      Metals: 45,
      Food: 30,
      'Rare Earth Elements': 6,
      Uranium: 3,
    },
  },
  {
    id: 'terraforming-kit',
    name: 'Terraforming Kit',
    icon: {
      symbol: 'T',
      color: '#7dd3fc',
      background: 'linear-gradient(135deg, #164e63, #38bdf8)',
    },
    category: 'planetary',
    description: 'Used to prepare harsh worlds for future development.',
    productionCost: 84,
    storageSize: 5,
    resourceCost: {
      Credits: 220,
      Metals: 80,
      'Rare Earth Elements': 10,
      Uranium: 8,
      Food: 40,
    },
  },
  {
    id: 'outpost-kit',
    name: 'Outpost Kit',
    icon: {
      symbol: 'O',
      color: '#fbbf24',
      background: 'linear-gradient(135deg, #78350f, #f59e0b)',
    },
    category: 'expansion',
    description: 'Used to establish a specialized outpost such as mining or logistics.',
    productionCost: 36,
    storageSize: 5,
    resourceCost: {
      Credits: 90,
      Metals: 60,
      Food: 20,
      'Rare Earth Elements': 4,
    },
  },
  {
    id: 'mining-kit',
    name: 'Mining Kit',
    icon: {
      symbol: 'M',
      color: '#cbd5e1',
      background: 'linear-gradient(135deg, #334155, #94a3b8)',
    },
    category: 'planetary',
    description: 'Used to establish or reinforce mining operations on resource-rich worlds.',
    productionCost: 40,
    storageSize: 5,
    resourceCost: {
      Credits: 110,
      Metals: 75,
      Food: 12,
      'Rare Earth Elements': 5,
    },
  },
  {
    id: 'defense-kit',
    name: 'Defense Kit',
    icon: {
      symbol: 'D',
      color: '#fca5a5',
      background: 'linear-gradient(135deg, #7f1d1d, #ef4444)',
    },
    category: 'military',
    description: 'Used to reduce or resist hostile pressure in a system.',
    productionCost: 32,
    storageSize: 5,
    resourceCost: {
      Credits: 100,
      Metals: 70,
      Uranium: 4,
    },
  },
  {
    id: 'wormhole-kit',
    name: 'Wormhole Kit',
    icon: {
      symbol: 'W',
      color: '#ddd6fe',
      background: 'linear-gradient(135deg, #312e81, #8b5cf6)',
    },
    category: 'logistics',
    description: 'Used to prepare experimental long-range transit infrastructure.',
    productionCost: 120,
    storageSize: 5,
    resourceCost: {
      Credits: 320,
      Metals: 120,
      'Rare Earth Elements': 18,
      Uranium: 14,
    },
  },
];

export const ITEM_IDS = ITEM_DEFINITIONS.map((item) => item.id);

export function getItemDefinition(itemId) {
  return ITEM_DEFINITIONS.find((item) => item.id === itemId) ?? null;
}

export function getItemProductionCost(itemId) {
  return Math.max(0, Number(getItemDefinition(itemId)?.productionCost) || 0);
}

export function getItemStorageSize(itemId) {
  return Math.max(0, Number(getItemDefinition(itemId)?.storageSize) || 0);
}

export function createEmptyItemInventory() {
  return Object.fromEntries(ITEM_IDS.map((itemId) => [itemId, 0]));
}

export function cloneItemInventory(source = {}) {
  return {
    ...createEmptyItemInventory(),
    ...source,
  };
}
