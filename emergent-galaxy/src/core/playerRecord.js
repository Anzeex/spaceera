import { createEmptyItemInventory, cloneItemInventory, cloneSystemItemInventories } from './itemDefinitions.js';

const RESOURCE_KEYS = [
  'Credits',
  'Metals',
  'Food',
  'Rare Earth Elements',
  'Uranium',
];

function createEmptyResources() {
  return Object.fromEntries(RESOURCE_KEYS.map((resource) => [resource, 0]));
}

function cloneResources(source = {}) {
  const resources = createEmptyResources();
  for (const resource of RESOURCE_KEYS) {
    resources[resource] = Number(source?.[resource]) || 0;
  }
  return resources;
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
        targetType: entry.targetType,
        itemName: entry.itemName,
        queuedAt: entry.queuedAt,
        productionCost:
          Number(entry.productionCost ?? entry.requiredIndustryPeriods ?? entry.requiredIndustryHours) || 0,
        completedProductionCost: Math.max(0, Number(entry.completedProductionCost) || 0),
        remainingProductionCost:
          entry.remainingProductionCost == null
            ? Number(entry.productionCost ?? entry.requiredIndustryPeriods ?? entry.requiredIndustryHours) || 0
            : Math.max(0, Number(entry.remainingProductionCost) || 0),
        industryAtQueue: Number(entry.industryAtQueue) || 0,
        estimatedPeriods:
          entry.estimatedPeriods == null && entry.estimatedHours == null
            ? null
            : Number(entry.estimatedPeriods ?? entry.estimatedHours) || 0,
        resourceCost: cloneResources(entry.resourceCost),
        shipTemplate: entry.shipTemplate ? cloneShipTemplate(entry.shipTemplate) : undefined,
      }))
    : [];
}

function cloneShipTemplate(template = {}) {
  return {
    ...template,
    id: template.id,
    name: template.name ?? 'Unnamed Template',
    hullId: template.hullId ?? null,
    hullName: template.hullName ?? null,
    modules: Array.isArray(template.modules)
      ? template.modules.map((module) => ({ ...module }))
      : [],
    traits: { ...(template.traits ?? {}) },
    runtime: { ...(template.runtime ?? {}) },
    cost: cloneResources(template.cost),
  };
}

function cloneShipTemplates(shipTemplates = []) {
  return Array.isArray(shipTemplates)
    ? shipTemplates.map((template) => cloneShipTemplate(template))
    : [];
}

function cloneMoveMission(mission = {}) {
  return {
    ...mission,
    id: mission.id,
    status: mission.status ?? 'moving',
    active: mission.active !== false,
    ship: mission.ship ? cloneShips([mission.ship])[0] : null,
    originStarId: mission.originStarId ?? null,
    destinationStarId: mission.destinationStarId ?? null,
    routeStarIds: Array.isArray(mission.routeStarIds) ? [...mission.routeStarIds] : [],
    markerWorld: mission.markerWorld
      ? {
          x: Number(mission.markerWorld.x) || 0,
          y: Number(mission.markerWorld.y) || 0,
        }
      : null,
    distanceWorldUnits: Number(mission.distanceWorldUnits) || 0,
    distanceLightYears: Number(mission.distanceLightYears) || 0,
    speedRating: Number(mission.speedRating) || 0,
    speedLightYearsPerDay: Number(mission.speedLightYearsPerDay) || 0,
    travelDays: Number(mission.travelDays) || 0,
    realTravelDurationMs: Number(mission.realTravelDurationMs) || 0,
    travelStartedAtMs: Number(mission.travelStartedAtMs) || 0,
    travelArrivesAtMs: Number(mission.travelArrivesAtMs) || 0,
    travelSummary: mission.travelSummary ? { ...mission.travelSummary } : null,
  };
}

