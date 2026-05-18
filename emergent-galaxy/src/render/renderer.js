import { worldToScreen } from '../camera/camera.js';
import { getCapitalBonusMultiplier } from '../core/capitalBonuses.js';
import { formatInfrastructureCost, MAX_INFRASTRUCTURE_LEVEL } from '../core/infrastructureCosts.js';
import { getPopulationCreditsForPlanet } from '../core/resourceEconomy.js';
import { getWeightedResourceAmount } from '../core/systemPools.js';
import {
  calculatePlanetPopulationCap,
  calculatePlanetPopulationGrowth,
  calculateStarDevelopment,
  calculateStarPopulationCap,
  calculateStarPopulationGrowth,
  estimatePlanetDisplayPeriodsToFill,
  estimatePlanetDisplayPeriodsToNinety,
  estimateStarDisplayPeriodsToFill,
  estimateStarDisplayPeriodsToNinety,
} from '../core/population.js';

function formatMoveCountdown(durationMs) {
  const totalSeconds = Math.max(0, Math.ceil((Number(durationMs) || 0) / 1000));
  if (totalSeconds >= 3600) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.ceil((totalSeconds % 3600) / 60);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  if (totalSeconds >= 60) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  return `${totalSeconds}s`;
}

// ---------- Geometry helpers ----------

function clipPolygonWithHalfPlane(polygon, a, b, c) {
  const result = [];
  if (!polygon.length) return result;

  const epsilon = 1e-6;

  function isInside(point) {
    return a * point.x + b * point.y <= c + epsilon;
  }

  function intersect(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const denom = a * dx + b * dy;

    if (Math.abs(denom) < epsilon) {
      return { x: p2.x, y: p2.y };
    }

    const t = (c - a * p1.x - b * p1.y) / denom;

    return {
      x: p1.x + dx * t,
      y: p1.y + dy * t,
    };
  }

  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];

    const currentInside = isInside(current);
    const nextInside = isInside(next);

    if (currentInside && nextInside) {
      result.push(next);
    } else if (currentInside && !nextInside) {
      result.push(intersect(current, next));
    } else if (!currentInside && nextInside) {
      result.push(intersect(current, next));
      result.push(next);
    }
  }

  return result;
}

function polygonToScreen(camera, viewport, polygon) {
  return polygon.map((p) => worldToScreen(camera, viewport, p.x, p.y));
}

function drawPolygonPath(ctx, polygon) {
  if (!polygon.length) return;

  ctx.beginPath();
  ctx.moveTo(polygon[0].x, polygon[0].y);

  for (let i = 1; i < polygon.length; i++) {
    ctx.lineTo(polygon[i].x, polygon[i].y);
  }

  ctx.closePath();
}

function pointKey(p, precision = 3) {
  return `${p.x.toFixed(precision)},${p.y.toFixed(precision)}`;
}

