import { createEmptyItemInventory, cloneItemInventory, cloneSystemItemInventories } from './itemDefinitions.js';

const RESOURCE_KEYS = [
  'Credits',
  'Metals',
  'Gas',
  'Food',
  'Rare Earth Elements',
  'Uranium',
  'Water',
];

function createEmptyResources() {
  return Object.fromEntries(RESOURCE_KEYS.map((resource) => [resource, 0]));
}

function cloneResources(source = {}) {
  return {
    ...createEmptyResources(),
    ...source,
  };
}

function cloneSystemPools(systemPools = {}) {
  const nextSystemPools = {};

  for (const [starId, poolEntry] of Object.entries(systemPools ?? {})) {
    nextSystemPools[starId] = {
      resources: cloneResources(poolEntry?.resources ?? poolEntry),
    };
  }

  return nextSystemPools;
}

function cloneSystemPoolCapacities(systemPoolCapacities = {}) {
  return { ...(systemPoolCapacities ?? {}) };
}

function cloneProductionQueue(productionQueue = []) {
  return Array.isArray(productionQueue)
    ? productionQueue.map((entry) => ({
        id: entry.id,
        itemId: entry.itemId,
        queuedAt: entry.queuedAt,
        requiredIndustryPeriods:
          Number(entry.requiredIndustryPeriods ?? entry.requiredIndustryHours) || 0,
        industryAtQueue: Number(entry.industryAtQueue) || 0,
        estimatedPeriods:
          entry.estimatedPeriods == null && entry.estimatedHours == null
            ? null
            : Number(entry.estimatedPeriods ?? entry.estimatedHours) || 0,
        resourceCost: cloneResources(entry.resourceCost),
      }))
    : [];
}

function normalizeTerritoryRecord(playerId, territory = null, profile = {}) {
  if (!territory) {
    return null;
  }

  return {
    id: territory.id ?? playerId,
    name: territory.name ?? profile.name ?? playerId,
    color: territory.color ?? profile.color ?? '#4ecdc4',
    faction: territory.faction ?? profile.faction ?? profile.name ?? playerId,
    capitalStarId: territory.capitalStarId ?? null,
    stars: Array.isArray(territory.stars) ? territory.stars : Array.from(territory.stars ?? []),
  };
}

export function createPlayerRecord(playerId, nowMs = Date.now(), overrides = {}) {
  const defaultName = overrides.profile?.name ?? overrides.name ?? playerId;
  const profile = {
    name: defaultName,
    faction: overrides.profile?.faction ?? overrides.faction ?? defaultName,
    color: overrides.profile?.color ?? overrides.color ?? '#4ecdc4',
  };
  const territory = normalizeTerritoryRecord(playerId, overrides.territory ?? null, profile);
  const timestamp = new Date(nowMs).toISOString();

  return {
    id: playerId,
    profile,
    territory,
    inventory: {
      items: cloneItemInventory(overrides.inventory?.items),
    },
    logistics: {
      systemPools: cloneSystemPools(overrides.logistics?.systemPools),
      systemItemInventories: cloneSystemItemInventories(overrides.logistics?.systemItemInventories),
      systemPoolCapacities: cloneSystemPoolCapacities(overrides.logistics?.systemPoolCapacities),
      productionQueue: cloneProductionQueue(overrides.logistics?.productionQueue),
    },
    economy: {
      resources: cloneResources(overrides.economy?.resources),
      hourlyProduction: cloneResources(overrides.economy?.hourlyProduction),
      completedHours: Math.max(0, Math.floor(Number(overrides.economy?.completedHours) || 0)),
      resourceUpdateInterval: overrides.economy?.resourceUpdateInterval ?? 'hour',
      lastResourceUpdate: overrides.economy?.lastResourceUpdate ?? timestamp,
    },
    status: {
      energyOutput: Number(overrides.status?.energyOutput) || 0,
      energyConsumption: Number(overrides.status?.energyConsumption) || 0,
      activeEnergyConsumption: Number(overrides.status?.activeEnergyConsumption) || 0,
      energyDeficit: Number(overrides.status?.energyDeficit) || 0,
      inactiveInfrastructureCount: Number(overrides.status?.inactiveInfrastructureCount) || 0,
    },
    meta: {
      createdAt: overrides.meta?.createdAt ?? timestamp,
      updatedAt: overrides.meta?.updatedAt ?? timestamp,
    },
  };
}

