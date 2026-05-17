export const SHIP_TRAIT_KEYS = Object.freeze([
  'combatPower',
  'defense',
  'thrust',
  'cargoCapacity',
  'passengerCapacity',
  'stealth',
]);

export const BASE_SHIP_TRAITS = Object.freeze({
  combatPower: 0,
  defense: 0,
  thrust: 0,
  cargoCapacity: 0,
  passengerCapacity: 0,
  stealth: 0,
});

export const BASE_SHIP_RUNTIME = Object.freeze({
  mass: 0,
  fuelUse: 0,
  speed: 0,
  vulnerability: 0,
});

export const SHIP_COST_KEYS = Object.freeze([
  'Credits',
  'Metals',
  'Food',
  'Rare Earth Elements',
  'Uranium',
]);

export const BASE_SHIP_COST = Object.freeze({
  Credits: 0,
  Metals: 0,
  Food: 0,
  'Rare Earth Elements': 0,
  Uranium: 0,
});

export const SHIP_HULL_DEFINITIONS = Object.freeze({
  speedHull: {
    id: 'speedHull',
    name: 'Lightframe Hull',
    hullWeight: 4,
    cost: {
      Credits: 90,
      Metals: 60,
      'Rare Earth Elements': 6,
    },
    traits: {
      combatPower: 0,
      defense: 0,
      thrust: 2,
      cargoCapacity: 1,
      passengerCapacity: 1,
      stealth: 2,
    },
    focusTraits: ['thrust', 'stealth'],
    orientation: 'speed',
  },
  defenseHull: {
    id: 'defenseHull',
    name: 'Reinforced Hull',
    hullWeight: 6,
    cost: {
      Credits: 120,
      Metals: 95,
      Uranium: 4,
    },
    traits: {
      combatPower: 1,
      defense: 2,
      thrust: 0,
      cargoCapacity: 1,
      passengerCapacity: 1,
      stealth: 0,
    },
    focusTraits: ['defense', 'combatPower'],
    orientation: 'defense',
  },
  tradeHull: {
    id: 'tradeHull',
    name: 'Spacious Hull',
    hullWeight: 7,
    cost: {
      Credits: 110,
      Metals: 80,
      'Rare Earth Elements': 4,
    },
    traits: {
      combatPower: 0,
      defense: 1,
      thrust: 1,
      cargoCapacity: 2,
      passengerCapacity: 2,
      stealth: 0,
    },
    focusTraits: ['cargoCapacity', 'passengerCapacity'],
    orientation: 'trade',
  },
  stealthHull: {
    id: 'stealthHull',
    name: 'Veiled Hull',
    hullWeight: 5,
    cost: {
      Credits: 130,
      Metals: 70,
      'Rare Earth Elements': 10,
    },
    traits: {
      combatPower: 0,
      defense: 0,
      thrust: 2,
      cargoCapacity: 1,
      passengerCapacity: 1,
      stealth: 2,
    },
    focusTraits: ['stealth', 'thrust'],
    orientation: 'stealth',
  },
  damageHull: {
    id: 'damageHull',
    name: 'Heavyframe Hull',
    hullWeight: 7,
    cost: {
      Credits: 140,
      Metals: 110,
      Uranium: 6,
    },
    traits: {
      combatPower: 2,
      defense: 2,
      thrust: 0,
      cargoCapacity: 1,
      passengerCapacity: 0,
      stealth: 0,
    },
    focusTraits: ['combatPower', 'defense'],
    orientation: 'damage',
  },
});

