import React, { useId, useState } from 'react';
import { StarSystemPanel } from './StarSystemPanel.jsx';

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
                <span className="resource-dot" style={{ background: resource.color }}>{resource.icon}</span>
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
              <div key={ship.id ?? `${ship.name ?? ship.type}-${index}`} className="menu-row">
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
              <strong>{compactNumber(items[item.id])}</strong>
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
  productionInfoText,
  productionEntries,
}) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const selectedItem =
    itemDefinitions.find((item) => item.id === selectedProductionItemId) ??
    itemDefinitions[0] ??
    null;

  if (!playerState) {
    return <div className="menu-empty">Log in to use production.</div>;
  }

  return (
    <div className="menu-stack">
      <section className="menu-section">
        <div className="menu-section__title">Production Queue</div>
        <div className="production-controls">
          <div className="production-dropdown">
            <button
              type="button"
              className="production-dropdown__button"
              onClick={() => setIsDropdownOpen((isOpen) => !isOpen)}
              disabled={!selectedItem}
              aria-haspopup="listbox"
              aria-expanded={isDropdownOpen}
            >
              {selectedItem ? (
                <>
                  <span className="production-dropdown__selected">
                    {renderItemIcon(selectedItem, 22)}
                    <span>{selectedItem.name}</span>
                    <small>{compactNumber(playerState?.items?.[selectedItem.id] ?? 0)}</small>
                  </span>
                  <strong>{compactNumber(selectedItem.productionCost)} PC</strong>
                </>
              ) : (
                <span>No craftable items</span>
              )}
            </button>
            {isDropdownOpen ? (
              <div className="production-dropdown__menu" role="listbox">
                {itemDefinitions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`production-dropdown__option${item.id === selectedItem?.id ? ' production-dropdown__option--active' : ''}`}
                    onClick={() => {
                      onSelectedProductionItemIdChange?.(item.id);
                      setIsDropdownOpen(false);
                    }}
                    role="option"
                    aria-selected={item.id === selectedItem?.id}
                  >
                    <span className="production-dropdown__option-main">
                      {renderItemIcon(item, 22)}
                      <span>{item.name}</span>
                      <small>{compactNumber(playerState?.items?.[item.id] ?? 0)}</small>
                    </span>
                    <strong>{compactNumber(item.productionCost)} PC</strong>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button type="button" onClick={onAddProduction}>Add</button>
        </div>
        <div className="menu-subtle">{productionInfoText}</div>
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
                  <strong>{entry.statusText}</strong>
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

function ProfileView({ playerState, loading = false, errorMessage = '', isOwnProfile = true }) {
  if (!playerState && loading) {
    return <div className="menu-empty">Loading profile...</div>;
  }

  if (!playerState) {
    return <div className="menu-empty">Log in to view your profile.</div>;
  }

  const territoryName = playerState?.territory?.name ?? playerState?.playerName ?? playerState?.playerId ?? 'Player';
  const profileImageUrl = playerState?.profileImageUrl ?? playerState?.territory?.avatarImageUrl ?? '';
  const initial = String(territoryName).trim().charAt(0).toUpperCase() || '?';

  return (
    <div className="menu-stack">
      <section className="menu-section">
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
          <div className="menu-row"><span>XP</span><strong>{compactNumber(playerState.xp ?? 0)}</strong></div>
          <div className="menu-row"><span>Gems</span><strong>{compactNumber(playerState.gems ?? playerState.premiumCurrency ?? 0)}</strong></div>
          <div className="menu-row"><span>Faction</span><strong>{playerState?.territory?.faction ?? territoryName}</strong></div>
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

function ShipDesignerView({ playerState }) {
  const ships = playerState?.ships ?? playerState?.fleet?.ships ?? [];

  if (!playerState) {
    return <div className="menu-empty">Log in to design ships.</div>;
  }

  return (
    <div className="menu-stack">
      <section className="menu-section">
        <div className="menu-section__title">Ship Designer</div>
        <div className="menu-subtle">
          This panel is ready for the ship builder flow. Next step is to create blueprints here and send saved designs into production.
        </div>
      </section>

      <section className="menu-section">
        <div className="menu-section__title">Current Fleet</div>
        {ships.length ? (
          <div className="menu-list">
            {ships.map((ship, index) => (
              <div key={ship.id ?? `${ship.name ?? ship.type}-${index}`} className="menu-row">
                <span>{ship.name ?? ship.type ?? 'Ship'}</span>
                <strong>{compactNumber(ship.count ?? 1)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <div className="menu-empty">No ships yet.</div>
        )}
      </section>

      <section className="menu-section">
        <div className="menu-section__title">Planned Flow</div>
        <div className="menu-list">
          <div className="menu-row"><span>Create blueprint</span><strong>Pending</strong></div>
          <div className="menu-row"><span>Save prefab</span><strong>Pending</strong></div>
          <div className="menu-row"><span>Produce design</span><strong>Pending</strong></div>
        </div>
      </section>
    </div>
  );
}

export function RightSideMenu(props) {
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
    productionInfoText,
    productionEntries,
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

  switch (activePanel) {
    case 'profile':
      title = 'Profile';
      content = (
        <ProfileView
          playerState={viewedProfileState ?? playerState}
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
          selectedProductionItemId={selectedProductionItemId}
          onSelectedProductionItemIdChange={onSelectedProductionItemIdChange}
          onAddProduction={onAddProduction}
          productionInfoText={productionInfoText}
          productionEntries={productionEntries}
        />
      );
      break;
    case 'ship-designer':
      title = 'Ship Designer';
      content = (
        <ShipDesignerView
          playerState={playerState}
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
          <div className="right-menu__header">
            <div className="right-menu__title">{title}</div>
            <button type="button" className="right-menu__close" onClick={onClose} aria-label="Close panel">
              x
            </button>
          </div>
          <div className="right-menu__body">{content}</div>
        </div>
      </div>
    </div>
  );
}
