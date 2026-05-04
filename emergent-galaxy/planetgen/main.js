import { createRNG } from './random.js';

const PLANET_TYPES = [
  { value: 'auto', label: 'Auto' },
  { value: 'rocky', label: 'Rocky' },
  { value: 'oceanic', label: 'Oceanic' },
  { value: 'icy', label: 'Icy' },
  { value: 'desert', label: 'Desert' },
  { value: 'lava', label: 'Lava' },
  { value: 'gas', label: 'Gas Giant' },
];

const PALETTES = {
  ash: {
    label: 'Ash',
    atmosphere: '#53b8ff',
    glow: '#ff58a8',
    ocean: ['#071c3f', '#1358a8', '#51b8ff'],
    land: ['#2f1458', '#8f3dbd', '#f39fff'],
    peaks: ['#ddd7ec', '#ffffff'],
    clouds: ['#9fe8ff', '#ffffff'],
    desert: ['#7f2f4d', '#ff7b72', '#ffd166'],
    lava: ['#35040f', '#ff315c', '#ffa24c'],
    ice: ['#a5eeff', '#f5fdff'],
    gas: ['#2b0f5e', '#7c3aed', '#ff72c6'],
  },
  jade: {
    label: 'Jade',
    atmosphere: '#38f9d7',
    glow: '#b8ff4f',
    ocean: ['#06252e', '#00a7a0', '#4dffd2'],
    land: ['#0d4b35', '#19b16b', '#b1ff87'],
    peaks: ['#d8ffe8', '#f4fff8'],
    clouds: ['#c4fff2', '#ffffff'],
    desert: ['#6a5300', '#d5a021', '#fff08a'],
    lava: ['#1f0d14', '#ff5d7d', '#ff9d5c'],
    ice: ['#bffff4', '#ffffff'],
    gas: ['#094d44', '#11c5a2', '#d9ff7a'],
  },
  ember: {
    label: 'Ember',
    atmosphere: '#ff8d2d',
    glow: '#ff2f92',
    ocean: ['#22062f', '#6f19a2', '#ff59ba'],
    land: ['#5d1800', '#ff6d1f', '#ffd166'],
    peaks: ['#ffe2c6', '#fff2e3'],
    clouds: ['#ffe3d1', '#ffffff'],
    desert: ['#763300', '#ff8f2a', '#ffe17a'],
    lava: ['#300008', '#e31b54', '#ff8a2b'],
    ice: ['#ffd6ea', '#fff1fa'],
    gas: ['#58112b', '#ff5f6d', '#ffc371'],
  },
  glacier: {
    label: 'Glacier',
    atmosphere: '#7bd8ff',
    glow: '#6f7bff',
    ocean: ['#071238', '#005cba', '#60d6ff'],
    land: ['#305a83', '#72b6ff', '#c3fdff'],
    peaks: ['#f1fbff', '#ffffff'],
    clouds: ['#edf7ff', '#ffffff'],
    desert: ['#4d5f7f', '#80a9d6', '#d6f0ff'],
    lava: ['#280714', '#ff4d6d', '#ff9770'],
    ice: ['#cbf5ff', '#ffffff'],
    gas: ['#112a7a', '#2ec5ff', '#d6f7ff'],
  },
  orchid: {
    label: 'Orchid',
    atmosphere: '#8ee3ff',
    glow: '#ff68d8',
    ocean: ['#1b1242', '#5f2dbd', '#8cf0ff'],
    land: ['#4b1f67', '#b84fe8', '#ffb3f7'],
    peaks: ['#f7e8ff', '#ffffff'],
    clouds: ['#ffd9fb', '#ffffff'],
    desert: ['#7d3e7f', '#e978b9', '#ffd58f'],
    lava: ['#3d1026', '#ff4f96', '#ffb36b'],
    ice: ['#e3d8ff', '#fff8ff'],
    gas: ['#41206d', '#d05cff', '#ffb6f4'],
  },
  citrus: {
    label: 'Citrus',
    atmosphere: '#7affb3',
    glow: '#ffd84f',
    ocean: ['#0d4032', '#0fbf81', '#9dffd1'],
    land: ['#466d12', '#9fdb32', '#f7ff85'],
    peaks: ['#f3ffd6', '#ffffff'],
    clouds: ['#efffd8', '#ffffff'],
    desert: ['#8d6900', '#e8b62c', '#fff0a2'],
    lava: ['#3e1700', '#ff7a18', '#ffd15c'],
    ice: ['#d9fff2', '#ffffff'],
    gas: ['#3e6614', '#7dff45', '#fff58f'],
  },
  coral: {
    label: 'Coral',
    atmosphere: '#7de8ff',
    glow: '#ff8b5c',
    ocean: ['#11335a', '#1580c9', '#7ef0ff'],
    land: ['#7a2a46', '#f0678f', '#ffbe78'],
    peaks: ['#fff0e3', '#ffffff'],
    clouds: ['#ffe4db', '#ffffff'],
    desert: ['#9a5a2b', '#f79c52', '#ffd48e'],
    lava: ['#46100b', '#ff5c3d', '#ffb347'],
    ice: ['#d7f7ff', '#ffffff'],
    gas: ['#7d304d', '#ff7aa2', '#ffd27d'],
  },
  toxic: {
    label: 'Toxic',
    atmosphere: '#b6ff3b',
    glow: '#36fca2',
    ocean: ['#132d14', '#1f7f2f', '#65ff7e'],
    land: ['#35510d', '#87d920', '#d4ff5d'],
    peaks: ['#f4ffd8', '#ffffff'],
    clouds: ['#ecffb6', '#ffffff'],
    desert: ['#6d6b11', '#b8c531', '#f3ff8a'],
    lava: ['#1f2208', '#72ff2d', '#d6ff61'],
    ice: ['#eaffd1', '#ffffff'],
    gas: ['#355f12', '#7dff29', '#d9ff73'],
  },
  dusk: {
    label: 'Dusk',
    atmosphere: '#6ba7ff',
    glow: '#ff8ac7',
    ocean: ['#140f38', '#3141a8', '#70b8ff'],
    land: ['#4a245d', '#9461d8', '#ff99c9'],
    peaks: ['#f2e7ff', '#ffffff'],
    clouds: ['#eadfff', '#ffffff'],
    desert: ['#875170', '#d38ab0', '#ffd09e'],
    lava: ['#341022', '#ff5f8f', '#ffb070'],
    ice: ['#d9e8ff', '#ffffff'],
    gas: ['#39236f', '#8f6bff', '#ffb0dd'],
  },
  mint: {
    label: 'Mint',
    atmosphere: '#8fffe1',
    glow: '#7bffd1',
    ocean: ['#0d3340', '#0ca5a6', '#96fff5'],
    land: ['#18553a', '#39c48d', '#b8ffd7'],
    peaks: ['#ebfff7', '#ffffff'],
    clouds: ['#ddfff4', '#ffffff'],
    desert: ['#6e7f56', '#b2ca84', '#eef9b8'],
    lava: ['#17352e', '#4effb5', '#c7ffdf'],
    ice: ['#dbfff8', '#ffffff'],
    gas: ['#165c56', '#43d8a8', '#d8fff0'],
  },
  ruby: {
    label: 'Ruby',
    atmosphere: '#ff8aa0',
    glow: '#ffd166',
    ocean: ['#2e102d', '#8d1d68', '#ff82c8'],
    land: ['#5c1010', '#c42c40', '#ff8470'],
    peaks: ['#ffe4db', '#ffffff'],
    clouds: ['#ffd9d2', '#ffffff'],
    desert: ['#8c4023', '#da7348', '#ffce8b'],
    lava: ['#3d0608', '#ff2e3f', '#ff9152'],
    ice: ['#ffe7f1', '#ffffff'],
    gas: ['#6e1832', '#ff5b7f', '#ffcf88'],
  },
  storm: {
    label: 'Storm',
    atmosphere: '#8ec5ff',
    glow: '#d0f0ff',
    ocean: ['#0f1c3a', '#294d85', '#7cb7ff'],
    land: ['#2a3f56', '#6185aa', '#c8deef'],
    peaks: ['#eef6ff', '#ffffff'],
    clouds: ['#dcecff', '#ffffff'],
    desert: ['#68788d', '#98aec0', '#dce8f0'],
    lava: ['#1e2231', '#6f8fb8', '#d8ecff'],
    ice: ['#e4f5ff', '#ffffff'],
    gas: ['#243f68', '#5f95d8', '#d4ebff'],
  },
  sunset: {
    label: 'Sunset',
    atmosphere: '#ffb36b',
    glow: '#ff5a9f',
    ocean: ['#28154d', '#7a2eb8', '#ff7fd1'],
    land: ['#7f2b1c', '#ff7a3d', '#ffd36e'],
    peaks: ['#fff0d8', '#ffffff'],
    clouds: ['#ffe3cb', '#ffffff'],
    desert: ['#9d4d1a', '#ff9d44', '#ffe08f'],
    lava: ['#41100c', '#ff4a3d', '#ffb04c'],
    ice: ['#ffe3f3', '#ffffff'],
    gas: ['#6a2351', '#ff6ca8', '#ffd07a'],
  },
  lagoon: {
    label: 'Lagoon',
    atmosphere: '#72f1ff',
    glow: '#7affc4',
    ocean: ['#082b4a', '#0d74b8', '#69e6ff'],
    land: ['#13604a', '#18b794', '#8fffd0'],
    peaks: ['#e9fff9', '#ffffff'],
    clouds: ['#d7fffb', '#ffffff'],
    desert: ['#5d8359', '#8fc38f', '#d8f4ba'],
    lava: ['#11302a', '#2cffc3', '#b2fff3'],
    ice: ['#dcfbff', '#ffffff'],
    gas: ['#0f5d80', '#26c6d8', '#bcfff8'],
  },
  royal: {
    label: 'Royal',
    atmosphere: '#8d7dff',
    glow: '#ffd56d',
    ocean: ['#18124a', '#4330c4', '#8bb1ff'],
    land: ['#35205f', '#7250db', '#c79dff'],
    peaks: ['#efe6ff', '#ffffff'],
    clouds: ['#e5dcff', '#ffffff'],
    desert: ['#7f5a49', '#c59169', '#f2d1a1'],
    lava: ['#261038', '#a34dff', '#ffcf71'],
    ice: ['#e0e3ff', '#ffffff'],
    gas: ['#2c1d6c', '#7763ff', '#e6c4ff'],
  },
  rose: {
    label: 'Rose',
    atmosphere: '#ff9db8',
    glow: '#ffcf7d',
    ocean: ['#3a1636', '#a5307b', '#ff9ad7'],
    land: ['#7a2347', '#da5387', '#ffb18f'],
    peaks: ['#ffe8ea', '#ffffff'],
    clouds: ['#ffe0e7', '#ffffff'],
    desert: ['#98635d', '#d79d8c', '#ffd8a8'],
    lava: ['#460d1d', '#ff4d79', '#ffad63'],
    ice: ['#ffe7f0', '#ffffff'],
    gas: ['#7f2e61', '#f46ca5', '#ffd291'],
  },
  aurora: {
    label: 'Aurora',
    atmosphere: '#7dffef',
    glow: '#8d89ff',
    ocean: ['#0f2240', '#1864b2', '#70d9ff'],
    land: ['#184e3f', '#27b785', '#85ff96'],
    peaks: ['#effff6', '#ffffff'],
    clouds: ['#e1fff6', '#ffffff'],
    desert: ['#5b7156', '#95bf78', '#ddf7a1'],
    lava: ['#102126', '#5fe0ff', '#a58cff'],
    ice: ['#e4ffff', '#ffffff'],
    gas: ['#1a4d76', '#4fd7b0', '#b4fff2'],
  },
};