export function normalizePlayerRecord(playerLike, playerId, nowMs = Date.now()) {
  if (!playerLike || typeof playerLike !== 'object') {
    return createPlayerRecord(playerId, nowMs);
  }

  if (playerLike.profile && playerLike.economy && playerLike.inventory && playerLike.logistics) {
    return createPlayerRecord(playerId, nowMs, playerLike);
  }

  return createPlayerRecord(playerId, nowMs, {
    profile: {
      name: playerLike.playerName ?? playerLike.playerId ?? playerId,
      faction: playerLike.playerName ?? playerLike.playerId ?? playerId,
    },
    territory: playerLike.territory ?? null,
    inventory: {
      items: playerLike.items,
    },
    logistics: {
      systemPools: playerLike.systemPools,
      systemItemInventories: playerLike.systemItemInventories,
      systemPoolCapacities: playerLike.systemPoolCapacities,
      productionQueue: playerLike.productionQueue,
    },
    economy: {
      resources: playerLike.resources,
      hourlyProduction: playerLike.hourlyProduction,
      completedHours: playerLike.completedHours,
      resourceUpdateInterval: playerLike.resourceUpdateInterval,
      lastResourceUpdate: playerLike.lastResourceUpdate,
    },
    status: {
      energyOutput: playerLike.energyOutput,
      energyConsumption: playerLike.energyConsumption,
      activeEnergyConsumption: playerLike.activeEnergyConsumption,
      energyDeficit: playerLike.energyDeficit,
      inactiveInfrastructureCount: playerLike.inactiveInfrastructureCount,
    },
  });
}

export function syncPlayerTerritoryRecord(playerRecord, territory) {
  return {
    ...playerRecord,
    territory: normalizeTerritoryRecord(playerRecord.id, territory, playerRecord.profile),
  };
}

export function playerRecordToRuntimeState(playerRecord) {
  return {
    playerId: playerRecord.id,
    playerName: playerRecord.profile.name,
    territory: playerRecord.territory
      ? {
          ...playerRecord.territory,
          stars: [...playerRecord.territory.stars],
        }
      : null,
    resources: cloneResources(playerRecord.economy.resources),
    items: cloneItemInventory(playerRecord.inventory.items),
    hourlyProduction: cloneResources(playerRecord.economy.hourlyProduction),
    systemPools: cloneSystemPools(playerRecord.logistics.systemPools),
    systemItemInventories: cloneSystemItemInventories(playerRecord.logistics.systemItemInventories),
    systemPoolCapacities: cloneSystemPoolCapacities(playerRecord.logistics.systemPoolCapacities),
    productionQueue: cloneProductionQueue(playerRecord.logistics.productionQueue),
    energyOutput: playerRecord.status.energyOutput,
    energyConsumption: playerRecord.status.energyConsumption,
    activeEnergyConsumption: playerRecord.status.activeEnergyConsumption,
    energyDeficit: playerRecord.status.energyDeficit,
    inactiveInfrastructureCount: playerRecord.status.inactiveInfrastructureCount,
    completedHours: playerRecord.economy.completedHours,
    resourceUpdateInterval: playerRecord.economy.resourceUpdateInterval,
    lastResourceUpdate: playerRecord.economy.lastResourceUpdate,
  };
}

export function applyRuntimeStateToPlayerRecord(playerRecord, runtimeState, nowMs = Date.now()) {
  const nextRecord = normalizePlayerRecord(playerRecord, playerRecord?.id ?? runtimeState?.playerId, nowMs);

  return {
    ...nextRecord,
    territory: normalizeTerritoryRecord(
      nextRecord.id,
      runtimeState?.territory ?? nextRecord.territory,
      nextRecord.profile
    ),
    inventory: {
      items: cloneItemInventory(runtimeState?.items ?? nextRecord.inventory.items),
    },
    logistics: {
      systemPools: cloneSystemPools(runtimeState?.systemPools ?? nextRecord.logistics.systemPools),
      systemItemInventories: cloneSystemItemInventories(
        runtimeState?.systemItemInventories ?? nextRecord.logistics.systemItemInventories
      ),
      systemPoolCapacities: cloneSystemPoolCapacities(
        runtimeState?.systemPoolCapacities ?? nextRecord.logistics.systemPoolCapacities
      ),
      productionQueue: cloneProductionQueue(
        runtimeState?.productionQueue ?? nextRecord.logistics.productionQueue
      ),
    },
    economy: {
      resources: cloneResources(runtimeState?.resources ?? nextRecord.economy.resources),
      hourlyProduction: cloneResources(runtimeState?.hourlyProduction ?? nextRecord.economy.hourlyProduction),
      completedHours: Math.max(
        0,
        Math.floor(Number(runtimeState?.completedHours ?? nextRecord.economy.completedHours) || 0)
      ),
      resourceUpdateInterval:
        runtimeState?.resourceUpdateInterval ?? nextRecord.economy.resourceUpdateInterval,
      lastResourceUpdate: runtimeState?.lastResourceUpdate ?? nextRecord.economy.lastResourceUpdate,
    },
    status: {
      energyOutput: Number(runtimeState?.energyOutput ?? nextRecord.status.energyOutput) || 0,
      energyConsumption: Number(runtimeState?.energyConsumption ?? nextRecord.status.energyConsumption) || 0,
      activeEnergyConsumption:
        Number(runtimeState?.activeEnergyConsumption ?? nextRecord.status.activeEnergyConsumption) || 0,
      energyDeficit: Number(runtimeState?.energyDeficit ?? nextRecord.status.energyDeficit) || 0,
      inactiveInfrastructureCount:
        Number(runtimeState?.inactiveInfrastructureCount ?? nextRecord.status.inactiveInfrastructureCount) || 0,
    },
    meta: {
      ...nextRecord.meta,
      updatedAt: new Date(nowMs).toISOString(),
    },
  };
}