export const SHIP_MODULE_DEFINITIONS = Object.freeze({
  combatPowerModule: {
    id: 'combatPowerModule',
    name: 'Combat Power Module',
    traits: { combatPower: 1 },
    mass: 1.4,
    fuelUse: 0.18,
    cost: {
      Credits: 22,
      Metals: 18,
      Uranium: 2,
    },
  },
  defenseModule: {
    id: 'defenseModule',
    name: 'Defense Module',
    traits: { defense: 1 },
    mass: 1.8,
    fuelUse: 0.12,
    cost: {
      Credits: 18,
      'Rare Earth Elements': 2,
      Uranium: 1,
    },
  },
  thrustModule: {
    id: 'thrustModule',
    name: 'Thrust Module',
    traits: { thrust: 1 },
    mass: 1.1,
    fuelUse: 0.24,
    cost: {
      Credits: 20,
      Metals: 14,
      Uranium: 2,
    },
  },
  cargoCapacityModule: {
    id: 'cargoCapacityModule',
    name: 'Cargo Capacity Module',
    traits: { cargoCapacity: 1 },
    mass: 1.6,
    fuelUse: 0.08,
    cost: {
      Credits: 16,
      Metals: 16,
    },
  },
  passengerCapacityModule: {
    id: 'passengerCapacityModule',
    name: 'Passenger Capacity Module',
    traits: { passengerCapacity: 1 },
    mass: 1.5,
    fuelUse: 0.09,
    cost: {
      Credits: 17,
      Metals: 12,
      Food: 8,
    },
  },
  stealthModule: {
    id: 'stealthModule',
    name: 'Stealth Module',
    traits: { stealth: 1 },
    mass: 1.2,
    fuelUse: 0.16,
    cost: {
      Credits: 24,
      Metals: 10,
      'Rare Earth Elements': 3,
    },
  },
});

function normalizeNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

export function createEmptyShipTraits() {
  return { ...BASE_SHIP_TRAITS };
}

export function createEmptyShipCost() {
  return { ...BASE_SHIP_COST };
}

export function addShipTraits(left = {}, right = {}) {
  const nextTraits = createEmptyShipTraits();

  for (const traitKey of SHIP_TRAIT_KEYS) {
    nextTraits[traitKey] = normalizeNumber(left[traitKey]) + normalizeNumber(right[traitKey]);
  }

  return nextTraits;
}

export function scaleShipTraits(traits = {}, multiplier = 1) {
  const nextTraits = createEmptyShipTraits();
  const normalizedMultiplier = normalizeNumber(multiplier);

  for (const traitKey of SHIP_TRAIT_KEYS) {
    nextTraits[traitKey] = normalizeNumber(traits[traitKey]) * normalizedMultiplier;
  }

  return nextTraits;
}

export function addShipCosts(left = {}, right = {}) {
  const nextCost = createEmptyShipCost();

  for (const costKey of SHIP_COST_KEYS) {
    nextCost[costKey] = normalizeNumber(left[costKey]) + normalizeNumber(right[costKey]);
  }

  return nextCost;
}

export function scaleShipCost(cost = {}, multiplier = 1) {
  const nextCost = createEmptyShipCost();
  const normalizedMultiplier = normalizeNumber(multiplier);

  for (const costKey of SHIP_COST_KEYS) {
    nextCost[costKey] = normalizeNumber(cost[costKey]) * normalizedMultiplier;
  }

  return nextCost;
}

export function getShipModuleDefinition(moduleOrId) {
  if (!moduleOrId) {
    return null;
  }

  if (typeof moduleOrId === 'string') {
    return SHIP_MODULE_DEFINITIONS[moduleOrId] ?? null;
  }

  return SHIP_MODULE_DEFINITIONS[moduleOrId.id] ?? moduleOrId;
}

export function getShipHullDefinition(hullOrId) {
  if (!hullOrId) {
    return null;
  }

  if (typeof hullOrId === 'string') {
    return SHIP_HULL_DEFINITIONS[hullOrId] ?? null;
  }

  return SHIP_HULL_DEFINITIONS[hullOrId.id] ?? hullOrId;
}

export function calculateShipCost(hullId, modules = []) {
  const hull = getShipHullDefinition(hullId);
  let totalCost = addShipCosts(createEmptyShipCost(), hull?.cost ?? {});

  for (const moduleEntry of modules) {
    const moduleDefinition = getShipModuleDefinition(moduleEntry);
    const count = Math.max(1, Math.floor(normalizeNumber(moduleEntry?.count ?? 1)));
    totalCost = addShipCosts(totalCost, scaleShipCost(moduleDefinition?.cost ?? {}, count));
  }

  return totalCost;
}