const BAYER_4X4 = [
  [0 / 16, 8 / 16, 2 / 16, 10 / 16],
  [12 / 16, 4 / 16, 14 / 16, 6 / 16],
  [3 / 16, 11 / 16, 1 / 16, 9 / 16],
  [15 / 16, 7 / 16, 13 / 16, 5 / 16],
];

const SURPRISE_FIRST_NAMES = [
  'Aether', 'Aquila', 'Astra', 'Aurelia', 'Boreal', 'Caelum', 'Cassia', 'Cinder',
  'Corona', 'Cygnus', 'Dawn', 'Drift', 'Echo', 'Eclipse', 'Ember', 'Eos',
  'Fable', 'Flare', 'Frost', 'Glimmer', 'Halo', 'Helion', 'Horizon', 'Hyperion',
  'Ion', 'Iris', 'Juno', 'Kestrel', 'Lumen', 'Lyra', 'Mirage', 'Nebula',
  'Nereid', 'Nova', 'Nyx', 'Obsidian', 'Orion', 'Perihelion', 'Photon', 'Pyre',
  'Quasar', 'Radiant', 'Rift', 'Sable', 'Solstice', 'Static', 'Storm', 'Sundrift',
  'Tundra', 'Umbra', 'Vanta', 'Vega', 'Velora', 'Verdant', 'Viridian', 'Zenith',
];

const SURPRISE_LAST_NAMES = [
  'Alpha', 'Archive', 'Atlas', 'Bloom', 'Choir', 'Crest', 'Crown', 'Delta',
  'Drift', 'Ember', 'Estate', 'Expanse', 'Fall', 'Field', 'Forge', 'Frontier',
  'Gate', 'Grove', 'Harbor', 'Haven', 'Heights', 'Hollow', 'Lab', 'Lagoon',
  'Lattice', 'Mire', 'Monolith', 'Reach', 'Ridge', 'Rise', 'Sanctum', 'Shard',
  'Shore', 'Spindle', 'Spire', 'Steppe', 'Strand', 'Throne', 'Vale', 'Veil',
  'Vista', 'Wake', 'Wilds', 'Wisp', 'Basin', 'Breach', 'Summit', 'Run', 'Cairn',
  'Crossing', 'Bastion', 'Circuit', 'Garden', 'Mirror', 'Cradle',
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a || 1), 0, 1);
  return t * t * (3 - 2 * t);
}

function rotateY(vector, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: vector.x * cos - vector.z * sin,
    y: vector.y,
    z: vector.x * sin + vector.z * cos,
  };
}

