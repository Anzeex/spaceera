"use strict";

const TRAITS = [
  {
    key: "combatPower",
    label: "Combat power",
    short: "Combat",
    mass: 6.4,
    color: "#c85f51",
  },
  {
    key: "defense",
    label: "Defense",
    short: "Defense",
    mass: 7.2,
    color: "#d8b35f",
  },
  {
    key: "thrust",
    label: "Thrust",
    short: "Thrust",
    mass: 4.8,
    color: "#56c4b3",
  },
  {
    key: "cargoCapacity",
    label: "Cargo capacity",
    short: "Cargo",
    mass: 6.8,
    color: "#8cb86d",
  },
  {
    key: "passengerCapacity",
    label: "Passenger capacity",
    short: "Pax",
    mass: 5.8,
    color: "#c99dd7",
  },
  {
    key: "stealth",
    label: "Stealth",
    short: "Stealth",
    mass: 4.2,
    color: "#7990b6",
  },
];

const DEFAULT_TRAITS = {
  combatPower: 3,
  defense: 3,
  thrust: 5,
  cargoCapacity: 3,
  passengerCapacity: 2,
  stealth: 2,
};

const MAX_TRAIT_VALUE = 12;

const state = {
  seed: makeSeed(),
  traits: { ...DEFAULT_TRAITS },
};

const elements = {
  canvas: document.querySelector("#shipCanvas"),
  seedInput: document.querySelector("#seedInput"),
  rerollSeed: document.querySelector("#rerollSeed"),
  randomizeTraits: document.querySelector("#randomizeTraits"),
  exportPng: document.querySelector("#exportPng"),
  copyBuild: document.querySelector("#copyBuild"),
  traitControls: document.querySelector("#traitControls"),
  traitReadout: document.querySelector("#traitReadout"),
  shipName: document.querySelector("#shipName"),
  massValue: document.querySelector("#massValue"),
  speedValue: document.querySelector("#speedValue"),
  fuelValue: document.querySelector("#fuelValue"),
  riskValue: document.querySelector("#riskValue"),
};

const LOW_WIDTH = 196;
const LOW_HEIGHT = 120;
const DETAIL_SCALE = 1.5;
const BAYER_8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

let toastTimer = 0;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function makeSeed() {
  const words = ["keel", "ember", "vector", "quiet", "halo", "forge", "drift", "ion"];
  return `${words[Math.floor(Math.random() * words.length)]}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function hashString(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex({
    r: Math.round(255 * f(0)),
    g: Math.round(255 * f(8)),
    b: Math.round(255 * f(4)),
  });
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  const toPart = (value) => value.toString(16).padStart(2, "0");
  return `#${toPart(r)}${toPart(g)}${toPart(b)}`;
}

function mixHex(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex({
    r: Math.round(lerp(ca.r, cb.r, t)),
    g: Math.round(lerp(ca.g, cb.g, t)),
    b: Math.round(lerp(ca.b, cb.b, t)),
  });
}

function mixRgbWithHex(color, hex, t) {
  const target = hexToRgb(hex);
  return {
    r: Math.round(lerp(color.r, target.r, t)),
    g: Math.round(lerp(color.g, target.g, t)),
    b: Math.round(lerp(color.b, target.b, t)),
  };
}

function mod(n, m) {
  return ((n % m) + m) % m;
}

function ditherValue(x, y) {
  return BAYER_8[mod(Math.round(y), 8)][mod(Math.round(x), 8)] / 4;
}

function getEffectiveTraits() {
  const traits = { ...state.traits };
  for (const trait of TRAITS) {
    traits[trait.key] = clamp(traits[trait.key], 0, MAX_TRAIT_VALUE);
  }
  return traits;
}

function getDerivedStats(traits) {
  const traitMass = TRAITS.reduce((sum, trait) => sum + traits[trait.key] * trait.mass, 0);
  const hullMass = 52 + traits.defense * 2.4 + traits.cargoCapacity * 2.9 + traits.passengerCapacity * 2.2;
  const mass = Math.round(hullMass + traitMass);
  const driveOutput = 35 + traits.thrust * 13.5;
  const drag = mass * 0.26 + traits.defense * 1.8 + traits.cargoCapacity * 1.2 + traits.passengerCapacity * 0.9;
  const speed = Math.round(clamp(driveOutput - drag + traits.stealth * 1.7, 8, 160));
  const fuel = Math.round(clamp(6 + mass * 0.09 + Math.max(0, speed - 50) * 0.11, 4, 120));
  const targetProfile = mass * 0.18 + traits.combatPower * 1.4 + traits.cargoCapacity * 1.2;
  const avoidance = traits.stealth * 5.2 + speed * 0.22 + traits.defense * 0.8;
  const risk = Math.round(clamp(55 + targetProfile - avoidance, 3, 99));
  return { mass, speed, fuel, risk };
}

