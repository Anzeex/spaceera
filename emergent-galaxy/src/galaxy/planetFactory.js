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

const MINED_RESOURCE_NAMES = ['Rare Earth Elements', 'Metals', 'Uranium'];

function hasResource(resources, resourceName) {
  return resources.some(
    (resource) => resource.name === resourceName && resource.abundance > 0
  );
}

function createPlanetInfrastructure(type, resources) {
  const infrastructure = {
    industrial: 0,
    energy: 0,
    defense: 0,
  };

  if (type === 'Gas Giant') {
    infrastructure.orbitalPopulation = 0;
  } else {
    infrastructure.cities = 0;
  }

  if (resources.some((resource) => MINED_RESOURCE_NAMES.includes(resource.name))) {
    infrastructure.mining = 0;
  }

  if (hasResource(resources, 'Food')) {
    infrastructure.farming = 0;
  }

  if (hasResource(resources, 'Water')) {
    infrastructure.waterExtraction = 0;
  }

  if (hasResource(resources, 'Gas')) {
    infrastructure.gasExtraction = 0;
  }

  return infrastructure;
}

function createProminentResources(type, habitability, rng) {
  if (type === 'Gas Giant') {
    return [
      {
        name: 'Gas',
        abundance: rng.randomInt(70, 100),
      },
    ];
  }

  const resourceWeights = [
    { name: 'Metals', chance: 55 },
    { name: 'Gas', chance: type === 'Rocky' ? 10 : type === 'Icy' ? 12 : 8 },
    { name: 'Food', chance: 25 },
    { name: 'Rare Earth Elements', chance: 30 },
    { name: 'Uranium', chance: 20 },
    { name: 'Water', chance: type === 'Icy' ? 70 : 35 },
  ];

  const resourceCandidates = resourceWeights.map((resource) => ({
    name: resource.name,
    chance: resource.chance,
    abundance: rng.randomInt(50, 100),
  }));

  const resources = resourceCandidates.flatMap((resource) => {
    if (rng.randomInt(1, 100) > resource.chance) {
      return [];
    }

    return [{
      name: resource.name,
      abundance: resource.abundance,
    }];
  });

  if (habitability < 30) {
    const foodResource = resources.find((resource) => resource.name === 'Food');

    if (foodResource) {
      foodResource.abundance = 0;
    }
  } else {
    const foodResource = resources.find((resource) => resource.name === 'Food');

    if (foodResource) {
      const reduction = 100 - habitability / 2;
      foodResource.abundance = Math.max(
        0,
        Math.round(foodResource.abundance - reduction)
      );
    }
  }

  const viableResources = resources.filter((resource) => resource.abundance > 0);

  if (viableResources.length > 0) {
    return viableResources;
  }

  const fallbackResource = resourceCandidates
    .map((resource) => {
      if (resource.name !== 'Food') {
        return resource;
      }

      if (habitability < 30) {
        return { ...resource, abundance: 0 };
      }

      const reduction = 100 - habitability / 2;
      return {
        ...resource,
        abundance: Math.max(0, Math.round(resource.abundance - reduction)),
      };
    })
    .reduce((best, resource) =>
      resource.abundance > best.abundance ? resource : best
    );

  return fallbackResource.abundance > 0
    ? [{
        name: fallbackResource.name,
        abundance: fallbackResource.abundance * 2,
      }]
    : [];
}

function keepHighestScoringMinedResource(resources) {
  const minedResources = resources.filter((resource) =>
    MINED_RESOURCE_NAMES.includes(resource.name)
  );

  if (minedResources.length <= 1) {
    return resources;
  }

  const strongestMinedResource = minedResources.reduce((best, resource) =>
    resource.abundance > best.abundance ? resource : best
  );

  return resources.filter(
    (resource) =>
      !MINED_RESOURCE_NAMES.includes(resource.name) ||
      resource.name === strongestMinedResource.name
  );
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
    };
  }

  const baseHabitability = rng.randomInt(0, 100);
  const habitability = type === 'Icy'
    ? Math.floor(baseHabitability / 2)
    : baseHabitability;
  return {
    type,
    habitability,
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
    const profile = createPlanetProfile(rng);
    const prominentResources = keepHighestScoringMinedResource(
      createProminentResources(
        profile.type,
        profile.habitability,
        rng
      )
    );
    const population = 0;
    const infrastructure = createPlanetInfrastructure(profile.type, prominentResources);

    planets.push({
      id: rng.randomUUID(),
      name: createPlanetName(starName, i, rng),
      habitability: profile.habitability,
      type: profile.type,
      population,
      prominentResources,
      infrastructure,
    });
  }

  return planets;
}
