import { createPlanets } from './planetFactory.js';
import { createStarName } from './nameGenerator.js';

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

function createStarProfile(rng) {
  const starType = pickWeighted(rng, [
    { value: 'Red Dwarf', weight: 30 },
    { value: 'Yellow Star', weight: 25 },
    { value: 'Red Giant', weight: 20 },
    { value: 'Blue Giant', weight: 15 },
    { value: 'Neutron Star', weight: 10 },
  ]);

  const energyRanges = {
    'Red Dwarf': [10, 25],
    'Yellow Star': [30, 50],
    'Red Giant': [55, 70],
    'Blue Giant': [75, 89],
    'Neutron Star': [90, 100],
  };

  const [minEnergy, maxEnergy] = energyRanges[starType];

  return {
    starType,
    energyOutput: rng.randomInt(minEnergy, maxEnergy),
  };
}

function calculateSystemDefense(planets) {
  if (!planets.length) {
    return 0;
  }

  const totalDefense = planets.reduce(
    (sum, planet) => sum + (planet.infrastructure?.defense ?? 0),
    0
  );

  return Math.round(totalDefense / planets.length);
}

export function createStar(index, position, rng) {
  const name = createStarName(index, rng);
  const planets = createPlanets(rng, name);
  const population = planets.reduce((sum, p) => sum + p.population, 0);
  const gdp = planets.reduce((sum, p) => sum + p.gdp, 0);
  const systemDefense = calculateSystemDefense(planets);
  const profile = createStarProfile(rng);

  return {
    id: rng.randomUUID(),
    name,
    x: position.x,
    y: position.y,
    owner: 'Unclaimed', // or faction
    starId: rng.randomUUID(), // maybe same as id
    starType: profile.starType,
    energyOutput: profile.energyOutput,
    population,
    gdp,
    systemDefense,
    planets,
    // old fields
    radius: 1 + rng.random() * 0.5,
    spectralType: rng.randomChoice(['O', 'B', 'A', 'F', 'G', 'K', 'M']),
    owner: 'Unclaimed',
    richness: rng.randomInt(0, 100),
    danger: rng.randomInt(0, 100),
    explored: rng.random() > 0.8,
  };
}