function getNormalizedTraits(traits) {
  return Object.fromEntries(TRAITS.map((trait) => [trait.key, traits[trait.key] / MAX_TRAIT_VALUE]));
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function createPixelSurface(width, height, detail = 1) {
  const pixelWidth = Math.round(width * detail);
  const pixelHeight = Math.round(height * detail);
  const imageData = new ImageData(pixelWidth, pixelHeight);
  const data = imageData.data;

  function setRawPixel(x, y, color, alpha = 255) {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= pixelWidth || py >= pixelHeight) return;
    const { r, g, b } = typeof color === "string" ? hexToRgb(color) : color;
    const i = (py * pixelWidth + px) * 4;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = alpha;
  }

  function setPixel(x, y, color, alpha = 255) {
    const left = Math.floor(x * detail);
    const top = Math.floor(y * detail);
    const right = Math.max(left + 1, Math.floor((x + 1) * detail));
    const bottom = Math.max(top + 1, Math.floor((y + 1) * detail));
    for (let yy = top; yy < bottom; yy += 1) {
      for (let xx = left; xx < right; xx += 1) {
        setRawPixel(xx, yy, color, alpha);
      }
    }
  }

  function getPixel(x, y) {
    const px = Math.round(x * detail);
    const py = Math.round(y * detail);
    if (px < 0 || py < 0 || px >= pixelWidth || py >= pixelHeight) return null;
    const i = (py * pixelWidth + px) * 4;
    return {
      r: data[i],
      g: data[i + 1],
      b: data[i + 2],
      a: data[i + 3],
    };
  }

  function fillRect(x, y, w, h, color) {
    const left = Math.round(x * detail);
    const top = Math.round(y * detail);
    const right = Math.round((x + w) * detail);
    const bottom = Math.round((y + h) * detail);
    for (let yy = top; yy < bottom; yy += 1) {
      for (let xx = left; xx < right; xx += 1) {
        setRawPixel(xx, yy, color);
      }
    }
  }

  function drawLine(x0, y0, x1, y1, color) {
    let ax = Math.round(x0 * detail);
    let ay = Math.round(y0 * detail);
    const bx = Math.round(x1 * detail);
    const by = Math.round(y1 * detail);
    const dx = Math.abs(bx - ax);
    const dy = -Math.abs(by - ay);
    const sx = ax < bx ? 1 : -1;
    const sy = ay < by ? 1 : -1;
    let err = dx + dy;
    while (true) {
      setRawPixel(ax, ay, color);
      if (ax === bx && ay === by) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        ax += sx;
      }
      if (e2 <= dx) {
        err += dx;
        ay += sy;
      }
    }
  }

  function drawRawLine(x0, y0, x1, y1, color) {
    let ax = Math.round(x0);
    let ay = Math.round(y0);
    const bx = Math.round(x1);
    const by = Math.round(y1);
    const dx = Math.abs(bx - ax);
    const dy = -Math.abs(by - ay);
    const sx = ax < bx ? 1 : -1;
    const sy = ay < by ? 1 : -1;
    let err = dx + dy;
    while (true) {
      setRawPixel(ax, ay, color);
      if (ax === bx && ay === by) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        ax += sx;
      }
      if (e2 <= dx) {
        err += dx;
        ay += sy;
      }
    }
  }

  function drawPolygonOutline(points, color) {
    for (let i = 0; i < points.length; i += 1) {
      const current = points[i];
      const next = points[(i + 1) % points.length];
      drawLine(current.x, current.y, next.x, next.y, color);
    }
  }

  function fillDitheredPolygon(points, palette, options = {}) {
    const minX = Math.floor(Math.min(...points.map((point) => point.x)) * detail);
    const maxX = Math.ceil(Math.max(...points.map((point) => point.x)) * detail);
    const minY = Math.floor(Math.min(...points.map((point) => point.y)) * detail);
    const maxY = Math.ceil(Math.max(...points.map((point) => point.y)) * detail);
    const yMid = (minY + maxY) / 2;
    const yRange = Math.max(1, maxY - minY);
    const xRange = Math.max(1, maxX - minX);
    const grain = options.grain ?? 0.08;

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const logicalX = (x + 0.5) / detail;
        const logicalY = (y + 0.5) / detail;
        if (!pointInPolygon(logicalX, logicalY, points)) continue;
        const forward = (x - minX) / xRange;
        const facet = options.facetShade
          ? Math.sin((x - y + options.phase) * 0.12) * 0.035 - forward * 0.08
          : 0;
        const shade = (y - yMid) / yRange + Math.sin((x + options.phase) * 0.23) * grain + facet;
        const threshold = ditherValue(x, y) / 16 - 0.5;
        let color = palette.base;
        if (shade < -0.18 + threshold * 0.22) color = palette.light;
        if (shade > 0.16 + threshold * 0.24) color = palette.shadow;
        if (options.facetShade && ditherValue(x + options.phase, y - options.phase) > 13 && shade < 0.08) {
          color = mixHex(color, palette.rim, 0.12);
        }
        if (options.facetShade && ditherValue(x - options.phase, y + options.phase) < 2 && shade > -0.04) {
          color = mixHex(color, palette.deep, 0.16);
        }
        if (options.panelNoise && ((x * 7 + y * 11 + options.phase) & 9) === 0) {
          color = mixHex(color, palette.shadow, 0.36);
        }
        setRawPixel(x, y, color);
      }
    }
  }

  function fillDitheredRect(x, y, w, h, palette, options = {}) {
    const phase = options.phase ?? 0;
    const left = Math.round(x * detail);
    const top = Math.round(y * detail);
    const right = Math.round((x + w) * detail);
    const bottom = Math.round((y + h) * detail);
    for (let yy = top; yy < bottom; yy += 1) {
      for (let xx = left; xx < right; xx += 1) {
        const shade = (yy / detail - y) / Math.max(1, h) - 0.5;
        const threshold = ditherValue(xx, yy + phase) / 16 - 0.5;
        let color = palette.base;
        if (shade < -0.12 + threshold * 0.16) color = palette.light;
        if (shade > 0.12 + threshold * 0.2) color = palette.shadow;
        setRawPixel(xx, yy, color);
      }
    }
  }

  function fillDitheredEllipse(cx, cy, rx, ry, palette, options = {}) {
    const phase = options.phase ?? 0;
    for (let y = Math.floor((cy - ry) * detail); y <= Math.ceil((cy + ry) * detail); y += 1) {
      for (let x = Math.floor((cx - rx) * detail); x <= Math.ceil((cx + rx) * detail); x += 1) {
        const logicalX = x / detail;
        const logicalY = y / detail;
        const nx = (logicalX - cx) / rx;
        const ny = (logicalY - cy) / ry;
        if (nx * nx + ny * ny > 1) continue;
        const threshold = ditherValue(x + phase, y + phase) / 16 - 0.5;
        let color = palette.base;
        if (ny < -0.15 + threshold * 0.16) color = palette.light;
        if (ny > 0.18 + threshold * 0.16) color = palette.shadow;
        setRawPixel(x, y, color);
      }
    }
  }

  return {
    width,
    height,
    detail,
    pixelWidth,
    pixelHeight,
    imageData,
    setRawPixel,
    setPixel,
    getPixel,
    fillRect,
    drawLine,
    drawRawLine,
    drawPolygonOutline,
    fillDitheredPolygon,
    fillDitheredRect,
    fillDitheredEllipse,
  };
}

function drawBackground(surface, rng) {
  const top = hexToRgb("#07172f");
  const middle = hexToRgb("#0b2f55");
  const bottom = hexToRgb("#112844");
  for (let y = 0; y < surface.pixelHeight; y += 1) {
    for (let x = 0; x < surface.pixelWidth; x += 1) {
      const t = y / (surface.pixelHeight - 1);
      const base = t < 0.54
        ? {
            r: lerp(top.r, middle.r, t / 0.54),
            g: lerp(top.g, middle.g, t / 0.54),
            b: lerp(top.b, middle.b, t / 0.54),
          }
        : {
            r: lerp(middle.r, bottom.r, (t - 0.54) / 0.46),
            g: lerp(middle.g, bottom.g, (t - 0.54) / 0.46),
            b: lerp(middle.b, bottom.b, (t - 0.54) / 0.46),
          };
      const threshold = ditherValue(x, y) / 16;
      const cloud = Math.sin(x * 0.018 + y * 0.04) * 4 + Math.sin(x * 0.05 - y * 0.012) * 2;
      const dither = threshold > t ? -4 : 3;
      surface.setRawPixel(x, y, {
        r: Math.round(base.r + dither + cloud * 0.25),
        g: Math.round(base.g + dither + cloud * 0.38),
        b: Math.round(base.b + dither + cloud * 0.8),
      });
    }
  }

  const starCount = 118;
  for (let i = 0; i < starCount; i += 1) {
    const x = Math.floor(rng() * surface.pixelWidth);
    const y = Math.floor(rng() * surface.pixelHeight);
    const color = rng() > 0.88 ? "#f2d078" : rng() > 0.44 ? "#d7f8ff" : "#86a8c7";
    surface.setRawPixel(x, y, color);
    if (rng() > 0.9) surface.setRawPixel(x + 1, y, mixHex(color, "#07172f", 0.28));
    if (rng() > 0.965) surface.setRawPixel(x, y + 1, mixHex(color, "#07172f", 0.18));
  }
}

