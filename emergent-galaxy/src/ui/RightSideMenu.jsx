import React, { useEffect, useId, useRef, useState } from 'react';
import { StarSystemPanel } from './StarSystemPanel.jsx';
import {
  SHIP_HULL_DEFINITIONS,
  SHIP_MODULE_DEFINITIONS,
  SHIP_TRAIT_KEYS,
  ShipClass,
} from '../core/shipClass.js';

const PROFILE_BANNER_URL = '/top-banner.png';
const MAX_PROFILE_IMAGE_BYTES = 100 * 1024;

function dataUrlByteLength(dataUrl) {
  const payload = String(dataUrl || '').split(',')[1] ?? '';
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Upload failed'));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Upload failed'));
    image.src = dataUrl;
  });
}

async function convertImageFileToPngDataUrl(file) {
  const sourceDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(sourceDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Upload failed');
  }
  context.drawImage(image, 0, 0);
  return canvas.toDataURL('image/png');
}

function compactNumber(value) {
  const number = Math.round(Number(value) || 0);
  const absolute = Math.abs(number);
  const units = [
    { threshold: 1_000_000_000_000, suffix: 'T' },
    { threshold: 1_000_000_000, suffix: 'B' },
    { threshold: 1_000_000, suffix: 'M' },
    { threshold: 1_000, suffix: 'K' },
  ];

  for (const unit of units) {
    if (absolute >= unit.threshold) {
      const scaled = number / unit.threshold;
      const formatted = scaled >= 100 ? Math.round(scaled).toString() : scaled >= 10 ? scaled.toFixed(1) : scaled.toFixed(2);
      return `${formatted.replace(/\.0+$|(\.\d*[1-9])0+$/, '$1')}${unit.suffix}`;
    }
  }

  return number.toString();
}

function formatCostSummary(cost = {}) {
  const entries = Object.entries(cost ?? {})
    .filter(([, value]) => (Number(value) || 0) > 0)
    .map(([resourceKey, value]) => `${compactNumber(value)} ${resourceKey}`);

  return entries.length ? entries.join(' | ') : 'Free';
}

function renderItemIcon(item, size = 24) {
  const icon = item?.icon ?? {};
  return (
    <span
      title={item?.name ?? 'Item'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: 10,
        background: icon.background ?? 'linear-gradient(135deg, #0b1220, #334155)',
        color: 'white',
        border: `1px solid ${icon.color ?? '#93a4bd'}88`,
        boxShadow: `0 10px 20px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.16)`,
        fontSize: Math.max(11, Math.round(size * 0.48)),
        fontWeight: 900,
        lineHeight: 1,
        flex: '0 0 auto',
      }}
    >
      {icon.symbol ?? '?'}
    </span>
  );
}

