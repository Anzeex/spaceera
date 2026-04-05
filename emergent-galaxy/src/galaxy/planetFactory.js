import { createPlanetName } from './nameGenerator.js';

function pickWeighted(rng, weightedItems) {
  const totalWeight = weightedItems.reduce((sum, item) => sum + item.weight, 0);
  let roll = rng.random() * totalWeight;

  for (const item of weightedItems) {
    roll -= item.weight;
    if (roll < 0) {
      return item.value;
    }
  }

  return weightedItems[weightedItems.length - 1].value;
}

function createStandardInfrastructure() {
  return {
    mining: 0,
    farming: 0,
    cities: 0,
    industrial: 0,
    energy: 0,
  };
}

function createGasGiantInfrastructure() {
  return {
    gasExtraction: 0,
    research: 0,
  };
}

function createPlanetProfile(rng) {
  const type = pickWeighted(rng, [
    { value: 'Rocky', weight: 50 },
    { value: 'Icy', weight: 25 },
    { value: 'Gas Giant', weight: 15 },
    { value: 'Dwarf', weight: 10 },
  ]);

  if (type === 'Gas Giant') {
    return {
      type,
      habitability: 0,
      infrastructure: createGasGiantInfrastructure(),
    };
  }

  const baseHabitability = rng.randomInt(0, 100);
  const habitability = type === 'Icy'
    ? Math.floor(baseHabitability / 2)
    : baseHabitability;
  return {
    type,
    habitability,
    infrastructure: createStandardInfrastructure(),
  };
}

export function createPlanets(rng, starName) {
  const count = pickWeighted(rng, [
    { value: 1, weight: 10 },
    { value: 2, weight: 20 },
    { value: 3, weight: 40 },
    { value: 4, weight: 20 },
    { value: 5, weight: 10 },
  ]);
  const planets = [];

  for (let i = 0; i < count; i++) {
    const resources = ['Metals', 'Gas', 'Food', 'Rare Earth Elements', 'Uranium', 'Water'];
    const prominentResources = [];
    resources.forEach(res => {
      const abundance = rng.randomInt(0, 100);
      if (abundance > 50) {
        prominentResources.push({ name: res, abundance });
      }
    });

    const profile = createPlanetProfile(rng);
    const population = 0;
    const gdp = 0;

    planets.push({
      id: rng.randomUUID(),
      name: createPlanetName(starName, i, rng),
      habitability: profile.habitability,
      type: profile.type,
      population,
      prominentResources,
      infrastructure: profile.infrastructure,
      gdp,
    });
  }

  return planets;
}