function buildPalette(norm, rng) {
  const baseLightness = clamp(40 + norm.defense * 8 - norm.stealth * 12 + rng() * 4, 28, 54);
  const base = hslToHex(220, 5, baseLightness);
  const shadow = mixHex(base, "#020305", 0.66 + norm.stealth * 0.18);
  const highlight = hslToHex(220, 4, clamp(96 - norm.stealth * 42, 48, 96));
  const midHighlight = hslToHex(220, 4, clamp(84 - norm.stealth * 34, 44, 84));
  const windowLight = hslToHex(48, 18, clamp(94 - norm.stealth * 46, 42, 94));
  return {
    base,
    light: mixHex(base, highlight, 0.58),
    rim: mixHex(base, highlight, 0.68),
    shadow,
    deep: mixHex(shadow, "#000000", 0.58),
    outline: norm.stealth > 0.46 ? "#010102" : "#030407",
    panel: mixHex(base, "#050609", 0.38),
    frame: mixHex(base, midHighlight, 0.52),
    frameDark: mixHex(shadow, "#000000", 0.36),
    accent: mixHex("#eeeeea", base, norm.stealth * 0.74),
    window: windowLight,
    engine: norm.stealth > 0.58 ? "#d35a28" : "#ff8a2c",
  };
}

function createHullPolygon(norm) {
  const cy = 60;
  const tailX = 24;
  const engineX = 28;
  const midX = 64;
  const frontRootX = 104;
  const headX = 123;
  const noseX = 138;
  const rearHalf = 6 + Math.round(norm.thrust * 12);
  const coreHalf = 8 + Math.round(norm.thrust * 2.4);
  const frontHalf = 4 + Math.round(norm.passengerCapacity * 17);
  const tailHalf = Math.max(4, Math.round(rearHalf * 0.72));

  return [
    { x: tailX, y: cy - tailHalf },
    { x: engineX, y: cy - tailHalf },
    { x: engineX, y: cy - rearHalf },
    { x: midX, y: cy - rearHalf },
    { x: midX, y: cy - coreHalf },
    { x: frontRootX, y: cy - coreHalf },
    { x: headX, y: cy - frontHalf },
    { x: noseX, y: cy - 3 },
    { x: noseX + 3, y: cy },
    { x: noseX, y: cy + 3 },
    { x: headX, y: cy + frontHalf },
    { x: frontRootX, y: cy + coreHalf },
    { x: midX, y: cy + coreHalf },
    { x: midX, y: cy + rearHalf },
    { x: engineX, y: cy + rearHalf },
    { x: engineX, y: cy + tailHalf },
    { x: tailX, y: cy + tailHalf },
  ];
}

function drawCargoPods(surface, norm, palette, hull) {
  if (norm.cargoCapacity < 0.08) return;
  const podW = Math.round(18 + norm.cargoCapacity * 48);
  const podH = Math.round(5 + norm.cargoCapacity * 3);
  const x = Math.round(hull.tailX + 2);
  const rearOffset = Math.round(6 + norm.thrust * 7);
  const podPalette = {
    base: mixHex(palette.base, "#d0d0ca", 0.18),
    light: mixHex(palette.light, "#ffffff", 0.12),
    shadow: mixHex(palette.shadow, "#08080a", 0.18),
  };

  for (const side of [-1, 1]) {
    const railY = Math.round(hull.cy + side * rearOffset);
    surface.drawLine(x - 6, railY, x + podW + 3, railY, palette.frameDark);
    surface.drawLine(x - 6, railY - side, x + podW + 3, railY - side, mixHex(palette.frame, "#f0f0ea", 0.16));
    const y = Math.round(railY + side * 2 - (side < 0 ? podH : 0));
    surface.drawLine(x + 3, railY, x + 3, y + (side < 0 ? podH : 0), palette.outline);
    surface.drawLine(x + podW - 4, railY, x + podW - 4, y + (side < 0 ? podH : 0), palette.outline);
    surface.fillDitheredRect(x, y, podW, podH, podPalette, { phase: side > 0 ? 2 : 5 });
    outlineRect(surface, x, y, podW, podH, palette.outline);
    const bayLines = Math.round(2 + norm.cargoCapacity * 3);
    for (let i = 1; i < bayLines; i += 1) {
      const sx = Math.round(x + (podW * i) / bayLines);
      surface.drawLine(sx, y + 1, sx, y + podH - 2, palette.frameDark);
    }
    surface.drawLine(x + 3, y + Math.round(podH / 2), x + podW - 4, y + Math.round(podH / 2), mixHex("#c8c8c0", palette.shadow, 0.18));
  }

  if (norm.cargoCapacity > 0.66) {
    const centerW = Math.round(18 + norm.cargoCapacity * 18);
    const centerH = Math.round(9 + norm.cargoCapacity * 7);
    const centerX = Math.round(hull.tailX + 8);
    const centerY = Math.round(hull.cy - centerH / 2);
    surface.fillDitheredRect(centerX, centerY, centerW, centerH, podPalette, { phase: 7 });
    outlineRect(surface, centerX, centerY, centerW, centerH, palette.outline);
    surface.drawLine(centerX + 4, centerY + Math.floor(centerH / 2), centerX + centerW - 5, centerY + Math.floor(centerH / 2), palette.frameDark);
    surface.drawLine(centerX + 2, hull.cy, centerX + centerW - 3, hull.cy, mixHex("#c8c8c0", palette.shadow, 0.18));
  }
}

