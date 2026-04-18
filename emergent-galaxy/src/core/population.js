import { getEffectiveInfrastructureLevel } from './energy.js';

const ORBITAL_POPULATION_CAP_BONUS = 7500;
const BASE_FILL_RATE = 0.0136;
const HABITABILITY_GROWTH_EXPONENT = 0.25;
const DISPLAY_PTF_MULTIPLIER = 0.5;
const DISPLAY_PT90_MULTIPLIER = 1.1;
export const CAPITAL_MINIMUM_POPULATION = 100000;

function getInfrastructureLevel(planet, key) {
  return getEffectiveInfrastructureLevel(planet, key);
}

export function calculatePlanetPopulationCap(planet) {
  const cityLevel = getInfrastructureLevel(planet, 'cities');
  const orbitalPopulationLevel = getInfrastructureLevel(planet, 'orbitalPopulation');
  const habitability = Math.max(0, planet.habitability ?? 0);
  const habitabilityMultiplier = Math.min(2, habitability / 50);
  const basePopulationCap =
    cityLevel * 50000 +
    orbitalPopulationLevel * ORBITAL_POPULATION_CAP_BONUS;

  return Math.max(
    0,
    Math.round(basePopulationCap * habitabilityMultiplier)
  );
}

export function calculatePlanetPopulationGrowth(planet, growthMultiplier = 1) {
  const populationCap = calculatePlanetPopulationCap(planet);
  const currentPopulation = Math.max(0, Math.round(planet.population ?? 0));
  const cityLevel = getInfrastructureLevel(planet, 'cities');
  const habitability = Math.max(0, planet.habitability ?? 0);
  const habitabilityGrowthMultiplier = Math.pow(habitability / 50, HABITABILITY_GROWTH_EXPONENT);

  if (cityLevel <= 0 || populationCap <= currentPopulation || habitabilityGrowthMultiplier <= 0) {
    return 0;
  }

  const remainingCapacity = populationCap - currentPopulation;
  const growth = Math.round(
    BASE_FILL_RATE *
      Math.max(0, growthMultiplier) *
      habitabilityGrowthMultiplier *
      remainingCapacity
  );

  return Math.max(1, Math.min(populationCap - currentPopulation, growth));
}

export function calculateStarPopulationCap(star) {
  return (star.planets ?? []).reduce(
    (sum, planet) => sum + calculatePlanetPopulationCap(planet),
    0
  );
}

export function calculateStarPopulationGrowth(star, growthMultiplier = 1) {
  return (star.planets ?? []).reduce(
    (sum, planet) => sum + calculatePlanetPopulationGrowth(planet, growthMultiplier),
    0
  );
}

export function estimatePlanetPeriodsToTarget(planet, targetRatio = 1, maxPeriods = 100000, growthMultiplier = 1) {
  const populationCap = calculatePlanetPopulationCap(planet);
  let population = Math.max(0, Math.round(planet.population ?? 0));
  const targetPopulation = Math.max(
    0,
    Math.min(populationCap, Math.ceil(populationCap * targetRatio))
  );

  if (targetPopulation <= population) {
    return 0;
  }

  for (let period = 1; period <= maxPeriods; period++) {
    const growth = calculatePlanetPopulationGrowth({
      ...planet,
      population,
    }, growthMultiplier);

    if (growth <= 0) {
      return Infinity;
    }

    population = Math.min(populationCap, population + growth);
    if (population >= targetPopulation) {
      return period;
    }
  }

  return Infinity;
}

export function estimatePlanetPeriodsToFill(planet, maxPeriods = 100000, growthMultiplier = 1) {
  return estimatePlanetPeriodsToTarget(planet, 1, maxPeriods, growthMultiplier);
}

export function estimatePlanetDisplayPeriodsToFill(planet, maxPeriods = 100000, growthMultiplier = 1) {
  const periods = estimatePlanetPeriodsToFill(planet, maxPeriods, growthMultiplier);
  if (!Number.isFinite(periods)) {
    return periods;
  }

  return Math.max(0, Math.round(periods * DISPLAY_PTF_MULTIPLIER));
}

