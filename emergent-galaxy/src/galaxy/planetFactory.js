export function createPlanets(rng) {
  const count = rng.randomInt(0, 7);
  const planets = [];

  for (let i = 0; i < count; i++) {
    const resources = ['Iron', 'Gold', 'Water', 'Oil', 'Rare Earths', 'Uranium', 'Helium-3', 'Crystals'];
    const prominentResources = [];
    resources.forEach(res => {
      const abundance = rng.randomInt(0, 100);
      if (abundance > 50) {
        prominentResources.push({ name: res, abundance });
      }
    });

    const infrastructure = {
      mining: rng.randomInt(0, 10),
      farming: rng.randomInt(0, 10),
      cities: rng.randomInt(0, 10),
      industrial: rng.randomInt(0, 10),
      energy: rng.randomInt(0, 10),
    };

    const population = rng.randomInt(0, 1000000);
    const gdp = population * rng.random() * 1000; // simple calculation

    planets.push({
      id: rng.randomUUID(),
      name: `Planet ${i + 1}`,
      habitability: rng.randomInt(0, 100),
      type: rng.randomChoice(['Terran', 'Ice', 'Gas Giant', 'Desert', 'Volcanic']),
      population,
      prominentResources,
      infrastructure,
      gdp,
      // old
      size: rng.randomInt(1, 10),
    });
  }

  return planets;
}