export function calculateShipRuntime(traits = {}, modules = [], options = {}) {
  const hullWeight = Math.max(0, normalizeNumber(options.hullWeight));
  const moduleCount = modules.reduce((sum, moduleEntry) => {
    const count = Math.max(1, Math.floor(normalizeNumber(moduleEntry?.count ?? 1)));
    return sum + count;
  }, 0);
  const moduleMass = modules.reduce((sum, moduleEntry) => {
    const moduleDefinition = getShipModuleDefinition(moduleEntry);
    const count = Math.max(1, Math.floor(normalizeNumber(moduleEntry?.count ?? 1)));
    return sum + normalizeNumber(moduleDefinition?.mass) * count;
  }, 0);
  const moduleFuelUse = modules.reduce((sum, moduleEntry) => {
    const moduleDefinition = getShipModuleDefinition(moduleEntry);
    const count = Math.max(1, Math.floor(normalizeNumber(moduleEntry?.count ?? 1)));
    return sum + normalizeNumber(moduleDefinition?.fuelUse) * count;
  }, 0);
  const mass = hullWeight + moduleMass;
  const thrust = Math.max(0, normalizeNumber(traits.thrust));
  const speed = thrust > 0 ? Math.max(0, (thrust * 4) / Math.sqrt(mass + 4)) : 0;
  const fuelUse = moduleFuelUse + mass * 0.035;
  const vulnerability = moduleCount * 0.03;

  return {
    mass,
    fuelUse,
    speed,
    vulnerability,
  };
}

export class ShipClass {
  constructor({
    id,
    name,
    hullId = 'speedHull',
    modules = [],
    upgrades = [],
  } = {}) {
    const hull = getShipHullDefinition(hullId) ?? getShipHullDefinition('speedHull');
    this.id = id ?? globalThis.crypto?.randomUUID?.() ?? `ship-${Date.now()}`;
    this.name = name ?? hull?.name ?? 'Unnamed Ship Class';
    this.hullId = hull?.id ?? 'speedHull';
    this.modules = [...modules];
    this.upgrades = [...upgrades];
  }

  withModule(moduleId, count = 1) {
    return new ShipClass({
      ...this.toJSON(),
      modules: [
        ...this.modules,
        { id: moduleId, count: Math.max(1, Math.floor(normalizeNumber(count))) },
      ],
    });
  }

  withUpgrade(upgrade) {
    return new ShipClass({
      ...this.toJSON(),
      upgrades: [...this.upgrades, upgrade],
    });
  }

  getTraits() {
    const hull = getShipHullDefinition(this.hullId);
    let traits = { ...createEmptyShipTraits(), ...hull?.traits };

    for (const moduleEntry of this.modules) {
      const moduleDefinition = getShipModuleDefinition(moduleEntry);
      const count = Math.max(1, Math.floor(normalizeNumber(moduleEntry?.count ?? 1)));
      if (!moduleDefinition?.traits) {
        continue;
      }

      traits = addShipTraits(traits, scaleShipTraits(moduleDefinition.traits, count));
    }

    for (const upgrade of this.upgrades) {
      traits = addShipTraits(traits, upgrade?.traits ?? {});
    }

    return traits;
  }

  getRuntime() {
    const hull = getShipHullDefinition(this.hullId);
    return calculateShipRuntime(this.getTraits(), this.modules, {
      hullWeight: hull?.hullWeight ?? 0,
    });
  }

  getCost() {
    return calculateShipCost(this.hullId, this.modules);
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      hullId: this.hullId,
      modules: this.modules.map((moduleEntry) => ({ ...moduleEntry })),
      upgrades: this.upgrades.map((upgrade) => ({ ...upgrade })),
    };
  }
}