export function estimatePlanetDisplayPeriodsToNinety(planet, maxPeriods = 100000, growthMultiplier = 1) {
  const periods = estimatePlanetPeriodsToTarget(planet, 0.9, maxPeriods, growthMultiplier);
  if (!Number.isFinite(periods)) {
    return periods;
  }

  return Math.max(0, Math.round(periods * DISPLAY_PT90_MULTIPLIER));
}

export function estimateStarPeriodsToFill(star, maxPeriods = 100000, growthMultiplier = 1) {
  return estimateStarPeriodsToTarget(star, 1, maxPeriods, growthMultiplier);
}

export function estimateStarDisplayPeriodsToFill(star, maxPeriods = 100000, growthMultiplier = 1) {
  const periods = estimateStarPeriodsToFill(star, maxPeriods, growthMultiplier);
  if (!Number.isFinite(periods)) {
    return periods;
  }

  return Math.max(0, Math.round(periods * DISPLAY_PTF_MULTIPLIER));
}

export function estimateStarPeriodsToTarget(star, targetRatio = 1, maxPeriods = 100000, growthMultiplier = 1) {
  const planetPeriods = (star.planets ?? []).map((planet) =>
    estimatePlanetPeriodsToTarget(planet, targetRatio, maxPeriods, growthMultiplier)
  );

  if (!planetPeriods.length) {
    return 0;
  }

  if (planetPeriods.some((periods) => periods === Infinity)) {
    return Infinity;
  }

  return Math.max(...planetPeriods);
}

export function estimateStarDisplayPeriodsToNinety(star, maxPeriods = 100000, growthMultiplier = 1) {
  const periods = estimateStarPeriodsToTarget(star, 0.9, maxPeriods, growthMultiplier);
  if (!Number.isFinite(periods)) {
    return periods;
  }

  return Math.max(0, Math.round(periods * DISPLAY_PT90_MULTIPLIER));
}

export function settlePlanetPopulation(planet, completedIntervals = 1, growthMultiplier = 1) {
  const normalizedIntervals = Math.max(0, Math.floor(completedIntervals));
  const populationCap = calculatePlanetPopulationCap(planet);
  const startingPopulation = Math.max(0, Math.round(planet.population ?? 0));
  let nextPopulation = Math.min(startingPopulation, populationCap);

  for (let intervalIndex = 0; intervalIndex < normalizedIntervals; intervalIndex++) {
    const growth = calculatePlanetPopulationGrowth({
      ...planet,
      population: nextPopulation,
    }, growthMultiplier);
    if (growth <= 0) {
      break;
    }

    nextPopulation = Math.min(populationCap, nextPopulation + growth);
  }

  planet.population = nextPopulation;
  return nextPopulation !== startingPopulation;
}

export function recalculateStarDerivedStats(star) {
  const planets = star.planets ?? [];
  star.population = planets.reduce((sum, planet) => sum + (planet.population ?? 0), 0);
  star.systemDefense = planets.length
    ? Math.round(
        planets.reduce((sum, planet) => sum + (planet.infrastructure?.defense ?? 0), 0) /
          planets.length
      )
    : 0;
}

export function ensureStarMinimumPopulation(star, minimumPopulation = CAPITAL_MINIMUM_POPULATION) {
  const planets = star?.planets ?? [];
  if (!star || planets.length === 0) {
    return false;
  }

  recalculateStarDerivedStats(star);
  const targetPopulation = Math.max(0, Math.round(Number(minimumPopulation) || 0));
  const currentPopulation = Math.max(0, Math.round(star.population ?? 0));
  if (currentPopulation >= targetPopulation) {
    return false;
  }

  const populationDelta = targetPopulation - currentPopulation;
  const bestPlanet = planets.reduce((best, planet) => {
    const bestHabitability = Number(best?.habitability) || 0;
    const planetHabitability = Number(planet?.habitability) || 0;
    return planetHabitability > bestHabitability ? planet : best;
  }, planets[0]);

  bestPlanet.population = Math.max(0, Math.round(bestPlanet.population ?? 0)) + populationDelta;
  recalculateStarDerivedStats(star);
  return true;
}

export function settleStarPopulation(star, completedIntervals = 1, growthMultiplier = 1) {
  let changed = false;

  for (const planet of star.planets ?? []) {
    changed = settlePlanetPopulation(planet, completedIntervals, growthMultiplier) || changed;
  }

  recalculateStarDerivedStats(star);
  return changed;
}