function drawPassengerSections(surface, norm, palette, hull) {
  if (norm.passengerCapacity < 0.08) return;
  const cabinPalette = {
    base: mixHex(palette.base, "#d6d6d0", 0.18),
    light: mixHex(palette.light, "#ffffff", 0.16),
    shadow: mixHex(palette.shadow, "#0a090d", 0.12),
  };
  const headX = Math.round(hull.noseX - 36);
  const headW = Math.round(24 + norm.passengerCapacity * 26);
  const headH = Math.round(5 + norm.passengerCapacity * 13);
  const y = Math.round(hull.cy - headH);
  drawRoundedDitheredRect(surface, headX, y, headW, headH * 2, 2, cabinPalette, palette.outline, 4);
  surface.drawLine(headX + 4, y + 2, headX + headW - 5, y + 2, cabinPalette.light);
  surface.drawLine(headX + 4, y + headH * 2 - 3, headX + headW - 5, y + headH * 2 - 3, cabinPalette.shadow);

  const rows = norm.passengerCapacity > 0.58 ? [-3, 3] : [0];
  for (const rowOffset of rows) {
    const wy = Math.round(hull.cy + rowOffset);
    for (let wx = headX + 6; wx < headX + headW - 5; wx += 5) {
      surface.setPixel(wx, wy, palette.window);
      if (norm.passengerCapacity > 0.72) surface.setPixel(wx + 1, wy, mixHex(palette.window, "#ffffff", 0.24));
    }
  }

  const lampY = y + 2;
  const lampSpacing = norm.passengerCapacity > 0.64 ? 8 : 11;
  for (let lx = headX + 5; lx < headX + headW - 4; lx += lampSpacing) {
    surface.setPixel(lx - 1, lampY, "#5f4b16");
    surface.setPixel(lx, lampY - 1, "#5f4b16");
    surface.setPixel(lx, lampY, "#ffd75a");
    surface.setPixel(lx + 1, lampY, "#fff2b8");
    surface.setPixel(lx, lampY + 1, "#ffd75a");
    if (norm.passengerCapacity > 0.72) {
      surface.setPixel(lx + 1, lampY + 1, mixHex("#fff2b8", palette.base, 0.18));
      surface.setPixel(lx - 1, lampY + 1, mixHex("#ffd75a", palette.base, 0.32));
    }
  }
}

function drawRailCannon(surface, x, y, side, length, palette, weaponColor, phase, bulk = 0) {
  const gunPalette = {
    base: mixHex(weaponColor, palette.shadow, 0.18),
    light: mixHex(weaponColor, "#ffffff", 0.14),
    shadow: palette.deep,
  };
  const heft = Math.round(bulk * 2);
  const housing = [
    { x: x - 7 - heft, y: y - side * (4 + heft) },
    { x: x + 8 + heft, y: y - side * (3 + heft) },
    { x: x + 10 + heft, y: y + side * (2 + heft) },
    { x: x - 6 - heft, y: y + side * (4 + heft) },
  ];
  surface.fillDitheredPolygon(housing, gunPalette, { phase, grain: 0.02 });
  surface.drawPolygonOutline(housing, palette.outline);
  surface.drawLine(x + 7, y - side * 2, x + length, y - side * 2, palette.outline);
  surface.drawLine(x + 8, y - side, x + length + heft, y - side, weaponColor);
  surface.drawLine(x + 8, y + side, x + length + heft - 1, y + side, palette.outline);
  surface.drawLine(x + 9, y, x + length + 3 + heft, y, mixHex(weaponColor, "#ffffff", 0.18));
  if (bulk > 0.72) surface.drawLine(x + 8, y + side * 2, x + length - 3, y + side * 2, weaponColor);
  for (let c = x + 13; c < x + length - 2; c += 5) {
    surface.setPixel(c, y - side, "#f4f4ee");
    surface.setPixel(c, y + side, weaponColor);
  }
}

function drawCenterCannon(surface, x, y, length, palette, weaponColor, bulk) {
  const h = 7 + Math.round(bulk * 3);
  const housingW = 17 + Math.round(bulk * 5);
  const gunPalette = {
    base: mixHex(weaponColor, palette.shadow, 0.16),
    light: mixHex(weaponColor, "#ffffff", 0.12),
    shadow: palette.deep,
  };
  surface.fillDitheredRect(x - housingW, y - Math.floor(h / 2), housingW + 4, h, gunPalette, { phase: 12 });
  outlineRect(surface, x - housingW, y - Math.floor(h / 2), housingW + 4, h, palette.outline);
  surface.drawLine(x, y - 2, x + length, y - 2, palette.outline);
  surface.drawLine(x, y - 1, x + length + 2, y - 1, weaponColor);
  surface.drawLine(x, y, x + length + 4, y, mixHex(weaponColor, "#ffffff", 0.18));
  surface.drawLine(x, y + 1, x + length + 1, y + 1, weaponColor);
  surface.drawLine(x, y + 2, x + length - 1, y + 2, palette.outline);
  for (let c = x + 7; c < x + length - 2; c += 5) {
    surface.setPixel(c, y, "#f4f4ee");
  }
}

function drawWeapons(surface, norm, palette, hull) {
  const level = Math.round(norm.combatPower * MAX_TRAIT_VALUE);
  if (level < 1) return;
  const weaponColor = mixHex("#b8b8b2", palette.light, 0.12);
  const earlyBulk = clamp((level - 1) / 5, 0, 1);
  const lateBulk = clamp((level - 8) / 4, 0, 1);
  const bulk = Math.min(1, earlyBulk * 0.55 + lateBulk * 0.35);

  const frontX = Math.round(hull.noseX - 38);
  const frontBarrel = Math.round(14 + earlyBulk * 7 + lateBulk * 4);
  const frontOffset = Math.round(hull.half + 6 + lateBulk * 2);
  for (const side of [-1, 1]) {
    const y = Math.round(hull.cy + side * frontOffset);
    const strutY = Math.round(hull.cy + side * (hull.half - 1));
    surface.drawLine(frontX - 5, y - side * 3, frontX - 11, strutY, palette.frameDark);
    surface.drawLine(frontX - 4, y + side * 3, frontX - 10, strutY + side * 3, palette.frameDark);
    drawRailCannon(surface, frontX, y, side, frontBarrel, palette, weaponColor, side + 3, bulk);
  }

  if (level >= 4) {
    const centerBulk = clamp((level - 4) / 5, 0, 1) * 0.8;
    const centerX = Math.round(hull.noseX - 18);
    const centerBarrel = Math.round(16 + centerBulk * 10 + lateBulk * 4);
    drawCenterCannon(surface, centerX, hull.cy, centerBarrel, palette, weaponColor, centerBulk);
  }

  if (level >= 7) {
    const rearBulk = clamp((level - 7) / 5, 0, 1) * 0.75;
    const rearX = Math.round(hull.tailX + 16);
    const rearBarrel = Math.round(10 + rearBulk * 7 + lateBulk * 3);
    for (const side of [-1, 1]) {
      const y = Math.round(hull.cy + side * (hull.half + 11 + norm.thrust * 7));
      const strutY = Math.round(hull.cy + side * (hull.half - 2));
      surface.drawLine(rearX - 6, y - side * 3, rearX - 12, strutY, palette.frameDark);
      surface.drawLine(rearX - 2, y + side * 3, rearX - 8, strutY + side * 3, palette.frameDark);
      drawRailCannon(surface, rearX, y, side, rearBarrel, palette, weaponColor, side + 11, rearBulk);
    }
  }
}

