import { createPlanets } from './planetFactory.js';

export function createStar(index, position) {
  return {
    id: crypto.randomUUID(),
    name: `SYS-${index + 1}`,
    x: position.x,
    y: position.y,
    radius: 1 + Math.random() * 0.5,
    planets: createPlanets(),
    spectralType: randomChoice(['O', 'B', 'A', 'F', 'G', 'K', 'M']),
    faction: randomChoice(['Neutral', 'Frontier', 'Prospectors', 'Unclaimed']),
    richness: randomInt(0, 100),
    danger: randomInt(0, 100),
    explored: Math.random() > 0.8,
  };
}

function createPlanetName(index) {
  return `Planet ${index + 1}`;
}

function randomChoice(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}