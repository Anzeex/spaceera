import { generateSpiralPositions } from './spiralGenerator.js';
import { createStar } from './starFactory.js';
import { createRNG } from './random.js';

export function generateGalaxy({ starCount = 10000, arms, armDensity = 0.8, seed = 'default' }) {
  const rng = createRNG(seed);
  const positions = generateSpiralPositions({ starCount, arms, armDensity, seed });

  return {
    stars: positions.map((pos, index) => createStar(index, pos, rng)),
  };
}
