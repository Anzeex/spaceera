export function createPlanets() {
  const count = Math.floor(Math.random() * 8);
  const planets = [];

  for (let i = 0; i < count; i++) {
    planets.push({
      id: crypto.randomUUID(),
      name: `Planet ${i + 1}`,
      type: randomChoice(['Terran', 'Ice', 'Gas Giant', 'Desert', 'Volcanic']),
      size: randomInt(1, 10),
      habitability: randomInt(0, 100),
    });
  }

  return planets;
}

function randomChoice(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}