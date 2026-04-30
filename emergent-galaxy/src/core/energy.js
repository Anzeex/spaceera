export const CAPITAL_SYSTEM_ENERGY_OUTPUT = 100;
export const ENERGY_INFRASTRUCTURE_OUTPUT_PER_LEVEL = 17.5;

export const INFRASTRUCTURE_ENERGY_COSTS = {
  cities: 6,
  orbitalPopulation: 8,
  mining: 4,
  farming: 3,
  industrial: 5,
  defense: 2,
};

export const POWERABLE_INFRASTRUCTURE_PRIORITY = [
  'cities',
  'orbitalPopulation',
  'mining',
  'farming',
  'industrial',
  'defense',
];

function normalizeInfrastructureLevel(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

export function getEffectiveInfrastructureLevel(planet, key) {
  if (planet?.activeInfrastructure && key in planet.activeInfrastructure) {
    return normalizeInfrastructureLevel(planet.activeInfrastructure[key]);
  }

  return normalizeInfrastructureLevel(planet?.infrastructure?.[key]);
}

export function clearInfrastructurePowerState(stars = []) {
  for (const star of stars) {
    for (const planet of star.planets ?? []) {
      delete planet.activeInfrastructure;
      delete planet.inactiveInfrastructure;
    }
  }
}

export function calculateAndApplyTerritoryEnergyState({ ownedStars = [], capitalStarId = null }) {
  const ownedStarIds = new Set(ownedStars.map((star) => star.id));
  const outputFromCapital =
    capitalStarId && ownedStarIds.has(capitalStarId) ? CAPITAL_SYSTEM_ENERGY_OUTPUT : 0;
  let outputFromInfrastructure = 0;
  let totalConsumption = 0;

  for (const star of ownedStars) {
    for (const planet of star.planets ?? []) {
      const energyLevel = normalizeInfrastructureLevel(planet.infrastructure?.energy);
      outputFromInfrastructure += energyLevel * ENERGY_INFRASTRUCTURE_OUTPUT_PER_LEVEL;

      const activeInfrastructure = {};
      const inactiveInfrastructure = {};

      for (const [key, rawValue] of Object.entries(planet.infrastructure ?? {})) {
        const level = normalizeInfrastructureLevel(rawValue);
        if (key === 'energy') {
          activeInfrastructure[key] = level;
          inactiveInfrastructure[key] = 0;
          continue;
        }

        const energyCost = INFRASTRUCTURE_ENERGY_COSTS[key] ?? 0;
        totalConsumption += level * energyCost;
        activeInfrastructure[key] = 0;
        inactiveInfrastructure[key] = level;
      }

      planet.activeInfrastructure = activeInfrastructure;
      planet.inactiveInfrastructure = inactiveInfrastructure;
    }
  }

  const totalOutput = outputFromCapital + outputFromInfrastructure;
  let remainingEnergy = totalOutput;
  let activeConsumption = 0;
  let inactiveInfrastructureCount = 0;

  for (const key of POWERABLE_INFRASTRUCTURE_PRIORITY) {
    const energyCost = INFRASTRUCTURE_ENERGY_COSTS[key] ?? 0;

    for (const star of ownedStars) {
      for (const planet of star.planets ?? []) {
        const totalLevel = normalizeInfrastructureLevel(planet.infrastructure?.[key]);
        if (totalLevel <= 0) {
          continue;
        }

        if (energyCost <= 0) {
          planet.activeInfrastructure[key] = totalLevel;
          planet.inactiveInfrastructure[key] = 0;
          continue;
        }

        const poweredLevels = Math.min(totalLevel, Math.floor(remainingEnergy / energyCost));
        const inactiveLevels = totalLevel - poweredLevels;

        planet.activeInfrastructure[key] = poweredLevels;
        planet.inactiveInfrastructure[key] = inactiveLevels;
        remainingEnergy -= poweredLevels * energyCost;
        activeConsumption += poweredLevels * energyCost;
        inactiveInfrastructureCount += inactiveLevels;
      }
    }
  }

  return {
    output: totalOutput,
    consumption: totalConsumption,
    activeConsumption,
    deficit: Math.max(0, totalConsumption - totalOutput),
    inactiveInfrastructureCount,
    capitalBonus: outputFromCapital,
    infrastructureOutput: outputFromInfrastructure,
  };
}
