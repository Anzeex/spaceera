import { createRNG } from './random.js';

export function generateSpiralPositions({
  starCount,
  arms = 2,
  wildness = 0.5,
  spinTightness = 0.00045, // lower = looser spiral, higher = tighter spin
  armDensity = 0.8, // 0-1: controls how concentrated density is at arm centers
  minStarDistance = 50, // minimum distance between stars (world units)
  seed = 'default',
}) {
  const random = createRNG(seed);
  const positions = [];

  const chaos = Math.max(0, Math.min(1, wildness));
  const safeArms = Math.max(1, arms);
  const density = Math.max(0, Math.min(1, armDensity));
  const minStarDistanceSq = minStarDistance * minStarDistance;

  for (let i = 0; i < starCount; i++) {
    const arm = i % safeArms;
    const t = i / starCount;

    // Bias stars more toward the center
    const centerBias = Math.pow(t, 1.3);

    const radius =
      centerBias * 18000 +
      random.random() * (30 + chaos * 20);

    // Control how tightly the galaxy spins
    const baseAngle = radius * spinTightness;

    const armOffset = (Math.PI * 2 * arm) / safeArms;

    // Arm thickness:
    // thicker near center, thinner farther out
    const armThickness = (2.7 - centerBias) * 0.9 + 0.05;

    // Wildness still affects how messy it gets
    const spread =
      (random.random() - 0.5) *
      armThickness *
      (0.8 + chaos * 2.8);

    const angle = baseAngle + armOffset + spread;

    // Distance from arm center (0 at center, up to 1 at edges)
    const distanceFromCenter = Math.abs(spread) / (armThickness * (0.8 + chaos * 2.8) / 2);
    
    // Density falloff: higher density values = sharper concentration at center
    // Use exponential falloff to control edge density
    const densityFalloff = Math.pow(Math.max(0, 1 - distanceFromCenter), (density * 3) + 0.3);

    // Rejection sampling: skip stars at edges based on density
    // This actually prevents stars from being placed, not just reducing jitter
    if (random.random() > densityFalloff) {
      i--; // Retry this star
      continue;
    }

    // Positional jitter also shrinks farther out,
    // so arms feel more defined at distance
    const jitter =
      ((1 - centerBias) * 60 + 10) *
      (0.4 + chaos);

    const x = Math.cos(angle) * radius + (random.random() - 0.5) * jitter;
    const y = Math.sin(angle) * radius * 0.7 + (random.random() - 0.5) * jitter;

    let tooClose = false;
    for (let j = 0; j < positions.length; j++) {
      const dx = positions[j].x - x;
      const dy = positions[j].y - y;
      if (dx * dx + dy * dy < minStarDistanceSq) {
        tooClose = true;
        break;
      }
    }

    if (tooClose) {
      continue; // ignore this star, do not add it, keep loop count
    }

    positions.push({ x, y });
  }

  return positions;
}