function cloneMoveMissions(moveMissions = []) {
  return Array.isArray(moveMissions)
    ? moveMissions.map((mission) => cloneMoveMission(mission)).filter((mission) => mission.id && mission.ship)
    : [];
}

function normalizeShipPosition(position, defaultPosition = null) {
  if (position === 'Moving') {
    return 'Moving';
  }

  return position ?? defaultPosition ?? null;
}

function cloneShips(ships = [], defaultPosition = null) {
  return Array.isArray(ships)
    ? ships.map((ship, index) => {
        const fallbackId = ship.templateId ?? ship.id ?? `ship-${index}`;
        return {
          ...ship,
          id: ship.id ?? fallbackId,
          templateId: ship.templateId ?? fallbackId,
          name: ship.name ?? ship.type ?? 'Ship',
          hullId: ship.hullId ?? null,
          hullName: ship.hullName ?? null,
          modules: Array.isArray(ship.modules)
            ? ship.modules.map((module) => ({ ...module }))
            : [],
          traits: { ...(ship.traits ?? {}) },
          runtime: { ...(ship.runtime ?? {}) },
          position: normalizeShipPosition(ship.position ?? ship.starId, defaultPosition),
          count: Math.max(1, Math.floor(Number(ship.count) || 1)),
        };
      })
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

function normalizeProgressionRecord(source = {}) {
  const level = Math.max(1, Math.floor(Number(source.level) || 1));
  const nextLevelXp = Math.max(1, Math.floor(Number(source.nextLevelXp ?? source.xpToNextLevel) || level * 100));
  const xp = Math.max(0, Math.floor(Number(source.xp ?? source.experience) || 0));
  const currentLevelXp = Math.max(
    0,
    Math.min(
      nextLevelXp,
      Math.floor(Number(source.currentLevelXp ?? source.levelXp ?? (xp % nextLevelXp)) || 0)
    )
  );

  return {
    level,
    xp,
    currentLevelXp,
    nextLevelXp,
    gems: Math.max(0, Math.floor(Number(source.gems ?? source.premiumCurrency) || 0)),
  };
}

export function createPlayerRecord(playerId, nowMs = Date.now(), overrides = {}) {
  const defaultName = overrides.profile?.name ?? overrides.name ?? playerId;
  const profile = {
    name: defaultName,
    faction: overrides.profile?.faction ?? overrides.faction ?? defaultName,
    color: overrides.profile?.color ?? overrides.color ?? '#4ecdc4',
    avatarImageUrl: overrides.profile?.avatarImageUrl ?? overrides.profileImageUrl ?? '',
  };
  const territory = normalizeTerritoryRecord(playerId, overrides.territory ?? null, profile);
  const progression = normalizeProgressionRecord(overrides.progression ?? overrides);
  const timestamp = new Date(nowMs).toISOString();

  return {
    id: playerId,
    profile,
    territory,
    progression,
    inventory: {
      items: cloneItemInventory(overrides.inventory?.items),
    },
    fleet: {
      ships: cloneShips(overrides.fleet?.ships ?? overrides.ships, territory?.capitalStarId ?? null),
      shipTemplates: cloneShipTemplates(overrides.fleet?.shipTemplates ?? overrides.shipTemplates),
      activeMoveMissions: cloneMoveMissions(overrides.fleet?.activeMoveMissions ?? overrides.activeMoveMissions),
    },
    logistics: {
      systemPools: cloneSystemPools(overrides.logistics?.systemPools),
      baseResourcePool: cloneResources(overrides.logistics?.baseResourcePool ?? overrides.baseResourcePool),
      systemItemInventories: cloneSystemItemInventories(overrides.logistics?.systemItemInventories),
      systemPoolCapacities: cloneSystemPoolCapacities(overrides.logistics?.systemPoolCapacities),
      productionQueue: cloneProductionQueue(overrides.logistics?.productionQueue),
    },
    economy: {
      resources: cloneResources(overrides.economy?.resources),
      hourlyProduction: cloneResources(overrides.economy?.hourlyProduction),
      completedHours: Math.max(0, Math.floor(Number(overrides.economy?.completedHours) || 0)),
      resourceUpdateInterval: overrides.economy?.resourceUpdateInterval ?? 'minute',
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
      avatarImageUrl: playerLike.profile?.avatarImageUrl ?? playerLike.profileImageUrl ?? '',
    },
    territory: playerLike.territory ?? null,
    inventory: {
      items: playerLike.items,
    },
    fleet: {
      ships: playerLike.ships ?? playerLike.fleet?.ships,
      shipTemplates: playerLike.shipTemplates ?? playerLike.fleet?.shipTemplates,
      activeMoveMissions: playerLike.activeMoveMissions ?? playerLike.fleet?.activeMoveMissions,
    },
    logistics: {
      systemPools: playerLike.systemPools,
      baseResourcePool: playerLike.baseResourcePool,
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
    progression: playerLike.progression ?? {
      level: playerLike.level,
      xp: playerLike.xp ?? playerLike.experience,
      currentLevelXp: playerLike.currentLevelXp ?? playerLike.levelXp,
      nextLevelXp: playerLike.nextLevelXp ?? playerLike.xpToNextLevel,
      gems: playerLike.gems ?? playerLike.premiumCurrency,
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
    ships: cloneShips(playerRecord.fleet?.ships, playerRecord.territory?.capitalStarId ?? null),
    shipTemplates: cloneShipTemplates(playerRecord.fleet?.shipTemplates),
    activeMoveMissions: cloneMoveMissions(playerRecord.fleet?.activeMoveMissions),
    level: playerRecord.progression.level,
    xp: playerRecord.progression.xp,
    currentLevelXp: playerRecord.progression.currentLevelXp,
    nextLevelXp: playerRecord.progression.nextLevelXp,
    gems: playerRecord.progression.gems,
    profileImageUrl: playerRecord.profile.avatarImageUrl ?? '',
    hourlyProduction: cloneResources(playerRecord.economy.hourlyProduction),
    systemPools: cloneSystemPools(playerRecord.logistics.systemPools),
    baseResourcePool: cloneResources(playerRecord.logistics.baseResourcePool),
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
    fleet: {
      ships: cloneShips(
        runtimeState?.ships ?? nextRecord.fleet?.ships,
        (runtimeState?.territory ?? nextRecord.territory)?.capitalStarId ?? null
      ),
      shipTemplates: cloneShipTemplates(
        runtimeState?.shipTemplates ?? nextRecord.fleet?.shipTemplates
      ),
      activeMoveMissions: cloneMoveMissions(
        runtimeState?.activeMoveMissions ?? nextRecord.fleet?.activeMoveMissions
      ),
    },
    progression: normalizeProgressionRecord({
      ...nextRecord.progression,
      level: runtimeState?.level ?? nextRecord.progression.level,
      xp: runtimeState?.xp ?? runtimeState?.experience ?? nextRecord.progression.xp,
      currentLevelXp:
        runtimeState?.currentLevelXp ?? runtimeState?.levelXp ?? nextRecord.progression.currentLevelXp,
      nextLevelXp:
        runtimeState?.nextLevelXp ?? runtimeState?.xpToNextLevel ?? nextRecord.progression.nextLevelXp,
      gems: runtimeState?.gems ?? runtimeState?.premiumCurrency ?? nextRecord.progression.gems,
    }),
    profile: {
      ...nextRecord.profile,
      avatarImageUrl: runtimeState?.profileImageUrl ?? nextRecord.profile.avatarImageUrl ?? '',
    },
    logistics: {
      systemPools: cloneSystemPools(runtimeState?.systemPools ?? nextRecord.logistics.systemPools),
      baseResourcePool: cloneResources(runtimeState?.baseResourcePool ?? nextRecord.logistics.baseResourcePool),
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
