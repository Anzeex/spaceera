export function createSpatialGrid(items, {
  cellSize = 400,
  getX = (item) => item.x,
  getY = (item) => item.y,
} = {}) {
  const cells = new Map();

  function getCellCoord(value) {
    return Math.floor(value / cellSize);
  }

  function getCellKey(cellX, cellY) {
    return `${cellX},${cellY}`;
  }

  for (const item of items) {
    const cellX = getCellCoord(getX(item));
    const cellY = getCellCoord(getY(item));
    const key = getCellKey(cellX, cellY);

    if (!cells.has(key)) {
      cells.set(key, []);
    }

    cells.get(key).push(item);
  }

  function queryRange(minX, minY, maxX, maxY) {
    const startCellX = getCellCoord(minX);
    const endCellX = getCellCoord(maxX);
    const startCellY = getCellCoord(minY);
    const endCellY = getCellCoord(maxY);
    const results = [];

    for (let cellX = startCellX; cellX <= endCellX; cellX++) {
      for (let cellY = startCellY; cellY <= endCellY; cellY++) {
        const bucket = cells.get(getCellKey(cellX, cellY));
        if (bucket) {
          results.push(...bucket);
        }
      }
    }

    return results;
  }

  return {
    cellSize,
    queryRange,
  };
}
