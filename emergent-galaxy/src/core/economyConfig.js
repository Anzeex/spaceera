export const RESOURCE_STANDARD_PRICES = {
  Credits: 1,
  Metals: 6,
  Food: 3,
  'Rare Earth Elements': 18,
  Uranium: 28,
};

export const STARTING_PLAYER_RESOURCES = {
  Credits: 250,
  Metals: 100,
  Food: 160,
  'Rare Earth Elements': 15,
  Uranium: 8,
};

export const RESOURCE_PRODUCTION_PER_INFRASTRUCTURE_LEVEL = {
  Credits: 0,
  Metals: 1,
  Food: 1.6,
  'Rare Earth Elements': 0.25,
  Uranium: 0.15,
};

// Tuned for 1 hour periods and long-term progression.
// A fully populated 1.2M planet yields about 12 credits/hour.
export const POPULATION_CREDITS_PER_PERSON = 0.00001;