function edgeKey(p1, p2, precision = 3) {
  const a = pointKey(p1, precision);
  const b = pointKey(p2, precision);
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function getGalaxyBounds(stars, padding = 1200) {
  if (!stars.length) {
    return {
      minX: -1000,
      minY: -1000,
      maxX: 1000,
      maxY: 1000,
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const star of stars) {
    if (star.x < minX) minX = star.x;
    if (star.y < minY) minY = star.y;
    if (star.x > maxX) maxX = star.x;
    if (star.y > maxY) maxY = star.y;
  }

  return {
    minX: minX - padding,
    minY: minY - padding,
    maxX: maxX + padding,
    maxY: maxY + padding,
  };
}

function createBoundingPolygon(bounds) {
  const centerX = (bounds.minX + bounds.maxX) * 0.5;
  const centerY = (bounds.minY + bounds.maxY) * 0.5;
  const radiusX = (bounds.maxX - bounds.minX) * 0.5;
  const radiusY = (bounds.maxY - bounds.minY) * 0.5;
  const segments = 48;
  const polygon = [];

  for (let index = 0; index < segments; index++) {
    const angle = (index / segments) * Math.PI * 2;
    polygon.push({
      x: centerX + Math.cos(angle) * radiusX,
      y: centerY + Math.sin(angle) * radiusY,
    });
  }

  return polygon;
}

function computeVoronoiCell(star, allStars, bounds) {
  let cell = createBoundingPolygon(bounds);

  for (const other of allStars) {
    if (other.id === star.id) continue;

    const mx = (star.x + other.x) * 0.5;
    const my = (star.y + other.y) * 0.5;
    const dx = other.x - star.x;
    const dy = other.y - star.y;

    const a = dx;
    const b = dy;
    const c = dx * mx + dy * my;

    cell = clipPolygonWithHalfPlane(cell, a, b, c);

    if (cell.length === 0) break;
  }

  return cell;
}

function createEmptyVoronoiData() {
  return {
    bounds: null,
    cellsByStarId: new Map(),
    edgeMap: new Map(),
    adjacentPairs: [],
  };
}

function getTerritoryStarIds(territories) {
  const starIds = new Set();

  for (const territory of territories.values()) {
    for (const starId of territory.stars ?? []) {
      starIds.add(starId);
    }
  }

  return starIds;
}

function buildVoronoiCellsForStarIds(stars, targetStarIds) {
  if (!targetStarIds?.size) {
    return createEmptyVoronoiData();
  }

  const bounds = getGalaxyBounds(stars);
  const cellsByStarId = new Map();
  const starById = new Map();

  for (const star of stars) {
    if (!targetStarIds.has(star.id)) {
      continue;
    }

    starById.set(star.id, star);
    const cell = computeVoronoiCell(star, stars, bounds);
    cellsByStarId.set(star.id, cell);
  }

  const edgeMap = buildSharedEdgeMap(cellsByStarId);

  return {
    bounds,
    cellsByStarId,
    edgeMap,
    adjacentPairs: getAdjacentStarPairs(starById, edgeMap),
  };
}

function buildSharedEdgeMap(cellsByStarId) {
  const edgeMap = new Map();

  for (const [starId, polygon] of cellsByStarId.entries()) {
    for (let i = 0; i < polygon.length; i++) {
      const p1 = polygon[i];
      const p2 = polygon[(i + 1) % polygon.length];
      const key = edgeKey(p1, p2, 3);

      if (!edgeMap.has(key)) {
        edgeMap.set(key, []);
      }

      edgeMap.get(key).push({
        starId,
        p1,
        p2,
      });
    }
  }

  return edgeMap;
}

// Chaikin smoothing for closed polygons
function smoothClosedPolygon(points, iterations = 2) {
  if (!points || points.length < 3) return points || [];

  let result = [...points];

  for (let k = 0; k < iterations; k++) {
    const next = [];

    for (let i = 0; i < result.length; i++) {
      const p0 = result[i];
      const p1 = result[(i + 1) % result.length];

      next.push(
        {
          x: p0.x * 0.75 + p1.x * 0.25,
          y: p0.y * 0.75 + p1.y * 0.25,
        },
        {
          x: p0.x * 0.25 + p1.x * 0.75,
          y: p0.y * 0.25 + p1.y * 0.75,
        }
      );
    }

    result = next;
  }

  return result;
}

function getSmoothedScreenCell(camera, viewport, cell, smoothingIterations = 2) {
  const screenCell = polygonToScreen(camera, viewport, cell);
  return smoothClosedPolygon(screenCell, smoothingIterations);
}

// ---------- Territory boundary extraction ----------

function buildOwnedBoundarySegments(edgeMap, ownedSet) {
  const segments = [];

  for (const [, edges] of edgeMap.entries()) {
    if (edges.length === 1) {
      const edge = edges[0];
      if (ownedSet.has(edge.starId)) {
        segments.push({
          p1: edge.p1,
          p2: edge.p2,
        });
      }
      continue;
    }

    if (edges.length === 2) {
      const aOwned = ownedSet.has(edges[0].starId);
      const bOwned = ownedSet.has(edges[1].starId);

      if (aOwned && !bOwned) {
        segments.push({
          p1: edges[0].p1,
          p2: edges[0].p2,
        });
      } else if (!aOwned && bOwned) {
        segments.push({
          p1: edges[1].p1,
          p2: edges[1].p2,
        });
      }
    }
  }

  return segments;
}

function buildBoundaryLoops(segments) {
  if (!segments.length) return [];

  const adjacency = new Map();

  function addConnection(point, segmentIndex) {
    const key = pointKey(point, 3);
    if (!adjacency.has(key)) adjacency.set(key, []);
    adjacency.get(key).push(segmentIndex);
  }

  for (let i = 0; i < segments.length; i++) {
    addConnection(segments[i].p1, i);
    addConnection(segments[i].p2, i);
  }

  const used = new Set();
  const loops = [];

  for (let startIndex = 0; startIndex < segments.length; startIndex++) {
    if (used.has(startIndex)) continue;

    let currentSegmentIndex = startIndex;
    let currentPoint = segments[currentSegmentIndex].p1;
    const loop = [];

    while (true) {
      if (used.has(currentSegmentIndex)) break;
      used.add(currentSegmentIndex);

      const segment = segments[currentSegmentIndex];
      const forward =
        pointKey(segment.p1, 3) === pointKey(currentPoint, 3);

      const nextPoint = forward ? segment.p2 : segment.p1;

      loop.push({ x: currentPoint.x, y: currentPoint.y });
      currentPoint = nextPoint;

      const nextCandidates = adjacency
        .get(pointKey(currentPoint, 3))
        .filter((idx) => !used.has(idx));

      if (!nextCandidates.length) {
        break;
      }

      currentSegmentIndex = nextCandidates[0];

      if (
        nextCandidates.length === 1 &&
        pointKey(currentPoint, 3) === pointKey(loop[0], 3)
      ) {
        break;
      }
    }

    if (loop.length >= 3) {
      loops.push(loop);
    }
  }

  return loops;
}

function buildTerritoryRenderData(edgeMap, state) {
  const loopsByTerritoryId = new Map();
  const smoothedLoopsByTerritoryId = new Map();
  const starTerritoryByStarId = new Map();
  const territoryRgbById = new Map();
  const ownedStarIds = new Set();

  for (const [territoryId, territory] of state.territories.entries()) {
    territoryRgbById.set(territoryId, hexToRgb(territory.color));

    for (const starId of territory.stars) {
      starTerritoryByStarId.set(starId, territory);
      ownedStarIds.add(starId);
    }

    if (territory.stars.size === 0) {
      loopsByTerritoryId.set(territoryId, []);
      smoothedLoopsByTerritoryId.set(territoryId, {
        0: [],
        1: [],
        2: [],
        3: [],
        5: [],
      });
      continue;
    }

    const segments = buildOwnedBoundarySegments(edgeMap, territory.stars);
    const loops = buildBoundaryLoops(segments);
    loopsByTerritoryId.set(territoryId, loops);
    smoothedLoopsByTerritoryId.set(territoryId, {
      0: loops,
      1: loops.map((loop) => smoothClosedPolygon(loop, 1)),
      2: loops.map((loop) => smoothClosedPolygon(loop, 2)),
      3: loops.map((loop) => smoothClosedPolygon(loop, 3)),
      5: loops.map((loop) => smoothClosedPolygon(loop, 5)),
    });
  }

  return {
    loopsByTerritoryId,
    smoothedLoopsByTerritoryId,
    starTerritoryByStarId,
    territoryRgbById,
    ownedStarIds,
  };
}

function buildTerritoryMembershipData(state) {
  const starTerritoryByStarId = new Map();
  const territoryRgbById = new Map();
  const ownedStarIds = new Set();

  for (const [territoryId, territory] of state.territories.entries()) {
    territoryRgbById.set(territoryId, hexToRgb(territory.color));

    for (const starId of territory.stars) {
      starTerritoryByStarId.set(starId, territory);
      ownedStarIds.add(starId);
    }
  }

  return {
    starTerritoryByStarId,
    territoryRgbById,
    ownedStarIds,
  };
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 100, g: 255, b: 140 };
}

function getVisibleTerritoryStarColor(rgb) {
  const luminance = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
  if (luminance >= 95) {
    return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  }

  const lift = Math.min(170, 95 - luminance + 55);
  const boosted = {
    r: Math.min(255, Math.round(rgb.r + lift)),
    g: Math.min(255, Math.round(rgb.g + lift)),
    b: Math.min(255, Math.round(rgb.b + lift)),
  };

  return `rgb(${boosted.r}, ${boosted.g}, ${boosted.b})`;
}

function getStableSeed(value) {
  const text = String(value ?? '');
  let hash = 2166136261;

  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function getStarburstSeed(starId) {
  return getStableSeed(starId);
}

function seededUnit(seed, salt) {
  let value = seed + Math.imul(salt + 1, 374761393);
  value = Math.imul(value ^ (value >>> 16), 2246822519);
  value = Math.imul(value ^ (value >>> 13), 3266489917);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function drawStarburst(ctx, x, y, radius, rgb, starId, opacityMultiplier = 1) {
  const safeOpacity = Math.max(0, Math.min(1, opacityMultiplier)) * 0.82;
  if (safeOpacity <= 0) {
    return;
  }

  const seed = getStarburstSeed(starId);
  const armCount = 5 + Math.floor(seededUnit(seed, 0) * 6);
  const rotation = seededUnit(seed, 1) * Math.PI * 2;
  const scale = 1.18 + seededUnit(seed, 2) * 0.98;
  const glowPower = 0.72 + seededUnit(seed, 3) * 0.52;
  const glowRadius = Math.max(18, radius * (14 + seededUnit(seed, 4) * 10) * scale);
  const baseSpike = Math.max(18, radius * (14 + seededUnit(seed, 5) * 12) * scale);
  const coreGap = Math.max(1.7, radius * 1.15);

  const drawArm = (angle, length, width, opacity) => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const innerX = cos * coreGap;
    const innerY = sin * coreGap;
    const outerX = cos * length;
    const outerY = sin * length;

    ctx.beginPath();
    ctx.moveTo(x + innerX, y + innerY);
    ctx.lineTo(x + outerX, y + outerY);
    ctx.strokeStyle = `rgba(${rgb.r}, ${Math.min(255, rgb.g + 65)}, ${Math.min(255, rgb.b + 85)}, ${opacity * safeOpacity * glowPower})`;
    ctx.lineWidth = width;
    ctx.stroke();
  };

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.lineCap = 'round';

  const glow = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
  glow.addColorStop(0, `rgba(255, 255, 255, ${0.56 * safeOpacity * glowPower})`);
  glow.addColorStop(0.18, `rgba(${rgb.r}, ${Math.min(255, rgb.g + 80)}, ${Math.min(255, rgb.b + 95)}, ${0.38 * safeOpacity * glowPower})`);
  glow.addColorStop(0.58, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.12 * safeOpacity * glowPower})`);
  glow.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
  ctx.fill();

  for (let i = 0; i < armCount; i++) {
    const jitter = (seededUnit(seed, 20 + i) - 0.5) * 0.28;
    const angle = rotation + (i / armCount) * Math.PI * 2 + jitter;
    const length = baseSpike * (0.58 + seededUnit(seed, 40 + i) * 0.82);
    const width = Math.max(0.9, radius * (0.46 + seededUnit(seed, 60 + i) * 0.82));
    const opacity = 0.2 + seededUnit(seed, 80 + i) * 0.3;

    drawArm(angle, length, width, opacity);
    drawArm(angle + Math.PI, length * (0.45 + seededUnit(seed, 100 + i) * 0.5), width * 0.72, opacity * 0.72);
  }

  for (let i = 0; i < Math.min(4, armCount); i++) {
    const angle = rotation + (i / Math.min(4, armCount)) * Math.PI * 2 + seededUnit(seed, 130 + i) * 0.18;
    drawArm(angle, baseSpike * (0.72 + seededUnit(seed, 150 + i) * 0.34), Math.max(0.65, radius * 0.28), 0.54);
    drawArm(angle + Math.PI, baseSpike * (0.4 + seededUnit(seed, 170 + i) * 0.28), Math.max(0.55, radius * 0.2), 0.34);
  }

  ctx.fillStyle = `rgba(${rgb.r}, ${Math.min(255, rgb.g + 90)}, ${Math.min(255, rgb.b + 100)}, ${0.22 * safeOpacity * glowPower})`;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(2.2, radius * 2.35), 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(255, 255, 255, ${0.52 * safeOpacity})`;
  ctx.lineWidth = Math.max(0.7, radius * 0.24);
  ctx.beginPath();
  ctx.arc(x, y, Math.max(1.4, radius * 1.7), 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawCapitalGlow(ctx, x, y, radius, rgb, opacityMultiplier = 1) {
  const safeOpacity = Math.max(0, Math.min(1, opacityMultiplier));
  if (safeOpacity <= 0) {
    return;
  }

  const glowRadius = Math.max(26, radius);
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
  gradient.addColorStop(0, `rgba(255, 244, 202, ${0.42 * safeOpacity})`);
  gradient.addColorStop(0.2, `rgba(${rgb.r}, ${Math.min(255, rgb.g + 70)}, ${Math.min(255, rgb.b + 80)}, ${0.28 * safeOpacity})`);
  gradient.addColorStop(0.58, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.12 * safeOpacity})`);
  gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(255, 244, 202, ${0.16 * safeOpacity})`;
  ctx.lineWidth = Math.max(1, glowRadius * 0.035);
  ctx.beginPath();
  ctx.arc(x, y, glowRadius * 0.38, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawOwnedTerritoryMass(ctx, camera, viewport, loopsByTerritoryId, smoothedLoopsByTerritoryId, territoryRgbById, state) {
  if (state.territories.size === 0) return;

  const quality = getTerritoryRenderQuality(camera.zoom, state);

  ctx.save();

  for (const [territoryId, territory] of state.territories.entries()) {
    const loops = loopsByTerritoryId.get(territoryId) || [];
    const smoothedLoops = smoothedLoopsByTerritoryId.get(territoryId)?.[quality.smoothingIterations] || loops;

    if (!loops.length) continue;

    const rgb = territoryRgbById.get(territoryId) ?? hexToRgb(territory.color);
    const fillColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${quality.fillOpacity})`;
    const shadowColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${quality.shadowOpacity})`;
    const outerBorderColor = `rgba(${rgb.r}, ${Math.min(255, rgb.g + 40)}, ${Math.min(255, rgb.b + 45)}, ${quality.outerBorderOpacity})`;
    const topBorderColor = `rgba(${rgb.r}, ${Math.min(255, rgb.g + 30)}, ${Math.min(255, rgb.b + 35)}, ${quality.topBorderOpacity})`;

    for (const loop of smoothedLoops) {
      const screenLoop = polygonToScreen(camera, viewport, loop);

      // soft fill
      ctx.shadowColor = shadowColor;
      ctx.shadowBlur = quality.shadowBlur;

      drawPolygonPath(ctx, screenLoop);
      ctx.fillStyle = fillColor;
      ctx.fill();

      ctx.shadowBlur = 0;

      // soft outer border
      drawPolygonPath(ctx, screenLoop);
      ctx.strokeStyle = outerBorderColor;
      ctx.lineWidth = quality.outerBorderWidth;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();

      // sharper top border
      drawPolygonPath(ctx, screenLoop);
      ctx.strokeStyle = topBorderColor;
      ctx.lineWidth = quality.topBorderWidth;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawTerritoryStarClouds(ctx, camera, viewport, visibleStars, starTerritoryByStarId, territoryRgbById, state) {
  if (state.territories.size === 0 || starTerritoryByStarId.size === 0) return;

  const motionBlend = state.performanceMode ? 1 : (state.motionVisualBlend ?? 0);
  const opacity = Math.max(0.04, 0.12 * (1 - motionBlend * 0.5));
  const radius = Math.max(18, Math.min(56, 26 / Math.max(0.25, camera.zoom)));

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  for (const star of visibleStars) {
    const territory = starTerritoryByStarId.get(star.id);
    if (!territory) {
      continue;
    }

    const rgb = territoryRgbById.get(territory.id) ?? hexToRgb(territory.color);
    const p = worldToScreen(camera, viewport, star.x, star.y);
    const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
    gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`);
    gradient.addColorStop(0.72, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity * 0.38})`);
    gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function getTerritoryRenderQuality(zoom, state) {
  const performanceMode = state.performanceMode ?? false;
  const motionBlend = state.motionVisualBlend ?? 0;
  const reducedDetailBlend = performanceMode ? 1 : motionBlend;

  if (reducedDetailBlend >= 0.5) {
    if (zoom < 0.28) {
      return {
        smoothingIterations: 0,
        shadowBlur: 0,
        outerBorderWidth: 2,
        topBorderWidth: 0.8,
        fillOpacity: 0.12 - 0.04 * reducedDetailBlend,
        shadowOpacity: 0.14 * Math.max(0, 1 - reducedDetailBlend),
        outerBorderOpacity: 0.14 - 0.04 * reducedDetailBlend,
        topBorderOpacity: 0.5 - 0.22 * reducedDetailBlend,
      };
    }

    return {
      smoothingIterations: 1,
      shadowBlur: 4,
      outerBorderWidth: 4,
      topBorderWidth: 1.25,
      fillOpacity: 0.12 - 0.02 * reducedDetailBlend,
      shadowOpacity: 0.14 - 0.06 * reducedDetailBlend,
      outerBorderOpacity: 0.14 - 0.02 * reducedDetailBlend,
      topBorderOpacity: 0.5 - 0.14 * reducedDetailBlend,
    };
  }

  if (zoom < 0.12) {
    return {
      smoothingIterations: 0,
      shadowBlur: 0,
      outerBorderWidth: 3,
      topBorderWidth: 1,
      fillOpacity: 0.12,
      shadowOpacity: 0.14,
      outerBorderOpacity: 0.14,
      topBorderOpacity: 0.5,
    };
  }

  if (zoom < 0.28) {
    return {
      smoothingIterations: 2,
      shadowBlur: 8,
      outerBorderWidth: 6,
      topBorderWidth: 1.5,
      fillOpacity: 0.12,
      shadowOpacity: 0.14,
      outerBorderOpacity: 0.14,
      topBorderOpacity: 0.5,
    };
  }

  return {
    smoothingIterations: 5,
    shadowBlur: 22,
    outerBorderWidth: 10,
    topBorderWidth: 2.5,
    fillOpacity: 0.12,
    shadowOpacity: 0.14,
    outerBorderOpacity: 0.14,
    topBorderOpacity: 0.5,
  };
}

function drawSelectedCell(ctx, camera, viewport, selectedStar, cellsByStarId, state) {
  if (!selectedStar) return;

  const cell = cellsByStarId.get(selectedStar.id);
  if (!cell || cell.length < 3) return;

  const reducedDetailBlend = state.performanceMode ? 1 : (state.motionVisualBlend ?? 0);
  const smoothCell = getSmoothedScreenCell(
    camera,
    viewport,
    cell,
    reducedDetailBlend >= 0.5 ? 1 : 3
  );

  ctx.save();

  drawPolygonPath(ctx, smoothCell);
  ctx.fillStyle = `rgba(255, 209, 102, ${0.05 * (1 - reducedDetailBlend * 0.65)})`;
  ctx.fill();

  drawPolygonPath(ctx, smoothCell);
  ctx.strokeStyle = `rgba(255, 209, 102, ${0.55 * (1 - reducedDetailBlend * 0.35)})`;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(255, 209, 102, 0.22)';
  ctx.shadowBlur = 8 - reducedDetailBlend * 6;
  ctx.stroke();

  ctx.restore();
}

function getAdjacentStarPairs(starById, edgeMap) {
  const pairs = [];

  for (const [, edges] of edgeMap.entries()) {
    if (edges.length === 2) {
      const star1 = starById.get(edges[0].starId);
      const star2 = starById.get(edges[1].starId);
      if (star1 && star2) {
        pairs.push([star1, star2]);
      }
    }
  }

  return pairs;
}

function drawStarConnections(ctx, camera, viewport, adjacentPairs, hoveredStarId, starTerritoryByStarId, state) {
  const motionBlend = state.performanceMode ? 1 : (state.motionVisualBlend ?? 0);
  const drawOwnedConnections =
    !state.performanceMode && starTerritoryByStarId.size > 0 && motionBlend < 0.98;

  if (!hoveredStarId && !drawOwnedConnections) {
    return;
  }

  ctx.save();
  const connectionOpacity = 0.3 * (1 - motionBlend);
  ctx.strokeStyle = `rgba(255, 255, 255, ${connectionOpacity})`;
  ctx.lineWidth = 1;

  for (const [star1, star2] of adjacentPairs) {
    let shouldDraw = false;
    
    // Draw if hovering over either star
    if (star1.id === hoveredStarId || star2.id === hoveredStarId) {
      shouldDraw = true;
    }
    
    // Draw territory connections only inside a territory, never from an owned star out to unowned space.
    if (!shouldDraw && drawOwnedConnections) {
      const star1Territory = starTerritoryByStarId.get(star1.id);
      const star2Territory = starTerritoryByStarId.get(star2.id);
      shouldDraw = Boolean(star1Territory?.id && star1Territory.id === star2Territory?.id);
    }

    if (shouldDraw) {
      const p1 = worldToScreen(camera, viewport, star1.x, star1.y);
      const p2 = worldToScreen(camera, viewport, star2.x, star2.y);

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawInfoBox(ctx, x, y, width, height, radius = 8) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawCapitalCrown(ctx, x, y, size, opacityMultiplier = 1) {
  const width = Math.max(8, size);
  const height = width * 0.7;
  const baseY = y - width * 1.15;
  const left = x - width / 2;
  const right = x + width / 2;
  const baseTop = baseY + height * 0.55;
  const tipInset = width * 0.18;
  const safeOpacity = Math.max(0, Math.min(1, opacityMultiplier));

  ctx.save();
  ctx.globalAlpha = safeOpacity;
  ctx.beginPath();
  ctx.moveTo(left, baseTop);
  ctx.lineTo(left + tipInset, baseY + height * 0.15);
  ctx.lineTo(x, baseY + height * 0.42);
  ctx.lineTo(right - tipInset, baseY);
  ctx.lineTo(right, baseTop);
  ctx.lineTo(right, baseY + height);
  ctx.lineTo(left, baseY + height);
  ctx.closePath();

  ctx.fillStyle = '#ffd166';
  ctx.shadowColor = 'rgba(255, 222, 132, 0.78)';
  ctx.shadowBlur = width * 0.9;
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255, 250, 218, 1)';
  ctx.lineWidth = Math.max(1.2, width * 0.1);
  ctx.lineJoin = 'round';
  ctx.stroke();

  ctx.globalCompositeOperation = 'screen';
  ctx.strokeStyle = 'rgba(255, 244, 200, 0.65)';
  ctx.shadowColor = 'rgba(255, 209, 102, 0.9)';
  ctx.shadowBlur = width * 0.75;
  ctx.lineWidth = Math.max(1, width * 0.16);
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowBlur = 0;

  for (const point of [
    { x: left + tipInset, y: baseY + height * 0.15 },
    { x, y: baseY + height * 0.42 },
    { x: right - tipInset, y: baseY },
  ]) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, Math.max(1.25, width * 0.08), 0, Math.PI * 2);
    ctx.fillStyle = '#fff3b0';
    ctx.shadowColor = 'rgba(255, 243, 176, 0.95)';
    ctx.shadowBlur = width * 0.45;
    ctx.fill();
  }

  ctx.restore();
}

function drawMissionShipIcon(ctx, x, y, radius = 15, status = 'placing') {
  const accent = status === 'arrived' ? '#86efac' : status === 'moving' ? '#7dd3fc' : '#ffd9c2';
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = `${accent}aa`;
  ctx.shadowBlur = 14;
  ctx.fillStyle = 'rgba(5, 10, 22, 0.94)';
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -radius);
  ctx.lineTo(radius * 0.72, radius * 0.74);
  ctx.lineTo(0, radius * 0.38);
  ctx.lineTo(-radius * 0.72, radius * 0.74);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(0, -radius * 0.08, Math.max(2.6, radius * 0.18), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawMoveMissionRoute(ctx, camera, viewport, state, routeStarIds = [], revealProgress = 1) {
  const routeStars = routeStarIds.map((id) => state.starsById?.get(id)).filter(Boolean);
  if (routeStars.length < 2) {
    return;
  }

  const screenPoints = routeStars.map((star) => worldToScreen(camera, viewport, star.x, star.y));
  const segments = [];
  let totalLength = 0;
  for (let index = 0; index < screenPoints.length - 1; index++) {
    const from = screenPoints[index];
    const to = screenPoints[index + 1];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    segments.push({ from, to, length });
    totalLength += length;
  }

  let remainingLength = totalLength * Math.max(0, Math.min(1, revealProgress));

  ctx.save();
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(125, 211, 252, 0.88)';
  ctx.shadowColor = 'rgba(125, 211, 252, 0.55)';
  ctx.shadowBlur = 10;
  ctx.beginPath();

  if (segments.length) {
    ctx.moveTo(segments[0].from.x, segments[0].from.y);
    for (const segment of segments) {
      if (remainingLength <= 0) {
        break;
      }

      if (remainingLength >= segment.length) {
        ctx.lineTo(segment.to.x, segment.to.y);
        remainingLength -= segment.length;
        continue;
      }

      const t = segment.length > 0 ? remainingLength / segment.length : 1;
      ctx.lineTo(
        segment.from.x + (segment.to.x - segment.from.x) * t,
        segment.from.y + (segment.to.y - segment.from.y) * t
      );
      remainingLength = 0;
      break;
    }
  }

  ctx.stroke();
  ctx.shadowBlur = 0;

  const nodeRevealDistance = totalLength * Math.max(0, Math.min(1, revealProgress));
  let cumulativeDistance = 0;
  for (let index = 0; index < screenPoints.length; index++) {
    const point = screenPoints[index];
    if (index > 0) {
      cumulativeDistance += segments[index - 1]?.length ?? 0;
    }
    if (cumulativeDistance > nodeRevealDistance + 0.5) {
      break;
    }

    ctx.fillStyle = 'rgba(5, 10, 22, 0.92)';
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.95)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

export function createRenderer(state) {
  let cachedTerritoryVoronoiStars = null;
  let cachedTerritoryVoronoiRevision = -1;
  let cachedTerritoryVoronoi = createEmptyVoronoiData();
  let cachedTerritorySignature = '';
  let cachedTerritoryRenderData = {
    loopsByTerritoryId: new Map(),
    smoothedLoopsByTerritoryId: new Map(),
    starTerritoryByStarId: new Map(),
    territoryRgbById: new Map(),
    ownedStarIds: new Set(),
  };
  let cachedSelectedCellStars = null;
  let cachedSelectedCellBounds = null;
  let cachedSelectedCellsByStarId = new Map();
  let cachedTerritoryMembershipSignature = '';
  let cachedTerritoryMembershipData = {
    starTerritoryByStarId: new Map(),
    territoryRgbById: new Map(),
    ownedStarIds: new Set(),
  };

  let lastSelectedStarId = null;
  let isPlanetListOpen = false;
  let selectedPlanetId = null;
  let planetsLineBounds = null;
  let planetListBoxBounds = null;
  let planetItemBounds = [];
  let infrastructureControlBounds = [];
  let infrastructureSaveButtonBounds = null;
  let starCollectButtonBounds = null;
  let starCapitalButtonBounds = null;
  let moveMissionDialogBounds = null;
  let attackMissionDialogBounds = null;
  let tradeMissionDialogBounds = null;
  let activeTradeRouteBounds = [];
  let piracyZoneBounds = [];
  let moveMissionShipBounds = [];
  let motionVisualBlend = 0;
  let lastMotionBlendTimestamp = performance.now();

  function canManageInfrastructureForStar(star) {
    if (!star || !state.currentTerritoryId) {
      return false;
    }

    const activeTerritory = state.territories.get(state.currentTerritoryId);
    return activeTerritory?.stars?.has(star.id) ?? false;
  }

  function formatNumber(value, digits = 0) {
    return Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }

  function resize() {
    const nativeDpr = window.devicePixelRatio || 1;
    const dpr = state.performanceMode || state.isCameraMoving
      ? Math.min(nativeDpr, 1.1)
      : nativeDpr;
    const width = state.canvas.clientWidth || window.innerWidth;
    const height = state.canvas.clientHeight || window.innerHeight;

    state.canvas.width = Math.floor(width * dpr);
    state.canvas.height = Math.floor(height * dpr);
    state.canvas.style.width = `${width}px`;
    state.canvas.style.height = `${height}px`;

    state.ctx.setTransform(1, 0, 0, 1, 0, 0);
    state.ctx.scale(dpr, dpr);
  }

  function ensureTerritoryVoronoiCache(stars) {
    const territoryRevision = state.territoryRevision ?? 0;

    if (
      stars !== cachedTerritoryVoronoiStars ||
      territoryRevision !== cachedTerritoryVoronoiRevision
    ) {
      cachedTerritoryVoronoi = buildVoronoiCellsForStarIds(
        stars,
        getTerritoryStarIds(state.territories)
      );
      cachedTerritoryVoronoiStars = stars;
      cachedTerritoryVoronoiRevision = territoryRevision;
      cachedTerritorySignature = '';
    }
  }

  function getSelectedCellsByStarId(stars, selectedStar) {
    if (!selectedStar) {
      return null;
    }

    if (stars !== cachedSelectedCellStars) {
      cachedSelectedCellStars = stars;
      cachedSelectedCellBounds = getGalaxyBounds(stars);
      cachedSelectedCellsByStarId = new Map();
    }

    if (!cachedSelectedCellsByStarId.has(selectedStar.id)) {
      cachedSelectedCellsByStarId.set(
        selectedStar.id,
        computeVoronoiCell(selectedStar, stars, cachedSelectedCellBounds)
      );
    }

    return cachedSelectedCellsByStarId;
  }

  function getSystemPoolUsedCapacity(poolResources) {
    return getWeightedResourceAmount(poolResources);
  }

  function summarizePoolResources(poolResources) {
    const summary = Object.entries(poolResources || {})
      .filter(([, amount]) => amount > 0)
      .map(([resource, amount]) => `${resource}: ${formatNumber(amount)}`)
      .join(' | ');

    if (!summary) {
      return 'Empty';
    }

    return summary.length > 34 ? `${summary.slice(0, 31)}...` : summary;
  }

  function ensureTerritoryRenderCache() {
    const territorySignature = `${cachedTerritoryVoronoiRevision}|${state.territoryRevision ?? 0}`;

    if (territorySignature !== cachedTerritorySignature) {
      cachedTerritoryRenderData = buildTerritoryRenderData(cachedTerritoryVoronoi.edgeMap, state);
      cachedTerritorySignature = territorySignature;
    }
  }

  function ensureTerritoryMembershipCache() {
    const territorySignature = `${state.territoryRevision ?? 0}`;

    if (territorySignature !== cachedTerritoryMembershipSignature) {
      cachedTerritoryMembershipData = buildTerritoryMembershipData(state);
      cachedTerritoryMembershipSignature = territorySignature;
    }
  }

  function getStationedShipStarIds() {
    const stationedShipStarIds = new Set();

    for (const ship of state.playerState?.ships ?? []) {
      const starId = ship?.position ?? ship?.starId ?? null;
      if (!starId || starId === 'Moving' || starId === 'Trading' || starId === 'Piracy') {
        continue;
      }

      stationedShipStarIds.add(starId);
    }

    return stationedShipStarIds;
  }

  function drawStationedShipDot(ctx, x, y, starRadius, zoom) {
    const dotRadius = Math.max(4.2, Math.min(8.5, starRadius * 1.85 + zoom * 1.35));

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(56, 189, 248, 0.9)';
    ctx.strokeStyle = 'rgba(4, 12, 28, 0.92)';
    ctx.lineWidth = Math.max(1.4, dotRadius * 0.34);
    ctx.beginPath();
    ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(186, 230, 253, 0.72)';
    ctx.lineWidth = Math.max(0.8, dotRadius * 0.16);
    ctx.beginPath();
    ctx.arc(x, y, dotRadius * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawMoveMissionEntry(ctx, camera, viewport, width, height, moveMission, { allowDialog = false } = {}) {
    if (!moveMission?.active) {
      return;
    }

    const originStar = state.starsById?.get(moveMission.originStarId);
    const markerWorld = moveMission.markerWorld ?? originStar;
    if (!originStar || !markerWorld) {
      return;
    }

    const originPoint = worldToScreen(camera, viewport, originStar.x, originStar.y);
    const markerPoint = worldToScreen(camera, viewport, markerWorld.x, markerWorld.y);
    const routeRevealProgress = moveMission.routeRevealStartedAt
      ? Math.min(1, (performance.now() - moveMission.routeRevealStartedAt) / 500)
      : 1;
    drawMoveMissionRoute(ctx, camera, viewport, state, moveMission.routeStarIds, routeRevealProgress);
    if (routeRevealProgress < 1) {
      state.invalidateRender?.();
    }

    ctx.save();
    ctx.setLineDash([8, 7]);
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = 'rgba(255, 217, 194, 0.68)';
    ctx.beginPath();
    ctx.moveTo(originPoint.x, originPoint.y);
    ctx.lineTo(markerPoint.x, markerPoint.y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(255, 217, 194, 0.92)';
    ctx.beginPath();
    ctx.arc(originPoint.x, originPoint.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    drawMissionShipIcon(ctx, markerPoint.x, markerPoint.y, 16, moveMission.status);
    if (moveMission.status === 'moving' || moveMission.status === 'arrived') {
      moveMissionShipBounds.push({
        x: markerPoint.x - 24,
        y: markerPoint.y - 24,
        width: 48,
        height: 48,
        missionId: moveMission.id,
        ship: moveMission.ship,
      });
    }

    if (moveMission.status === 'placing' && !moveMission.showDestinationDialog) {
      const label = 'Drag marker to destination';
      ctx.save();
      ctx.font = '700 11px Arial';
      const labelWidth = Math.ceil(ctx.measureText(label).width) + 20;
      const labelX = markerPoint.x - labelWidth / 2;
      const labelY = markerPoint.y + 26;
      ctx.fillStyle = 'rgba(5, 10, 22, 0.86)';
      ctx.strokeStyle = 'rgba(125, 211, 252, 0.38)';
      drawInfoBox(ctx, labelX, labelY, labelWidth, 26, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#bae6fd';
      ctx.textAlign = 'center';
      ctx.fillText(label, markerPoint.x, labelY + 8);
      ctx.restore();

      if (allowDialog) {
        const boxWidth = 212;
        const boxHeight = 98;
        const boxX = Math.min(width - boxWidth - 14, Math.max(14, markerPoint.x + 22));
        const boxY = Math.min(height - boxHeight - 14, Math.max(14, markerPoint.y - boxHeight - 18));
        const padding = 12;
        const cancelButton = {
          x: boxX + padding,
          y: boxY + boxHeight - padding - 30,
          width: 78,
          height: 30,
        };

        ctx.save();
        ctx.fillStyle = 'rgba(5, 10, 22, 0.92)';
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.62)';
        ctx.lineWidth = 1;
        drawInfoBox(ctx, boxX, boxY, boxWidth, boxHeight, 10);
        ctx.fill();
        ctx.stroke();
        ctx.textBaseline = 'top';
        ctx.font = '700 11px Arial';
        ctx.fillStyle = '#7dd3fc';
        ctx.fillText('Move Mission', boxX + padding, boxY + padding);
        ctx.font = '12px Arial';
        ctx.fillStyle = '#eef4ff';
        ctx.fillText('Choose a destination', boxX + padding, boxY + padding + 22);
        ctx.fillStyle = 'rgba(232,239,255,0.58)';
        ctx.fillText('Drag the marker to a system', boxX + padding, boxY + padding + 42);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
        drawInfoBox(ctx, cancelButton.x, cancelButton.y, cancelButton.width, cancelButton.height, 7);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(232,239,255,0.72)';
        ctx.font = '700 11px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Cancel', cancelButton.x + cancelButton.width / 2, cancelButton.y + 9);
        ctx.restore();

        moveMissionDialogBounds = {
          cancel: cancelButton,
          calculate: null,
          move: null,
        };
      }
    }

    if (moveMission.status === 'moving' || moveMission.status === 'arrived') {
      const remainingMs = Math.max(0, Number(moveMission.travelArrivesAtMs ?? 0) - Date.now());
      const label = moveMission.status === 'arrived'
        ? 'Arrived'
        : `Moving - ${formatMoveCountdown(remainingMs)} left`;
      ctx.save();
      ctx.font = '11px Arial';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(232,239,255,0.92)';
      ctx.fillText(label, markerPoint.x, markerPoint.y + 30);
      ctx.restore();
      return;
    }

    if (!allowDialog) {
      return;
    }

    if (!moveMission.showDestinationDialog || !moveMission.destinationStarId) {
      return;
    }

    const destinationStar = state.starsById?.get(moveMission.destinationStarId);
    if (!destinationStar) {
      return;
    }

    const boxWidth = 312;
    const boxHeight = moveMission.routeStarIds?.length ? 218 : 156;
    const boxX = Math.min(width - boxWidth - 14, Math.max(14, markerPoint.x + 22));
    const boxY = Math.min(height - boxHeight - 14, Math.max(14, markerPoint.y - boxHeight - 18));
    const padding = 12;

    ctx.save();
    ctx.fillStyle = 'rgba(5, 10, 22, 0.92)';
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.62)';
    ctx.lineWidth = 1;
    drawInfoBox(ctx, boxX, boxY, boxWidth, boxHeight, 10);
    ctx.fill();
    ctx.stroke();

    ctx.textBaseline = 'top';
    ctx.font = '700 11px Arial';
    ctx.fillStyle = '#7dd3fc';
    ctx.fillText('Destination', boxX + padding, boxY + padding);
    ctx.font = '12px Arial';
    ctx.fillStyle = '#eef4ff';
    ctx.fillText(`The destination is ${destinationStar.name}`, boxX + padding, boxY + padding + 22);
    ctx.fillStyle = 'rgba(232,239,255,0.58)';
    ctx.fillText('You can still move the marker', boxX + padding, boxY + padding + 44);
    ctx.font = '700 11px Arial';
    ctx.fillStyle = 'rgba(232,239,255,0.68)';
    ctx.fillText('Map Route', boxX + padding, boxY + padding + 74);

    if (moveMission.routeStarIds?.length) {
      ctx.font = '11px Arial';
      ctx.fillStyle = 'rgba(186,230,253,0.78)';
      ctx.fillText(`${Math.max(0, moveMission.routeStarIds.length - 1)} jumps calculated`, boxX + padding, boxY + padding + 94);
      ctx.fillStyle = 'rgba(232,239,255,0.76)';
      ctx.fillText(`Distance ${moveMission.travelSummary?.distanceText ?? '-'}`, boxX + padding, boxY + padding + 112);
      ctx.fillText(`ETA ${moveMission.travelSummary?.travelTimeText ?? '-'}`, boxX + padding, boxY + padding + 130);
      ctx.fillText(`Speed ${moveMission.travelSummary?.speedText ?? '-'}`, boxX + padding, boxY + padding + 148);
      ctx.fillStyle = 'rgba(232,239,255,0.48)';
      ctx.fillText(moveMission.travelSummary?.realTimeText ?? '', boxX + padding, boxY + padding + 166);
    }

    const buttonY = boxY + boxHeight - padding - 30;
    const cancelButton = {
      x: boxX + padding,
      y: buttonY,
      width: 70,
      height: 30,
    };
    const calculateButton = {
      x: boxX + padding + 80,
      y: buttonY,
      width: 104,
      height: 30,
    };
    const moveButton = {
      x: boxX + boxWidth - padding - 86,
      y: buttonY,
      width: 86,
      height: 30,
    };

    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    drawInfoBox(ctx, cancelButton.x, cancelButton.y, cancelButton.width, cancelButton.height, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(232,239,255,0.72)';
    ctx.font = '700 11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Cancel', cancelButton.x + cancelButton.width / 2, cancelButton.y + 9);

    ctx.fillStyle = 'rgba(125, 211, 252, 0.16)';
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.48)';
    drawInfoBox(ctx, calculateButton.x, calculateButton.y, calculateButton.width, calculateButton.height, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#bae6fd';
    ctx.font = '700 11px Arial';
    ctx.fillText('Calculate', calculateButton.x + calculateButton.width / 2, calculateButton.y + 9);

    let canMove = Boolean(moveMission.routeStarIds?.length);
    if (canMove) {
      ctx.fillStyle = 'rgba(255, 217, 194, 0.18)';
      ctx.strokeStyle = 'rgba(255, 217, 194, 0.52)';
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    }
    drawInfoBox(ctx, moveButton.x, moveButton.y, moveButton.width, moveButton.height, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = canMove ? '#ffd9c2' : 'rgba(232,239,255,0.34)';
    ctx.fillText('Move', moveButton.x + moveButton.width / 2, moveButton.y + 9);
    ctx.textAlign = 'left';

    ctx.restore();

    moveMissionDialogBounds = {
      cancel: cancelButton,
      calculate: calculateButton,
      move: {
        ...moveButton,
        disabled: !canMove,
      },
    };
  }

  function drawMoveMissionOverlay(ctx, camera, viewport, width, height) {
    moveMissionDialogBounds = null;
    moveMissionShipBounds = [];

    const renderedMissionIds = new Set();
    for (const moveMission of state.moveMissions ?? []) {
      drawMoveMissionEntry(ctx, camera, viewport, width, height, moveMission, { allowDialog: false });
      if (moveMission?.id) {
        renderedMissionIds.add(moveMission.id);
      }
    }

    const plannedMission = state.moveMission;
    if (plannedMission?.active && !renderedMissionIds.has(plannedMission.id)) {
      drawMoveMissionEntry(ctx, camera, viewport, width, height, plannedMission, { allowDialog: true });
    }
  }

  function drawAttackMissionOverlay(ctx, camera, viewport, width, height) {
    attackMissionDialogBounds = null;

    const attackMission = state.attackMission;
    if (!attackMission?.active || !attackMission.targetStarId) {
      return;
    }

    const targetStar = state.starsById?.get(attackMission.targetStarId);
    if (!targetStar) {
      return;
    }

    const targetPoint = worldToScreen(camera, viewport, targetStar.x, targetStar.y);
    const pulse = 0.5 + Math.sin(performance.now() / 160) * 0.5;
    const ringRadius = Math.max(20, targetStar.radius * camera.zoom * 5.6);

    ctx.save();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = `rgba(251, 113, 133, ${0.62 + pulse * 0.22})`;
    ctx.beginPath();
    ctx.arc(targetPoint.x, targetPoint.y, ringRadius + pulse * 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([8, 7]);
    ctx.strokeStyle = 'rgba(255, 217, 194, 0.72)';
    ctx.beginPath();
    ctx.arc(targetPoint.x, targetPoint.y, ringRadius * 0.68, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    state.invalidateRender?.();

    const boxWidth = 306;
    const boxHeight = attackMission.message ? 162 : 140;
    const boxX = Math.min(width - boxWidth - 14, Math.max(14, targetPoint.x + 24));
    const boxY = Math.min(height - boxHeight - 14, Math.max(14, targetPoint.y - boxHeight - 22));
    const padding = 12;
    const buttonY = boxY + boxHeight - padding - 30;
    const cancelButton = {
      x: boxX + padding,
      y: buttonY,
      width: 78,
      height: 30,
    };
    const confirmButton = {
      x: boxX + boxWidth - padding - 94,
      y: buttonY,
      width: 94,
      height: 30,
    };

    ctx.save();
    ctx.fillStyle = 'rgba(12, 7, 18, 0.94)';
    ctx.strokeStyle = 'rgba(251, 113, 133, 0.62)';
    ctx.lineWidth = 1;
    drawInfoBox(ctx, boxX, boxY, boxWidth, boxHeight, 10);
    ctx.fill();
    ctx.stroke();

    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.font = '700 11px Arial';
    ctx.fillStyle = '#fb7185';
    ctx.fillText('Attack Mission', boxX + padding, boxY + padding);
    ctx.font = '12px Arial';
    ctx.fillStyle = '#eef4ff';
    ctx.fillText(`Target: ${targetStar.name}`, boxX + padding, boxY + padding + 24);
    ctx.fillStyle = 'rgba(232,239,255,0.62)';
    ctx.fillText(`Defender: ${attackMission.defenderName ?? targetStar.owner ?? 'Unknown'}`, boxX + padding, boxY + padding + 46);

    if (attackMission.message) {
      ctx.fillStyle = '#fca5a5';
      ctx.fillText(attackMission.message, boxX + padding, boxY + padding + 70);
    } else {
      ctx.fillStyle = 'rgba(255, 217, 194, 0.78)';
      ctx.fillText('Confirm to capture this system.', boxX + padding, boxY + padding + 70);
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    drawInfoBox(ctx, cancelButton.x, cancelButton.y, cancelButton.width, cancelButton.height, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(232,239,255,0.72)';
    ctx.font = '700 11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Cancel', cancelButton.x + cancelButton.width / 2, cancelButton.y + 9);

    ctx.fillStyle = 'rgba(251, 113, 133, 0.18)';
    ctx.strokeStyle = 'rgba(251, 113, 133, 0.54)';
    drawInfoBox(ctx, confirmButton.x, confirmButton.y, confirmButton.width, confirmButton.height, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fecdd3';
    ctx.fillText('Confirm', confirmButton.x + confirmButton.width / 2, confirmButton.y + 9);
    ctx.restore();

    attackMissionDialogBounds = {
      cancel: cancelButton,
      confirm: confirmButton,
    };
  }

  function getActiveTradeRoutes() {
    const routesById = new Map();
    const ships = state.playerState?.ships ?? [];

    for (const ship of ships) {
      const position = ship?.position ?? ship?.starId ?? null;
      if (position !== 'Trading' || !ship.tradeOriginStarId || !ship.tradeDestinationStarId) {
        continue;
      }

      const originStar = state.starsById?.get(ship.tradeOriginStarId);
      const destinationStar = state.starsById?.get(ship.tradeDestinationStarId);
      if (!originStar || !destinationStar) {
        continue;
      }

      const routeId = ship.tradeRouteId ?? `trade:${[originStar.id, destinationStar.id].sort().join('|')}`;
      const shipCount = Math.max(1, Math.floor(Number(ship.count) || 1));
      const existingRoute = routesById.get(routeId);
      if (existingRoute) {
        existingRoute.count += shipCount;
        existingRoute.ship = {
          ...existingRoute.ship,
          count: Math.max(1, Math.floor(Number(existingRoute.ship?.count) || 1)) + shipCount,
        };
        continue;
      }

      routesById.set(routeId, {
        routeId,
        originStar,
        destinationStar,
        count: shipCount,
        ship: {
          ...ship,
          position: 'Trading',
          count: shipCount,
          tradeRouteId: routeId,
          tradeOriginStarId: originStar.id,
          tradeDestinationStarId: destinationStar.id,
          tradeOriginName: originStar.name,
          tradeDestinationName: destinationStar.name,
        },
      });
    }

    return Array.from(routesById.values());
  }

  function drawActiveTradeRoutes(ctx, camera, viewport) {
    activeTradeRouteBounds = [];
    const routes = getActiveTradeRoutes();
    if (!routes.length) {
      return;
    }

    ctx.save();
    ctx.lineCap = 'round';

    for (const route of routes) {
      const originPoint = worldToScreen(camera, viewport, route.originStar.x, route.originStar.y);
      const destinationPoint = worldToScreen(camera, viewport, route.destinationStar.x, route.destinationStar.y);

      ctx.lineWidth = Math.min(4.2, 1.8 + route.count * 0.45);
      ctx.setLineDash([10, 8]);
      ctx.strokeStyle = 'rgba(134, 239, 172, 0.68)';
      ctx.shadowColor = 'rgba(134, 239, 172, 0.34)';
      ctx.shadowBlur = 7;
      ctx.beginPath();
      ctx.moveTo(originPoint.x, originPoint.y);
      ctx.lineTo(destinationPoint.x, destinationPoint.y);
      ctx.stroke();

      activeTradeRouteBounds.push({
        routeId: route.routeId,
        ship: route.ship,
        x1: originPoint.x,
        y1: originPoint.y,
        x2: destinationPoint.x,
        y2: destinationPoint.y,
      });
    }

    ctx.restore();
  }

  function getActivePiracyZones() {
    const zones = [];
    const ships = state.playerState?.ships ?? [];

    for (const ship of ships) {
      const position = ship?.position ?? ship?.starId ?? null;
      if (position !== 'Piracy' || !ship.piracyCenterStarId) {
        continue;
      }

      const centerStar = state.starsById?.get(ship.piracyCenterStarId);
      if (!centerStar) {
        continue;
      }

      zones.push({
        id: ship.piracyMissionId ?? `piracy:${ship.piracyCenterStarId}`,
        centerStar,
        radiusLightYears: Math.max(0, Number(ship.piracyRadiusLightYears) || 1000),
        efficiency: Math.max(0, Number(ship.piracyEfficiency) || 0),
        stolenCredits: Math.max(0, Number(ship.piracyStolenCredits) || 0),
        ship: {
          ...ship,
          position: 'Piracy',
        },
      });
    }

    return zones;
  }

  function drawPiracyZones(ctx, camera, viewport) {
    piracyZoneBounds = [];
    const zones = getActivePiracyZones();
    if (!zones.length) {
      return;
    }

    ctx.save();
    for (const zone of zones) {
      const centerPoint = worldToScreen(camera, viewport, zone.centerStar.x, zone.centerStar.y);
      const radiusWorldUnits = zone.radiusLightYears /  (50000 / 18000);
      const radiusPixels = radiusWorldUnits * camera.zoom;

      ctx.setLineDash([8, 8]);
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = 'rgba(251, 113, 133, 0.72)';
      ctx.fillStyle = 'rgba(251, 113, 133, 0.075)';
      ctx.shadowColor = 'rgba(251, 113, 133, 0.28)';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(centerPoint.x, centerPoint.y, radiusPixels, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fecdd3';
      ctx.font = '800 10px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('P', centerPoint.x, centerPoint.y);

      piracyZoneBounds.push({
        id: zone.id,
        ship: zone.ship,
        x: centerPoint.x,
        y: centerPoint.y,
        radius: Math.max(12, radiusPixels),
      });
    }
    ctx.restore();
  }

  function getPointSegmentDistanceSq(pointX, pointY, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq <= 0) {
      const pointDx = pointX - x1;
      const pointDy = pointY - y1;
      return pointDx * pointDx + pointDy * pointDy;
    }

    const t = Math.max(0, Math.min(1, ((pointX - x1) * dx + (pointY - y1) * dy) / lengthSq));
    const projectionX = x1 + t * dx;
    const projectionY = y1 + t * dy;
    const pointDx = pointX - projectionX;
    const pointDy = pointY - projectionY;
    return pointDx * pointDx + pointDy * pointDy;
  }

  function getClickedActiveTradeRoute(screenX, screenY) {
    for (let index = activeTradeRouteBounds.length - 1; index >= 0; index -= 1) {
      const routeBounds = activeTradeRouteBounds[index];
      if (
        getPointSegmentDistanceSq(
          screenX,
          screenY,
          routeBounds.x1,
          routeBounds.y1,
          routeBounds.x2,
          routeBounds.y2
        ) <= 8 * 8
      ) {
        return routeBounds;
      }
    }

    return null;
  }

  function isClickOnStar(screenX, screenY) {
    const { camera, galaxy } = state;
    const width = state.canvas.clientWidth || window.innerWidth;
    const height = state.canvas.clientHeight || window.innerHeight;
    const viewport = { width, height };
    const worldPadding = 40 / camera.zoom;
    const candidateStars = state.starSpatialIndex
      ? state.starSpatialIndex.queryRange(
          camera.x - width / (2 * camera.zoom) - worldPadding,
          camera.y - height / (2 * camera.zoom) - worldPadding,
          camera.x + width / (2 * camera.zoom) + worldPadding,
          camera.y + height / (2 * camera.zoom) + worldPadding
        )
      : galaxy.stars;

    for (const star of candidateStars) {
      const point = worldToScreen(camera, viewport, star.x, star.y);
      const dx = point.x - screenX;
      const dy = point.y - screenY;
      const pickRadius = Math.max(12, star.radius * camera.zoom);
      if (dx * dx + dy * dy <= pickRadius * pickRadius) {
        return true;
      }
    }

    return false;
  }

  function getTradeMissionEndpointPoint(tradeMission, endpoint, star) {
    if (tradeMission.draggingEndpoint === endpoint) {
      return endpoint === 'origin'
        ? tradeMission.originMarkerWorld ?? star
        : tradeMission.destinationMarkerWorld ?? star;
    }

    return star;
  }

  function drawTradeMissionEndpoint(ctx, point, label, color, isDragging = false) {
    ctx.save();
    ctx.shadowColor = `${color}aa`;
    ctx.shadowBlur = isDragging ? 18 : 12;
    ctx.fillStyle = 'rgba(5, 10, 22, 0.96)';
    ctx.strokeStyle = color;
    ctx.lineWidth = isDragging ? 3 : 2;
    ctx.beginPath();
    ctx.arc(point.x, point.y, isDragging ? 11 : 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.font = '800 10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, point.x, point.y);
    ctx.restore();
  }

  function drawTradeMissionOverlay(ctx, camera, viewport, width, height) {
    tradeMissionDialogBounds = null;

    const tradeMission = state.tradeMission;
    if (!tradeMission?.active) {
      return;
    }

    const originStar = state.starsById?.get(tradeMission.originStarId);
    const destinationStar = state.starsById?.get(tradeMission.destinationStarId);
    if (!originStar || !destinationStar) {
      return;
    }

    const originWorld = getTradeMissionEndpointPoint(tradeMission, 'origin', originStar);
    const destinationWorld = getTradeMissionEndpointPoint(tradeMission, 'destination', destinationStar);
    const originPoint = worldToScreen(camera, viewport, originWorld.x, originWorld.y);
    const destinationPoint = worldToScreen(camera, viewport, destinationWorld.x, destinationWorld.y);
    const metrics = tradeMission.metrics ?? {};
    const isValid = Boolean(metrics.valid);
    const isInspectMode = tradeMission.mode === 'inspect';
    const routeColor = isValid ? '#86efac' : '#fb7185';
    const midPoint = {
      x: (originPoint.x + destinationPoint.x) / 2,
      y: (originPoint.y + destinationPoint.y) / 2,
    };

    ctx.save();
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.setLineDash(isValid ? [12, 8] : [5, 7]);
    ctx.strokeStyle = isValid ? 'rgba(134, 239, 172, 0.86)' : 'rgba(251, 113, 133, 0.78)';
    ctx.shadowColor = isValid ? 'rgba(134, 239, 172, 0.5)' : 'rgba(251, 113, 133, 0.45)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(originPoint.x, originPoint.y);
    ctx.lineTo(destinationPoint.x, destinationPoint.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    drawTradeMissionEndpoint(ctx, originPoint, 'A', '#86efac', !isInspectMode && tradeMission.draggingEndpoint === 'origin');
    drawTradeMissionEndpoint(ctx, destinationPoint, 'B', '#67e8f9', !isInspectMode && tradeMission.draggingEndpoint === 'destination');
    ctx.restore();

    const boxWidth = 326;
    const boxHeight = isInspectMode
      ? 226
      : (tradeMission.message ? 208 : 186);
    const routeDx = destinationPoint.x - originPoint.x;
    const routeDy = destinationPoint.y - originPoint.y;
    const routeLength = Math.hypot(routeDx, routeDy);
    const normal = routeLength > 0
      ? { x: -routeDy / routeLength, y: routeDx / routeLength }
      : { x: 1, y: 0 };
    const boxClearance =
      38 +
      Math.abs(normal.x) * boxWidth / 2 +
      Math.abs(normal.y) * boxHeight / 2;
    const margin = 14;
    function getTradeBoxCandidate(sign) {
      const centerX = midPoint.x + normal.x * boxClearance * sign;
      const centerY = midPoint.y + normal.y * boxClearance * sign;
      const rawX = centerX - boxWidth / 2;
      const rawY = centerY - boxHeight / 2;
      const x = Math.min(width - boxWidth - margin, Math.max(margin, rawX));
      const y = Math.min(height - boxHeight - margin, Math.max(margin, rawY));
      return {
        x,
        y,
        overflow: Math.abs(x - rawX) + Math.abs(y - rawY),
      };
    }
    const positiveCandidate = getTradeBoxCandidate(1);
    const negativeCandidate = getTradeBoxCandidate(-1);
    const tradeBox =
      positiveCandidate.overflow <= negativeCandidate.overflow
        ? positiveCandidate
        : negativeCandidate;
    const boxX = tradeBox.x;
    const boxY = tradeBox.y;
    const padding = 12;
    const buttonY = boxY + boxHeight - padding - 30;
    const cancelButton = {
      x: boxX + padding,
      y: buttonY,
      width: 78,
      height: 30,
    };
    const fleetButton = isInspectMode ? {
      x: boxX + boxWidth - padding - 200,
      y: buttonY,
      width: 88,
      height: 30,
    } : null;
    const commitButton = {
      x: boxX + boxWidth - padding - (isInspectMode ? 104 : 104),
      y: buttonY,
      width: 104,
      height: 30,
      disabled: isInspectMode ? false : !isValid || Number(metrics.credits) <= 0,
    };

    ctx.save();
    ctx.fillStyle = 'rgba(5, 18, 16, 0.94)';
    ctx.strokeStyle = isValid ? 'rgba(134, 239, 172, 0.58)' : 'rgba(251, 113, 133, 0.62)';
    ctx.lineWidth = 1;
    drawInfoBox(ctx, boxX, boxY, boxWidth, boxHeight, 10);
    ctx.fill();
    ctx.stroke();

    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.font = '700 11px Arial';
    ctx.fillStyle = routeColor;
    ctx.fillText('Trade Route', boxX + padding, boxY + padding);
    ctx.font = '12px Arial';
    ctx.fillStyle = '#eef4ff';
    ctx.fillText(`${originStar.name} -> ${destinationStar.name}`, boxX + padding, boxY + padding + 24);
    ctx.fillStyle = 'rgba(232,239,255,0.68)';
    ctx.fillText(`Distance ${metrics.distanceText ?? '-'} / ${metrics.maxDistanceText ?? '5,000 ly'}`, boxX + padding, boxY + padding + 46);
    ctx.fillText(`Development ${formatNumber(metrics.originDevelopment)} -> ${formatNumber(metrics.destinationDevelopment)}`, boxX + padding, boxY + padding + 66);
    ctx.fillStyle = isValid ? '#bbf7d0' : '#fca5a5';
    ctx.font = '700 12px Arial';
    ctx.fillText(
      isValid
        ? `Revenue ${formatNumber(metrics.credits)} Credits`
        : 'Route exceeds trade range',
      boxX + padding,
      boxY + padding + 90
    );
    ctx.fillStyle = 'rgba(232,239,255,0.48)';
    ctx.font = '11px Arial';
    ctx.fillText(
      isInspectMode
        ? `${tradeMission.ship?.name ?? tradeMission.ship?.type ?? 'Ship'} on route`
        : 'Drag A or B to change systems.',
      boxX + padding,
      boxY + padding + 114
    );

    if (isInspectMode) {
      ctx.fillStyle = 'rgba(232,239,255,0.68)';
      ctx.fillText(`Fleet size ${formatNumber(tradeMission.ship?.count ?? 1)}`, boxX + padding, boxY + padding + 136);
    } else if (tradeMission.message) {
      ctx.fillStyle = tradeMission.message.includes('Earned') ? '#bbf7d0' : '#fca5a5';
      ctx.fillText(tradeMission.message, boxX + padding, boxY + padding + 136);
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    drawInfoBox(ctx, cancelButton.x, cancelButton.y, cancelButton.width, cancelButton.height, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(232,239,255,0.72)';
    ctx.font = '700 11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(isInspectMode ? 'Close' : 'Cancel', cancelButton.x + cancelButton.width / 2, cancelButton.y + 9);

    if (fleetButton) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      drawInfoBox(ctx, fleetButton.x, fleetButton.y, fleetButton.width, fleetButton.height, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(232,239,255,0.72)';
      ctx.fillText('Open Fleet', fleetButton.x + fleetButton.width / 2, fleetButton.y + 9);
    }

    ctx.fillStyle = commitButton.disabled ? 'rgba(255,255,255,0.06)' : (isInspectMode ? 'rgba(251, 113, 133, 0.16)' : 'rgba(134, 239, 172, 0.17)');
    ctx.strokeStyle = commitButton.disabled ? 'rgba(255,255,255,0.12)' : (isInspectMode ? 'rgba(251, 113, 133, 0.52)' : 'rgba(134, 239, 172, 0.52)');
    drawInfoBox(ctx, commitButton.x, commitButton.y, commitButton.width, commitButton.height, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = commitButton.disabled ? 'rgba(232,239,255,0.34)' : (isInspectMode ? '#fecdd3' : '#bbf7d0');
    ctx.fillText(isInspectMode ? 'Cancel Trade' : 'Start Trade', commitButton.x + commitButton.width / 2, commitButton.y + 9);
    ctx.restore();

    tradeMissionDialogBounds = {
      cancel: cancelButton,
      fleet: fleetButton,
      commit: commitButton,
    };
  }

  function render() {
    const now = performance.now();
    const elapsedSeconds = Math.min(0.1, (now - lastMotionBlendTimestamp) / 1000);
    lastMotionBlendTimestamp = now;
    const motionTarget = state.performanceMode ? 1 : (state.isCameraMoving ? 1 : 0);
    const blendStep = elapsedSeconds * 4;
    if (motionVisualBlend < motionTarget) {
      motionVisualBlend = Math.min(motionTarget, motionVisualBlend + blendStep);
    } else if (motionVisualBlend > motionTarget) {
      motionVisualBlend = Math.max(motionTarget, motionVisualBlend - blendStep);
    }
    state.motionVisualBlend = motionVisualBlend;
    if (Math.abs(motionVisualBlend - motionTarget) > 0.001) {
      state.invalidateRender?.();
    }

    const { ctx, canvas, camera, galaxy, selection } = state;
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    const viewport = { width, height };
    const worldPadding = 40 / camera.zoom;
    const visibleStars = state.starSpatialIndex
      ? state.starSpatialIndex.queryRange(
          camera.x - width / (2 * camera.zoom) - worldPadding,
          camera.y - height / (2 * camera.zoom) - worldPadding,
          camera.x + width / (2 * camera.zoom) + worldPadding,
          camera.y + height / (2 * camera.zoom) + worldPadding
        )
      : galaxy.stars;

    const useBlurTerritories = state.showBlurTerritories;
    let adjacentPairs = [];
    let loopsByTerritoryId = null;
    let smoothedLoopsByTerritoryId = null;
    let starTerritoryByStarId = null;
    let territoryRgbById = null;
    const selected = state.starsById?.get(selection.selectedStarId) || null;
    const selectedCellsByStarId = useBlurTerritories
      ? null
      : getSelectedCellsByStarId(galaxy.stars, selected);

    if (useBlurTerritories) {
      ensureTerritoryMembershipCache();
      ({
        starTerritoryByStarId,
        territoryRgbById,
      } = cachedTerritoryMembershipData);
    } else {
      ensureTerritoryVoronoiCache(galaxy.stars);
      ensureTerritoryRenderCache();
      ({ adjacentPairs } = cachedTerritoryVoronoi);
      ({
        loopsByTerritoryId,
        smoothedLoopsByTerritoryId,
        starTerritoryByStarId,
        territoryRgbById,
      } = cachedTerritoryRenderData);
    }

    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    drawStarConnections(ctx, camera, viewport, adjacentPairs, selection.hoveredStarId, starTerritoryByStarId, state);

    if (lastSelectedStarId !== selection.selectedStarId) {
      isPlanetListOpen = false;
      selectedPlanetId = null;
      planetListBoxBounds = null;
      planetItemBounds = [];
      infrastructureControlBounds = [];
      infrastructureSaveButtonBounds = null;
      starCollectButtonBounds = null;
      starCapitalButtonBounds = null;
      lastSelectedStarId = selection.selectedStarId;
    }

    if (useBlurTerritories) {
      drawTerritoryStarClouds(
        ctx,
        camera,
        viewport,
        visibleStars,
        starTerritoryByStarId,
        territoryRgbById,
        state
      );
    } else {
      drawOwnedTerritoryMass(
        ctx,
        camera,
        viewport,
        loopsByTerritoryId,
        smoothedLoopsByTerritoryId,
        territoryRgbById,
        state
      );
    }

    // Optional selected-system highlight
    if (!useBlurTerritories) {
      drawSelectedCell(ctx, camera, viewport, selected, selectedCellsByStarId, state);
    }

    drawActiveTradeRoutes(ctx, camera, viewport);
    drawPiracyZones(ctx, camera, viewport);

    const auraOpacityMultiplier = Math.max(0, 1 - motionVisualBlend);
    const shouldDrawTerritoryAuras =
      !state.performanceMode && auraOpacityMultiplier > 0.02;

    const shouldDrawCapitalCrowns = true;
    const stationedShipStarIds = getStationedShipStarIds();

    // Stars on top
    for (const star of visibleStars) {
      const p = worldToScreen(camera, viewport, star.x, star.y);

      if (p.x < -20 || p.x > width + 20 || p.y < -20 || p.y > height + 20) {
        continue;
      }

      const r = Math.max(0.8, star.radius * camera.zoom);

      // Find which territory this star belongs to
      const starTerritory = starTerritoryByStarId.get(star.id) || null;
      const isCapital = starTerritory?.capitalStarId === star.id;
      const starTerritoryRgb = starTerritory
        ? territoryRgbById.get(starTerritory.id) ?? hexToRgb(starTerritory.color)
        : null;

      if (
        isCapital &&
        starTerritoryRgb
      ) {
        drawStarburst(ctx, p.x, p.y, r, starTerritoryRgb, star.id, 1);
      }

      // Draw territory aura if star belongs to a territory
      if (starTerritory && shouldDrawTerritoryAuras) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
        const rgb = starTerritoryRgb;
        ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.12 * auraOpacityMultiplier})`;
        ctx.fill();
      }

      if (isCapital && starTerritoryRgb && shouldDrawTerritoryAuras) {
        drawCapitalGlow(ctx, p.x, p.y, Math.max(34, r * 11), starTerritoryRgb, auraOpacityMultiplier);
      }

      if (isCapital && shouldDrawCapitalCrowns) {
        drawCapitalCrown(ctx, p.x, p.y, Math.max(14, r * 4.4), Math.max(0.45, auraOpacityMultiplier));
      }

      let starFillStyle;
      if (selection.selectedStarId === star.id) {
        starFillStyle = '#ffd166';
      } else if (starTerritory) {
        starFillStyle = getVisibleTerritoryStarColor(starTerritoryRgb);
      } else {
        starFillStyle = '#ffffff';
      }

      ctx.beginPath();
      ctx.fillStyle = starFillStyle;
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();

      if (stationedShipStarIds.has(star.id)) {
        drawStationedShipDot(ctx, p.x, p.y, r, camera.zoom);
      }
    }

    if (selected && !state.useReactSystemPanel) {
      const sp = worldToScreen(camera, viewport, selected.x, selected.y);
      const selectedPoolResources = state.playerState?.systemPools?.[selected.id]?.resources ?? {};
      const selectedPoolCapacity = state.playerState?.systemPoolCapacities?.[selected.id] ?? 0;
      const selectedPoolUsed = getSystemPoolUsedCapacity(selectedPoolResources);
      const selectedPoolSummary = summarizePoolResources(selectedPoolResources);
      const canCollectFromStar = canManageInfrastructureForStar(selected);
      const selectedTerritory = starTerritoryByStarId.get(selected.id) || null;
      const selectedIsCapital = selectedTerritory?.capitalStarId === selected.id;
      const capitalGrowthMultiplier = getCapitalBonusMultiplier(
        selected.id,
        selectedTerritory?.capitalStarId ?? null
      );
      const canSetCapital = canCollectFromStar && !selectedIsCapital;
      const starPopulationCap = calculateStarPopulationCap(selected);
      const starPopulationGrowth = calculateStarPopulationGrowth(selected, capitalGrowthMultiplier);
      const starDevelopment = calculateStarDevelopment(selected);
      const starPeriodsToFill = estimateStarDisplayPeriodsToFill(selected, 100000, capitalGrowthMultiplier);
      const starPeriodsToNinety = estimateStarDisplayPeriodsToNinety(selected, 100000, capitalGrowthMultiplier);
      const starTimingLine = `PTF: ${Number.isFinite(starPeriodsToFill) ? formatNumber(starPeriodsToFill) : '--'} | PT90%: ${Number.isFinite(starPeriodsToNinety) ? formatNumber(starPeriodsToNinety) : '--'}`;
      const text = [
        selected.name,
        `Owner: ${selected.owner}`,
        `Star Type: ${selected.starType}`,
        `Energy: ${formatNumber(selected.energyOutput)}`,
        `Population: ${selected.population.toLocaleString()} (+${formatNumber(starPopulationGrowth)} pp)`,
        `Population Cap: ${formatNumber(starPopulationCap)}`,
        ...(state.showPopulationTiming ? [starTimingLine] : []),
        `Defense: ${selected.systemDefense}`,
        `Development: ${formatNumber(starDevelopment)}`,
        `Pool Used: ${formatNumber(selectedPoolUsed)}/${formatNumber(selectedPoolCapacity)}`,
        `Stored: ${selectedPoolSummary}`,
        `Planets: ${selected.planets.length}`,
      ];

      const padding = 8;
      const lineHeight = 16;
      const boxWidth = 220;
      const collectButtonHeight = 16;
      const collectButtonWidth = 58;
      const capitalButtonHeight = 16;
      const capitalButtonWidth = 70;
      const boxHeight = text.length * lineHeight + padding * 2;
      const x = Math.min(width - boxWidth - 12, Math.max(12, sp.x + 20));
      const y = Math.min(height - boxHeight - 12, Math.max(12, sp.y - boxHeight - 20));

      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 1;

      drawInfoBox(ctx, x, y, boxWidth, boxHeight, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = '12px Arial';
      ctx.textBaseline = 'top';

      for (let i = 0; i < text.length; i++) {
        const textY = y + padding + i * lineHeight;
        if (i === text.length - 1) {
          ctx.fillStyle = '#ffd166';
          const planetsText = isPlanetListOpen ? `${text[i]} ▾` : `${text[i]} ▸`;
          ctx.fillText(planetsText, x + padding, textY);
          planetsLineBounds = {
            x: x + padding,
            y: textY,
            width: boxWidth - padding * 2,
            height: lineHeight,
          };
          ctx.beginPath();
          ctx.moveTo(x + padding, textY + lineHeight + 1);
          ctx.lineTo(x + boxWidth - padding, textY + lineHeight + 1);
          ctx.strokeStyle = 'rgba(255, 209, 102, 0.8)';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
        } else {
          if (text[i].startsWith('Pool Used:')) {
            ctx.fillStyle = '#9ad1ff';
          } else if (text[i].startsWith('Stored:')) {
            ctx.fillStyle = 'rgba(255,255,255,0.78)';
          } else {
            ctx.fillStyle = '#ffffff';
          }
          ctx.fillText(text[i], x + padding, textY);
        }
      }

      const collectButtonX = x + boxWidth - padding - collectButtonWidth;
      const collectButtonY = y + padding + (text.length - 1) * lineHeight;
      const collectButtonActive = canCollectFromStar && selectedPoolUsed > 0;
      const capitalButtonX = collectButtonX - 8 - capitalButtonWidth;
      const capitalButtonY = collectButtonY;

      ctx.fillStyle = collectButtonActive ? 'rgba(255, 209, 102, 0.18)' : 'rgba(255, 255, 255, 0.08)';
      drawInfoBox(ctx, collectButtonX, collectButtonY, collectButtonWidth, collectButtonHeight, 5);
      ctx.fill();

      ctx.strokeStyle = collectButtonActive ? 'rgba(255, 209, 102, 0.9)' : 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      drawInfoBox(ctx, collectButtonX, collectButtonY, collectButtonWidth, collectButtonHeight, 5);
      ctx.stroke();

      ctx.fillStyle = collectButtonActive ? '#ffd166' : 'rgba(255,255,255,0.6)';
      ctx.fillText('Collect', collectButtonX + 8, collectButtonY + 1);
      starCollectButtonBounds = canCollectFromStar ? {
        starId: selected.id,
        x: collectButtonX,
        y: collectButtonY,
        width: collectButtonWidth,
        height: collectButtonHeight,
        disabled: !collectButtonActive,
      } : null;

      ctx.fillStyle = canSetCapital ? 'rgba(255, 209, 102, 0.18)' : 'rgba(255, 255, 255, 0.08)';
      drawInfoBox(ctx, capitalButtonX, capitalButtonY, capitalButtonWidth, capitalButtonHeight, 5);
      ctx.fill();

      ctx.strokeStyle = canSetCapital ? 'rgba(255, 209, 102, 0.9)' : 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      drawInfoBox(ctx, capitalButtonX, capitalButtonY, capitalButtonWidth, capitalButtonHeight, 5);
      ctx.stroke();

      ctx.fillStyle = canSetCapital ? '#ffd166' : 'rgba(255,255,255,0.6)';
      ctx.fillText(selectedIsCapital ? 'Capital' : 'Set Capital', capitalButtonX + 6, capitalButtonY + 1);
      starCapitalButtonBounds = canCollectFromStar ? {
        starId: selected.id,
        x: capitalButtonX,
        y: capitalButtonY,
        width: capitalButtonWidth,
        height: capitalButtonHeight,
        disabled: !canSetCapital,
      } : null;

      ctx.restore();

      planetItemBounds = [];

      if (isPlanetListOpen && selected.planets.length > 0) {
        const listLines = selected.planets.map((planet) => `${planet.name} (${planet.type})`);
        const listPadding = 8;
        const listLineHeight = 18;
        const listWidth = boxWidth;
        const listHeight = listLines.length * listLineHeight + listPadding * 2;
        const listX = x;
        const listY = y + boxHeight + 8;

        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 1;
        drawInfoBox(ctx, listX, listY, listWidth, listHeight, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Arial';
        ctx.textBaseline = 'top';
        for (let i = 0; i < listLines.length; i++) {
          const itemY = listY + listPadding + i * listLineHeight;
          const planet = selected.planets[i];
          const isSelectedPlanet = planet.id === selectedPlanetId;
          const itemX = listX + 4;
          const itemWidth = listWidth - 8;

          ctx.fillStyle = isSelectedPlanet ? 'rgba(255, 209, 102, 0.2)' : 'rgba(255, 255, 255, 0.06)';
          drawInfoBox(ctx, itemX, itemY - 2, itemWidth, listLineHeight, 6);
          ctx.fill();

          ctx.strokeStyle = isSelectedPlanet ? 'rgba(255, 209, 102, 0.95)' : 'rgba(255, 255, 255, 0.18)';
          ctx.lineWidth = 1;
          drawInfoBox(ctx, itemX, itemY - 2, itemWidth, listLineHeight, 6);
          ctx.stroke();

          if (isSelectedPlanet) {
            ctx.fillStyle = '#ffd166';
          } else {
            ctx.fillStyle = '#ffffff';
          }

          ctx.fillText(`> ${listLines[i]}`, listX + listPadding + 2, itemY);
          planetItemBounds.push({
            planetId: planet.id,
            x: itemX,
            y: itemY - 2,
            width: itemWidth,
            height: listLineHeight,
          });
        }
        ctx.restore();
        planetListBoxBounds = {
          x: listX,
          y: listY,
          width: listWidth,
          height: listHeight,
        };
      }

      const selectedPlanet =
        selected.planets.find((planet) => planet.id === selectedPlanetId) || null;

      if (selectedPlanet) {
        infrastructureControlBounds = [];
        infrastructureSaveButtonBounds = null;
        const canManageInfrastructure = canManageInfrastructureForStar(selected);
        const resourceText = selectedPlanet.prominentResources.length
          ? selectedPlanet.prominentResources
              .map((resource) => `${resource.name} (${resource.abundance})`)
              .join(', ')
          : 'None';
        const infrastructureEntries = Object.entries(selectedPlanet.infrastructure);
        const populationCap = calculatePlanetPopulationCap(selectedPlanet);
        const populationGrowth = calculatePlanetPopulationGrowth(selectedPlanet, capitalGrowthMultiplier);
        const creditProduction = getPopulationCreditsForPlanet(selectedPlanet);
        const creditPeriodLabel = state.playerState?.resourceUpdateInterval === 'hour' ? 'h' : 'min';
        const planetPeriodsToFill = estimatePlanetDisplayPeriodsToFill(
          selectedPlanet,
          100000,
          capitalGrowthMultiplier
        );
        const planetPeriodsToNinety = estimatePlanetDisplayPeriodsToNinety(
          selectedPlanet,
          100000,
          capitalGrowthMultiplier
        );
        const planetTimingLine = `PTF: ${Number.isFinite(planetPeriodsToFill) ? formatNumber(planetPeriodsToFill) : '--'} | PT90%: ${Number.isFinite(planetPeriodsToNinety) ? formatNumber(planetPeriodsToNinety) : '--'}`;
        const infrastructureLines = infrastructureEntries.map(
          ([key, value]) => {
            const label = key
              .replace(/([A-Z])/g, ' $1')
              .replace(/^./, (char) => char.toUpperCase());
            const activeLevel = selectedPlanet.activeInfrastructure?.[key] ?? value;
            const inactiveLevel = Math.max(0, value - activeLevel);
            const isMaxLevel = value >= MAX_INFRASTRUCTURE_LEVEL;
            const nextLevelCost = isMaxLevel ? null : state.getInfrastructureBuildCost?.(selectedPlanet, key, value + 1);
            const costText = isMaxLevel
              ? ` | Max ${MAX_INFRASTRUCTURE_LEVEL}`
              : nextLevelCost
                ? ` | Next: ${formatInfrastructureCost(nextLevelCost) || 'Free'}`
                : '';
            return inactiveLevel > 0
              ? `  ${label}: ${activeLevel}/${value} active (${inactiveLevel} offline)${costText}`
              : `  ${label}: ${value}${costText}`;
          }
        );

        const detailLines = [
          selectedPlanet.name,
          `Type: ${selectedPlanet.type}`,
          `Habitability: ${selectedPlanet.habitability}`,
          `Population: ${formatNumber(selectedPlanet.population)} (+${formatNumber(populationGrowth)} pp)`,
          `Gold: ${formatNumber(creditProduction)}/${creditPeriodLabel}`,
          `Population Cap: ${formatNumber(populationCap)}`,
          ...(state.showPopulationTiming ? [planetTimingLine] : []),
          `Resources: ${resourceText}`,
          `Infrastructure`,
          ...infrastructureLines,
        ];
        const infrastructureHeaderIndex = detailLines.indexOf('Infrastructure');
        const infrastructureStartIndex = infrastructureHeaderIndex + 1;

        const detailPadding = 8;
        const detailLineHeight = 16;
        const detailWidth = 280;
        const saveButtonHeight = 20;
        const saveButtonWidth = 64;
        const saveSectionSpacing = 10;
        const ownershipNoticeHeight = canManageInfrastructure ? 0 : detailLineHeight;
        const detailHeight =
          detailLines.length * detailLineHeight +
          detailPadding * 2 +
          ownershipNoticeHeight +
          saveSectionSpacing +
          saveButtonHeight;
        const detailX = Math.min(width - detailWidth - 12, x + boxWidth + 12);
        const detailY = Math.min(height - detailHeight - 12, y);

        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
        ctx.strokeStyle = 'rgba(255, 209, 102, 0.9)';
        ctx.lineWidth = 1;
        drawInfoBox(ctx, detailX, detailY, detailWidth, detailHeight, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Arial';
        ctx.textBaseline = 'top';

        for (let i = 0; i < detailLines.length; i++) {
          const textX = detailX + detailPadding;
          const textY = detailY + detailPadding + i * detailLineHeight;

          if (i === 0) {
            ctx.fillStyle = '#ffd166';
          } else if (i === infrastructureHeaderIndex) {
            ctx.fillStyle = '#9ad1ff';
          } else {
            ctx.fillStyle = '#ffffff';
          }

          ctx.fillText(detailLines[i], textX, textY);

          if (canManageInfrastructure && i >= infrastructureStartIndex) {
            const infrastructureIndex = i - infrastructureStartIndex;
            const [infrastructureKey] = infrastructureEntries[infrastructureIndex];
            const buttonSize = 14;
            const buttonGap = 6;
            const rightButtonX = detailX + detailWidth - detailPadding - buttonSize;
            const leftButtonX = rightButtonX - buttonGap - buttonSize;
            const buttonY = textY;
            const isMaxLevel = (selectedPlanet.infrastructure[infrastructureKey] ?? 0) >= MAX_INFRASTRUCTURE_LEVEL;
            const canAffordUpgrade =
              !isMaxLevel && (state.canAffordInfrastructureUpgrade?.(selectedPlanet, infrastructureKey) ?? true);

            ctx.fillStyle = 'rgba(255, 209, 102, 0.14)';
            drawInfoBox(ctx, leftButtonX, buttonY, buttonSize, buttonSize, 4);
            ctx.fill();
            ctx.fillStyle = canAffordUpgrade ? 'rgba(255, 209, 102, 0.14)' : 'rgba(255, 255, 255, 0.08)';
            drawInfoBox(ctx, rightButtonX, buttonY, buttonSize, buttonSize, 4);
            ctx.fill();

            ctx.strokeStyle = 'rgba(255, 209, 102, 0.55)';
            ctx.lineWidth = 1;
            drawInfoBox(ctx, leftButtonX, buttonY, buttonSize, buttonSize, 4);
            ctx.stroke();
            ctx.strokeStyle = canAffordUpgrade ? 'rgba(255, 209, 102, 0.55)' : 'rgba(255, 255, 255, 0.2)';
            drawInfoBox(ctx, rightButtonX, buttonY, buttonSize, buttonSize, 4);
            ctx.stroke();

            ctx.fillStyle = '#ffd166';
            ctx.fillText('<', leftButtonX + 4, buttonY - 1);
            ctx.fillStyle = canAffordUpgrade ? '#ffd166' : 'rgba(255,255,255,0.5)';
            ctx.fillText(isMaxLevel ? 'x' : '>', rightButtonX + 4, buttonY - 1);

            infrastructureControlBounds.push({
              planetId: selectedPlanet.id,
              infrastructureKey,
              decrement: {
                x: leftButtonX,
                y: buttonY,
                width: buttonSize,
                height: buttonSize,
              },
              increment: {
                x: rightButtonX,
                y: buttonY,
                width: buttonSize,
                height: buttonSize,
                disabled: !canAffordUpgrade,
              },
            });
          }
        }

        if (!canManageInfrastructure) {
          const noticeY = detailY + detailPadding + detailLines.length * detailLineHeight;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.fillText('Build only on planets around stars you own.', detailX + detailPadding, noticeY);
        }

        const saveButtonX = detailX + detailWidth - detailPadding - saveButtonWidth;
        const saveButtonY = detailY + detailHeight - detailPadding - saveButtonHeight;
        const saveButtonActive = canManageInfrastructure && state.hasPendingInfrastructureChanges;

        ctx.fillStyle = saveButtonActive ? 'rgba(255, 209, 102, 0.18)' : 'rgba(255, 255, 255, 0.08)';
        drawInfoBox(ctx, saveButtonX, saveButtonY, saveButtonWidth, saveButtonHeight, 5);
        ctx.fill();

        ctx.strokeStyle = saveButtonActive ? 'rgba(255, 209, 102, 0.9)' : 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        drawInfoBox(ctx, saveButtonX, saveButtonY, saveButtonWidth, saveButtonHeight, 5);
        ctx.stroke();

        ctx.fillStyle = saveButtonActive ? '#ffd166' : 'rgba(255,255,255,0.6)';
        ctx.fillText('Save', saveButtonX + 18, saveButtonY + 3);

        infrastructureSaveButtonBounds = {
          x: saveButtonX,
          y: saveButtonY,
          width: saveButtonWidth,
          height: saveButtonHeight,
          disabled: !saveButtonActive,
        };

        ctx.restore();
      } else {
        infrastructureControlBounds = [];
        infrastructureSaveButtonBounds = null;
      }
    } else {
      planetsLineBounds = null;
      planetListBoxBounds = null;
      planetItemBounds = [];
      infrastructureControlBounds = [];
      infrastructureSaveButtonBounds = null;
      starCollectButtonBounds = null;
      starCapitalButtonBounds = null;
      selectedPlanetId = null;
    }

    drawMoveMissionOverlay(ctx, camera, viewport, width, height);
    drawTradeMissionOverlay(ctx, camera, viewport, width, height);
    drawAttackMissionOverlay(ctx, camera, viewport, width, height);

  }

  function handleCanvasClick(screenX, screenY) {
    if (tradeMissionDialogBounds) {
      const { cancel, fleet, commit } = tradeMissionDialogBounds;
      const isInspectMode = state.tradeMission?.mode === 'inspect';
      const inCancel =
        Boolean(cancel) &&
        screenX >= cancel.x &&
        screenX <= cancel.x + cancel.width &&
        screenY >= cancel.y &&
        screenY <= cancel.y + cancel.height;
      const inFleet =
        Boolean(fleet) &&
        screenX >= fleet.x &&
        screenX <= fleet.x + fleet.width &&
        screenY >= fleet.y &&
        screenY <= fleet.y + fleet.height;
      const inCommit =
        Boolean(commit) &&
        screenX >= commit.x &&
        screenX <= commit.x + commit.width &&
        screenY >= commit.y &&
        screenY <= commit.y + commit.height;

      if (inCancel) {
        state.onTradeMissionCancel?.();
        return true;
      }

      if (inFleet) {
        state.onTradeRouteOpenFleet?.(state.tradeMission?.ship, state.tradeMission?.ship?.tradeRouteId ?? null);
        return true;
      }

      if (inCommit) {
        if (isInspectMode) {
          if (state.tradeMission?.ship) {
            state.onCancelTradeRoute?.(state.tradeMission.ship);
          }
        } else if (!commit.disabled) {
          state.onTradeMissionCommit?.();
        }
        return true;
      }
    }

    if (attackMissionDialogBounds) {
      const { cancel, confirm } = attackMissionDialogBounds;
      const inCancel =
        Boolean(cancel) &&
        screenX >= cancel.x &&
        screenX <= cancel.x + cancel.width &&
        screenY >= cancel.y &&
        screenY <= cancel.y + cancel.height;
      const inConfirm =
        Boolean(confirm) &&
        screenX >= confirm.x &&
        screenX <= confirm.x + confirm.width &&
        screenY >= confirm.y &&
        screenY <= confirm.y + confirm.height;

      if (inCancel) {
        state.onAttackMissionCancel?.();
        return true;
      }

      if (inConfirm) {
        state.onAttackMissionConfirm?.();
        return true;
      }
    }

    if (moveMissionDialogBounds) {
      const { cancel, calculate, move } = moveMissionDialogBounds;
      const inCancel =
        Boolean(cancel) &&
        screenX >= cancel.x &&
        screenX <= cancel.x + cancel.width &&
        screenY >= cancel.y &&
        screenY <= cancel.y + cancel.height;
      const inCalculate =
        Boolean(calculate) &&
        screenX >= calculate.x &&
        screenX <= calculate.x + calculate.width &&
        screenY >= calculate.y &&
        screenY <= calculate.y + calculate.height;
      const inMove =
        Boolean(move) &&
        screenX >= move.x &&
        screenX <= move.x + move.width &&
        screenY >= move.y &&
        screenY <= move.y + move.height;

      if (inCancel) {
        state.onMoveMissionCancel?.();
        return true;
      }

      if (inCalculate) {
        state.onMoveMissionCalculateRoute?.();
        return true;
      }

      if (inMove) {
        if (!move.disabled) {
          state.onMoveMissionCommitMove?.();
        }
        return true;
      }
    }

    for (let index = moveMissionShipBounds.length - 1; index >= 0; index -= 1) {
      const shipBounds = moveMissionShipBounds[index];
      const inShipIcon =
        screenX >= shipBounds.x &&
        screenX <= shipBounds.x + shipBounds.width &&
        screenY >= shipBounds.y &&
        screenY <= shipBounds.y + shipBounds.height;

      if (inShipIcon) {
        state.onMoveMissionOpenFleet?.(shipBounds.ship, shipBounds.missionId);
        return true;
      }
    }

    const clickedTradeRoute = isClickOnStar(screenX, screenY)
      ? null
      : getClickedActiveTradeRoute(screenX, screenY);
    if (clickedTradeRoute) {
      state.onTradeRouteInspect?.(clickedTradeRoute.ship, clickedTradeRoute.routeId);
      return true;
    }

    for (let index = piracyZoneBounds.length - 1; index >= 0; index -= 1) {
      const zoneBounds = piracyZoneBounds[index];
      const dx = screenX - zoneBounds.x;
      const dy = screenY - zoneBounds.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (Math.abs(distance - zoneBounds.radius) <= 14 || distance <= 14) {
        state.onPiracyZoneOpenFleet?.(zoneBounds.ship);
        return true;
      }
    }

    if (starCapitalButtonBounds) {
      const inCapitalButton =
        screenX >= starCapitalButtonBounds.x &&
        screenX <= starCapitalButtonBounds.x + starCapitalButtonBounds.width &&
        screenY >= starCapitalButtonBounds.y &&
        screenY <= starCapitalButtonBounds.y + starCapitalButtonBounds.height;

      if (inCapitalButton) {
        if (!starCapitalButtonBounds.disabled) {
          state.onSetCapitalStar?.(starCapitalButtonBounds.starId);
        }
        return true;
      }
    }

    if (starCollectButtonBounds) {
      const inCollectButton =
        screenX >= starCollectButtonBounds.x &&
        screenX <= starCollectButtonBounds.x + starCollectButtonBounds.width &&
        screenY >= starCollectButtonBounds.y &&
        screenY <= starCollectButtonBounds.y + starCollectButtonBounds.height;

      if (inCollectButton) {
        if (!starCollectButtonBounds.disabled) {
          state.onCollectStarResources?.(starCollectButtonBounds.starId);
        }
        return true;
      }
    }

    if (infrastructureSaveButtonBounds) {
      const inSaveButton =
        screenX >= infrastructureSaveButtonBounds.x &&
        screenX <= infrastructureSaveButtonBounds.x + infrastructureSaveButtonBounds.width &&
        screenY >= infrastructureSaveButtonBounds.y &&
        screenY <= infrastructureSaveButtonBounds.y + infrastructureSaveButtonBounds.height;

      if (inSaveButton) {
        if (!infrastructureSaveButtonBounds.disabled) {
          state.onSaveInfrastructureChanges?.();
        }
        return true;
      }
    }

    const clickedInfrastructureControl = infrastructureControlBounds.find((control) => {
      const inDecrement =
        screenX >= control.decrement.x &&
        screenX <= control.decrement.x + control.decrement.width &&
        screenY >= control.decrement.y &&
        screenY <= control.decrement.y + control.decrement.height;
      const inIncrement =
        screenX >= control.increment.x &&
        screenX <= control.increment.x + control.increment.width &&
        screenY >= control.increment.y &&
        screenY <= control.increment.y + control.increment.height;

      return inDecrement || inIncrement;
    });

    if (clickedInfrastructureControl) {
      const selected = state.starsById?.get(state.selection.selectedStarId) || null;
      if (!canManageInfrastructureForStar(selected)) {
        return true;
      }
      const selectedPlanet =
        selected?.planets.find((planet) => planet.id === clickedInfrastructureControl.planetId) || null;

      if (selectedPlanet) {
        const isIncrement =
          screenX >= clickedInfrastructureControl.increment.x &&
          screenX <= clickedInfrastructureControl.increment.x + clickedInfrastructureControl.increment.width &&
          screenY >= clickedInfrastructureControl.increment.y &&
          screenY <= clickedInfrastructureControl.increment.y + clickedInfrastructureControl.increment.height;
        const delta = isIncrement ? 1 : -1;
        if (isIncrement && clickedInfrastructureControl.increment.disabled) {
          return true;
        }
        state.onInfrastructureChanged?.(selectedPlanet, clickedInfrastructureControl.infrastructureKey, delta);
      }

      return true;
    }

    if (planetsLineBounds) {
      const inPlanetsLine =
        screenX >= planetsLineBounds.x &&
        screenX <= planetsLineBounds.x + planetsLineBounds.width &&
        screenY >= planetsLineBounds.y &&
        screenY <= planetsLineBounds.y + planetsLineBounds.height;

      if (inPlanetsLine) {
        isPlanetListOpen = !isPlanetListOpen;
        return true;
      }
    }

    if (isPlanetListOpen && planetListBoxBounds) {
      const inListBox =
        screenX >= planetListBoxBounds.x &&
        screenX <= planetListBoxBounds.x + planetListBoxBounds.width &&
        screenY >= planetListBoxBounds.y &&
        screenY <= planetListBoxBounds.y + planetListBoxBounds.height;

      if (inListBox) {
        const clickedPlanet = planetItemBounds.find((item) =>
          screenX >= item.x &&
          screenX <= item.x + item.width &&
          screenY >= item.y &&
          screenY <= item.y + item.height
        );

        if (clickedPlanet) {
          selectedPlanetId = clickedPlanet.planetId;
        }

        return true;
      }

      isPlanetListOpen = false;
    }

    return false;
  }

  return {
    render,
    resize,
    handleCanvasClick,
  };
}
