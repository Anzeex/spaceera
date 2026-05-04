export const SHIP_TRAIT_KEYS = Object.freeze([
  'combatPower',
  'defense',
  'thrust',
  'cargoCapacity',
  'passengerCapacity',
  'stealth',
]);

export const SHIP_USAGE_KEYS = Object.freeze([
  'warfare',
  'transport',
  'colonization',
  'raiding',
  'blockade',
  'civilianPassenger',
  'trade',
  'escort',
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
  hullMass: 10,
  fuelUse: 1,
  moduleMass: 0,
  speed: 0,
});

export const SHIP_MODULE_DEFINITIONS = Object.freeze({
  weaponBattery: {
    id: 'weaponBattery',
    name: 'Weapon Battery',
    traits: { combatPower: 8 },
    mass: 3,
    fuelUse: 0.4,
  },
  armorPlating: {
    id: 'armorPlating',
    name: 'Armor Plating',
    traits: { defense: 7 },
    mass: 4,
    fuelUse: 0.2,
  },
  engineArray: {
    id: 'engineArray',
    name: 'Engine Array',
    traits: { thrust: 10 },
    mass: 2,
    fuelUse: 0.8,
  },
  cargoHold: {
    id: 'cargoHold',
    name: 'Cargo Hold',
    traits: { cargoCapacity: 16 },
    mass: 5,
    fuelUse: 0.15,
  },
  passengerDeck: {
    id: 'passengerDeck',
    name: 'Passenger Deck',
    traits: { passengerCapacity: 12 },
    mass: 4,
    fuelUse: 0.2,
  },
  stealthCoating: {
    id: 'stealthCoating',
    name: 'Stealth Coating',
    traits: { stealth: 9 },
    mass: 2,
    fuelUse: 0.45,
  },
  colonyPod: {
    id: 'colonyPod',
    name: 'Colony Pod',
    traits: { passengerCapacity: 8, cargoCapacity: 6, defense: 1 },
    mass: 6,
    fuelUse: 0.35,
    tags: ['colonization'],
  },
});

function normalizeNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

export function createEmptyShipTraits() {
  return { ...BASE_SHIP_TRAITS };
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

export function getShipModuleDefinition(moduleOrId) {
  if (!moduleOrId) {
    return null;
  }

  if (typeof moduleOrId === 'string') {
    return SHIP_MODULE_DEFINITIONS[moduleOrId] ?? null;
  }

  return SHIP_MODULE_DEFINITIONS[moduleOrId.id] ?? moduleOrId;
}

export function calculateShipRuntime(traits = {}, modules = [], options = {}) {
  const hullMass = Math.max(1, normalizeNumber(options.hullMass ?? BASE_SHIP_RUNTIME.hullMass));
  const baseFuelUse = Math.max(0, normalizeNumber(options.baseFuelUse ?? BASE_SHIP_RUNTIME.fuelUse));
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
  const totalMass = hullMass + moduleMass;
  const thrust = Math.max(0, normalizeNumber(traits.thrust));
  const speed = totalMass > 0 ? Math.max(0, thrust / totalMass) : 0;
  const fuelUse = baseFuelUse + moduleFuelUse + totalMass * 0.015;

  return {
    hullMass,
    moduleMass,
    totalMass,
    fuelUse,
    speed,
  };
}

export function deriveShipUsageScores(traits = {}, runtime = {}) {
  const combatPower = normalizeNumber(traits.combatPower);
  const defense = normalizeNumber(traits.defense);
  const thrust = normalizeNumber(traits.thrust);
  const cargoCapacity = normalizeNumber(traits.cargoCapacity);
  const passengerCapacity = normalizeNumber(traits.passengerCapacity);
  const stealth = normalizeNumber(traits.stealth);
  const speed = normalizeNumber(runtime.speed);

  return {
    warfare: combatPower * 1.1 + defense * 0.7 + speed * 8,
    transport: cargoCapacity * 1.1 + thrust * 0.2 + defense * 0.2,
    colonization: passengerCapacity * 0.9 + cargoCapacity * 0.7 + defense * 0.2,
    raiding: combatPower * 0.8 + stealth * 1.1 + speed * 10,
    blockade: combatPower * 0.7 + defense * 1.1 + cargoCapacity * 0.2,
    civilianPassenger: passengerCapacity * 1.2 + defense * 0.2 + speed * 5,
    trade: cargoCapacity * 1.25 + defense * 0.15 + speed * 6,
    escort: combatPower * 0.65 + defense * 0.85 + thrust * 0.25 + stealth * 0.15,
  };
}

export function getPrimaryShipUsages(usageScores = {}, limit = 3) {
  return Object.entries(usageScores)
    .filter(([, score]) => normalizeNumber(score) > 0)
    .sort(([, leftScore], [, rightScore]) => normalizeNumber(rightScore) - normalizeNumber(leftScore))
    .slice(0, limit)
    .map(([usage, score]) => ({ usage, score }));
}

export class ShipClass {
  constructor({
    id,
    name,
    hullMass = BASE_SHIP_RUNTIME.hullMass,
    baseFuelUse = BASE_SHIP_RUNTIME.fuelUse,
    baseTraits = BASE_SHIP_TRAITS,
    modules = [],
    upgrades = [],
  } = {}) {
    this.id = id ?? globalThis.crypto?.randomUUID?.() ?? `ship-${Date.now()}`;
    this.name = name ?? 'Unnamed Ship Class';
    this.hullMass = Math.max(1, normalizeNumber(hullMass));
    this.baseFuelUse = Math.max(0, normalizeNumber(baseFuelUse));
    this.baseTraits = { ...createEmptyShipTraits(), ...baseTraits };
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
    let traits = { ...createEmptyShipTraits(), ...this.baseTraits };

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
    return calculateShipRuntime(this.getTraits(), this.modules, {
      hullMass: this.hullMass,
      baseFuelUse: this.baseFuelUse,
    });
  }

  getUsageScores() {
    return deriveShipUsageScores(this.getTraits(), this.getRuntime());
  }

  getPrimaryUsages(limit = 3) {
    return getPrimaryShipUsages(this.getUsageScores(), limit);
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      hullMass: this.hullMass,
      baseFuelUse: this.baseFuelUse,
      baseTraits: { ...this.baseTraits },
      modules: this.modules.map((moduleEntry) => ({ ...moduleEntry })),
      upgrades: this.upgrades.map((upgrade) => ({ ...upgrade })),
    };
  }
}
