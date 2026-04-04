import { worldToScreen } from '../camera/camera.js';

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
  return [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
  ];
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

  for (const star of stars) {
    const cell = computeVoronoiCell(star, stars, bounds);
    cellsByStarId.set(star.id, cell);
  }

  return { bounds, cellsByStarId };
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

function buildOwnedBoundarySegments(cellsByStarId, ownedSet) {
  const edgeMap = buildSharedEdgeMap(cellsByStarId);
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

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 100, g: 255, b: 140 };
}

function drawOwnedTerritoryMass(ctx, camera, viewport, cellsByStarId, state) {
  if (state.territories.size === 0) return;

  ctx.save();

  for (const [, territory] of state.territories.entries()) {
    if (territory.stars.size === 0) continue;

    const segments = buildOwnedBoundarySegments(cellsByStarId, territory.stars);
    const loops = buildBoundaryLoops(segments);

    if (!loops.length) continue;

    const rgb = hexToRgb(territory.color);
    const fillColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12)`;
    const shadowColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.14)`;
    const outerBorderColor = `rgba(${rgb.r}, ${Math.min(255, rgb.g + 40)}, ${Math.min(255, rgb.b + 45)}, 0.14)`;
    const topBorderColor = `rgba(${rgb.r}, ${Math.min(255, rgb.g + 30)}, ${Math.min(255, rgb.b + 35)}, 0.5)`;

    for (const loop of loops) {
      const screenLoop = polygonToScreen(camera, viewport, loop);
      const smoothLoop = smoothClosedPolygon(screenLoop, 3);

      // soft fill
      ctx.shadowColor = shadowColor;
      ctx.shadowBlur = 22;

      drawPolygonPath(ctx, smoothLoop);
      ctx.fillStyle = fillColor;
      ctx.fill();

      ctx.shadowBlur = 0;

      // soft outer border
      drawPolygonPath(ctx, smoothLoop);
      ctx.strokeStyle = outerBorderColor;
      ctx.lineWidth = 10;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();

      // sharper top border
      drawPolygonPath(ctx, smoothLoop);
      ctx.strokeStyle = topBorderColor;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawSelectedCell(ctx, camera, viewport, selectedStar, cellsByStarId) {
  if (!selectedStar) return;

  const cell = cellsByStarId.get(selectedStar.id);
  if (!cell || cell.length < 3) return;

  const smoothCell = getSmoothedScreenCell(camera, viewport, cell, 3);

  ctx.save();

  drawPolygonPath(ctx, smoothCell);
  ctx.fillStyle = 'rgba(255, 209, 102, 0.05)';
  ctx.fill();

  drawPolygonPath(ctx, smoothCell);
  ctx.strokeStyle = 'rgba(255, 209, 102, 0.55)';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(255, 209, 102, 0.22)';
  ctx.shadowBlur = 8;
  ctx.stroke();

  ctx.restore();
}

function getAdjacentStarPairs(stars, cellsByStarId) {
  const edgeMap = buildSharedEdgeMap(cellsByStarId);
  const pairs = [];

  for (const [, edges] of edgeMap.entries()) {
    if (edges.length === 2) {
      const star1 = stars.find(s => s.id === edges[0].starId);
      const star2 = stars.find(s => s.id === edges[1].starId);
      if (star1 && star2) {
        pairs.push([star1, star2]);
      }
    }
  }

  return pairs;
}

function drawStarConnections(ctx, camera, viewport, adjacentPairs, hoveredStarId, state) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1;

  for (const [star1, star2] of adjacentPairs) {
    let shouldDraw = false;
    
    // Draw if hovering over either star
    if (star1.id === hoveredStarId || star2.id === hoveredStarId) {
      shouldDraw = true;
    }
    
    // Draw if either star belongs to a territory
    if (!shouldDraw && state.territories.size > 0) {
      for (const [, territory] of state.territories.entries()) {
        if (territory.stars.has(star1.id) || territory.stars.has(star2.id)) {
          shouldDraw = true;
          break;
        }
      }
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

export function createRenderer(state) {
  let cachedStarSignature = '';
  let cachedVoronoi = {
    bounds: null,
    cellsByStarId: new Map(),
    adjacentPairs: [],
  };

  let lastSelectedStarId = null;
  let isPlanetListOpen = false;
  let planetsLineBounds = null;
  let planetListBoxBounds = null;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
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
      cachedVoronoi.adjacentPairs = getAdjacentStarPairs(stars, cachedVoronoi.cellsByStarId);
      cachedStarSignature = signature;
    }
  }

  function render() {
    const { ctx, canvas, camera, galaxy, selection } = state;
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    const viewport = { width, height };

    ensureVoronoiCache(galaxy.stars);

    const { cellsByStarId, adjacentPairs } = cachedVoronoi;

    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = '#030712';
    ctx.fillRect(0, 0, width, height);

    // Draw star connections
    if (state.showLines) {
      drawStarConnections(ctx, camera, viewport, adjacentPairs, selection.hoveredStarId, state);
    }

    const selected =
      galaxy.stars.find((star) => star.id === selection.selectedStarId) || null;

    if (lastSelectedStarId !== selection.selectedStarId) {
      isPlanetListOpen = false;
      planetListBoxBounds = null;
      lastSelectedStarId = selection.selectedStarId;
    }

    // One unified territory mass from all owned systems
    drawOwnedTerritoryMass(ctx, camera, viewport, cellsByStarId, state);

    // Optional selected-system highlight
    drawSelectedCell(ctx, camera, viewport, selected, cellsByStarId);

    // Stars on top
    for (const star of galaxy.stars) {
      const p = worldToScreen(camera, viewport, star.x, star.y);

      if (p.x < -20 || p.x > width + 20 || p.y < -20 || p.y > height + 20) {
        continue;
      }

      const r = Math.max(0.8, star.radius * camera.zoom);

      // Find which territory this star belongs to
      let starTerritory = null;
      for (const [, territory] of state.territories.entries()) {
        if (territory.stars.has(star.id)) {
          starTerritory = territory;
          break;
        }
      }

      // Draw territory aura if star belongs to a territory
      if (starTerritory) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
        const rgb = hexToRgb(starTerritory.color);
        ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12)`;
        ctx.fill();
      }

      ctx.beginPath();
      if (selection.selectedStarId === star.id) {
        ctx.fillStyle = '#ffd166';
      } else if (starTerritory) {
        ctx.fillStyle = starTerritory.color;
      } else {
        ctx.fillStyle = '#ffffff';
      }

      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (selected) {
      const sp = worldToScreen(camera, viewport, selected.x, selected.y);

      const text = [
        selected.name,
        `Owner: ${selected.owner}`,
        `Star Type: ${selected.starType}`,
        `Energy: ${selected.energyOutput}`,
        `Population: ${selected.population.toLocaleString()}`,
        `GDP: ${selected.gdp.toFixed(0)}`,
        `Defense: ${selected.systemDefense}`,
        `Planets: ${selected.planets.length}`,
      ];

      const padding = 8;
      const lineHeight = 16;
      const boxWidth = 220;
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
          ctx.moveTo(x + padding, textY + lineHeight - 2);
          ctx.lineTo(x + boxWidth - padding, textY + lineHeight - 2);
          ctx.strokeStyle = 'rgba(255, 209, 102, 0.8)';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
        } else {
          ctx.fillText(text[i], x + padding, textY);
        }
      }

      ctx.restore();

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
          ctx.fillText(listLines[i], listX + listPadding, listY + listPadding + i * listLineHeight);
        }
        ctx.restore();
        planetListBoxBounds = {
          x: listX,
          y: listY,
          width: listWidth,
          height: listHeight,
        };
      }
    } else {
      planetsLineBounds = null;
      planetListBoxBounds = null;
    }
  }

  function handleCanvasClick(screenX, screenY) {
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