function drawDefenseShield(surface, norm, palette, hull) {
  if (norm.defense < 0.08) return;
  const shieldColor = mixHex("#7defff", palette.light, 0.18);
  const shieldDark = mixHex("#0a4a69", palette.deep, 0.24);
  const detail = surface.detail;
  const envelope = hull.shieldEnvelope ?? hull;
  const cy = envelope.cy;
  const defenseLevel = Math.round(norm.defense * MAX_TRAIT_VALUE);
  const passes = defenseLevel < 3 ? 1 : defenseLevel < 7 ? 3 : defenseLevel < 10 ? 5 : 7;
  const rearCutX = Math.max(5, Math.round(envelope.tailX + 12 - norm.defense * 1.2));
  const frontX = Math.min(surface.width - 7, Math.round(envelope.noseX + 14 + norm.defense * 3));
  const cutRatio = -0.56;
  const rx = Math.max(18, Math.round((frontX - rearCutX) / (1 - cutRatio)));
  const cx = Math.round(frontX - rx);
  const ry = Math.min(
    Math.round(envelope.half + 9 + norm.defense * 3),
    cy - 5,
    surface.height - cy - 6,
  );
  const startAngle = -Math.acos(cutRatio);
  const endAngle = Math.acos(cutRatio);

  for (let pass = 0; pass < passes; pass += 1) {
    const color = pass % 2 === 0 ? shieldColor : shieldDark;
    const centeredPass = pass - (passes - 1) / 2;
    const logicalOffset = centeredPass * (0.42 + norm.defense * 0.18);
    const rawRx = (rx + logicalOffset) * detail;
    const rawRy = (ry + logicalOffset) * detail;
    const rawCx = cx * detail;
    const rawCy = cy * detail;
    const step = 1 / Math.max(32, Math.max(rawRx, rawRy) * 1.6);
    let previous = null;

    for (let angle = startAngle; angle <= endAngle + step; angle += step) {
      const a = Math.min(angle, endAngle);
      const rawX = rawCx + Math.cos(a) * rawRx;
      const rawY = rawCy + Math.sin(a) * rawRy;
      const dither = ditherValue(rawX + pass * 3, rawY - pass * 2);

      if (previous) surface.drawRawLine(previous.x, previous.y, rawX, rawY, color);
      else surface.setRawPixel(rawX, rawY, color);

      if (norm.defense > 0.68 && pass === passes - 1 && dither > 10) {
        const innerX = rawCx + Math.cos(a) * (rawRx - 1);
        const innerY = rawCy + Math.sin(a) * (rawRy - 1);
        surface.setRawPixel(innerX, innerY, shieldColor);
      }
      previous = { x: rawX, y: rawY };
    }
  }

  const rearY = Math.round(Math.sin(endAngle) * ry);
  drawNode(surface, rearCutX, cy - rearY, shieldColor, shieldDark);
  drawNode(surface, rearCutX, cy + rearY, shieldColor, shieldDark);
}

function drawEngines(surface, norm, palette, rng, hull) {
  const thrustVisual = 0.42 + norm.thrust * 0.58;
  const nozzleCount = clamp(1 + Math.round(thrustVisual * 6), 1, 8);
  const span = Math.round(6 + thrustVisual * 30);
  const nozzleW = Math.max(4, Math.round(4 + thrustVisual * 8));
  const glow = thrustVisual;
  for (let i = 0; i < nozzleCount; i += 1) {
    const t = nozzleCount === 1 ? 0.5 : i / (nozzleCount - 1);
    const y = Math.round(hull.cy - span / 2 + t * span);
    const x = Math.round(hull.tailX - 4 + Math.abs(t - 0.5) * 4);
    surface.fillRect(x, y - 2, nozzleW, 5, palette.outline);
    surface.fillRect(x + 1, y - 1, nozzleW - 1, 3, mixHex(palette.base, "#08080b", 0.45));
    if (glow > 0.05) {
      const flame = Math.round(2 + glow * 10 + rng() * 2);
      const rawX = Math.round(x * surface.detail);
      const rawY = Math.round(y * surface.detail);
      const rawFlame = Math.round(flame * surface.detail);
      for (let rawF = 0; rawF < rawFlame; rawF += 1) {
        const f = rawF / surface.detail;
        const fx = rawX - rawF - surface.detail;
        const spread = Math.ceil(((flame - f) * 0.13 + rng() * 1.3) * surface.detail);
        for (let sy = -spread; sy <= spread; sy += 1) {
          const threshold = ditherValue(rawF, rawY + sy) / 16;
          if (threshold < 0.44 + glow * 0.34 - f / flame * 0.34) {
            const color = f < flame * 0.28 ? "#fff2c7" : f < flame * 0.62 ? palette.engine : "#b3321f";
            surface.setRawPixel(fx, rawY + sy, color);
          }
        }
      }
    }
    surface.fillRect(x - 2, y - 4, 4, 9, palette.outline);
    surface.fillRect(x - 1, y - 3, 3, 7, mixHex(palette.shadow, "#000000", 0.24));
    surface.setPixel(x - 3, y, palette.engine);
  }

  if (thrustVisual > 0.28) {
    const nacellePalette = {
      base: mixHex(palette.base, "#d0d0ca", 0.16),
      light: mixHex(palette.light, "#ffffff", 0.14),
      shadow: mixHex(palette.shadow, "#070708", 0.16),
    };
    for (const side of [-1, 1]) {
      const y = hull.cy + side * Math.round(6 + thrustVisual * 18);
      const x = Math.round(hull.tailX - 8);
      const w = Math.round(30 + thrustVisual * 38);
      const h = Math.round(6 + thrustVisual * 5);
      const moduleY = Math.round(y - h / 2);
      surface.fillDitheredRect(x, moduleY, w, h, nacellePalette, { phase: side > 0 ? 3 : 1 });
      outlineRect(surface, x, moduleY, w, h, palette.outline);
      const pylonX = x + w - 14;
      const pylonW = 5;
      const innerY = side < 0 ? moduleY + h : Math.round(hull.cy + 5);
      const outerY = side < 0 ? Math.round(hull.cy - 5) : moduleY;
      const pylonY = Math.min(innerY, outerY);
      const pylonH = Math.max(2, Math.abs(innerY - outerY));
      surface.fillRect(pylonX, pylonY, pylonW, pylonH, palette.outline);
      surface.fillRect(pylonX + 1, pylonY, pylonW - 2, pylonH, palette.frameDark);
      surface.drawLine(x, y - 2, x, y + 2, palette.engine);
      surface.drawLine(x + 1, y - 1, x + 1, y + 1, "#ffffff");
      if (thrustVisual > 0.68) {
        surface.setPixel(x - 1, y - 1, "#ffffff");
        surface.setPixel(x - 1, y + 1, "#ffffff");
      }
    }
  }
}

