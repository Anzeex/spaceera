export function captureBaselineState(galaxy) {
  const baselineStars = new Map();

  for (const star of galaxy.stars) {
    baselineStars.set(star.id, {
      owner: star.owner,
      faction: star.faction ?? null,
      population: star.population,
      systemDefense: star.systemDefense,
      explored: star.explored,
      richness: star.richness,
      danger: star.danger,
      planets: star.planets.map((planet) => ({
        id: planet.id,
        population: planet.population,
        infrastructure: { ...planet.infrastructure },
      })),
    });
  }

  return {
    stars: baselineStars,
  };
}

export function serializeGameState(state, baselineState) {
  const starOverrides = {};

  for (const star of state.galaxy.stars) {
    const baselineStar = baselineState.stars.get(star.id);
    if (!baselineStar) continue;

    const starDiff = {};

    if (star.owner !== baselineStar.owner) {
      starDiff.owner = star.owner;
    }

    if ((star.faction ?? null) !== baselineStar.faction) {
      starDiff.faction = star.faction ?? null;
    }

    if (star.population !== baselineStar.population) {
      starDiff.population = star.population;
    }

    if (star.systemDefense !== baselineStar.systemDefense) {
      starDiff.systemDefense = star.systemDefense;
    }

    if (star.explored !== baselineStar.explored) {
      starDiff.explored = star.explored;
    }

    if (star.richness !== baselineStar.richness) {
      starDiff.richness = star.richness;
    }

    if (star.danger !== baselineStar.danger) {
      starDiff.danger = star.danger;
    }

    const planetOverrides = {};
    for (const planet of star.planets) {
      const baselinePlanet = baselineStar.planets.find((entry) => entry.id === planet.id);
      if (!baselinePlanet) continue;

      const planetDiff = {};
      if (planet.population !== baselinePlanet.population) {
        planetDiff.population = planet.population;
      }

      const infrastructureDiff = {};
      for (const [key, value] of Object.entries(planet.infrastructure)) {
        if (baselinePlanet.infrastructure[key] !== value) {
          infrastructureDiff[key] = value;
        }
      }

      if (Object.keys(infrastructureDiff).length > 0) {
        planetDiff.infrastructure = infrastructureDiff;
      }

      if (Object.keys(planetDiff).length > 0) {
        planetOverrides[planet.id] = planetDiff;
      }
    }

    if (Object.keys(planetOverrides).length > 0) {
      starDiff.planets = planetOverrides;
    }

    if (Object.keys(starDiff).length > 0) {
      starOverrides[star.id] = starDiff;
    }
  }

  return {
    territories: Array.from(state.territories.values()).map((territory) => ({
      id: territory.id,
      name: territory.name,
      color: territory.color,
      faction: territory.faction,
      avatarImageUrl: territory.avatarImageUrl ?? '',
      capitalStarId: territory.capitalStarId ?? null,
      stars: Array.from(territory.stars),
    })),
    currentTerritoryId: state.currentTerritoryId,
    starOverrides,
  };
}

export function applyStoredState(state, storedState) {
  if (!storedState) return;

  state.territories = new Map(
    (storedState.territories || []).map((territory) => [
      territory.id,
      {
        ...territory,
        capitalStarId: territory.capitalStarId ?? null,
        stars: new Set(territory.stars || []),
      },
    ])
  );

  state.currentTerritoryId = storedState.currentTerritoryId || null;

  for (const star of state.galaxy.stars) {
    const override = storedState.starOverrides?.[star.id];
    if (!override) continue;

    if ('owner' in override) star.owner = override.owner;
    if ('faction' in override) star.faction = override.faction;
    if ('population' in override) star.population = override.population;
    if ('systemDefense' in override) star.systemDefense = override.systemDefense;
    if ('explored' in override) star.explored = override.explored;
    if ('richness' in override) star.richness = override.richness;
    if ('danger' in override) star.danger = override.danger;

    if (override.planets) {
      for (const planet of star.planets) {
        const planetOverride = override.planets[planet.id];
        if (!planetOverride) continue;

        if ('population' in planetOverride) planet.population = planetOverride.population;
        if (planetOverride.infrastructure) {
          Object.assign(planet.infrastructure, planetOverride.infrastructure);
        }
      }
    }
  }
}

export function restoreBaselineState(state, baselineState) {
  state.territories = new Map();
  state.currentTerritoryId = null;

  for (const star of state.galaxy.stars) {
    const baselineStar = baselineState.stars.get(star.id);
    if (!baselineStar) continue;

    star.owner = baselineStar.owner;
    star.faction = baselineStar.faction;
    star.population = baselineStar.population;
    star.systemDefense = baselineStar.systemDefense;
    star.explored = baselineStar.explored;
    star.richness = baselineStar.richness;
    star.danger = baselineStar.danger;

    for (const planet of star.planets) {
      const baselinePlanet = baselineStar.planets.find((entry) => entry.id === planet.id);
      if (!baselinePlanet) continue;

      planet.population = baselinePlanet.population;
      planet.infrastructure = { ...baselinePlanet.infrastructure };
    }
  }
}
