import { generateSpiralPositions } from './spiralGenerator.js';
import { createStar } from './starFactory.js';

export function generateGalaxy({ starCount = 10000, arms, armDensity = 0.8 }) {
  const positions = generateSpiralPositions({ starCount, arms, armDensity });

  return {
    stars: positions.map((pos, index) => createStar(index, pos)),
  };
}