function drawStealth(surface, norm, palette, hull) {
  return;
}

function ellipseAsPolygon(cx, cy, rx, ry, steps) {
  const points = [];
  for (let i = 0; i < steps; i += 1) {
    const angle = (Math.PI * 2 * i) / steps;
    points.push({ x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry });
  }
  return points;
}

function outlineRect(surface, x, y, w, h, color) {
  surface.drawLine(x, y, x + w - 1, y, color);
  surface.drawLine(x, y + h - 1, x + w - 1, y + h - 1, color);
  surface.drawLine(x, y, x, y + h - 1, color);
  surface.drawLine(x + w - 1, y, x + w - 1, y + h - 1, color);
}

function drawRoundedDitheredRect(surface, x, y, w, h, radius, palette, outline, phase = 0) {
  const points = [
    { x: x + radius, y },
    { x: x + w - radius, y },
    { x: x + w, y: y + radius },
    { x: x + w, y: y + h - radius },
    { x: x + w - radius, y: y + h },
    { x: x + radius, y: y + h },
    { x, y: y + h - radius },
    { x, y: y + radius },
  ];
  surface.fillDitheredPolygon(points, palette, { phase, grain: 0.02 });
  surface.drawPolygonOutline(points, outline);
}

function drawFacetedModule(surface, x, y, w, h, bevel, palette, outline, phase = 0) {
  const points = [
    { x: x + bevel, y },
    { x: x + w - bevel, y },
    { x: x + w, y: y + Math.floor(h / 2) },
    { x: x + w - bevel, y: y + h },
    { x: x + bevel, y: y + h },
    { x, y: y + Math.floor(h / 2) },
  ];
  surface.fillDitheredPolygon(points, palette, { phase, grain: 0.02 });
  surface.drawPolygonOutline(points, outline);
}

function drawNode(surface, x, y, color, shadow) {
  surface.fillRect(x - 1, y - 1, 3, 3, shadow);
  surface.setPixel(x, y, color);
  surface.setPixel(x + 1, y, color);
  surface.setPixel(x, y + 1, color);
}

function shadePixel(surface, x, y, color, amount) {
  const current = surface.getPixel(Math.round(x), Math.round(y));
  if (!current?.a) return;
  surface.setPixel(x, y, mixRgbWithHex(current, color, amount), current.a);
}

function drawHullLighting(surface, norm, palette, hullPoints, hull) {
  const minX = Math.floor(hull.tailX);
  const maxX = Math.ceil(hull.noseX);
  const minY = Math.floor(hull.cy - hull.half);
  const maxY = Math.ceil(hull.cy + hull.half);
  const height = Math.max(1, maxY - minY);
  const width = Math.max(1, maxX - minX);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (!pointInPolygon(x + 0.5, y + 0.5, hullPoints)) continue;
      const vertical = (y - minY) / height;
      const forward = (x - minX) / width;
      const bayer = ditherValue(x, y) / 15;
      if (vertical < 0.34 && bayer > vertical * 0.9) {
        shadePixel(surface, x, y, palette.rim, 0.2 + norm.thrust * 0.08);
      }
      if (vertical > 0.58 && bayer < vertical) {
        shadePixel(surface, x, y, palette.deep, 0.22 + vertical * 0.22);
      }
      if (forward > 0.7 && vertical > 0.3 && vertical < 0.62 && bayer > 0.34) {
        shadePixel(surface, x, y, palette.light, 0.12);
      }
      const diagonalSheen = Math.sin(x * 0.22 - y * 0.18 + norm.thrust * 1.7);
      if (vertical > 0.18 && vertical < 0.56 && forward > 0.16 && forward < 0.92 && diagonalSheen > 0.78 && bayer > 0.42) {
        shadePixel(surface, x, y, palette.rim, 0.12);
      }
      if (vertical > 0.46 && forward > 0.12 && diagonalSheen < -0.86 && bayer < 0.46) {
        shadePixel(surface, x, y, palette.deep, 0.12);
      }
    }
  }

  const split = Math.floor(hullPoints.length / 2);
  for (let i = 1; i <= split; i += 1) {
    const a = hullPoints[i - 1];
    const b = hullPoints[i];
    surface.drawLine(a.x, a.y, b.x, b.y, palette.rim);
  }
  for (let i = split + 1; i < hullPoints.length - 1; i += 1) {
    const a = hullPoints[i];
    const b = hullPoints[i + 1];
    surface.drawLine(a.x, a.y, b.x, b.y, palette.deep);
  }
}

function drawHullPanels(surface, norm, palette, hull) {
  const lineCount = Math.round(4 + norm.cargoCapacity * 2);
  const lineColor = mixHex(palette.panel, palette.deep, 0.42);
  for (let i = 0; i < lineCount; i += 1) {
    const t = (i + 0.8) / (lineCount + 1);
    const x = Math.round(lerp(hull.tailX + 10, hull.noseX - 18, t));
    const h = Math.round(hull.half * (0.34 + 0.24 * Math.sin(t * Math.PI)));
    if (ditherValue(x, i) > 4) {
      surface.drawLine(x, hull.cy - h, x + 2, hull.cy - 3, lineColor);
      surface.drawLine(x + 2, hull.cy + 3, x, hull.cy + h, palette.deep);
    }
  }

  const spineColor = mixHex(palette.rim, palette.base, 0.35);
  surface.drawLine(hull.tailX + 12, hull.cy - 1, hull.noseX - 15, hull.cy - 1, spineColor);
  surface.drawLine(hull.tailX + 18, hull.cy + 3, hull.noseX - 22, hull.cy + 3, palette.deep);
}

