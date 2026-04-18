import { worldToScreen } from '../camera/camera.js';
import { getCapitalBonusMultiplier } from '../core/capitalBonuses.js';
import { formatInfrastructureCost, MAX_INFRASTRUCTURE_LEVEL } from '../core/infrastructureCosts.js';
import { getPopulationCreditsForPlanet } from '../core/resourceEconomy.js';
import { getWeightedResourceAmount } from '../core/systemPools.js';
import {
  calculatePlanetPopulationCap,
  calculatePlanetPopulationGrowth,
  calculateStarPopulationCap,
  calculateStarPopulationGrowth,
  estimatePlanetDisplayPeriodsToFill,
  estimatePlanetDisplayPeriodsToNinety,
  estimateStarDisplayPeriodsToFill,
  estimateStarDisplayPeriodsToNinety,
} from '../core/population.js';

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

function buildVoronoiCells(stars) {
  const bounds = getGalaxyBounds(stars);
  const cellsByStarId = new Map();
  const starById = new Map();

  for (const star of stars) {
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
        3: [],
      });
      continue;
    }

    const segments = buildOwnedBoundarySegments(edgeMap, territory.stars);
    const loops = buildBoundaryLoops(segments);
    loopsByTerritoryId.set(territoryId, loops);
    smoothedLoopsByTerritoryId.set(territoryId, {
      0: loops,
      1: loops.map((loop) => smoothClosedPolygon(loop, 1)),
      3: loops.map((loop) => smoothClosedPolygon(loop, 3)),
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
      smoothingIterations: 1,
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
    smoothingIterations: 3,
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

function drawStarConnections(ctx, camera, viewport, adjacentPairs, hoveredStarId, ownedStarIds, state) {
  const motionBlend = state.performanceMode ? 1 : (state.motionVisualBlend ?? 0);
  const drawOwnedConnections =
    !state.performanceMode && ownedStarIds.size > 0 && motionBlend < 0.98;

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
    
    // Draw if either star belongs to a territory
    if (!shouldDraw && drawOwnedConnections) {
      shouldDraw = ownedStarIds.has(star1.id) || ownedStarIds.has(star2.id);
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

function drawCapitalCrown(ctx, x, y, size) {
  const width = Math.max(8, size);
  const height = width * 0.7;
  const baseY = y - width * 1.15;
  const left = x - width / 2;
  const right = x + width / 2;
  const baseTop = baseY + height * 0.55;
  const tipInset = width * 0.18;

  ctx.save();
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
  ctx.shadowColor = 'rgba(255, 209, 102, 0.45)';
  ctx.shadowBlur = width * 0.55;
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255, 244, 200, 0.95)';
  ctx.lineWidth = Math.max(1, width * 0.08);
  ctx.lineJoin = 'round';
  ctx.stroke();

  for (const point of [
    { x: left + tipInset, y: baseY + height * 0.15 },
    { x, y: baseY + height * 0.42 },
    { x: right - tipInset, y: baseY },
  ]) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, Math.max(1.25, width * 0.08), 0, Math.PI * 2);
    ctx.fillStyle = '#fff3b0';
    ctx.fill();
  }

  ctx.restore();
}

export function createRenderer(state) {
  let cachedStarSignature = '';
  let cachedVoronoi = {
    bounds: null,
    cellsByStarId: new Map(),
    edgeMap: new Map(),
    adjacentPairs: [],
  };
  let cachedTerritorySignature = '';
  let cachedTerritoryRenderData = {
    loopsByTerritoryId: new Map(),
    smoothedLoopsByTerritoryId: new Map(),
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

  function ensureVoronoiCache(stars) {
    const signature = stars
      .map((s) => `${s.id}:${s.x.toFixed(1)},${s.y.toFixed(1)}`)
      .join('|');

    if (signature !== cachedStarSignature) {
      cachedVoronoi = buildVoronoiCells(stars);
      cachedStarSignature = signature;
      cachedTerritorySignature = '';
    }
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
    const territorySignature = `${cachedStarSignature}|${state.territoryRevision ?? 0}`;

    if (territorySignature !== cachedTerritorySignature) {
      cachedTerritoryRenderData = buildTerritoryRenderData(cachedVoronoi.edgeMap, state);
      cachedTerritorySignature = territorySignature;
    }
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

    ensureVoronoiCache(galaxy.stars);
    ensureTerritoryRenderCache();

    const { cellsByStarId, adjacentPairs } = cachedVoronoi;
    const {
      loopsByTerritoryId,
      smoothedLoopsByTerritoryId,
      starTerritoryByStarId,
      territoryRgbById,
      ownedStarIds,
    } = cachedTerritoryRenderData;

    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = '#030712';
    ctx.fillRect(0, 0, width, height);

    drawStarConnections(ctx, camera, viewport, adjacentPairs, selection.hoveredStarId, ownedStarIds, state);

    const selected = state.starsById?.get(selection.selectedStarId) || null;

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

    // One unified territory mass from all owned systems
    drawOwnedTerritoryMass(
      ctx,
      camera,
      viewport,
      loopsByTerritoryId,
      smoothedLoopsByTerritoryId,
      territoryRgbById,
      state
    );

    // Optional selected-system highlight
    drawSelectedCell(ctx, camera, viewport, selected, cellsByStarId, state);

    const auraOpacityMultiplier = Math.max(0, 1 - motionVisualBlend);
    const shouldDrawTerritoryAuras =
      !state.performanceMode && auraOpacityMultiplier > 0.02;

    const shouldDrawCapitalCrowns = true;

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

      // Draw territory aura if star belongs to a territory
      if (starTerritory && shouldDrawTerritoryAuras) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
        const rgb =
          territoryRgbById.get(starTerritory.id) ?? hexToRgb(starTerritory.color);
        ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.12 * auraOpacityMultiplier})`;
        ctx.fill();
      }

      if (isCapital && shouldDrawCapitalCrowns) {
        drawCapitalCrown(ctx, p.x, p.y, Math.max(14, r * 4.4));
      }

      ctx.beginPath();
      if (selection.selectedStarId === star.id) {
        ctx.fillStyle = '#ffd166';
      } else if (starTerritory) {
        const starTerritoryRgb =
          territoryRgbById.get(starTerritory.id) ?? hexToRgb(starTerritory.color);
        ctx.fillStyle = getVisibleTerritoryStarColor(starTerritoryRgb);
      } else {
        ctx.fillStyle = '#ffffff';
      }

      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (selected) {
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
  }

  function handleCanvasClick(screenX, screenY) {
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