function normalize(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function parseHex(hex) {
  const normalized = hex.replace('#', '');
  const full = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized;
  const value = Number.parseInt(full, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function mixColor(a, b, t) {
  return {
    r: Math.round(lerp(a.r, b.r, t)),
    g: Math.round(lerp(a.g, b.g, t)),
    b: Math.round(lerp(a.b, b.b, t)),
  };
}

function scaleColor(color, amount) {
  return {
    r: Math.round(clamp(color.r * amount, 0, 255)),
    g: Math.round(clamp(color.g * amount, 0, 255)),
    b: Math.round(clamp(color.b * amount, 0, 255)),
  };
}

function shiftColor(color, amount) {
  return {
    r: clamp(Math.round(color.r + amount.r), 0, 255),
    g: clamp(Math.round(color.g + amount.g), 0, 255),
    b: clamp(Math.round(color.b + amount.b), 0, 255),
  };
}

function pickPalette(seedKey, forcedPalette) {
  if (forcedPalette !== 'auto') {
    return {
      key: forcedPalette,
      ...PALETTES[forcedPalette],
    };
  }

  const rng = createRNG(`${seedKey}:palette`);
  const key = Object.keys(PALETTES)[rng.randomInt(0, Object.keys(PALETTES).length - 1)];
  return {
    key,
    ...PALETTES[key],
  };
}

function hash3(x, y, z, seed) {
  let value = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ seed;
  value = (value ^ (value >>> 13)) >>> 0;
  value = Math.imul(value, 1274126177) >>> 0;
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function valueNoise3(x, y, z, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const xf = x - x0;
  const yf = y - y0;
  const zf = z - z0;
  const u = fade(xf);
  const v = fade(yf);
  const w = fade(zf);

  const c000 = hash3(x0, y0, z0, seed);
  const c100 = hash3(x0 + 1, y0, z0, seed);
  const c010 = hash3(x0, y0 + 1, z0, seed);
  const c110 = hash3(x0 + 1, y0 + 1, z0, seed);
  const c001 = hash3(x0, y0, z0 + 1, seed);
  const c101 = hash3(x0 + 1, y0, z0 + 1, seed);
  const c011 = hash3(x0, y0 + 1, z0 + 1, seed);
  const c111 = hash3(x0 + 1, y0 + 1, z0 + 1, seed);

  const x00 = lerp(c000, c100, u);
  const x10 = lerp(c010, c110, u);
  const x01 = lerp(c001, c101, u);
  const x11 = lerp(c011, c111, u);
  const y0Mix = lerp(x00, x10, v);
  const y1Mix = lerp(x01, x11, v);

  return lerp(y0Mix, y1Mix, w);
}

function fbm(point, seed, octaves, lacunarity, gain) {
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;
  let max = 0;

  for (let index = 0; index < octaves; index += 1) {
    total += valueNoise3(
      point.x * frequency,
      point.y * frequency,
      point.z * frequency,
      seed + index * 977
    ) * amplitude;
    max += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return total / (max || 1);
}

function createDescriptor(name, controls) {
  const safeName = (name || 'Aurelia').trim() || 'Aurelia';
  const typeRng = createRNG(`${safeName}:type`);
  const chosenType = controls.type === 'auto'
    ? PLANET_TYPES[typeRng.randomInt(1, PLANET_TYPES.length - 1)].value
    : controls.type;
  const palette = pickPalette(`${safeName}:${chosenType}`, controls.palette);
  const rng = createRNG(`${safeName}:${chosenType}:surface`);

  const variationRng = createRNG(`${safeName}:${chosenType}:variation`);
  const baseRadius = variationRng.randomInt(50, 58);
  const baseClouds = variationRng.randomInt(14, 82);
  const radius = controls.autoSize
    ? baseRadius
    : clamp(Math.round(controls.size), 50, 62);
  const cloudCover = clamp(baseClouds / 100, 0, 1);

  const descriptor = {
    seedKey: safeName,
    name: safeName,
    type: chosenType,
    palette,
    radius,
    rotationSpeed: 0.08 + rng.random() * 0.18,
    terrainSeed: rng.randomInt(1, 2147483646),
    cloudSeed: rng.randomInt(1, 2147483646),
    bandSeed: rng.randomInt(1, 2147483646),
    colorSeed: rng.randomInt(1, 2147483646),
    rimWarmth: rng.random(),
    cloudCover,
    cloudDensity: 0.8 + rng.random() * 0.7,
    surfaceContrast: 0.88 + rng.random() * 0.44,
    hueDrift: {
      r: rng.randomInt(-18, 18),
      g: rng.randomInt(-18, 18),
      b: rng.randomInt(-18, 18),
    },
    waterLevel: 0.43 + (rng.random() - 0.5) * 0.18,
    landBias: rng.random() * 0.25 - 0.125,
    atmosphere: clamp(controls.atmosphere, 0, 100) / 100,
    atmosphereTint: 0.28 + rng.random() * 0.42,
    atmosphereReach: 0.06 + rng.random() * 0.06,
    cloudShellAltitude: 0.04 + clamp(controls.cloudDistance, 0, 100) / 100 * 0.18,
    cloudShellDrift: 0.12 + rng.random() * 0.28,
    cloudColor: controls.cloudColor,
    banding: 0.18 + rng.random() * 0.42,
    ring: Boolean(controls.rings),
    ringTilt: -0.5 + rng.random() * 1,
    ringSpinSpeed: 0.168 + rng.random() * 0.168,
    ringSeed: rng.randomInt(1, 2147483646),
    ringPaletteMix: rng.random(),
    ringBrightness: 0.8 + rng.random() * 0.45,
    lightTarget: controls.autoLight
      ? {
          x: 0.76 + rng.random() * 0.08,
          y: 0.68 + rng.random() * 0.08,
        }
      : controls.lightTarget,
    seededRadius: baseRadius,
    seededCloudCover: baseClouds,
  };

  if (chosenType === 'oceanic') {
    descriptor.waterLevel = 0.58 + rng.random() * 0.12;
  }
  if (chosenType === 'desert') {
    descriptor.waterLevel = 0.24 + rng.random() * 0.09;
  }
  if (chosenType === 'icy') {
    descriptor.waterLevel = 0.46 + rng.random() * 0.12;
    descriptor.cloudCover = Math.max(descriptor.cloudCover, 0.36);
  }
  if (chosenType === 'lava') {
    descriptor.waterLevel = 0.08 + rng.random() * 0.06;
  }
  if (chosenType === 'gas') {
    descriptor.waterLevel = 1;
    descriptor.cloudCover = Math.max(descriptor.cloudCover, 0.28);
  }

  descriptor.seedDisplay = safeName.toLowerCase().replace(/\s+/g, '-');
  return descriptor;
}

function chooseSurfaceColor(descriptor, elevation, humidity, temperature, cloudMask) {
  const palette = descriptor.palette;
  const oceanDark = parseHex(palette.ocean[0]);
  const oceanMid = parseHex(palette.ocean[1]);
  const oceanLight = parseHex(palette.ocean[2]);
  const landDark = parseHex(palette.land[0]);
  const landMid = parseHex(palette.land[1]);
  const landLight = parseHex(palette.land[2]);
  const peakBase = parseHex(palette.peaks[0]);
  const peakBright = parseHex(palette.peaks[1]);
  const desertDark = parseHex(palette.desert[0]);
  const desertMid = parseHex(palette.desert[1]);
  const desertLight = parseHex(palette.desert[2]);
  const lavaDark = parseHex(palette.lava[0]);
  const lavaMid = parseHex(palette.lava[1]);
  const lavaLight = parseHex(palette.lava[2]);
  const iceBase = parseHex(palette.ice[0]);
  const iceBright = parseHex(palette.ice[1]);
  const accentWarm = parseHex(palette.glow);
  const accentCool = parseHex(palette.atmosphere);
  const colorDrift = descriptor.hueDrift;

  if (descriptor.type === 'gas') {
    const gasA = parseHex(palette.gas[0]);
    const gasB = parseHex(palette.gas[1]);
    const gasC = parseHex(palette.gas[2]);
    const swirl = Math.sin((humidity * 8.2 + temperature * 4.1 + elevation * 5.4) * Math.PI);
    const storm = smoothstep(0.62, 0.94, humidity * 0.7 + cloudMask * 0.45);
    const bandMix = clamp(elevation * 0.45 + humidity * 0.32 + swirl * 0.23, 0, 1);
    const baseBand = bandMix < 0.5
      ? mixColor(gasA, gasB, bandMix * 2)
      : mixColor(gasB, gasC, (bandMix - 0.5) * 2);
    const stormLayer = mixColor(accentCool, parseHex(palette.clouds[1]), storm * 0.72);
    const stormTint = shiftColor(
      mixColor(baseBand, stormLayer, 0.14 + storm * 0.36),
      {
        r: colorDrift.r * 0.5,
        g: colorDrift.g * 0.5,
        b: colorDrift.b * 0.5,
      }
    );
    return stormTint;
  }

  const waterLevel = descriptor.waterLevel;
  if (elevation < waterLevel) {
    const seaMix = smoothstep(waterLevel - 0.22, waterLevel, elevation);
    const oceanColor = seaMix < 0.5
      ? mixColor(oceanDark, oceanMid, seaMix * 2)
      : mixColor(oceanMid, oceanLight, (seaMix - 0.5) * 2);
    return mixColor(oceanColor, accentCool, humidity * 0.1 + temperature * 0.06);
  }

  if (descriptor.type === 'lava') {
    const magmaMix = smoothstep(waterLevel, 1, elevation + humidity * 0.2);
    const magmaColor = magmaMix < 0.5
      ? mixColor(lavaDark, lavaMid, magmaMix * 2)
      : mixColor(lavaMid, lavaLight, (magmaMix - 0.5) * 2);
    return mixColor(magmaColor, accentWarm, 0.08 + temperature * 0.18);
  }

  if (descriptor.type === 'icy') {
    const frost = smoothstep(0.3, 0.85, 1 - temperature + humidity * 0.2 + elevation * 0.25);
    return mixColor(mixColor(iceBase, accentCool, 0.1), iceBright, frost);
  }

  if (descriptor.type === 'desert') {
    const duneMix = smoothstep(waterLevel, 1, elevation * 0.9 + (1 - humidity) * 0.35);
    const duneColor = duneMix < 0.5
      ? mixColor(desertDark, desertMid, duneMix * 2)
      : mixColor(desertMid, desertLight, (duneMix - 0.5) * 2);
    return mixColor(duneColor, accentWarm, 0.06 + temperature * 0.12);
  }

  if (descriptor.type === 'oceanic') {
    const coast = smoothstep(waterLevel, waterLevel + 0.12, elevation);
    const lush = mixColor(landDark, landLight, clamp(humidity * 0.82 + coast * 0.36, 0, 1));
    const tintedLush = mixColor(lush, accentCool, humidity * 0.12);
    return elevation > 0.84 ? mixColor(peakBase, peakBright, smoothstep(0.84, 1, elevation)) : tintedLush;
  }

  const arid = 1 - humidity;
  const landBase = arid > 0.58
    ? mixColor(desertDark, desertLight, clamp((elevation - waterLevel) * 1.3 + arid * 0.32, 0, 1))
    : mixColor(landDark, landMid, clamp((elevation - waterLevel) * 1.15 + humidity * 0.28, 0, 1));
  const alpine = smoothstep(0.8, 0.98, elevation + temperature * -0.1);
  const biomeAccent = humidity > 0.56
    ? accentCool
    : temperature > 0.62
      ? accentWarm
      : mixColor(accentWarm, accentCool, 0.5);
  const baseTinted = mixColor(landBase, biomeAccent, 0.1 + Math.abs(humidity - 0.5) * 0.16 + temperature * 0.06);
  const resolved = alpine > 0
    ? mixColor(landBase, mixColor(peakBase, peakBright, alpine), alpine)
    : baseTinted;
  return shiftColor(resolved, {
    r: colorDrift.r * 0.28,
    g: colorDrift.g * 0.28,
    b: colorDrift.b * 0.28,
  });
}

function quantizeColor(color, brightness, threshold) {
  const shaded = scaleColor(color, brightness);
  const channels = [shaded.r, shaded.g, shaded.b].map((channel) => {
    const scaled = channel / 255 * 4;
    const base = Math.floor(scaled);
    const remainder = scaled - base;
    const quantized = remainder > threshold ? base + 1 : base;
    return Math.round((clamp(quantized, 0, 4) / 4) * 255);
  });

  return {
    r: channels[0],
    g: channels[1],
    b: channels[2],
  };
}

function sampleSimpleRing(dx, dy, descriptor, phase) {
  if (!descriptor.ring) {
    return null;
  }

  const cos = Math.cos(descriptor.ringTilt);
  const sin = Math.sin(descriptor.ringTilt);
  const xRot = dx * cos + dy * sin;
  const yRot = -dx * sin + dy * cos;
  const ringX = xRot / 1.44;
  const ringY = yRot / 0.48;
  const wobbleNoise = fbm(
    {
      x: ringX * 5.6 + Math.cos(phase) * 0.8,
      y: ringY * 7.4 + Math.sin(phase) * 0.7,
      z: Math.atan2(ringY, ringX) * 1.1,
    },
    descriptor.ringSeed + 77,
    3,
    2.3,
    0.55
  );
  const wobble = (wobbleNoise - 0.5) * 0.12;
  const ringRadius = Math.hypot(ringX, ringY) + wobble;
  const inner = 0.94;
  const outer = 1.42;

  if (ringRadius < inner || ringRadius > outer) {
    return null;
  }

  const radialT = clamp((ringRadius - inner) / (outer - inner), 0, 1);
  const angular = Math.atan2(ringY, ringX);
  const edgeWarp = 0.08 + (wobbleNoise - 0.5) * 0.06;
  const edgeFade = smoothstep(0, 0.1 + edgeWarp, radialT) * smoothstep(1, 0.88 - edgeWarp, radialT);
  const rotationPhase = phase * 1.35;
  const spinAngle = angular + rotationPhase;
  const stripeA = 0.5 + 0.5 * Math.sin(spinAngle * 9 + radialT * 12);
  const stripeB = 0.5 + 0.5 * Math.cos(spinAngle * 17 + radialT * 23);
  const textureNoise = fbm(
    {
      x: Math.cos(spinAngle) * ringRadius * 8.8 + radialT * 2.8,
      y: Math.sin(spinAngle) * ringRadius * 18.8 + radialT * 3.6,
      z: radialT * 10.2 + spinAngle * 1.4,
    },
    descriptor.ringSeed,
    4,
    2.2,
    0.58
  );
  const grainNoise = fbm(
    {
      x: Math.cos(spinAngle * 1.1) * ringRadius * 16.2 - radialT * 4.2,
      y: Math.sin(spinAngle * 1.1) * ringRadius * 25.4 + radialT * 5.4,
      z: spinAngle * 2 + radialT * 12.6,
    },
    descriptor.ringSeed + 404,
    3,
    2.6,
    0.54
  );
  const alphaNoiseField = fbm(
    {
      x: Math.cos(spinAngle * 0.9) * ringRadius * 22.4 + radialT * 7.2,
      y: Math.sin(spinAngle * 0.9) * ringRadius * 31.2 - radialT * 6.1,
      z: spinAngle * 2.8 + radialT * 18.4,
    },
    descriptor.ringSeed + 909,
    3,
    2.4,
    0.52
  );
  const breakupNoise = fbm(
    {
      x: Math.cos(spinAngle * 1.4) * ringRadius * 28.4 + radialT * 8.6,
      y: Math.sin(spinAngle * 1.4) * ringRadius * 34.8 - radialT * 7.1,
      z: spinAngle * 3.4 + radialT * 21.2,
    },
    descriptor.ringSeed + 1337,
    4,
    2.5,
    0.5
  );
  const stripe = clamp(stripeA * 0.24 + stripeB * 0.14 + textureNoise * 0.34 + grainNoise * 0.46, 0, 1);
  const baseA = parseHex(descriptor.palette.land[0]);
  const baseB = parseHex(descriptor.palette.land[2]);
  const baseC = parseHex(descriptor.palette.ocean[1]);
  const baseD = parseHex(descriptor.palette.ocean[2]);
  const baseE = parseHex(descriptor.palette.clouds[0]);
  const baseF = parseHex(descriptor.palette.peaks[0]);
  const colorA = mixColor(baseA, baseB, 0.34 + descriptor.ringPaletteMix * 0.24);
  const colorB = mixColor(baseC, baseD, 0.38 + (1 - descriptor.ringPaletteMix) * 0.22);
  const colorC = mixColor(baseE, baseF, 0.28 + grainNoise * 0.14);
  const colorD = mixColor(colorA, colorB, 0.42 + stripeA * 0.22);
  const colorBand = stripe < 0.33
    ? mixColor(colorA, colorD, stripe / 0.33)
    : stripe < 0.66
      ? mixColor(colorD, colorB, (stripe - 0.33) / 0.33)
      : mixColor(colorB, colorC, (stripe - 0.66) / 0.34);
  const color = scaleColor(
    mixColor(colorBand, colorC, 0.18 + grainNoise * 0.28),
    descriptor.ringBrightness * (0.84 + textureNoise * 0.16 + grainNoise * 0.12)
  );
  const alphaNoise = clamp(0.28 + alphaNoiseField * 0.78 + (breakupNoise - 0.5) * 0.38, 0, 1);
  const softness = smoothstep(0.08, 0.82, alphaNoise);
  const fringeFade = 1 - smoothstep(0.82, 1, Math.abs(wobble) * 8.4 + Math.abs(radialT - 0.5) * 1.05);
  const holeFade = smoothstep(0.16, 0.72, alphaNoise);
  const opacityMask = edgeFade * softness * fringeFade * holeFade * (0.56 + stripe * 0.22);

  return {
    front: yRot > 0,
    color,
    alpha: clamp(opacityMask, 0, 1),
  };
}

function renderSimpleRing(ctx, descriptor, metrics, phase, side, darkMode) {
  if (!descriptor.ring) {
    return;
  }

  const xRadius = Math.ceil(metrics.radius * 1.92);
  const yRadius = Math.ceil(metrics.radius * 1.04);
  const pixelScale = Math.max(1, Math.round(metrics.radius / descriptor.radius));
  const width = Math.max(28, Math.ceil((xRadius * 2) / pixelScale));
  const height = Math.max(18, Math.ceil((yRadius * 2) / pixelScale));
  const ringCanvas = document.createElement('canvas');
  ringCanvas.width = width;
  ringCanvas.height = height;
  const ringCtx = ringCanvas.getContext('2d');
  ringCtx.imageSmoothingEnabled = false;
  const imageData = ringCtx.createImageData(width, height);
  const pixels = imageData.data;

  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const canvasX = metrics.center - xRadius + (px + 0.5) * pixelScale;
      const canvasY = metrics.center - yRadius + (py + 0.5) * pixelScale;
      const dx = (canvasX - metrics.center) / metrics.radius;
      const dy = (canvasY - metrics.center) / metrics.radius;
      const distanceSq = dx * dx + dy * dy;
      if (side === 'back' && distanceSq <= 1) {
        continue;
      }
      const sample = sampleSimpleRing(dx, dy, descriptor, phase);

      if (!sample || sample.front !== (side === 'front')) {
        continue;
      }

      const pixelIndex = (py * width + px) * 4;
      const shaded = darkMode
        ? mixColor(sample.color, { r: 0, g: 0, b: 0 }, 0.08)
        : sample.color;
      pixels[pixelIndex] = shaded.r;
      pixels[pixelIndex + 1] = shaded.g;
      pixels[pixelIndex + 2] = shaded.b;
      pixels[pixelIndex + 3] = Math.round(255 * clamp(sample.alpha, 0, 1));
    }
  }

  ringCtx.putImageData(imageData, 0, 0);
  ctx.drawImage(
    ringCanvas,
    Math.round(metrics.center - xRadius),
    Math.round(metrics.center - yRadius),
    width * pixelScale,
    height * pixelScale
  );
}

function renderPlanetSprite(ctx, descriptor, rotation, size, options = {}) {
  const imageData = ctx.createImageData(size, size);
  const pixels = imageData.data;
  const center = size / 2;
  const radius = descriptor.radius;
  const stableForGif = Boolean(options.stableForGif);
  const lightTarget = getLightTargetFromDiskPosition(
    descriptor.lightTarget.x * 2 - 1,
    descriptor.lightTarget.y * 2 - 1
  ) ?? { x: 0.68, y: 0.62, z: 0.39 };
  const light = normalize(lightTarget);
  const paletteGlow = parseHex(descriptor.palette.glow);
  const atmosphereColor = parseHex(descriptor.palette.atmosphere);
  const cloudBright = parseHex(descriptor.cloudColor || descriptor.palette.clouds[1]);
  const cloudDark = mixColor(parseHex(descriptor.palette.clouds[0]), cloudBright, 0.44);
  const shellRadius = 1 + descriptor.cloudShellAltitude;
  const shellRadiusSq = shellRadius * shellRadius;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x + 0.5 - center) / radius;
      const dy = (y + 0.5 - center) / radius;
      const distanceSq = dx * dx + dy * dy;
      const index = (y * size + x) * 4;
      let shellPatch = 0;
      let shellLight = 0;
      let shellNight = 0;
      let shellAlpha = 0;
      let shellColor = null;

      if (distanceSq <= shellRadiusSq) {
        const shellDz = Math.sqrt(Math.max(0, shellRadiusSq - distanceSq)) / shellRadius;
        const shellNormal = normalize({ x: dx / shellRadius, y: dy / shellRadius, z: shellDz });
        const shellRotated = rotateY(shellNormal, rotation * (1 + descriptor.cloudShellDrift));
        const shellCloudPoint = {
          x: shellRotated.x * 5.1 + rotation * 0.55,
          y: shellRotated.y * 5.1 + 41.7,
          z: shellRotated.z * 5.1 + 13.4,
        };
        const shellNoise = fbm(shellCloudPoint, descriptor.cloudSeed + 1337, 4, 2.08, 0.58);
        shellPatch = smoothstep(
          0.66 - descriptor.atmosphere * 0.24,
          1,
          shellNoise * (0.98 + descriptor.cloudDensity * 0.22)
        );
        shellLight = Math.max(0, dot(shellNormal, light));
        shellNight = smoothstep(0.3, -0.95, dot(shellNormal, light));
        shellColor = mixColor(
          mixColor(cloudDark, atmosphereColor, 0.7),
          mixColor(cloudBright, paletteGlow, 0.44),
          0.56 + shellLight * 0.3
        );
      }

      if (distanceSq > 1) {
        if (distanceSq <= shellRadiusSq) {
          const shellEdge = smoothstep(shellRadius, 1.002, Math.sqrt(distanceSq));
          shellAlpha = shellPatch * shellEdge * descriptor.atmosphere * (1.18 + shellLight * 1.26) * (1 - shellNight * 0.96);
          pixels[index] = Math.round(shellColor.r);
          pixels[index + 1] = Math.round(shellColor.g);
          pixels[index + 2] = Math.round(shellColor.b);
          pixels[index + 3] = Math.round(255 * clamp(shellAlpha, 0, 1));
        } else {
          const distance = Math.sqrt(distanceSq);
          const edgeDelta = Math.abs(distance - 1);
          const auraReach = descriptor.atmosphereReach + descriptor.atmosphere * 0.08;
          if (edgeDelta < auraReach) {
            const aura = smoothstep(auraReach, 0, edgeDelta) * descriptor.atmosphere * 0.22;
            const auraColor = mixColor(atmosphereColor, paletteGlow, 0.42);
            pixels[index] = Math.round(auraColor.r * aura);
            pixels[index + 1] = Math.round(auraColor.g * aura);
            pixels[index + 2] = Math.round(auraColor.b * aura);
            pixels[index + 3] = Math.round(255 * aura);
          }
        }
        continue;
      }

      const dz = Math.sqrt(1 - distanceSq);
      const normal = normalize({ x: dx, y: dy, z: dz });
      const rotated = rotateY(normal, rotation);
      const terrainPoint = {
        x: rotated.x * 2.2 + 7.37,
        y: rotated.y * 2.2 + 19.11,
        z: rotated.z * 2.2 + 4.53,
      };
      const humidityPoint = {
        x: rotated.x * 3.9 + 16.73,
        y: rotated.y * 3.9 + 9.17,
        z: rotated.z * 3.9 + 12.43,
      };
      const cloudPoint = {
        x: rotated.x * 4.9 + rotation * (0.42 + descriptor.cloudShellDrift * 0.4),
        y: rotated.y * 4.9 + 25.13,
        z: rotated.z * 4.9 + 2.71,
      };

      const terrainNoise = fbm(terrainPoint, descriptor.terrainSeed, 5, 2, 0.54);
      const detailNoise = fbm(
        { x: terrainPoint.x * 2.1, y: terrainPoint.y * 2.1, z: terrainPoint.z * 2.1 },
        descriptor.terrainSeed + 404,
        3,
        2.4,
        0.5
      );
      const humidity = fbm(humidityPoint, descriptor.terrainSeed + 900, 4, 2, 0.58);
      const cloudNoise = fbm(cloudPoint, descriptor.cloudSeed, 4, 2.1, 0.57);
      const colorNoise = fbm(
        { x: rotated.x * 5.8 + 14.2, y: rotated.y * 5.8 + 7.1, z: rotated.z * 5.8 + 21.4 },
        descriptor.colorSeed,
        3,
        2.3,
        0.5
      );
      const accentNoise = fbm(
        { x: rotated.x * 8.1 + 5.2, y: rotated.y * 8.1 + 17.4, z: rotated.z * 8.1 + 29.1 },
        descriptor.colorSeed + 222,
        2,
        2.7,
        0.55
      );
      const latBands = Math.sin((rotated.y * 8 + descriptor.bandSeed * 0.000001) * Math.PI);
      const equatorWarmth = 1 - Math.abs(rotated.y);
      const temperature = clamp(0.56 + equatorWarmth * 0.34 - Math.abs(rotated.y) * 0.42, 0, 1);

      let elevation = terrainNoise * 0.72 + detailNoise * 0.28 + descriptor.landBias;
      if (descriptor.type === 'gas') {
        const stormBands = Math.sin((rotated.y * 6.2 + rotated.x * 2.8 + rotated.z * 1.8) * Math.PI + terrainNoise * 6);
        const vortex = Math.sin((Math.atan2(rotated.y, rotated.x) + terrainNoise * 2.6) * 5 + rotated.z * 4.5);
        elevation = clamp(
          0.5
            + latBands * descriptor.banding * 0.2
            + stormBands * 0.22
            + vortex * 0.16
            + (terrainNoise - 0.5) * 0.22
            + (cloudNoise - 0.5) * 0.26,
          0,
          1
        );
      }

      const cloudMask = clamp(
        smoothstep(0.68 - descriptor.atmosphere * 0.18, 1, cloudNoise * (0.82 + descriptor.cloudDensity * 0.2)) * (0.44 + equatorWarmth * 0.38),
        0,
        1
      );

      let baseColor = chooseSurfaceColor(descriptor, elevation, humidity, temperature, cloudMask);
      const varianceTint = colorNoise - 0.5;
      const chromaBands = Math.sin((rotated.x * 5.4 + rotated.y * 3.1 + rotated.z * 4.7) * Math.PI);
      const warmCoolShift = (humidity - 0.5) * 22 + chromaBands * 10 + (accentNoise - 0.5) * 24;
      baseColor = shiftColor(baseColor, {
        r: varianceTint * 50 + warmCoolShift + descriptor.hueDrift.r * 0.28,
        g: varianceTint * 34 - chromaBands * 12 + (accentNoise - 0.5) * 16 + descriptor.hueDrift.g * 0.26,
        b: -varianceTint * 46 - warmCoolShift + descriptor.hueDrift.b * 0.28,
      });

      const diffuseRaw = dot(normal, light);
      const diffuse = Math.max(0, diffuseRaw);
      const light2DLength = Math.hypot(light.x, light.y) || 1;
      const light2DX = light.x / light2DLength;
      const light2DY = light.y / light2DLength;
      const parallel = dx * light2DX + dy * light2DY;
      const perpendicular = dx * -light2DY + dy * light2DX;
      const terminatorCurve =
        perpendicular * perpendicular * (0.24 + (1 - light.z) * 0.24) * (0.44 + (1 - dz) * 0.32);
      const curvedDiffuse = diffuseRaw - terminatorCurve;
      const night = smoothstep(0.6, -0.98, curvedDiffuse);
      const rim = Math.pow(1 - dz, 1.9) * (0.28 + descriptor.rimWarmth * 0.18);
      const shadow = smoothstep(-0.92, 0.86, curvedDiffuse);
      const brightness = (0.018 + shadow * 0.77 + rim) * descriptor.surfaceContrast;
      const ditherThreshold = stableForGif ? 0.5 : BAYER_4X4[y % 4][x % 4];
      let finalColor = quantizeColor(baseColor, brightness, ditherThreshold);
      let alpha = 255;

      if (night > 0.02) {
        const shadowMix = descriptor.darkMode
          ? clamp(smoothstep(0.08, 0.92, night), 0, 1)
          : Math.min(0.92, night * 0.96);
        finalColor = mixColor(finalColor, { r: 0, g: 0, b: 0 }, shadowMix);
      }

      if (cloudMask > 0.04) {
        const cloudBase = mixColor(cloudDark, cloudBright, 0.36 + cloudMask * 0.64);
        const litCloud = mixColor(mixColor(cloudBase, atmosphereColor, 0.42), paletteGlow, 0.16);
        const cloudOpacity = cloudMask * descriptor.atmosphere * 0.04 * (1 - night * 0.96);
        finalColor = mixColor(finalColor, litCloud, cloudOpacity);
      }

      if (shellPatch > 0.04 && shellColor) {
        const shellSurfaceOpacity = shellPatch * descriptor.atmosphere * (0.48 + shellLight * 0.48) * (1 - shellNight * 0.92);
        finalColor = mixColor(finalColor, shellColor, clamp(shellSurfaceOpacity, 0, 0.86));
      }

      const limbGlow = Math.pow(1 - dz, 1.72) * descriptor.atmosphere * 0.22 * (1 - night * 0.82);
      if (limbGlow > 0.01) {
        finalColor = mixColor(finalColor, mixColor(atmosphereColor, paletteGlow, 0.6), limbGlow);
      }

      const terminatorGlow = smoothstep(-0.18, 0.2, curvedDiffuse) * 0.08 * descriptor.atmosphere * (1 - night * 0.82);
      if (terminatorGlow > 0.01) {
        finalColor = mixColor(finalColor, atmosphereColor, terminatorGlow);
      }

      if (descriptor.darkMode && night > 0.72) {
        finalColor = { r: 0, g: 0, b: 0 };
      }

      if (descriptor.darkMode) {
        alpha = Math.round(255 * clamp(1 - smoothstep(0.18, 0.96, night) * 1.04, 0, 1));
        if (limbGlow > 0.01) {
          alpha = Math.max(alpha, Math.round(255 * clamp(limbGlow * 1.28, 0, 1)));
        }
      }

      pixels[index] = finalColor.r;
      pixels[index + 1] = finalColor.g;
      pixels[index + 2] = finalColor.b;
      pixels[index + 3] = alpha;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

function drawBackdrop(ctx, width, height, rng, time, darkMode, options = {}) {
  const animated = options.animated !== false;
  const simplified = options.simplified === true;
  ctx.clearRect(0, 0, width, height);
  if (darkMode || simplified) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    if (simplified) {
      return;
    }
    return;
  }
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#070b18');
  gradient.addColorStop(0.55, '#0b1330');
  gradient.addColorStop(1, '#120f20');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  for (let index = 0; index < 90; index += 1) {
    const x = rng.random() * width;
    const y = rng.random() * height;
    const radius = rng.random() > 0.92 ? 2 : 1;
    const twinkle = animated
      ? 0.45 + 0.55 * Math.sin(time * 0.0013 + index * 2.17)
      : 0.82;
    ctx.fillStyle = `rgba(255,255,255,${0.16 + twinkle * 0.72})`;
    ctx.fillRect(Math.round(x), Math.round(y), radius, radius);
  }

  ctx.globalCompositeOperation = 'screen';
  const haze = ctx.createRadialGradient(width * 0.72, height * 0.28, 0, width * 0.72, height * 0.28, width * 0.46);
  haze.addColorStop(0, 'rgba(69, 126, 255, 0.22)');
  haze.addColorStop(0.65, 'rgba(69, 126, 255, 0.05)');
  haze.addColorStop(1, 'rgba(69, 126, 255, 0)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';
}

function updateQuery(name, type, palette) {
  const url = new URL(window.location.href);
  url.searchParams.set('name', name);
  if (type === 'auto') {
    url.searchParams.delete('type');
  } else {
    url.searchParams.set('type', type);
  }
  if (palette === 'auto') {
    url.searchParams.delete('palette');
  } else {
    url.searchParams.set('palette', palette);
  }
  window.history.replaceState({}, '', url);
}

function randomSurpriseName() {
  const rng = createRNG(`surprise:${Date.now()}`);
  const first = SURPRISE_FIRST_NAMES[rng.randomInt(0, SURPRISE_FIRST_NAMES.length - 1)];
  const last = SURPRISE_LAST_NAMES[rng.randomInt(0, SURPRISE_LAST_NAMES.length - 1)];
  const suffix = rng.randomInt(2, 999);
  return `${first} ${last} ${suffix}`;
}

function getLightTargetFromDiskPosition(x, y) {
  const lengthSq = x * x + y * y;
  if (lengthSq > 1) {
    return null;
  }

  return {
    x,
    y,
    z: Math.sqrt(Math.max(0, 1 - lengthSq)),
  };
}

function getPlanetRenderMetrics(descriptor, spriteSize, canvasSize) {
  const scale = 3.1;
  return {
    scale,
    center: canvasSize / 2,
    radius: descriptor.radius * scale,
    drawSize: spriteSize * scale,
  };
}

function createPlanetGeneratorPage(container) {
  container.textContent = '';
  container.className = 'planet-gen-app';

  const params = new URLSearchParams(window.location.search);
  const initialName = params.get('name') || 'Aurelia';
  const initialType = params.get('type') || 'auto';
  const initialPalette = params.get('palette') || 'auto';

  container.innerHTML = `
    <section class="planet-gen-shell">
      <div class="planet-gen-hero">
        <p class="planet-gen-eyebrow">Secret Lab / Planet Gen MVP</p>
        <h1>Procedural pixel planets from a seed name.</h1>
        <p class="planet-gen-copy">
          Rough first pass for a future planet view: spherical noise, palette-based biomes,
          old-school dithering, and deterministic generation from the name.
        </p>
      </div>
      <div class="planet-gen-layout">
        <aside class="planet-gen-panel planet-gen-panel--controls">
          <label class="planet-gen-field">
            <span>Planet name</span>
            <input id="planet-gen-name" type="text" spellcheck="false" />
          </label>
          <div class="planet-gen-row">
            <label class="planet-gen-field">
              <span>Style</span>
              <select id="planet-gen-type">
                ${PLANET_TYPES.map((option) => `
                  <option value="${option.value}" ${option.value === initialType ? 'selected' : ''}>${option.label}</option>
                `).join('')}
              </select>
            </label>
            <label class="planet-gen-field">
              <span>Palette</span>
              <select id="planet-gen-palette">
                <option value="auto" ${initialPalette === 'auto' ? 'selected' : ''}>Auto</option>
                ${Object.entries(PALETTES).map(([key, palette]) => `
                  <option value="${key}" ${key === initialPalette ? 'selected' : ''}>${palette.label}</option>
                `).join('')}
              </select>
            </label>
          </div>
          <label class="planet-gen-field">
            <span>Theme</span>
            <label class="planet-gen-toggle">
              <input id="planet-gen-dark-mode" type="checkbox" checked />
              <span>Dark mode: black space + transparent night side</span>
            </label>
          </label>
          <details class="planet-gen-extras">
            <summary>Experimental</summary>
            <div class="planet-gen-extras-body">
              <div class="planet-gen-extra-card">
                <div class="planet-gen-extra-head">
                  <span>Planet size <strong id="planet-gen-size-value">54</strong></span>
                </div>
                <label class="planet-gen-toggle">
                  <input id="planet-gen-auto-size" type="checkbox" checked />
                  <span>Seeded auto size</span>
                </label>
                <input id="planet-gen-size" type="range" min="50" max="62" step="1" value="54" />
              </div>
              <div class="planet-gen-extra-card">
                <div class="planet-gen-extra-head">
                  <span>Sun target <strong id="planet-gen-light-value">Auto</strong></span>
                </div>
                <label class="planet-gen-toggle">
                  <input id="planet-gen-auto-light" type="checkbox" checked />
                  <span>Seeded auto light</span>
                </label>
                <p class="planet-gen-hint">Turn auto off, then drag directly on the planet to place the bright center.</p>
              </div>
              <div class="planet-gen-extra-card">
                <div class="planet-gen-extra-head">
                  <span>Atmosphere <strong id="planet-gen-atmosphere-value">0%</strong></span>
                </div>
                <input id="planet-gen-atmosphere" type="range" min="0" max="100" step="1" value="0" />
                <div class="planet-gen-extra-head">
                  <span>Cloud distance <strong id="planet-gen-cloud-distance-value">50%</strong></span>
                </div>
                <input id="planet-gen-cloud-distance" type="range" min="0" max="100" step="1" value="50" />
                <div class="planet-gen-extra-head">
                  <span>Cloud color</span>
                </div>
                <input id="planet-gen-cloud-color" type="color" value="#ffffff" />
              </div>
              <div class="planet-gen-extra-card">
                <div class="planet-gen-extra-head">
                  <span>Rings</span>
                </div>
                <label class="planet-gen-toggle">
                  <input id="planet-gen-rings" type="checkbox" />
                  <span>Enable simple ring</span>
                </label>
              </div>
            </div>
          </details>
          <div class="planet-gen-actions">
            <button id="planet-gen-surprise" type="button">Surprise me</button>
            <button id="planet-gen-copy-seed" type="button">Copy seed key</button>
          </div>
          <div class="planet-gen-stats">
            <div><span>Resolved type</span><strong id="planet-gen-stat-type">-</strong></div>
            <div><span>Palette</span><strong id="planet-gen-stat-palette">-</strong></div>
            <div><span>Ocean level</span><strong id="planet-gen-stat-water">-</strong></div>
            <div><span>Pixel radius</span><strong id="planet-gen-stat-size">-</strong></div>
            <div><span>Sun target</span><strong id="planet-gen-stat-light">-</strong></div>
          </div>
          <div class="planet-gen-seed">
            <span>Seed key</span>
            <code id="planet-gen-seed-value">-</code>
          </div>
        </aside>
        <section class="planet-gen-panel planet-gen-panel--preview">
          <div class="planet-gen-preview-meta">
            <div>
              <p class="planet-gen-eyebrow">Live Preview</p>
              <h2 id="planet-gen-title"></h2>
            </div>
            <p class="planet-gen-caption">Nearest-neighbor upscale from a tiny sprite canvas.</p>
          </div>
          <div class="planet-gen-canvas-wrap">
            <canvas id="planet-gen-canvas" width="512" height="512"></canvas>
          </div>
        </section>
      </div>
    </section>
  `;

  const elements = {
    name: container.querySelector('#planet-gen-name'),
    type: container.querySelector('#planet-gen-type'),
    palette: container.querySelector('#planet-gen-palette'),
    size: container.querySelector('#planet-gen-size'),
    autoSize: container.querySelector('#planet-gen-auto-size'),
    autoLight: container.querySelector('#planet-gen-auto-light'),
    sizeValue: container.querySelector('#planet-gen-size-value'),
    lightValue: container.querySelector('#planet-gen-light-value'),
    atmosphere: container.querySelector('#planet-gen-atmosphere'),
    atmosphereValue: container.querySelector('#planet-gen-atmosphere-value'),
    cloudDistance: container.querySelector('#planet-gen-cloud-distance'),
    cloudDistanceValue: container.querySelector('#planet-gen-cloud-distance-value'),
    cloudColor: container.querySelector('#planet-gen-cloud-color'),
    darkMode: container.querySelector('#planet-gen-dark-mode'),
    rings: container.querySelector('#planet-gen-rings'),
    title: container.querySelector('#planet-gen-title'),
    seedValue: container.querySelector('#planet-gen-seed-value'),
    statType: container.querySelector('#planet-gen-stat-type'),
    statPalette: container.querySelector('#planet-gen-stat-palette'),
    statWater: container.querySelector('#planet-gen-stat-water'),
    statSize: container.querySelector('#planet-gen-stat-size'),
    statLight: container.querySelector('#planet-gen-stat-light'),
    canvas: container.querySelector('#planet-gen-canvas'),
    surprise: container.querySelector('#planet-gen-surprise'),
    copySeed: container.querySelector('#planet-gen-copy-seed'),
  };

  const ctx = elements.canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const spriteCanvas = document.createElement('canvas');
  spriteCanvas.width = 128;
  spriteCanvas.height = 128;
  const spriteCtx = spriteCanvas.getContext('2d', { willReadFrequently: true });
  spriteCtx.imageSmoothingEnabled = false;

  let currentDescriptor = null;
  let frameId = null;
  let startTime = performance.now();
  let isDraggingLight = false;
  let manualLightTarget = { x: 0.62, y: 0.48 };
  let cloudColorTouched = false;

  elements.name.value = initialName;

  function readControls() {
    return {
      type: elements.type.value,
      palette: elements.palette.value,
      size: Number(elements.size.value),
      atmosphere: Number(elements.atmosphere.value),
      cloudDistance: Number(elements.cloudDistance.value),
      cloudColor: elements.cloudColor.value,
      lightTarget: manualLightTarget,
      autoSize: elements.autoSize.checked,
      autoLight: elements.autoLight.checked,
      rings: elements.rings.checked,
    };
  }

  function syncLabels() {
    elements.size.disabled = elements.autoSize.checked;
    elements.sizeValue.textContent = elements.autoSize.checked ? 'Auto' : elements.size.value;
    elements.lightValue.textContent = elements.autoLight.checked
      ? 'Auto'
      : `${Math.round(manualLightTarget.x * 100)}%, ${Math.round(manualLightTarget.y * 100)}%`;
    elements.atmosphereValue.textContent = `${elements.atmosphere.value}%`;
    elements.cloudDistanceValue.textContent = `${elements.cloudDistance.value}%`;
    document.body.classList.toggle('planet-gen-dark', elements.darkMode.checked);
  }

  function syncDescriptor() {
    syncLabels();
    currentDescriptor = createDescriptor(elements.name.value, readControls());
    if (!cloudColorTouched && elements.cloudColor.value !== currentDescriptor.palette.clouds[1]) {
      elements.cloudColor.value = currentDescriptor.palette.clouds[1];
      currentDescriptor = createDescriptor(elements.name.value, readControls());
    }
    elements.title.textContent = currentDescriptor.name;
    elements.seedValue.textContent = currentDescriptor.seedDisplay;
    elements.statType.textContent = PLANET_TYPES.find((item) => item.value === currentDescriptor.type)?.label ?? currentDescriptor.type;
    elements.statPalette.textContent = currentDescriptor.palette.label;
    elements.statWater.textContent = `${Math.round(currentDescriptor.waterLevel * 100)}%`;
    elements.statSize.textContent = `${currentDescriptor.radius}px`;
    elements.statLight.textContent = `${Math.round(currentDescriptor.lightTarget.x * 100)}%, ${Math.round(currentDescriptor.lightTarget.y * 100)}%`;
    updateQuery(currentDescriptor.name, elements.type.value, elements.palette.value);
  }

  async function copySeedKey() {
    if (!currentDescriptor?.seedDisplay) {
      return;
    }

    try {
      await navigator.clipboard.writeText(currentDescriptor.seedDisplay);
      elements.copySeed.textContent = 'Copied';
      window.setTimeout(() => {
        elements.copySeed.textContent = 'Copy seed key';
      }, 1000);
    } catch {
      elements.copySeed.textContent = 'Clipboard blocked';
      window.setTimeout(() => {
        elements.copySeed.textContent = 'Copy seed key';
      }, 1200);
    }
  }

  function renderScene(targetCtx, targetCanvas, descriptor, elapsedSeconds, options = {}) {
    const rotation = elapsedSeconds * descriptor.rotationSpeed;
    const ringPhase = elapsedSeconds * descriptor.ringSpinSpeed;
    const metrics = getPlanetRenderMetrics(descriptor, spriteCanvas.width, targetCanvas.width);
    const lightTarget = getLightTargetFromDiskPosition(
      descriptor.lightTarget.x * 2 - 1,
      descriptor.lightTarget.y * 2 - 1
    ) ?? { x: 0.68, y: 0.62, z: 0.39 };
    const light = normalize(lightTarget);
    const backgroundRng = createRNG(`${descriptor.seedKey}:stars`);

    drawBackdrop(
      targetCtx,
      targetCanvas.width,
      targetCanvas.height,
      backgroundRng,
      elapsedSeconds * 1000,
      descriptor.darkMode,
      {
        animated: options.animatedBackdrop !== false,
        simplified: options.simplifiedBackdrop === true,
      }
    );
    renderSimpleRing(targetCtx, descriptor, metrics, ringPhase, 'back', descriptor.darkMode);

    spriteCtx.clearRect(0, 0, spriteCanvas.width, spriteCanvas.height);
    renderPlanetSprite(spriteCtx, descriptor, rotation, spriteCanvas.width, {
      stableForGif: Boolean(options.stableForGif),
    });

    targetCtx.save();
    targetCtx.translate(metrics.center, metrics.center);
    targetCtx.drawImage(spriteCanvas, -metrics.drawSize / 2, -metrics.drawSize / 2, metrics.drawSize, metrics.drawSize);
    targetCtx.restore();

    renderSimpleRing(targetCtx, descriptor, metrics, ringPhase, 'front', descriptor.darkMode);
  }

function drawFrame(now) {
    if (!currentDescriptor) {
      return;
    }

    const elapsed = (now - startTime) / 1000;
    currentDescriptor.darkMode = elements.darkMode.checked;
    renderScene(ctx, elements.canvas, currentDescriptor, elapsed);
    const metrics = getPlanetRenderMetrics(currentDescriptor, spriteCanvas.width, elements.canvas.width);

    ctx.save();
    ctx.translate(metrics.center, metrics.center);
    if (!elements.autoLight.checked) {
      const markerX = (currentDescriptor.lightTarget.x * 2 - 1) * metrics.radius;
      const markerY = (currentDescriptor.lightTarget.y * 2 - 1) * metrics.radius;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(markerX, markerY, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(142, 163, 201, 0.95)';
      ctx.beginPath();
      ctx.moveTo(markerX - 12, markerY);
      ctx.lineTo(markerX + 12, markerY);
      ctx.moveTo(markerX, markerY - 12);
      ctx.lineTo(markerX, markerY + 12);
      ctx.stroke();
    }
    ctx.restore();

    frameId = window.requestAnimationFrame(drawFrame);
  }

  function updateManualLightFromPointer(clientX, clientY) {
    if (!currentDescriptor) {
      return false;
    }

    const rect = elements.canvas.getBoundingClientRect();
    const canvasX = ((clientX - rect.left) / rect.width) * elements.canvas.width;
    const canvasY = ((clientY - rect.top) / rect.height) * elements.canvas.height;
    const metrics = getPlanetRenderMetrics(currentDescriptor, spriteCanvas.width, elements.canvas.width);
    const normalizedX = (canvasX - metrics.center) / metrics.radius;
    const normalizedY = (canvasY - metrics.center) / metrics.radius;
    const target = getLightTargetFromDiskPosition(normalizedX, normalizedY);

    if (!target) {
      return false;
    }

    manualLightTarget = {
      x: (target.x + 1) / 2,
      y: (target.y + 1) / 2,
    };
    return true;
  }

  function refresh() {
    syncDescriptor();
    if (frameId === null) {
      frameId = window.requestAnimationFrame(drawFrame);
    }
  }

  elements.name.addEventListener('input', refresh);
  elements.type.addEventListener('change', refresh);
  elements.palette.addEventListener('change', refresh);
  elements.size.addEventListener('input', refresh);
  elements.atmosphere.addEventListener('input', refresh);
  elements.cloudDistance.addEventListener('input', refresh);
  elements.cloudColor.addEventListener('input', () => {
    cloudColorTouched = true;
    refresh();
  });
  elements.autoSize.addEventListener('change', refresh);
  elements.autoLight.addEventListener('change', refresh);
  elements.darkMode.addEventListener('change', refresh);
  elements.rings.addEventListener('change', refresh);
  elements.canvas.addEventListener('pointerdown', (event) => {
    elements.autoLight.checked = false;
    if (updateManualLightFromPointer(event.clientX, event.clientY)) {
      isDraggingLight = true;
      elements.canvas.setPointerCapture(event.pointerId);
      refresh();
    }
  });
  elements.canvas.addEventListener('pointermove', (event) => {
    if (!isDraggingLight) {
      return;
    }
    if (updateManualLightFromPointer(event.clientX, event.clientY)) {
      refresh();
    }
  });
  elements.canvas.addEventListener('pointerup', () => {
    isDraggingLight = false;
  });
  elements.canvas.addEventListener('pointercancel', () => {
    isDraggingLight = false;
  });
  elements.copySeed.addEventListener('click', () => {
    void copySeedKey();
  });
  elements.surprise.addEventListener('click', () => {
    elements.name.value = randomSurpriseName();
    refresh();
  });

  refresh();

  return () => {
    if (frameId !== null) {
      window.cancelAnimationFrame(frameId);
    }
  };
}


document.body.classList.add('planet-gen-page');
createPlanetGeneratorPage(document.getElementById('app'));