function drawFrameworkUnderlay(surface, norm, palette, hull) {
  const topY = Math.round(hull.cy - hull.half - 8);
  const bottomY = Math.round(hull.cy + hull.half + 8);
  const startX = Math.round(hull.tailX + 4);
  const endX = Math.round(hull.noseX - 10);
  const frameColor = mixHex(palette.frame, "#f0f0ea", 0.12);
  const dark = palette.frameDark;

  surface.drawLine(startX, topY, endX, topY + 3, dark);
  surface.drawLine(startX, bottomY, endX, bottomY - 3, dark);
  surface.drawLine(startX + 1, topY - 1, endX, topY + 2, frameColor);
  surface.drawLine(startX + 1, bottomY + 1, endX, bottomY - 2, frameColor);

  const bayCount = 5;
  for (let i = 0; i <= bayCount; i += 1) {
    const t = i / bayCount;
    const x = Math.round(lerp(startX + 3, endX - 2, t));
    const top = Math.round(lerp(topY, topY + 3, t));
    const bottom = Math.round(lerp(bottomY, bottomY - 3, t));
    surface.drawLine(x, top, x, bottom, dark);
    if (i < bayCount) {
      const nx = Math.round(lerp(startX + 3, endX - 2, (i + 1) / bayCount));
      const ntop = Math.round(lerp(topY, topY + 3, (i + 1) / bayCount));
      const nbottom = Math.round(lerp(bottomY, bottomY - 3, (i + 1) / bayCount));
      const flip = i % 2 === 0;
      surface.drawLine(x, flip ? top : bottom, nx, flip ? nbottom : ntop, frameColor);
    }
    drawNode(surface, x, top, frameColor, dark);
    drawNode(surface, x, bottom, frameColor, dark);
  }

  const tailFrameX = Math.round(hull.tailX - 4);
  surface.drawLine(tailFrameX, topY + 4, tailFrameX, bottomY - 4, dark);
  surface.drawLine(tailFrameX + 1, topY + 5, tailFrameX + 1, bottomY - 5, frameColor);
  surface.drawLine(tailFrameX, topY + 4, startX + 4, hull.cy - 5, dark);
  surface.drawLine(tailFrameX, bottomY - 4, startX + 4, hull.cy + 5, dark);

  if (norm.stealth > 0.45) {
    surface.drawLine(startX + 12, topY - 3, endX - 18, topY, "#21364e");
    surface.drawLine(startX + 12, bottomY + 3, endX - 18, bottomY, "#21364e");
  }
}

function drawFrameworkOverlay(surface, norm, palette, hull) {
  const frameColor = mixHex(palette.frame, "#f0f0ea", 0.08);
  const dark = palette.frameDark;
  const startX = Math.round(hull.tailX + 8);
  const endX = Math.round(hull.noseX - 14);
  const upperY = Math.round(hull.cy - hull.half * 0.54);
  const lowerY = Math.round(hull.cy + hull.half * 0.55);
  const spineY = Math.round(hull.cy);

  surface.drawLine(startX, spineY, endX, spineY, dark);
  surface.drawLine(startX + 1, spineY - 1, endX - 1, spineY - 1, frameColor);
  surface.drawLine(startX + 5, upperY, endX - 9, upperY + 2, frameColor);
  surface.drawLine(startX + 5, lowerY, endX - 9, lowerY - 2, dark);

  const ribCount = 5;
  for (let i = 0; i < ribCount; i += 1) {
    const t = (i + 0.55) / ribCount;
    const x = Math.round(lerp(startX, endX, t));
    const lean = i % 2 === 0 ? 3 : -2;
    surface.drawLine(x, upperY + 1, x + lean, lowerY - 1, dark);
    if (i % 2 === 0) {
      surface.drawLine(x + 1, upperY + 2, x + lean + 1, spineY - 1, frameColor);
    }
    drawNode(surface, x, spineY - 1, frameColor, dark);
  }

  const noseFrame = Math.round(hull.noseX - 9);
  surface.drawLine(endX - 4, upperY + 2, noseFrame, hull.cy - 2, frameColor);
  surface.drawLine(endX - 4, lowerY - 2, noseFrame, hull.cy + 2, dark);
  surface.drawLine(noseFrame, hull.cy - 4, hull.noseX + 2, hull.cy, frameColor);
  surface.drawLine(noseFrame, hull.cy + 4, hull.noseX + 2, hull.cy, dark);
}

function getHullBounds(points) {
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const cy = Math.round((minY + maxY) / 2);
  return {
    tailX: Math.min(...points.map((point) => point.x)),
    noseX: Math.max(...points.map((point) => point.x)),
    half: Math.max(...points.map((point) => Math.abs(point.y - cy))),
    cy,
  };
}

function getShieldEnvelope(hull, norm) {
  const thrustVisual = 0.42 + norm.thrust * 0.58;
  const cargoReach = norm.cargoCapacity > 0.08 ? 6 + norm.thrust * 7 + 2 + (5 + norm.cargoCapacity * 3) : 0;
  const passengerReach = norm.passengerCapacity > 0.08 ? 7 + norm.passengerCapacity * 18 : 0;
  const weaponReach = norm.combatPower > 0.08 ? 9 + Math.max(0, (norm.combatPower - 0.38) / 0.62) * 8 : 0;
  const rearWeaponReach = norm.combatPower >= 7 / MAX_TRAIT_VALUE ? 14 + norm.thrust * 7 + 6 : 0;
  const thrustReach = thrustVisual > 0.28 ? 6 + thrustVisual * 18 + (6 + thrustVisual * 5) / 2 : 0;
  const frontPassengerX = norm.passengerCapacity > 0.08 ? hull.noseX - 36 + 24 + norm.passengerCapacity * 26 : hull.noseX;
  const frontWeaponX = norm.combatPower >= 4 / MAX_TRAIT_VALUE
    ? hull.noseX - 18 + 16 + Math.min(1, Math.max(0, (norm.combatPower - 4 / MAX_TRAIT_VALUE) / (5 / MAX_TRAIT_VALUE))) * 10
    : hull.noseX;
  const frontPairX = norm.combatPower > 0.08 ? hull.noseX - 38 + 14 + norm.combatPower * 11 : hull.noseX;
  const half = Math.ceil(Math.max(hull.half, cargoReach, passengerReach, weaponReach, rearWeaponReach, thrustReach) + 3);
  return {
    tailX: hull.tailX - 12,
    noseX: Math.max(hull.noseX, frontPassengerX, frontWeaponX, frontPairX),
    half,
    cy: hull.cy,
  };
}

function drawShip(traits, stats) {
  const rng = mulberry32(hashString(`${state.seed}|${JSON.stringify(traits)}|${stats.mass}`));
  const norm = getNormalizedTraits(traits);
  const surface = createPixelSurface(LOW_WIDTH, LOW_HEIGHT, DETAIL_SCALE);
  drawBackground(surface, rng);
  const palette = buildPalette(norm, rng);
  const hullPoints = createHullPolygon(norm);
  const hull = getHullBounds(hullPoints);
  hull.shieldEnvelope = getShieldEnvelope(hull, norm);

  drawShipShadow(surface, hull);
  drawFrameworkUnderlay(surface, norm, palette, hull);
  drawEngines(surface, norm, palette, rng, hull);
  surface.fillDitheredPolygon(hullPoints, palette, {
    phase: Math.round(rng() * 100),
    grain: 0.05 + norm.stealth * 0.04,
    facetShade: true,
    panelNoise: norm.stealth > 0.24 || stats.mass > 210,
  });
  drawHullLighting(surface, norm, palette, hullPoints, hull);
  drawHullPanels(surface, norm, palette, hull);
  surface.drawPolygonOutline(hullPoints, palette.outline);
  drawFrameworkOverlay(surface, norm, palette, hull);
  drawCargoPods(surface, norm, palette, hull);
  drawPassengerSections(surface, norm, palette, hull);
  drawWeapons(surface, norm, palette, hull);
  drawStealth(surface, norm, palette, hull);
  drawBridge(surface, norm, palette, hull);
  drawDefenseShield(surface, norm, palette, hull);

  const ctx = elements.canvas.getContext("2d");
  const offscreen = document.createElement("canvas");
  offscreen.width = surface.pixelWidth;
  offscreen.height = surface.pixelHeight;
  offscreen.getContext("2d").putImageData(surface.imageData, 0, 0);
  elements.canvas.width = surface.pixelWidth;
  elements.canvas.height = surface.pixelHeight;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
  ctx.drawImage(offscreen, 0, 0, elements.canvas.width, elements.canvas.height);
}

