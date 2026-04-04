import { createPlanets } from './planetFactory.js';
import { createStarName } from './nameGenerator.js';

export function createStar(index, position, rng) {
  const planets = createPlanets(rng);
  const population = planets.reduce((sum, p) => sum + p.population, 0);
  const gdp = planets.reduce((sum, p) => sum + p.gdp, 0);

  const starTypes = ['Red Dwarf', 'Yellow Sun', 'Blue Giant', 'Neutron Star', 'White Dwarf', 'Brown Dwarf', 'Supergiant'];
  const starType = rng.randomChoice(starTypes);

  return {
    id: rng.randomUUID(),
    name: createStarName(index, rng),
    x: position.x,
    y: position.y,
    owner: 'Unclaimed', // or faction
    starId: rng.randomUUID(), // maybe same as id
    starType,
    energyOutput: rng.randomInt(10, 100),
    population,
    gdp,
    systemDefense: rng.randomInt(0, 100),
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
