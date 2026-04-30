import React, { useEffect, useMemo, useState } from 'react';
import { getCapitalBonusMultiplier } from '../core/capitalBonuses.js';
import { formatInfrastructureCost, MAX_INFRASTRUCTURE_LEVEL } from '../core/infrastructureCosts.js';
import { getPopulationCreditsForPlanet } from '../core/resourceEconomy.js';
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
import { getWeightedResourceAmount } from '../core/systemPools.js';

function formatNumber(value, digits = 0) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function summarizePoolResources(poolResources) {
  const entries = Object.entries(poolResources || {})
    .filter(([, amount]) => Number(amount) > 0)
    .map(([resource, amount]) => `${resource}: ${formatNumber(amount)}`);

  return entries.length ? entries.join(' | ') : 'Empty';
}

function titleCaseInfrastructure(key) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase());
}

function Stat({ label, value, tone = 'default' }) {
  return (
    <div className={`system-stat system-stat--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PlanetPill({ planet, active, onClick }) {
  return (
    <button
      type="button"
      className={`planet-pill ${active ? 'planet-pill--active' : ''}`}
      onClick={onClick}
    >
      <span>{planet.name}</span>
      <small>{planet.type}</small>
    </button>
  );
}

function InfrastructureRow({ planet, infrastructureKey, canManage, canAffordUpgrade, getBuildCost, onChange }) {
  const level = Math.max(0, Math.floor(Number(planet.infrastructure?.[infrastructureKey]) || 0));
  const activeLevel = planet.activeInfrastructure?.[infrastructureKey] ?? level;
  const inactiveLevel = Math.max(0, level - activeLevel);
  const isMaxLevel = level >= MAX_INFRASTRUCTURE_LEVEL;
  const nextCost = isMaxLevel ? null : getBuildCost?.(planet, infrastructureKey, level + 1);
  const label = titleCaseInfrastructure(infrastructureKey);

  return (
    <div className="infrastructure-row">
      <div className="infrastructure-row__main">
        <span>{label}</span>
        <strong>{inactiveLevel > 0 ? `${activeLevel}/${level}` : level}</strong>
      </div>
      <div className="infrastructure-row__meta">
        {inactiveLevel > 0 ? <span>{inactiveLevel} offline</span> : <span>active</span>}
        <span>{isMaxLevel ? `Max ${MAX_INFRASTRUCTURE_LEVEL}` : `Next: ${nextCost ? formatInfrastructureCost(nextCost) : 'Free'}`}</span>
      </div>
      {canManage ? (
        <div className="infrastructure-row__controls">
          <button type="button" onClick={() => onChange?.(planet, infrastructureKey, -1)} disabled={level <= 0}>
            -
          </button>
          <button
            type="button"
            onClick={() => onChange?.(planet, infrastructureKey, 1)}
            disabled={isMaxLevel || !canAffordUpgrade?.(planet, infrastructureKey)}
          >
            +
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function StarSystemPanel({
  star,
  territory,
  playerState,
  currentTerritoryId,
  hasPendingInfrastructureChanges,
  infrastructureStatusMessage,
  showPopulationTiming,
  getBuildCost,
  canAffordUpgrade,
  onCollectResources,
  onSetCapital,
  onInfrastructureChanged,
  onSaveInfrastructureChanges,
  onSelectPlanet,
  onInspectOwnerProfile,
  onClose,
  embedded = false,
  showCloseButton = true,
}) {
  const [selectedPlanetId, setSelectedPlanetId] = useState(null);

  useEffect(() => {
    setSelectedPlanetId(null);
  }, [star?.id]);

  const selectedPlanet = useMemo(() => {
    if (!star?.planets?.length) return null;
    return star.planets.find((planet) => planet.id === selectedPlanetId) ?? star.planets[0] ?? null;
  }, [selectedPlanetId, star]);

  if (!star) {
    return null;
  }

  const isOwnedByCurrentTerritory =
    Boolean(star && currentTerritoryId && territory?.id === currentTerritoryId && territory?.stars?.has?.(star.id));
  const isCapital = territory?.capitalStarId === star.id;
  const capitalGrowthMultiplier = getCapitalBonusMultiplier(star.id, territory?.capitalStarId ?? null);
  const poolResources = playerState?.systemPools?.[star.id]?.resources ?? {};
  const poolCapacity = playerState?.systemPoolCapacities?.[star.id] ?? 0;
  const poolUsed = getWeightedResourceAmount(poolResources);
  const canCollect = isOwnedByCurrentTerritory && poolUsed > 0;
  const canSetCapital = isOwnedByCurrentTerritory && !isCapital;
  const ownerProfileImageUrl =
    territory?.avatarImageUrl
    ?? (isOwnedByCurrentTerritory ? playerState?.profileImageUrl ?? '' : '');
  const starPopulationGrowth = calculateStarPopulationGrowth(star, capitalGrowthMultiplier);
  const starPeriodsToFill = estimateStarDisplayPeriodsToFill(star, 100000, capitalGrowthMultiplier);
  const starPeriodsToNinety = estimateStarDisplayPeriodsToNinety(star, 100000, capitalGrowthMultiplier);
  const creditPeriodLabel = playerState?.resourceUpdateInterval === 'hour' ? 'h' : 'min';

  const resources = selectedPlanet?.prominentResources?.length
    ? selectedPlanet.prominentResources.map((resource) => `${resource.name} (${resource.abundance})`).join(', ')
    : 'None';

  const planetPopulationGrowth = selectedPlanet
    ? calculatePlanetPopulationGrowth(selectedPlanet, capitalGrowthMultiplier)
    : 0;
  const planetPopulationCap = selectedPlanet ? calculatePlanetPopulationCap(selectedPlanet) : 0;
  const planetCreditProduction = selectedPlanet ? getPopulationCreditsForPlanet(selectedPlanet) : 0;
  const planetPeriodsToFill = selectedPlanet
    ? estimatePlanetDisplayPeriodsToFill(selectedPlanet, 100000, capitalGrowthMultiplier)
    : null;
  const planetPeriodsToNinety = selectedPlanet
    ? estimatePlanetDisplayPeriodsToNinety(selectedPlanet, 100000, capitalGrowthMultiplier)
    : null;

  return (
    <aside className={`system-panel${embedded ? ' system-panel--embedded' : ''}`} aria-label="Selected star system">
      <div className="system-panel__header">
        <div>
          <div className="system-panel__eyebrow">{isCapital ? 'Capital System' : territory ? 'Occupied System' : 'Unclaimed System'}</div>
          <h2>{star.name}</h2>
        </div>
        {showCloseButton ? (
          <button type="button" className="system-panel__close" onClick={onClose} aria-label="Close selected system">
            x
          </button>
        ) : null}
      </div>

      <div className="system-panel__grid">
        <div className={`system-stat system-stat--${territory ? 'accent' : 'default'}`}>
          <span>Owner</span>
          <div className="system-owner">
            <button
              type="button"
              className="system-owner__button"
              onClick={() => onInspectOwnerProfile?.(territory)}
              disabled={!territory?.id}
              title={territory?.id ? `Open ${star.owner} profile` : star.owner}
            >
              <strong>{star.owner}</strong>
              <span
                className="system-owner__avatar"
                style={ownerProfileImageUrl
                  ? undefined
                  : {
                      background: territory?.color
                        ? `linear-gradient(135deg, ${territory.color}, #93a4bd)`
                        : 'linear-gradient(135deg, #1e293b, #93a4bd)',
                    }}
              >
                {ownerProfileImageUrl ? (
                  <img
                    className="system-owner__avatar-image"
                    src={ownerProfileImageUrl}
                    alt={`${star.owner} profile`}
                  />
                ) : (String(star.owner ?? '?').trim().charAt(0).toUpperCase() || '?')}
              </span>
            </button>
          </div>
        </div>
        <Stat label="Star Type" value={star.starType} />
        <Stat label="Energy" value={formatNumber(star.energyOutput)} />
        <Stat label="Defense" value={formatNumber(star.systemDefense)} />
        <Stat label="Population" value={`${formatNumber(star.population)} (+${formatNumber(starPopulationGrowth)} pp)`} />
        <Stat label="Population Cap" value={formatNumber(calculateStarPopulationCap(star))} />
      </div>

      {showPopulationTiming ? (
        <div className="system-panel__timing">
          <span>PTF {Number.isFinite(starPeriodsToFill) ? formatNumber(starPeriodsToFill) : '--'}</span>
          <span>PT90% {Number.isFinite(starPeriodsToNinety) ? formatNumber(starPeriodsToNinety) : '--'}</span>
        </div>
      ) : null}

      <div className="system-panel__actions">
        <button type="button" onClick={() => onCollectResources?.(star.id)} disabled={!canCollect}>
          Collect
        </button>
        <button type="button" onClick={() => onSetCapital?.(star.id)} disabled={!canSetCapital}>
          {isCapital ? 'Capital' : 'Set Capital'}
        </button>
      </div>

      <section className="system-section">
        <div className="system-section__title">System Pool</div>
        <div className="pool-line">
          <strong>{formatNumber(poolUsed)} / {formatNumber(poolCapacity)}</strong>
          <span>{summarizePoolResources(poolResources)}</span>
        </div>
      </section>

      <section className="system-section">
        <div className="system-section__title">Planets</div>
        <div className="planet-list">
          {star.planets.map((planet) => (
            <PlanetPill
              key={planet.id}
              planet={planet}
              active={planet.id === selectedPlanet?.id}
              onClick={() => {
                onSelectPlanet?.(planet.id);
                setSelectedPlanetId(planet.id);
              }}
            />
          ))}
        </div>
      </section>

      {selectedPlanet ? (
        <section className="planet-detail">
          <div className="planet-detail__header">
            <div>
              <h3>{selectedPlanet.name}</h3>
              <span>{selectedPlanet.type} planet</span>
            </div>
            <strong>{selectedPlanet.habitability}</strong>
          </div>

          <div className="system-panel__grid system-panel__grid--planet">
            <Stat label="Population" value={`${formatNumber(selectedPlanet.population)} (+${formatNumber(planetPopulationGrowth)} pp)`} />
            <Stat label="Credits" value={`${formatNumber(planetCreditProduction)}/${creditPeriodLabel}`} />
            <Stat label="Population Cap" value={formatNumber(planetPopulationCap)} />
            <Stat label="Resources" value={resources} />
          </div>

          {showPopulationTiming ? (
            <div className="system-panel__timing">
              <span>PTF {Number.isFinite(planetPeriodsToFill) ? formatNumber(planetPeriodsToFill) : '--'}</span>
              <span>PT90% {Number.isFinite(planetPeriodsToNinety) ? formatNumber(planetPeriodsToNinety) : '--'}</span>
            </div>
          ) : null}

          <div className="system-section__title">Infrastructure</div>
          {!isOwnedByCurrentTerritory ? (
            <div className="system-panel__notice">Build only on planets around stars you own.</div>
          ) : null}
          <div className="infrastructure-list">
            {Object.keys(selectedPlanet.infrastructure ?? {}).map((infrastructureKey) => (
              <InfrastructureRow
                key={infrastructureKey}
                planet={selectedPlanet}
                infrastructureKey={infrastructureKey}
                canManage={isOwnedByCurrentTerritory}
                canAffordUpgrade={canAffordUpgrade}
                getBuildCost={getBuildCost}
                onChange={onInfrastructureChanged}
              />
            ))}
          </div>

          <div className="system-panel__footer">
            <span>{infrastructureStatusMessage || 'Ready'}</span>
            <button
              type="button"
              onClick={onSaveInfrastructureChanges}
              disabled={!isOwnedByCurrentTerritory || !hasPendingInfrastructureChanges}
            >
              Save
            </button>
          </div>
        </section>
      ) : null}
    </aside>
  );
}