function drawBridge(surface, norm, palette, hull) {
  if (norm.passengerCapacity < 0.12) return;
  const x = Math.round(lerp(hull.tailX, hull.noseX, 0.58));
  const y = Math.round(hull.cy - hull.half * 0.42);
  const w = Math.round(10 + norm.passengerCapacity * 7);
  const h = Math.round(4 + norm.passengerCapacity * 5);
  const bridgePalette = {
    base: mixHex(palette.base, "#f0eadb", 0.09),
    light: mixHex(palette.light, "#f0eadb", 0.18),
    shadow: mixHex(palette.shadow, "#070708", 0.1),
  };
  surface.fillDitheredRect(x - w / 2, y - h, w, h, bridgePalette, { phase: 2 });
  outlineRect(surface, x - w / 2, y - h, w, h, palette.outline);
  if (norm.stealth < 0.68) {
    for (let wx = Math.round(x - w / 2 + 3); wx < x + w / 2 - 2; wx += 4) {
      surface.setPixel(wx, y - h + 2, palette.window);
    }
  }
}

function drawShipShadow(surface, hull) {
  const y = Math.round(hull.cy + hull.half + 9);
  const startX = Math.round(hull.tailX + 12);
  const endX = Math.round(hull.noseX - 16);
  for (let x = startX; x < endX; x += 1) {
    const t = (x - startX) / Math.max(1, endX - startX);
    const spread = Math.sin(t * Math.PI) * 4;
    for (let dy = -spread; dy <= spread; dy += 1) {
      const py = y + Math.round(dy);
      if (ditherValue(x, py) < 6) {
        surface.setPixel(x, py, "#07070a");
      }
    }
  }
}

function buildShipName(traits, rngSeed) {
  const rng = mulberry32(hashString(rngSeed));
  const prefixes = ["Kestrel", "Nadir", "Vesper", "Argent", "Morrow", "Aster", "Helix", "Pale"];
  const suffixes = ["Frame", "Keel", "Array", "Lance", "Drifter", "Ark", "Vector", "Shell"];
  const topTrait = [...TRAITS].sort((a, b) => traits[b.key] - traits[a.key])[0];
  const code = Math.floor(100 + rng() * 900);
  return `${prefixes[Math.floor(rng() * prefixes.length)]} ${suffixes[Math.floor(rng() * suffixes.length)]} ${code}-${topTrait.short.toUpperCase()}`;
}

function renderControls() {
  elements.seedInput.value = state.seed;
  elements.traitControls.innerHTML = "";
  for (const trait of TRAITS) {
    const wrapper = document.createElement("div");
    wrapper.className = "trait-control";
    wrapper.innerHTML = `
      <div class="trait-head">
        <label for="${trait.key}">${trait.label}</label>
        <span id="${trait.key}Value">${state.traits[trait.key]}</span>
      </div>
      <div class="range-wrap">
        <input id="${trait.key}" type="range" min="0" max="${MAX_TRAIT_VALUE}" step="1" value="${state.traits[trait.key]}" />
        <span class="mass-tag">+${trait.mass.toFixed(1)}t</span>
      </div>
    `;
    const input = wrapper.querySelector("input");
    input.style.accentColor = trait.color;
    input.addEventListener("input", () => {
      state.traits[trait.key] = Number(input.value);
      wrapper.querySelector(`#${trait.key}Value`).textContent = input.value;
      render();
    });
    elements.traitControls.appendChild(wrapper);
  }
}

function renderReadout(traits) {
  elements.traitReadout.innerHTML = "";
  for (const trait of TRAITS) {
    const pill = document.createElement("article");
    pill.className = "trait-pill";
    pill.innerHTML = `<span>${trait.short}</span><strong>${traits[trait.key]}</strong>`;
    elements.traitReadout.appendChild(pill);
  }
}

function render() {
  const traits = getEffectiveTraits();
  const stats = getDerivedStats(traits);
  elements.massValue.textContent = `${stats.mass}t`;
  elements.speedValue.textContent = stats.speed;
  elements.fuelValue.textContent = stats.fuel;
  elements.riskValue.textContent = `${stats.risk}%`;
  elements.shipName.textContent = buildShipName(traits, state.seed);
  renderReadout(traits);
  drawShip(traits, stats);
}

function randomizeTraits() {
  const rng = mulberry32(hashString(`${state.seed}|trait-randomize|${Date.now()}`));
  for (const trait of TRAITS) {
    state.traits[trait.key] = Math.round(rng() * MAX_TRAIT_VALUE);
  }
  renderControls();
  render();
}

function exportPng() {
  const link = document.createElement("a");
  link.href = elements.canvas.toDataURL("image/png");
  link.download = `${elements.shipName.textContent.toLowerCase().replace(/\s+/g, "-")}.png`;
  link.click();
}

async function copyBuild() {
  const traits = getEffectiveTraits();
  const stats = getDerivedStats(traits);
  const payload = {
    seed: state.seed,
    traits,
    derived: stats,
  };
  const text = JSON.stringify(payload, null, 2);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      copyTextFallback(text);
    }
    flashButton(elements.copyBuild, "Kopierad");
  } catch {
    try {
      copyTextFallback(text);
      flashButton(elements.copyBuild, "Kopierad");
    } catch {
      flashButton(elements.copyBuild, "Blockerad");
    }
  }
}

function copyTextFallback(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function flashButton(button, label) {
  const previous = button.textContent;
  button.textContent = label;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    button.textContent = previous;
  }, 1200);
}

function bindEvents() {
  elements.seedInput.addEventListener("change", () => {
    state.seed = elements.seedInput.value.trim() || makeSeed();
    elements.seedInput.value = state.seed;
    render();
  });
  elements.rerollSeed.addEventListener("click", () => {
    state.seed = makeSeed();
    renderControls();
    render();
  });
  elements.randomizeTraits.addEventListener("click", randomizeTraits);
  elements.exportPng.addEventListener("click", exportPng);
  elements.copyBuild.addEventListener("click", copyBuild);
}

bindEvents();
renderControls();
render();