function PlayerSummaryCard({ playerState, playerSummary, onProfileImageUpload, canEditProfileImage = true }) {
  const uploadInputId = useId();
  const [uploadMessage, setUploadMessage] = useState('');
  const territoryName = playerState?.territory?.name ?? playerState?.playerName ?? playerState?.playerId ?? 'Commander';
  const initial = String(territoryName).trim().charAt(0).toUpperCase() || '?';
  const profileImageUrl = playerState?.profileImageUrl ?? '';
  const planetsFull = playerSummary?.planetsFull ?? 0;
  const planetsTotal = playerSummary?.planetsTotal ?? 0;
  const readySystems = playerSummary?.readySystems ?? 0;
  const ownedSystems = playerSummary?.ownedSystems ?? 0;
  const energyUsed = playerSummary?.activeEnergyConsumption ?? playerState?.activeEnergyConsumption ?? 0;
  const energyMax = playerSummary?.energyOutput ?? playerState?.energyOutput ?? 0;
  const inactiveInfrastructure = playerSummary?.inactiveInfrastructureCount ?? playerState?.inactiveInfrastructureCount ?? 0;
  const level = Math.max(1, Math.floor(Number(playerState?.level) || 1));

  async function handleProfileImageChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    if (file.size > MAX_PROFILE_IMAGE_BYTES) {
      setUploadMessage('Max 100 KB');
      return;
    }

    try {
      const pngDataUrl = await convertImageFileToPngDataUrl(file);
      if (dataUrlByteLength(pngDataUrl) > MAX_PROFILE_IMAGE_BYTES) {
        setUploadMessage('Max 100 KB');
        return;
      }

      setUploadMessage('');
      await onProfileImageUpload?.(pngDataUrl);
    } catch (error) {
      setUploadMessage('Upload failed');
    }
  }

  return (
    <section
      className="player-summary"
      aria-label="Player summary"
      style={{ '--player-summary-banner-image': `url(${PROFILE_BANNER_URL})` }}
    >
      <div className="player-summary__avatar-wrap">
        <div
          className="player-summary__avatar"
          title={territoryName}
          style={profileImageUrl ? { backgroundImage: `url(${profileImageUrl})` } : undefined}
        >
          {profileImageUrl ? null : initial}
        </div>
        <input
          id={uploadInputId}
          className="player-summary__avatar-input"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleProfileImageChange}
          disabled={!playerState || !canEditProfileImage}
        />
        <label
          className="player-summary__avatar-upload"
          htmlFor={uploadInputId}
          aria-label="Upload profile image"
          title="Upload profile image (max 100 KB)"
        >
          ✎
        </label>
      </div>
      <div className="player-summary__content">
        <div className="player-summary__name">{territoryName}</div>
        <div className="player-summary__meta">Level {compactNumber(level)}</div>
        {uploadMessage ? <div className="player-summary__upload-message">{uploadMessage}</div> : null}
        <div className="player-summary__stats">
          <div>
            <span>Planets full</span>
            <strong>{compactNumber(planetsFull)} / {compactNumber(planetsTotal)}</strong>
          </div>
          <div>
            <span>Ready pools</span>
            <strong>{compactNumber(readySystems)} / {compactNumber(ownedSystems)}</strong>
          </div>
          <div>
            <span>Energy</span>
            <strong>{compactNumber(energyUsed)} / {compactNumber(energyMax)}</strong>
          </div>
          {inactiveInfrastructure > 0 ? (
            <div className="player-summary__warning">
              <span>Offline infra</span>
              <strong>{compactNumber(inactiveInfrastructure)}</strong>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function InventoryView({ resourceDisplay, playerState, itemDefinitions }) {
  const resources = playerState?.resources ?? {};
  const production = playerState?.hourlyProduction ?? {};
  const items = playerState?.items ?? {};
  const ships = playerState?.ships ?? playerState?.fleet?.ships ?? [];

  if (!playerState) {
    return <div className="menu-empty">Log in to load your inventory.</div>;
  }

  return (
    <div className="menu-stack">
      <section className="menu-section">
        <div className="menu-section__title">Resources</div>
        <div className="menu-list">
          {resourceDisplay.map((resource) => (
            <div key={resource.key} className="menu-row">
              <span className="menu-row__label">
                {renderResourceIcon(resource, 20)}
                <span>{resource.key}</span>
              </span>
              <strong title={String(Math.round(Number(resources[resource.key]) || 0))}>
                {compactNumber(resources[resource.key])}
              </strong>
            </div>
          ))}
        </div>
      </section>

      <section className="menu-section">
        <div className="menu-section__title">Ships</div>
        {ships.length ? (
          <div className="menu-list">
            {ships.map((ship, index) => (
              <div
                key={`${ship.id ?? ship.templateId ?? ship.name ?? ship.type ?? 'ship'}-${ship.position ?? ship.starId ?? 'unknown'}-${ship.moveMissionId ?? index}`}
                className="menu-row"
              >
                <span>{ship.name ?? ship.type ?? 'Ship'}</span>
                <strong>{compactNumber(ship.count ?? 1)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <div className="menu-empty">No ships.</div>
        )}
      </section>

      <section className="menu-section">
        <div className="menu-section__title">Special Items</div>
        <div className="menu-list">
          {itemDefinitions.map((item) => (
            <div key={item.id} className="menu-row">
              <span className="menu-row__label">
                {renderItemIcon(item, 28)}
                <span>{item.name}</span>
              </span>
              <span style={{ display: 'grid', justifyItems: 'end', gap: 2 }}>
                <strong>{compactNumber(items[item.id])}</strong>
                <small style={{ color: 'rgba(255,255,255,0.46)', fontSize: 10 }}>
                  {compactNumber(item.storageSize)} space
                </small>
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ProductionView({
  playerState,
  itemDefinitions,
  selectedProductionItemId,
  onSelectedProductionItemIdChange,
  onAddProduction,
  onRemoveProductionEntry,
  productionInfoText,
  productionEntries,
  shipTemplates = [],
}) {
  const [activeType, setActiveType] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [selectedTargetId, setSelectedTargetId] = useState(
    selectedProductionItemId ? `item:${selectedProductionItemId}` : null,
  );

  const itemTargets = itemDefinitions.map((item) => ({
    id: `item:${item.id}`,
    type: 'item',
    itemId: item.id,
    name: item.name,
    category: item.category ?? 'item',
    productionCost: item.productionCost,
    resourceCost: item.resourceCost,
    item,
    ownedCount: playerState?.items?.[item.id] ?? 0,
  }));
  const templateTargets = shipTemplates.map((template) => {
    const resourceTotal = Object.values(template.cost ?? {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
    return {
      id: `template:${template.id}`,
      type: 'ship-template',
      template,
      name: template.name,
      category: template.hullName ?? 'ship template',
      productionCost: Math.max(2, Math.ceil(resourceTotal / 90)),
      resourceCost: template.cost ?? {},
      item: null,
      ownedCount: null,
    };
  });
  const productionTargets = [...itemTargets, ...templateTargets];
  const selectedTarget =
    productionTargets.find((target) => target.id === selectedTargetId) ??
    productionTargets.find((target) => target.id === `item:${selectedProductionItemId}`) ??
    productionTargets[0] ??
    null;
  const normalizedSearch = searchText.trim().toLowerCase();
  const visibleTargets = productionTargets.filter((target) => {
    const matchesType =
      activeType === 'all' ||
      (activeType === 'items' && target.type === 'item') ||
      (activeType === 'templates' && target.type === 'ship-template');
    const matchesSearch =
      !normalizedSearch ||
      target.name.toLowerCase().includes(normalizedSearch) ||
      target.category.toLowerCase().includes(normalizedSearch);
    return matchesType && matchesSearch;
  });

  function handleSelectTarget(target) {
    setSelectedTargetId(target.id);
    if (target.type === 'item') {
      onSelectedProductionItemIdChange?.(target.itemId);
    }
  }

  if (!playerState) {
    return <div className="menu-empty">Log in to use production.</div>;
  }

  return (
    <div className="menu-stack">
      <section className="menu-section">
        <div className="menu-section__title">Production</div>
        <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
          <input
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search production"
            style={{
              width: '100%',
              border: '1px solid rgba(148,163,184,0.16)',
              borderRadius: 12,
              padding: '10px 12px',
              color: '#e8efff',
              background: 'rgba(255,255,255,0.04)',
            }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
            {[
              ['all', `All ${productionTargets.length}`],
              ['items', `Items ${itemTargets.length}`],
              ['templates', `Ships ${templateTargets.length}`],
            ].map(([type, label]) => (
              <button
                key={type}
                type="button"
                onClick={() => setActiveType(type)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: `1px solid ${activeType === type ? 'rgba(201,116,66,0.42)' : 'rgba(148,163,184,0.14)'}`,
                  background: activeType === type ? 'rgba(201,116,66,0.16)' : 'rgba(255,255,255,0.03)',
                  color: activeType === type ? '#ffd9c2' : '#cfd7e4',
                  cursor: 'pointer',
                  fontWeight: 800,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div
          className="production-target-list"
          style={{
            display: 'grid',
            maxHeight: 360,
            overflowY: 'auto',
            paddingRight: 2,
            borderTop: '1px solid rgba(148,163,184,0.12)',
          }}
        >
          {visibleTargets.map((target) => {
            const isSelected = target.id === selectedTarget?.id;
            return (
              <button
                key={target.id}
                type="button"
                onClick={() => handleSelectTarget(target)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                  gap: 12,
                  alignItems: 'center',
                  width: '100%',
                  padding: '12px 10px 12px 0',
                  borderRadius: 0,
                  border: 0,
                  borderBottom: '1px solid rgba(148,163,184,0.12)',
                  background: isSelected ? 'rgba(255,255,255,0.035)' : 'transparent',
                  color: '#e8efff',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '26px minmax(0, 1fr)',
                    alignItems: 'center',
                    gap: 10,
                    minWidth: 0,
                  }}
                >
                  {target.type === 'item' ? renderItemIcon(target.item, 26) : (
                    <span
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 8,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flex: '0 0 auto',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(148,163,184,0.16)',
                        color: '#eef4ff',
                        fontWeight: 900,
                      }}
                    >
                      S
                    </span>
                  )}
                  <span style={{ minWidth: 0, display: 'grid', gap: 3 }}>
                    <strong
                      style={{
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        minWidth: 0,
                        color: '#eef4ff',
                        fontSize: 13,
                        fontWeight: 900,
                      }}
                    >
                      {target.name}
                    </strong>
                    <small className="menu-subtle" style={{ display: 'block', fontSize: 11, textTransform: 'capitalize', marginTop: 2 }}>
                      {target.category}{target.ownedCount == null ? '' : ` | owned ${compactNumber(target.ownedCount)}`}
                    </small>
                    {isSelected ? (
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 6,
                          marginTop: 7,
                        }}
                        title={formatCostSummary(target.resourceCost)}
                      >
                        {Object.entries(target.resourceCost ?? {})
                          .filter(([, value]) => (Number(value) || 0) > 0)
                          .map(([resourceKey, value]) => (
                            <span
                              key={`${target.id}-${resourceKey}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '3px 7px',
                                borderRadius: 999,
                                background: 'rgba(255,255,255,0.06)',
                                border: '1px solid rgba(148,163,184,0.14)',
                                color: '#d9e3f4',
                                fontSize: 11,
                                lineHeight: 1.2,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <strong style={{ color: '#ffffff', fontSize: 11 }}>{compactNumber(value)}</strong>
                              <span>{resourceKey}</span>
                            </span>
                          ))}
                        {!Object.values(target.resourceCost ?? {}).some((value) => (Number(value) || 0) > 0) ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '3px 7px',
                              borderRadius: 999,
                              background: 'rgba(255,255,255,0.06)',
                              border: '1px solid rgba(148,163,184,0.14)',
                              color: '#d9e3f4',
                              fontSize: 11,
                              lineHeight: 1.2,
                            }}
                          >
                            Free
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </span>
                </span>
                <strong
                  style={{
                    color: '#eef4ff',
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                    fontSize: 12,
                    fontWeight: 850,
                    letterSpacing: '0.01em',
                  }}
                >
                  {compactNumber(target.productionCost)} Industry
                </strong>
              </button>
            );
          })}
          {!visibleTargets.length ? <div className="menu-empty">No production targets.</div> : null}
        </div>

        <div className="production-controls" style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => selectedTarget && onAddProduction?.(selectedTarget)}
            disabled={!selectedTarget}
            style={{ width: '100%' }}
          >
            Add Selected
          </button>
        </div>
        <div className="menu-subtle">{productionInfoText}</div>
      </section>

      <section className="menu-section">
        <div className="menu-section__title">Production Queue</div>
        {!productionEntries.length ? (
          <div className="menu-empty">Queue is empty.</div>
        ) : (
          <div className="queue-list">
            {productionEntries.map((entry) => (
              <div key={entry.id} className="queue-card">
                <div className="queue-card__row">
                  <span className="menu-row__label">
                    {renderItemIcon(entry.item, 22)}
                    <span>{entry.item?.name ?? entry.itemId}</span>
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    <strong>{entry.statusText}</strong>
                    <button
                      type="button"
                      onClick={() => onRemoveProductionEntry?.(entry.id)}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 999,
                        border: '1px solid rgba(248,113,113,0.24)',
                        background: 'rgba(127,29,29,0.16)',
                        color: '#fca5a5',
                        cursor: 'pointer',
                        fontSize: 15,
                        lineHeight: 1,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flex: '0 0 auto',
                      }}
                      title="Remove from queue"
                      aria-label={`Remove ${entry.item?.name ?? entry.itemId} from queue`}
                    >
                      x
                    </button>
                  </span>
                </div>
                <div className="queue-card__bar">
                  <div style={{ width: `${entry.progressPercent}%` }} />
                </div>
                <div className="menu-subtle">Efficiency: {entry.efficiencyPercent}%</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ProfileView({
  playerState,
  resourceDisplay = [],
  loading = false,
  errorMessage = '',
  isOwnProfile = true,
}) {
  if (!playerState && loading) {
    return <div className="menu-empty">Loading profile...</div>;
  }

  if (!playerState) {
    return <div className="menu-empty">Log in to view your profile.</div>;
  }

  const territoryName = playerState?.territory?.name ?? playerState?.playerName ?? playerState?.playerId ?? 'Player';
  const profileImageUrl = playerState?.profileImageUrl ?? playerState?.territory?.avatarImageUrl ?? '';
  const initial = String(territoryName).trim().charAt(0).toUpperCase() || '?';
  const resources = playerState?.resources ?? {};
  const production = playerState?.hourlyProduction ?? {};
  const productionResources = [
    { key: 'Credits', label: 'Credits', icon: '$', color: '#fbbf24' },
    ...resourceDisplay.map((resource) => ({ ...resource, label: resource.key })),
  ];
  const xpIcon = { symbol: '✦', color: '#93c5fd', background: 'transparent', boxShadow: 'none' };
  const gemsIcon = { symbol: '◆', color: '#c4b5fd', background: 'transparent', boxShadow: 'none' };

  return (
    <div className="menu-stack">
      <section>
        <div className="menu-section__title">Profile</div>
        <div className="profile-card">
          <div
            className="profile-card__avatar"
            style={profileImageUrl ? { backgroundImage: `url(${profileImageUrl})` } : undefined}
          >
            {profileImageUrl ? null : initial}
          </div>
          <div className="profile-card__identity">
            <strong>{territoryName}</strong>
            <span>{isOwnProfile ? 'Your empire' : 'Viewed empire'}</span>
          </div>
        </div>
        <div className="menu-list">
          <div className="menu-row"><span>Name</span><strong>{territoryName}</strong></div>
          <div className="menu-row"><span>Level</span><strong>{compactNumber(playerState.level ?? 1)}</strong></div>
          <div className="menu-row">
            <span className="menu-row__label">{renderProfileMetricIcon(xpIcon, 20)}<span>XP</span></span>
            <strong>{compactNumber(playerState.xp ?? 0)}</strong>
          </div>
          <div className="menu-row">
            <span className="menu-row__label">{renderProfileMetricIcon(gemsIcon, 20)}<span>Gems</span></span>
            <strong>{compactNumber(playerState.gems ?? playerState.premiumCurrency ?? 0)}</strong>
          </div>
        </div>
        <div className="menu-section__title" style={{ marginTop: 12 }}>Resources</div>
        <div className="profile-resource-list">
          <div className="profile-resource-header">
            <span />
            <span>Owned</span>
            <span>+/period</span>
          </div>
          {productionResources.map((resource) => (
            <div className="profile-resource-row" key={resource.key}>
              <span className="menu-row__label">
                {renderResourceIcon(resource, 20)}
                <span>{resource.label}</span>
              </span>
              <strong>{compactNumber(resources[resource.key] ?? 0)}</strong>
              <strong>{compactNumber(production[resource.key] ?? 0)}</strong>
            </div>
          ))}
        </div>
        {loading ? <div className="menu-subtle">Refreshing profile...</div> : null}
        {errorMessage ? <div className="menu-empty">{errorMessage}</div> : null}
      </section>
    </div>
  );
}

function ObjectivesView({ playerState, playerSummary }) {
  if (!playerState) {
    return <div className="menu-empty">Log in to view objectives.</div>;
  }

  const planetsFull = Number(playerSummary?.planetsFull ?? 0) || 0;
  const planetsTotal = Number(playerSummary?.planetsTotal ?? 0) || 0;
  const readySystems = Number(playerSummary?.readySystems ?? 0) || 0;
  const ownedSystems = Number(playerSummary?.ownedSystems ?? 0) || 0;
  const queueLength = Array.isArray(playerState?.productionQueue) ? playerState.productionQueue.length : 0;
  const inactiveInfrastructure = Number(playerSummary?.inactiveInfrastructureCount ?? playerState?.inactiveInfrastructureCount ?? 0) || 0;

  const cards = [
    {
      title: 'Expand empire',
      body: planetsTotal > 0
        ? `${compactNumber(planetsFull)} of ${compactNumber(planetsTotal)} planets are full. Keep your strongest worlds productive.`
        : 'Claim or develop more planets to grow your empire.',
      accent: '#93a4bd',
    },
    {
      title: 'Keep systems ready',
      body: ownedSystems > 0
        ? `${compactNumber(readySystems)} of ${compactNumber(ownedSystems)} pools are ready to collect right now.`
        : 'Secure a system to begin generating ready resource pools.',
      accent: '#d8c38a',
    },
    {
      title: 'Production focus',
      body: queueLength > 0
        ? `${compactNumber(queueLength)} item${queueLength === 1 ? '' : 's'} in queue. Stay on top of ship and item output.`
        : 'Your production queue is empty. Add a build to keep industry moving.',
      accent: '#7c8faa',
    },
  ];

  if (inactiveInfrastructure > 0) {
    cards.unshift({
      title: 'Restore offline infra',
      body: `${compactNumber(inactiveInfrastructure)} infrastructure node${inactiveInfrastructure === 1 ? '' : 's'} offline. Stabilize energy to reactivate them.`,
      accent: '#fca5a5',
    });
  }

  return (
    <div className="menu-stack">
      <section className="menu-section">
        <div className="menu-section__title">Objectives</div>
        <div className="menu-subtle">A quick command view for what matters most right now.</div>
        <div className="menu-stack">
          {cards.map((card) => (
            <div
              key={card.title}
              className="menu-section"
              style={{
                borderColor: `${card.accent}22`,
                boxShadow: `0 14px 28px rgba(0,0,0,0.16), inset 0 1px 0 ${card.accent}18`,
              }}
            >
              <div
                className="menu-section__title"
                style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}
              >
                <span
                  className="resource-dot"
                  style={{ background: card.accent, color: '#07111f' }}
                >
                  ◎
                </span>
                <span>{card.title}</span>
              </div>
              <div className="menu-subtle" style={{ fontSize: 13, lineHeight: 1.5 }}>
                {card.body}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const SHIP_TRAIT_LABELS = {
  combatPower: 'Combat power',
  defense: 'Defense',
  thrust: 'Thrust',
  cargoCapacity: 'Storage',
  passengerCapacity: 'Passengers',
  stealth: 'Stealth',
};

const SHIP_TRAIT_SHORT_LABELS = {
  combatPower: 'ATK',
  defense: 'DEF',
  thrust: 'SPD',
  cargoCapacity: 'STO',
  passengerCapacity: 'PAX',
  stealth: 'STL',
};

const FLEET_STAT_LABELS = {
  combatPower: 'Combat',
  defense: 'Defense',
  thrust: 'Speed',
  cargoCapacity: 'Storage',
  passengerCapacity: 'Passengers',
  stealth: 'Stealth',
};

const SHIP_TRAIT_COLORS = {
  combatPower: '#fca5a5',
  defense: '#93c5fd',
  thrust: '#fde68a',
  cargoCapacity: '#86efac',
  passengerCapacity: '#c4b5fd',
  stealth: '#7dd3fc',
};

function svgDataUri(svg) {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const SHIP_TRAIT_ICONS = {
  combatPower: '/ship-icons/damage.png',
  defense: '/ship-icons/defense.png',
  thrust: '/ship-icons/speed.png',
  cargoCapacity: svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#86efac" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 7.5 12 3l9 4.5-9 4.5L3 7.5Z"/>
      <path d="M3 7.5V16.5L12 21l9-4.5v-9"/>
      <path d="M12 12v9"/>
      <path d="m7.5 5.25 9 4.5"/>
    </svg>
  `),
  passengerCapacity: svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="9" cy="8" r="3"/>
      <circle cx="17" cy="9" r="2.5"/>
      <path d="M3.5 20c.8-3.8 2.8-6 5.5-6s4.7 2.2 5.5 6"/>
      <path d="M13.5 15c1-.8 2.1-1.2 3.5-1.2 2.2 0 3.7 1.8 4.3 5.2"/>
    </svg>
  `),
  stealth: '/ship-icons/stealth.png',
};

const HULL_ORIENTATION_ICONS = {
  speed: '/ship-icons/speed.png',
  defense: '/ship-icons/defense.png',
  trade: '/ship-icons/trade.png',
  stealth: '/ship-icons/stealth.png',
  damage: '/ship-icons/damage.png',
};

const RESOURCE_ICON_PATHS = {
  Food: '/icons/food.png',
  Metals: '/icons/metal.png',
  'Rare Earth Elements': '/icons/rare.png',
  Uranium: '/icons/uranium.png',
};

const SHIP_COST_DISPLAY = [
  { key: 'Credits', icon: '$', color: '#fbbf24' },
  { key: 'Metals', icon: 'M', color: '#a8b5c7' },
  { key: 'Food', icon: 'F', color: '#86efac' },
  { key: 'Rare Earth Elements', icon: 'R', color: '#c4b5fd' },
  { key: 'Uranium', icon: 'U', color: '#bef264' },
];

function renderResourceIcon(resource, size = 20) {
  const iconPath = RESOURCE_ICON_PATHS[resource?.key];
  const isCredits = resource?.key === 'Credits';

  return (
    <span
      className="resource-dot"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(11, Math.round(size * 0.55)),
        flex: '0 0 auto',
        borderRadius: isCredits ? '0' : undefined,
        background: iconPath
          ? `center / ${Math.max(14, size - 4)}px ${Math.max(14, size - 4)}px no-repeat url(${iconPath})`
          : (isCredits ? 'transparent' : (resource?.color ?? '#93a4bd')),
        color: isCredits ? '#fbbf24' : '#07111f',
      }}
    >
      {iconPath ? '' : (resource?.icon ?? '?')}
    </span>
  );
}

function renderProfileMetricIcon({ symbol, color, background, boxShadow }, size = 20) {
  return (
    <span
      className="resource-dot"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.5)),
        flex: '0 0 auto',
        background,
        color,
        boxShadow,
      }}
    >
      {symbol}
    </span>
  );
}

function StatPips({ value = 0, max = 10, activeColor = '#c97442', inactiveColor = 'rgba(255,255,255,0.06)' }) {
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {Array.from({ length: max }, (_, index) => {
        const isActive = index < value;
        return (
          <span
            key={`${value}-${index}`}
            style={{
              width: 14,
              height: 28,
              borderRadius: 2,
              background: isActive ? activeColor : inactiveColor,
              border: `1px solid ${isActive ? `${activeColor}88` : 'rgba(255,255,255,0.04)'}`,
              boxShadow: isActive ? `inset 0 1px 0 rgba(255,255,255,0.14), 0 0 0 1px ${activeColor}14` : 'none',
            }}
          />
        );
      })}
    </div>
  );
}

function ShipHullCanvasPicker({ hulls, selectedHullId, onSelectHull }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${hulls.length}, minmax(0, 1fr))`,
        gap: 8,
      }}
    >
      {hulls.map((hull) => {
        const isSelected = hull.id === selectedHullId;
        return (
          <button
            key={hull.id}
            type="button"
            onClick={() => onSelectHull(hull.id)}
            title={hull.name}
            aria-label={hull.name}
            style={{
              height: 54,
              borderRadius: 10,
              border: `1px solid ${isSelected ? 'rgba(201,116,66,0.52)' : 'rgba(148,163,184,0.2)'}`,
              background: isSelected ? 'rgba(201,116,66,0.18)' : 'rgba(9,14,21,0.82)',
              color: '#eef4ff',
              cursor: 'pointer',
              boxShadow: isSelected ? '0 0 0 1px rgba(201,116,66,0.16), 0 10px 24px rgba(0,0,0,0.26)' : '0 10px 24px rgba(0,0,0,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 34,
                height: 34,
                borderRadius: 999,
                backgroundColor: isSelected ? 'rgba(201,116,66,0.24)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${isSelected ? 'rgba(201,116,66,0.32)' : 'rgba(255,255,255,0.08)'}`,
                backgroundImage: `url(${HULL_ORIENTATION_ICONS[hull.orientation] ?? ''})`,
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: '27px 27px',
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

function getShipPreviewUrl(hullId, traits = {}) {
  const seed = [
    hullId,
    traits.combatPower ?? 0,
    traits.defense ?? 0,
    traits.thrust ?? 0,
    traits.cargoCapacity ?? 0,
    traits.passengerCapacity ?? 0,
    traits.stealth ?? 0,
  ].join("-");

  return `/shipgen/index.html?embed=1`
    + `&seed=${encodeURIComponent(seed)}`
    + `&combatPower=${encodeURIComponent(traits.combatPower ?? 0)}`
    + `&defense=${encodeURIComponent(traits.defense ?? 0)}`
    + `&thrust=${encodeURIComponent(traits.thrust ?? 0)}`
    + `&cargoCapacity=${encodeURIComponent(traits.cargoCapacity ?? 0)}`
    + `&passengerCapacity=${encodeURIComponent(traits.passengerCapacity ?? 0)}`
    + `&stealth=${encodeURIComponent(traits.stealth ?? 0)}`;
}

function ShipPreviewFrame({ hullId, traits, height = 210, title = 'Ship preview' }) {
  const previewUrl = getShipPreviewUrl(hullId, traits);

  return (
    <div
      style={{
        borderRadius: 10,
        overflow: 'hidden',
        border: '1px solid rgba(148,163,184,0.16)',
        background: 'linear-gradient(180deg, rgba(5,12,20,0.96), rgba(3,8,14,0.96))',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 18px rgba(0,0,0,0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <iframe
        title={title}
        src={previewUrl}
        scrolling="no"
        style={{
          display: 'block',
          width: '100%',
          height,
          border: 0,
          background: 'transparent',
          overflow: 'hidden',
        }}
      />
    </div>
  );
}

function ShipSpritePreview({ hullId, traits }) {

  return (
    <section className="menu-section">
      <ShipPreviewFrame hullId={hullId} traits={traits} />
    </section>
  );
}

function ShipTraitIconStat({ traitKey, value }) {
  const label = SHIP_TRAIT_LABELS[traitKey] ?? traitKey;
  const shortLabel = SHIP_TRAIT_SHORT_LABELS[traitKey] ?? label;
  const iconPath = SHIP_TRAIT_ICONS[traitKey];
  const color = SHIP_TRAIT_COLORS[traitKey] ?? '#cfd7e4';

  return (
    <div
      title={`${label}: ${compactNumber(value)}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 6,
        minWidth: 0,
        height: 30,
        padding: '0 8px',
        borderRadius: 8,
        border: `1px solid ${color}24`,
        background: `linear-gradient(180deg, ${color}14, rgba(255,255,255,0.025))`,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
        <span
          aria-hidden="true"
          style={{
            width: 14,
            height: 14,
            backgroundImage: `url(${iconPath})`,
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundSize: 'contain',
            flex: '0 0 auto',
            opacity: 0.95,
          }}
        />
        <span style={{ color, fontSize: 10, fontWeight: 900, lineHeight: 1 }}>
          {shortLabel}
        </span>
      </span>
      <strong style={{ color: '#eef4ff', fontSize: 12, lineHeight: 1 }}>{compactNumber(value)}</strong>
    </div>
  );
}

function ShipTabs({ activeTab, onChange }) {
  const tabs = [
    { id: 'fleet', label: 'Fleet' },
    { id: 'designer', label: 'Ship Designer' },
  ];

  function getShipTabHref(tabId) {
    if (typeof window === 'undefined') {
      return `#panel=ship-designer&view=${tabId}`;
    }

    const params = new URLSearchParams();
    params.set('panel', 'ship-designer');
    params.set('view', tabId);
    return `${window.location.pathname}${window.location.search}#${params.toString()}`;
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        margin: '0 0 14px',
      }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <a
            key={tab.id}
            href={getShipTabHref(tab.id)}
            onClick={(event) => {
              event.preventDefault();
              onChange(tab.id);
            }}
            style={{
              padding: '0 0 5px',
              border: 0,
              borderBottom: `1px solid ${isActive ? 'rgba(232,239,255,0.78)' : 'transparent'}`,
              background: 'transparent',
              color: isActive ? '#eef4ff' : 'rgba(232,239,255,0.58)',
              fontSize: 12,
              fontWeight: 800,
              cursor: 'pointer',
              textAlign: 'left',
              textDecoration: 'none',
            }}
          >
            {tab.label}
          </a>
        );
      })}
    </div>
  );
}

function getShipLinkId(ship, index) {
  return ship?.id ? String(ship.id) : `index-${index}`;
}

function formatShipCount(count) {
  const normalizedCount = Math.max(1, Math.floor(Number(count) || 1));
  return `${compactNumber(normalizedCount)} ${normalizedCount === 1 ? 'ship' : 'ships'}`;
}

function getShipCount(count) {
  return Math.max(1, Math.floor(Number(count) || 1));
}

function getShipPositionId(ship) {
  return ship?.position ?? ship?.starId ?? null;
}

function getShipModelKey(ship, index) {
  return String(ship?.templateId ?? ship?.id ?? ship?.name ?? ship?.type ?? `ship-${index}`);
}

function getFleetGroups(ships = []) {
  const shipList = Array.isArray(ships) ? ships : [];
  const groups = [];
  const groupsByKey = new Map();

  shipList.forEach((ship, index) => {
    const modelKey = getShipModelKey(ship, index);
    const position = getShipPositionId(ship);
    const moveMissionKey = position === 'Moving' ? ship.moveMissionId ?? `moving-${index}` : '';
    const groupKey = `${modelKey}::${position ?? 'unknown'}::${moveMissionKey}`;
    let group = groupsByKey.get(groupKey);

    if (!group) {
      group = {
        id: `fleet-group-${groups.length}`,
        modelKey,
        position,
        moveMissionId: ship.moveMissionId ?? null,
        count: 0,
        ship: {
          ...ship,
          position,
          count: 0,
        },
      };
      groupsByKey.set(groupKey, group);
      groups.push(group);
    }

    group.count += getShipCount(ship.count);
    group.ship = {
      ...group.ship,
      ...ship,
      position,
      count: group.count,
    };
  });

  return groups.map((group) => ({
    ...group,
    ship: {
      ...group.ship,
      position: group.position,
      moveMissionId: group.moveMissionId,
      count: group.count,
    },
  }));
}

function getFleetGroupUnitId(group, unitNumber) {
  return `${group.id}-unit-${unitNumber}`;
}

function getFleetGroupSelectionId(group, selectedUnits = []) {
  const normalizedUnits = Array.from(new Set(selectedUnits))
    .map((unitNumber) => Math.max(1, Math.floor(Number(unitNumber) || 1)))
    .filter((unitNumber) => unitNumber <= group.count)
    .sort((a, b) => a - b);

  return normalizedUnits.length ? `${group.id}-units-${normalizedUnits.join(',')}` : group.id;
}

function resolveMissionShip(activeShipId, ships = []) {
  if (!activeShipId) {
    return null;
  }

  const groups = getFleetGroups(ships);
  for (const group of groups) {
    if (activeShipId === group.id) {
      return {
        ...group.ship,
        count: group.count,
      };
    }

    const selectionPrefix = `${group.id}-units-`;
    if (activeShipId.startsWith(selectionPrefix)) {
      const selectedUnits = Array.from(new Set(
        activeShipId
          .slice(selectionPrefix.length)
          .split(',')
          .map((unitNumber) => Math.max(1, Math.floor(Number(unitNumber) || 1)))
          .filter((unitNumber) => unitNumber <= group.count)
      )).sort((a, b) => a - b);

      if (selectedUnits.length) {
        return {
          ...group.ship,
          count: selectedUnits.length,
          missionUnitNumbers: selectedUnits,
        };
      }
    }

    const unitPrefix = `${group.id}-unit-`;
    if (activeShipId.startsWith(unitPrefix)) {
      const unitNumber = Math.max(1, Math.floor(Number(activeShipId.slice(unitPrefix.length)) || 1));
      if (unitNumber <= group.count) {
        return {
          ...group.ship,
          count: 1,
          missionUnitNumber: unitNumber,
        };
      }
    }
  }

  const shipList = Array.isArray(ships) ? ships : [];
  const directShip = shipList.find((ship, index) => getShipLinkId(ship, index) === activeShipId);
  return directShip
    ? {
        ...directShip,
        position: getShipPositionId(directShip),
        count: getShipCount(directShip.count),
      }
    : null;
}

function formatShipPosition(position, stars = []) {
  if (position === 'Moving') {
    return 'Moving';
  }

  const star = stars.find((entry) => entry.id === position);
  if (star) {
    return star.name;
  }

  return position ? `Star ${String(position).slice(0, 6)}` : 'Unknown';
}

function ShipPositionButton({ position, stars = [], onOpenStarSystem }) {
  const isMoving = position === 'Moving';
  const star = !isMoving ? stars.find((entry) => entry.id === position) : null;
  const label = formatShipPosition(position, stars);
  const canOpen = Boolean(star && onOpenStarSystem);

  return (
    <button
      type="button"
      onClick={() => canOpen && onOpenStarSystem(star.id)}
      disabled={!canOpen}
      title={canOpen ? `Open ${label}` : label}
      style={{
        display: 'grid',
        gridTemplateColumns: '54px minmax(0, 1fr)',
        alignItems: 'center',
        gap: 6,
        width: '100%',
        minHeight: 24,
        padding: '0',
        borderRadius: 0,
        border: 0,
        background: 'transparent',
        color: '#eef4ff',
        fontSize: 12,
        fontWeight: 800,
        cursor: canOpen ? 'pointer' : 'default',
        opacity: canOpen || isMoving ? 1 : 0.74,
        textAlign: 'left',
      }}
    >
      <span style={{ color: 'rgba(232,239,255,0.5)', fontWeight: 760 }}>Location</span>
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textDecorationLine: canOpen ? 'underline' : 'none',
          textUnderlineOffset: 3,
          textDecorationColor: 'rgba(232,239,255,0.32)',
        }}
      >
        {label}
      </span>
    </button>
  );
}

function FleetStatCell({ traitKey, value }) {
  const label = FLEET_STAT_LABELS[traitKey] ?? SHIP_TRAIT_LABELS[traitKey] ?? traitKey;
  const iconPath = SHIP_TRAIT_ICONS[traitKey];

  return (
    <div
      title={`${label}: ${compactNumber(value)}`}
      style={{
        display: 'grid',
        gridTemplateRows: 'auto auto',
        gap: 5,
        minWidth: 0,
        minHeight: 48,
        padding: '8px 9px',
        borderRadius: 6,
        border: '1px solid rgba(148,163,184,0.12)',
        background: 'rgba(255,255,255,0.025)',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          minWidth: 0,
          color: 'rgba(232,239,255,0.58)',
          fontSize: 11,
          fontWeight: 780,
          lineHeight: 1,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 14,
            height: 14,
            backgroundImage: `url(${iconPath})`,
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundSize: 'contain',
            flex: '0 0 auto',
            opacity: 0.52,
            filter: 'grayscale(1) brightness(1.55)',
          }}
        />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
      </span>
      <strong style={{ color: '#eef4ff', fontSize: 14, fontWeight: 900, lineHeight: 1 }}>
        {compactNumber(value)}
      </strong>
    </div>
  );
}

function ShipFleetView({ playerState, stars = [], highlightedFleetShip = null, onStartMission, onOpenStarSystem }) {
  const ships = playerState?.ships ?? playerState?.fleet?.ships ?? [];
  const fleetGroups = getFleetGroups(ships);
  const [selectedUnitsByGroup, setSelectedUnitsByGroup] = useState({});
  const [visibleHighlight, setVisibleHighlight] = useState(highlightedFleetShip);
  const highlightedGroupRef = useRef(null);

  useEffect(() => {
    setVisibleHighlight(highlightedFleetShip);

    if (!highlightedFleetShip) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setVisibleHighlight(null);
    }, 1000);

    return () => window.clearTimeout(timeoutId);
  }, [highlightedFleetShip?.modelKey, highlightedFleetShip?.position, highlightedFleetShip?.moveMissionId]);

  useEffect(() => {
    if (!highlightedGroupRef.current) {
      return;
    }

    highlightedGroupRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [visibleHighlight?.modelKey, visibleHighlight?.position, visibleHighlight?.moveMissionId, fleetGroups.length]);

  function getSelectedUnits(group) {
    return Array.from(new Set(selectedUnitsByGroup[group.id] ?? []))
      .map((unitNumber) => Math.max(1, Math.floor(Number(unitNumber) || 1)))
      .filter((unitNumber) => unitNumber <= group.count)
      .sort((a, b) => a - b);
  }

  function toggleSelectedUnit(group, unitNumber) {
    setSelectedUnitsByGroup((current) => {
      const nextSelected = new Set(current[group.id] ?? []);

      if (nextSelected.has(unitNumber)) {
        nextSelected.delete(unitNumber);
      } else {
        nextSelected.add(unitNumber);
      }

      return {
        ...current,
        [group.id]: Array.from(nextSelected).sort((a, b) => a - b),
      };
    });
  }

  function getMissionHref(targetId) {
    const params = new URLSearchParams();
    params.set('panel', 'ship-designer');
    params.set('view', 'mission');
    params.set('ship', targetId);

    if (typeof window === 'undefined') {
      return `#${params.toString()}`;
    }

    return `${window.location.pathname}${window.location.search}#${params.toString()}`;
  }

  return (
    <div className="menu-stack">
      {fleetGroups.length ? (
        <div className="fleet-group-list">
          {fleetGroups.map((group) => {
            const traits = group.ship.traits ?? {};
            const selectedUnits = getSelectedUnits(group);
            const missionTargetId = getFleetGroupSelectionId(group, selectedUnits);
            const isHighlighted =
              visibleHighlight?.modelKey === group.modelKey &&
              (visibleHighlight?.position ?? null) === (group.position ?? null) &&
              (
                !visibleHighlight?.moveMissionId ||
                visibleHighlight.moveMissionId === group.moveMissionId ||
                visibleHighlight.moveMissionId === group.ship.moveMissionId
              );
            return (
              <div
                key={group.id}
                ref={isHighlighted ? highlightedGroupRef : null}
                className={`fleet-group${isHighlighted ? ' fleet-group--highlighted' : ''}`}
              >
                <div className="fleet-group__header">
                  <div className="fleet-group__title">
                    <strong>{group.ship.name ?? group.ship.type ?? 'Ship'}</strong>
                    <span>{formatShipCount(group.count)}</span>
                    <ShipPositionButton
                      position={group.position}
                      stars={stars}
                      onOpenStarSystem={onOpenStarSystem}
                    />
                  </div>
                  <a
                    href={getMissionHref(missionTargetId)}
                    onClick={(event) => {
                      event.preventDefault();
                      onStartMission?.(missionTargetId);
                    }}
                    className="fleet-mission-link fleet-mission-link--primary"
                  >
                    Start Mission
                  </a>
                </div>

                <div className="fleet-unit-list" aria-label={`${group.ship.name ?? group.ship.type ?? 'Ship'} ships`}>
                  {Array.from({ length: group.count }, (_, unitIndex) => {
                    const unitNumber = unitIndex + 1;
                    const unitId = getFleetGroupUnitId(group, unitNumber);
                    const isSelected = selectedUnits.includes(unitNumber);
                    return (
                      <label
                        key={unitId}
                        className={`fleet-unit-row${isSelected ? ' fleet-unit-row--selected' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectedUnit(group, unitNumber)}
                          aria-label={`Select ship ${unitNumber}`}
                        />
                        <span className="fleet-unit-row__number">{unitNumber}</span>
                      </label>
                    );
                  })}
                </div>

                <div className="fleet-stat-grid">
                  {SHIP_TRAIT_KEYS.map((traitKey) => (
                    <FleetStatCell
                      key={traitKey}
                      traitKey={traitKey}
                      value={traits[traitKey] ?? 0}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="menu-empty">No ships yet.</div>
      )}
    </div>
  );
}

function ShipMissionView({ ship, stars = [], onMissionAction, onOpenStarSystem, onBack }) {
  const traits = ship?.traits ?? {};
  const missionUnitLabel = Array.isArray(ship?.missionUnitNumbers) && ship.missionUnitNumbers.length
    ? ` #${ship.missionUnitNumbers.join(', #')}`
    : ship?.missionUnitNumber
      ? ` #${ship.missionUnitNumber}`
      : '';
  const shipName = `${ship?.name ?? ship?.type ?? 'Ship'}${missionUnitLabel}`;
  const missionOptions = [
    { id: 'move-ship', name: 'Move', tone: '#7dd3fc', detail: 'Move this ship to another system.', available: true },
    { id: 'warfare', name: 'Attack', tone: '#fb7185', detail: 'Use this ship for combat.', available: false },
    { id: 'transport', name: 'Transport', tone: '#67e8f9', detail: 'Move resources between places.', available: false },
    { id: 'colonization', name: 'Colonize', tone: '#bef264', detail: 'Start or support a new colony.', available: false },
    { id: 'raiding', name: 'Raid', tone: '#fca5a5', detail: 'Steal from routes, pools, or systems.', available: false },
    { id: 'blockade', name: 'Blockade', tone: '#fbbf24', detail: 'Disrupt a system or its trade.', available: false },
    { id: 'population-movement', name: 'Move Population', tone: '#c4b5fd', detail: 'Move population between planets or systems.', available: false },
    { id: 'trade', name: 'Trade', tone: '#86efac', detail: 'Generate credits over time.', available: false },
    { id: 'protect-trade', name: 'Protect Trade', tone: '#93c5fd', detail: 'Protect trade from raids.', available: false },
  ];

  return (
    <div className="menu-stack">
      <a
        href={typeof window === 'undefined' ? '#panel=ship-designer&view=fleet' : `${window.location.pathname}${window.location.search}#panel=ship-designer&view=fleet`}
        onClick={(event) => {
          event.preventDefault();
          onBack?.();
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          minHeight: 32,
          borderRadius: 9,
          border: '1px solid rgba(148,163,184,0.16)',
          background: 'rgba(255,255,255,0.04)',
          color: '#cfd7e4',
          fontSize: 12,
          fontWeight: 800,
          cursor: 'pointer',
          textDecoration: 'none',
        }}
      >
        Back to Fleet
      </a>

      <section className="menu-section" style={{ paddingBottom: 18 }}>
        <div className="menu-section__title">Mission Ship</div>
        <ShipPreviewFrame
          hullId={ship?.hullId ?? 'speedHull'}
          traits={traits}
          height={142}
          title={`${shipName} mission preview`}
        />
        <div className="menu-row" style={{ marginTop: 10 }}>
          <span className="menu-row__label">
            <span style={{ color: '#eef4ff', fontWeight: 850 }}>{shipName}</span>
          </span>
          <strong style={{ color: '#ffd9c2' }}>x{compactNumber(ship?.count ?? 1)}</strong>
        </div>
        <div style={{ marginTop: 8 }}>
          <ShipPositionButton
            position={ship?.position}
            stars={stars}
            onOpenStarSystem={onOpenStarSystem}
          />
        </div>
      </section>

      <section className="menu-section">
        <div className="menu-section__title">Mission</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {missionOptions.map((mission) => {
            const isAvailable = mission.available;
            return (
              <button
                key={mission.id}
                type="button"
                disabled={!isAvailable}
                onClick={() => {
                  if (isAvailable) {
                    onMissionAction?.(mission.id, ship);
                  }
                }}
                style={{
                  display: 'grid',
                  gap: 4,
                  width: '100%',
                  padding: '11px 12px',
                  borderRadius: 10,
                  border: `1px solid ${isAvailable ? `${mission.tone}28` : 'rgba(148,163,184,0.12)'}`,
                  background: isAvailable
                    ? `linear-gradient(180deg, ${mission.tone}14, rgba(255,255,255,0.025))`
                    : 'linear-gradient(180deg, rgba(148,163,184,0.06), rgba(255,255,255,0.018))',
                  color: isAvailable ? '#eef4ff' : 'rgba(148,163,184,0.58)',
                  textAlign: 'left',
                  cursor: isAvailable ? 'pointer' : 'not-allowed',
                  opacity: isAvailable ? 1 : 0.56,
                }}
              >
                <strong style={{ color: isAvailable ? mission.tone : 'rgba(148,163,184,0.7)' }}>{mission.name}</strong>
                <span style={{ color: isAvailable ? 'rgba(255,255,255,0.58)' : 'rgba(148,163,184,0.52)', fontSize: 11 }}>
                  {mission.detail}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ShipDesignerView({ resourceDisplay = [], templates = [], onCreateTemplate, onDeleteTemplate }) {
  const hulls = Object.values(SHIP_HULL_DEFINITIONS);
  const modules = Object.values(SHIP_MODULE_DEFINITIONS);
  const [selectedHullId, setSelectedHullId] = useState(hulls[0]?.id ?? 'speedHull');
  const [moduleCounts, setModuleCounts] = useState(() => (
    Object.fromEntries(modules.map((module) => [module.id, 0]))
  ));
  const [shipName, setShipName] = useState('Unnamed Template');
  const [templateFeedback, setTemplateFeedback] = useState('');
  const [latestTemplateId, setLatestTemplateId] = useState(null);

  const selectedHull = SHIP_HULL_DEFINITIONS[selectedHullId] ?? hulls[0] ?? null;
  const activeModules = modules
    .map((module) => ({ id: module.id, count: Math.max(0, Math.min(10, Number(moduleCounts[module.id]) || 0)) }))
    .filter((module) => module.count > 0);
  const ship = new ShipClass({
    hullId: selectedHull?.id,
    name: shipName,
    modules: activeModules,
  });
  const traits = ship.getTraits();
  const runtime = ship.getRuntime();
  const cost = ship.getCost();
  const costResourceDisplay = SHIP_COST_DISPLAY.map(
    (resource) => resourceDisplay.find((entry) => entry.key === resource.key) ?? resource,
  );
  const resourceDisplayMap = Object.fromEntries(costResourceDisplay.map((resource) => [resource.key, resource]));
  const costEntries = costResourceDisplay
    .map((resource) => [resource.key, cost[resource.key] ?? 0])
    .filter(([resourceKey]) => resourceDisplayMap[resourceKey]);

  useEffect(() => {
    if (!templateFeedback) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setTemplateFeedback('');
    }, 2600);

    return () => window.clearTimeout(timeoutId);
  }, [templateFeedback]);

  function updateModuleCount(moduleId, nextValue) {
    const normalized = Math.max(0, Math.min(10, Math.floor(Number(nextValue) || 0)));
    setModuleCounts((current) => ({
      ...current,
      [moduleId]: normalized,
    }));
  }

  function handleCreateTemplate() {
    const trimmedName = String(shipName || '').trim() || 'Unnamed Template';
    const nextTemplate = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmedName,
      hullName: selectedHull?.name ?? 'Unknown Hull',
      hullId: selectedHull?.id ?? 'speedHull',
      modules: activeModules.map((module) => ({ ...module })),
      traits: { ...traits },
      runtime: { ...runtime },
      cost: { ...cost },
    };

    onCreateTemplate?.(nextTemplate);
    setLatestTemplateId(nextTemplate.id);
    setTemplateFeedback(`Template saved: ${trimmedName}`);
  }

  return (
    <div className="menu-stack">
      <ShipSpritePreview
        hullId={selectedHull?.id ?? 'speedHull'}
        traits={traits}
      />

      <section className="menu-section">
        <div className="menu-section__title">Hull</div>
        <div className="menu-subtle" style={{ marginBottom: 12 }}>
          Choose the base trait profile for the ship.
        </div>
        <ShipHullCanvasPicker
          hulls={hulls}
          selectedHullId={selectedHullId}
          onSelectHull={setSelectedHullId}
        />
      </section>

      <section className="menu-section">
        <div className="menu-section__title">Skill Menu</div>
        <div className="menu-subtle" style={{ marginBottom: 12 }}>
          Add modules with step controls.
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          {modules.map((module) => (
            <div
              key={module.id}
              style={{
                padding: '12px 14px',
                borderRadius: 14,
                border: '1px solid rgba(148,163,184,0.16)',
                background: 'rgba(255,255,255,0.03)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                <strong>{module.name}</strong>
                <span className="menu-subtle">mass {module.mass} | fuel {module.fuelUse}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => updateModuleCount(module.id, (moduleCounts[module.id] ?? 0) - 1)}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 999,
                      border: '1px solid rgba(148,163,184,0.12)',
                      background: 'rgba(255,255,255,0.03)',
                      color: '#cfd7e4',
                      fontSize: 22,
                      lineHeight: 1,
                      cursor: 'pointer',
                    }}
                  >
                    -
                  </button>
                  <button
                    type="button"
                    onClick={() => updateModuleCount(module.id, (moduleCounts[module.id] ?? 0) + 1)}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 999,
                      border: '1px solid rgba(201,116,66,0.24)',
                      background: 'rgba(201,116,66,0.22)',
                      color: '#ffd9c2',
                      fontSize: 22,
                      lineHeight: 1,
                      cursor: 'pointer',
                    }}
                  >
                    +
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <StatPips value={moduleCounts[module.id] ?? 0} />
                  <strong style={{ minWidth: 18, textAlign: 'right' }}>{moduleCounts[module.id] ?? 0}</strong>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="menu-section">
        <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
          <input
            type="text"
            value={shipName}
            onChange={(event) => setShipName(event.target.value)}
            placeholder="Ship template name"
            style={{
              boxSizing: 'border-box',
              width: '100%',
              border: '1px solid rgba(148,163,184,0.16)',
              borderRadius: 12,
              padding: '10px 12px',
              color: '#e8efff',
              background: 'rgba(255,255,255,0.04)',
            }}
          />
          <button
            type="button"
            onClick={handleCreateTemplate}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid rgba(201,116,66,0.28)',
              background: 'rgba(201,116,66,0.18)',
              color: '#ffd9c2',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Create Template
          </button>
          {templateFeedback ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 12,
                border: '1px solid rgba(134,163,184,0.18)',
                background: 'linear-gradient(180deg, rgba(16,34,31,0.84), rgba(10,22,21,0.78))',
                color: '#d8fff0',
                boxShadow: '0 0 0 1px rgba(134,239,172,0.06), inset 0 1px 0 rgba(255,255,255,0.04)',
              }}
            >
              <strong
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#86efac',
                  whiteSpace: 'nowrap',
                }}
              >
                Saved
              </strong>
              <span style={{ fontSize: 12, color: 'rgba(232,255,241,0.88)' }}>{templateFeedback}</span>
            </div>
          ) : null}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
            gap: 8,
          }}
        >
          {costEntries.map(([resourceKey, value]) => {
            const resource = resourceDisplayMap[resourceKey] ?? null;
            return (
              <div
                key={resourceKey}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 12,
                  border: '1px solid rgba(148,163,184,0.14)',
                  background: 'rgba(255,255,255,0.03)',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  {renderResourceIcon(resource ?? { key: resourceKey, icon: resourceKey.charAt(0) }, 20)}
                  <span className="menu-subtle" style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {resourceKey}
                  </span>
                </span>
                <strong>{compactNumber(value)}</strong>
              </div>
            );
          })}
        </div>
      </section>

      <section className="menu-section">
        <div className="menu-section__title">Result</div>
        <div className="menu-list">
          <div className="menu-row"><span>Hull</span><strong>{selectedHull?.name ?? 'None'}</strong></div>
          <div className="menu-row"><span>Mass</span><strong>{runtime.mass.toFixed(2)}</strong></div>
          <div className="menu-row"><span>Fuel Use</span><strong>{runtime.fuelUse.toFixed(2)}</strong></div>
          <div className="menu-row"><span>Speed</span><strong>{runtime.speed.toFixed(2)}</strong></div>
          <div className="menu-row"><span>Vulnerability</span><strong>{runtime.vulnerability.toFixed(2)}</strong></div>
        </div>
        <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
          {SHIP_TRAIT_KEYS.map((traitKey) => (
            <div key={traitKey} className="menu-row">
              <span>{SHIP_TRAIT_LABELS[traitKey] ?? traitKey}</span>
              <strong>{traits[traitKey] ?? 0}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="menu-section">
        <div className="menu-section__title">Templates</div>
        {templates.length ? (
          <div className="menu-list">
            {templates.map((template) => (
              <div key={template.id} style={{
                padding: '10px 12px',
                borderRadius: 12,
                border: template.id === latestTemplateId ? '1px solid rgba(134,239,172,0.26)' : '1px solid rgba(148,163,184,0.14)',
                background: template.id === latestTemplateId ? 'rgba(134,239,172,0.08)' : 'rgba(255,255,255,0.03)',
                boxShadow: template.id === latestTemplateId ? '0 0 0 1px rgba(134,239,172,0.05)' : 'none',
                display: 'grid',
                gap: 6,
              }}>
                <div className="menu-row">
                  <span>{template.name}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {template.id === latestTemplateId ? (
                      <span
                        style={{
                          padding: '3px 7px',
                          borderRadius: 999,
                          background: 'rgba(134,239,172,0.14)',
                          border: '1px solid rgba(134,239,172,0.18)',
                          color: '#d8fff0',
                          fontSize: 10,
                          fontWeight: 800,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                        }}
                      >
                        New
                      </span>
                    ) : null}
                    <strong>{template.hullName}</strong>
                    <button
                      type="button"
                      onClick={() => onDeleteTemplate?.(template.id)}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 999,
                        border: '1px solid rgba(248,113,113,0.22)',
                        background: 'rgba(127,29,29,0.14)',
                        color: '#fca5a5',
                        cursor: 'pointer',
                        fontSize: 14,
                        lineHeight: 1,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginLeft: 2,
                      }}
                      title="Delete template"
                      aria-label={`Delete template ${template.name}`}
                    >
                      x
                    </button>
                  </span>
                </div>
                <div className="menu-subtle" style={{ fontSize: 12 }}>
                  Combat power {template.traits.combatPower} | Defense {template.traits.defense} | Thrust {template.traits.thrust}
                </div>
                <div className="menu-subtle" style={{ fontSize: 12 }}>
                  Cargo capacity {template.traits.cargoCapacity} | Passenger capacity {template.traits.passengerCapacity} | Stealth {template.traits.stealth}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="menu-empty">No templates yet.</div>
        )}
      </section>
    </div>
  );
}

function ShipsView({
  playerState,
  resourceDisplay = [],
  stars = [],
  templates = [],
  activeView = 'designer',
  activeShipId = '',
  highlightedFleetShip = null,
  onViewChange,
  onMissionAction,
  onCreateTemplate,
  onDeleteTemplate,
  onOpenStarSystem,
}) {
  const activeTab =
    activeView === 'designer' || activeView === 'fleet' || activeView === 'mission'
      ? activeView
      : 'fleet';
  const ships = playerState?.ships ?? playerState?.fleet?.ships ?? [];
  const missionShip = activeTab === 'mission'
    ? resolveMissionShip(activeShipId, ships)
    : null;

  function handleTabChange(tab) {
    onViewChange?.(tab);
  }

  return (
    <div>
      {activeTab === 'mission' ? (
        <ShipMissionView
          ship={missionShip}
          stars={stars}
          onMissionAction={onMissionAction}
          onOpenStarSystem={onOpenStarSystem}
          onBack={() => onViewChange?.('fleet')}
        />
      ) : (
        <>
          <ShipTabs activeTab={activeTab === 'mission' ? 'fleet' : activeTab} onChange={handleTabChange} />
          {activeTab === 'fleet' ? (
            <ShipFleetView
              playerState={playerState}
              stars={stars}
              highlightedFleetShip={highlightedFleetShip}
              onStartMission={(shipId) => onViewChange?.('mission', shipId)}
              onOpenStarSystem={onOpenStarSystem}
            />
          ) : (
            <ShipDesignerView
              resourceDisplay={resourceDisplay}
              templates={templates}
              onCreateTemplate={onCreateTemplate}
              onDeleteTemplate={onDeleteTemplate}
            />
          )}
        </>
      )}
    </div>
  );
}

export function RightSideMenu(props) {
  const [localShipTemplates, setLocalShipTemplates] = useState([]);
  const {
    isOpen,
    activePanel,
    onClose,
    selectedStar,
    selectedTerritory,
    selectedOwnerProfileImageUrl,
    selectedPlanetId,
    currentTerritoryId,
    playerState,
    playerSummary,
    viewedProfileState,
    viewedProfileSummary,
    viewedProfileLoading,
    viewedProfileErrorMessage,
    resourceDisplay,
    itemDefinitions,
    onProfileImageUpload,
    selectedProductionItemId,
    onSelectedProductionItemIdChange,
    onAddProduction,
    onRemoveProductionEntry,
    productionInfoText,
    productionEntries,
    shipTemplates: savedShipTemplates = [],
    shipView = 'fleet',
    shipId = '',
    highlightedFleetShip = null,
    onShipViewChange,
    onMissionAction,
    stars = [],
    onCreateShipTemplate,
    onDeleteShipTemplate,
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
    onOpenStarSystem,
    onCloseSelectedSystem,
    onInspectTerritoryProfile,
  } = props;

  let content = null;
  let title = 'Inventory';
  const isViewingOtherProfile =
    activePanel === 'profile'
    && viewedProfileState
    && viewedProfileState?.playerId
    && viewedProfileState.playerId !== playerState?.playerId;
  const summaryPlayerState = isViewingOtherProfile ? viewedProfileState : playerState;
  const summaryPlayerSummary = isViewingOtherProfile ? viewedProfileSummary : playerSummary;
  const shipTemplates = playerState ? savedShipTemplates : localShipTemplates;

  function handleCreateShipTemplate(template) {
    if (playerState && onCreateShipTemplate) {
      onCreateShipTemplate(template);
      return;
    }

    setLocalShipTemplates((current) => [template, ...current]);
  }

  function handleDeleteShipTemplate(templateId) {
    if (playerState && onDeleteShipTemplate) {
      onDeleteShipTemplate(templateId);
      return;
    }

    setLocalShipTemplates((current) => current.filter((template) => template.id !== templateId));
  }

  switch (activePanel) {
    case 'profile':
      title = 'Profile';
      content = (
        <ProfileView
          playerState={viewedProfileState ?? playerState}
          resourceDisplay={resourceDisplay}
          loading={viewedProfileLoading}
          errorMessage={viewedProfileErrorMessage}
          isOwnProfile={!viewedProfileState || viewedProfileState?.playerId === playerState?.playerId}
        />
      );
      break;
    case 'skills':
      title = 'Skills';
      content = <div className="menu-empty">No skills available yet.</div>;
      break;
    case 'objectives':
      title = 'Objectives';
      content = (
        <ObjectivesView
          playerState={playerState}
          playerSummary={playerSummary}
        />
      );
      break;
    case 'production':
      title = 'Production';
      content = (
        <ProductionView
          playerState={playerState}
          itemDefinitions={itemDefinitions}
          shipTemplates={shipTemplates}
          selectedProductionItemId={selectedProductionItemId}
          onSelectedProductionItemIdChange={onSelectedProductionItemIdChange}
          onAddProduction={onAddProduction}
          onRemoveProductionEntry={onRemoveProductionEntry}
          productionInfoText={productionInfoText}
          productionEntries={productionEntries}
        />
      );
      break;
    case 'ship-designer':
      title = 'Ships';
      content = (
        <ShipsView
          playerState={playerState}
          resourceDisplay={resourceDisplay}
          stars={stars}
          templates={shipTemplates}
          activeView={shipView}
          activeShipId={shipId}
          highlightedFleetShip={highlightedFleetShip}
          onViewChange={onShipViewChange}
          onMissionAction={onMissionAction}
          onCreateTemplate={handleCreateShipTemplate}
          onDeleteTemplate={handleDeleteShipTemplate}
          onOpenStarSystem={onOpenStarSystem}
        />
      );
      break;
    case 'market':
      title = 'Market';
      content = <div className="menu-empty">Market is not available yet.</div>;
      break;
    case 'alliance':
      title = 'Alliance';
      content = <div className="menu-empty">No alliance controls yet.</div>;
      break;
    case 'system':
      title = 'System';
      content = selectedStar ? (
        <StarSystemPanel
          embedded
          showCloseButton={false}
          star={selectedStar}
          territory={selectedTerritory}
          playerState={playerState}
          ownerProfileImageUrl={selectedOwnerProfileImageUrl}
          selectedPlanetId={selectedPlanetId}
          currentTerritoryId={currentTerritoryId}
          hasPendingInfrastructureChanges={hasPendingInfrastructureChanges}
          infrastructureStatusMessage={infrastructureStatusMessage}
          showPopulationTiming={showPopulationTiming}
          getBuildCost={getBuildCost}
          canAffordUpgrade={canAffordUpgrade}
          onCollectResources={onCollectResources}
          onSetCapital={onSetCapital}
          onInfrastructureChanged={onInfrastructureChanged}
          onSaveInfrastructureChanges={onSaveInfrastructureChanges}
          onSelectPlanet={onSelectPlanet}
          onOpenFleetShip={props.onOpenFleetShip}
          onInspectOwnerProfile={onInspectTerritoryProfile}
          onClose={onCloseSelectedSystem}
        />
      ) : (
        <div className="menu-empty">Select a city or star system.</div>
      );
      break;
    case 'inventory':
    default:
      title = 'Inventory';
      content = (
        <InventoryView
          resourceDisplay={resourceDisplay}
          playerState={playerState}
          itemDefinitions={itemDefinitions}
        />
      );
      break;
  }

  return (
    <div className={`right-menu-shell ${isOpen ? 'right-menu-shell--open' : ''}`}>
      <div className="right-menu">
        <PlayerSummaryCard
          playerState={summaryPlayerState}
          playerSummary={summaryPlayerSummary}
          onProfileImageUpload={onProfileImageUpload}
          canEditProfileImage={!isViewingOtherProfile}
        />
        <div className="right-menu__scroll">
          <div className="right-menu__body">{content}</div>
        </div>
      </div>
    </div>
  );
}
