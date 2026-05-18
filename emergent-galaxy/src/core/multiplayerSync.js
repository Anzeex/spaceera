import { applyStoredState, restoreBaselineState, serializeGameState } from './galaxyState.js';
import {
  collectStarSystemPool,
  fetchPlayerState as fetchAuthoritativePlayerState,
  fetchServerGalaxyState,
  isLocalServerUnavailable,
  resetServerGalaxyState,
  resetServerGalaxyMapState,
  savePlayerState,
  saveServerGalaxyState,
  uploadProfileImage as uploadProfileImageRequest,
} from './serverApi.js';

const REMOTE_STATE_POLL_INTERVAL_MS = 2500;

export function createMultiplayerSync({ state, baselineState, onStateApplied }) {
  let lastAppliedSnapshot = null;
  let hasLoggedLocalServerIssue = false;
  let pushQueue = Promise.resolve();
  let remoteStatePollIntervalId = null;
  let isPushingState = false;

  function hasPendingLocalState() {
    return Boolean(state.hasPendingTerritoryChanges || state.hasPendingInfrastructureChanges);
  }

  function applyServerGalaxyState(serverState, { force = false } = {}) {
    if (!serverState) {
      return false;
    }

    const nextSnapshot = JSON.stringify(serverState);
    if (nextSnapshot === lastAppliedSnapshot) {
      return false;
    }

    if (!force && (isPushingState || hasPendingLocalState())) {
      return false;
    }

    restoreBaselineState(state, baselineState);
    applyStoredState(state, serverState);
    lastAppliedSnapshot = nextSnapshot;
    onStateApplied?.();
    state.invalidateRender?.();
    return true;
  }

  async function pullServerGalaxyState(options = {}) {
    try {
      const serverSnapshot = await fetchServerGalaxyState(state.galaxySeed);
      applyServerGalaxyState(serverSnapshot?.state, options);
      hasLoggedLocalServerIssue = false;
      return true;
    } catch (error) {
      if (!hasLoggedLocalServerIssue) {
        console.warn(
          'Local resource server is unavailable. Start `npm run dev:server` to enable authoritative resource updates.',
          error
        );
        hasLoggedLocalServerIssue = true;
      }
      return false;
    }
  }

  function startRemoteStatePolling() {
    if (remoteStatePollIntervalId !== null) {
      return;
    }

    remoteStatePollIntervalId = window.setInterval(() => {
      void pullServerGalaxyState();
    }, REMOTE_STATE_POLL_INTERVAL_MS);
  }

  function getSerializablePlayerState(options = {}) {
    if (typeof state.getSerializablePlayerState === 'function') {
      return state.getSerializablePlayerState(options);
    }

    const playerId = state.currentPlayerId ?? state.currentTerritoryId;
    if (!playerId || !state.playerState) {
      return null;
    }

    if (state.playerState.playerId && state.playerState.playerId !== playerId) {
      return null;
    }

    const { playerName, ...playerState } = state.playerState;
    const territory = state.territories.get(playerId);
    return {
      ...playerState,
      playerId,
      territory: territory
        ? {
            id: territory.id,
            name: territory.name,
            color: territory.color,
            faction: territory.faction,
            avatarImageUrl: territory.avatarImageUrl ?? '',
            capitalStarId: territory.capitalStarId ?? null,
            stars: Array.from(territory.stars ?? []),
          }
        : playerState.territory ?? null,
    };
  }

  function snapshotState() {
    const serializableGalaxyState =
      typeof state.getSerializableGalaxyState === 'function'
        ? state.getSerializableGalaxyState(baselineState)
        : serializeGameState(state, baselineState);
    return JSON.stringify(serializableGalaxyState);
  }

  async function pushStateNow(options = {}) {
    isPushingState = true;
    let didPersistState = false;

    try {
      const nextState =
        typeof state.getSerializableGalaxyState === 'function'
          ? state.getSerializableGalaxyState(baselineState, options)
          : serializeGameState(state, baselineState);
      const nextSnapshot = JSON.stringify(nextState);
      const serializablePlayerState = getSerializablePlayerState(options);

      if (nextSnapshot === lastAppliedSnapshot && !serializablePlayerState) {
        return true;
      }

      if (nextSnapshot !== lastAppliedSnapshot) {
        try {
          await saveServerGalaxyState(state.galaxySeed, nextState);
          lastAppliedSnapshot = nextSnapshot;
          hasLoggedLocalServerIssue = false;
          didPersistState = true;
        } catch (serverError) {
          if (!hasLoggedLocalServerIssue) {
            console.warn(
              'Local resource server is unavailable. Start `npm run dev:server` to enable authoritative resource updates.',
              serverError
            );
            hasLoggedLocalServerIssue = true;
          }
        }
      }

      if (serializablePlayerState) {
        try {
          await savePlayerState(state.galaxySeed, serializablePlayerState.playerId, serializablePlayerState);
          hasLoggedLocalServerIssue = false;
          didPersistState = true;
        } catch (serverError) {
          if (!hasLoggedLocalServerIssue) {
            console.warn(
              'Local resource server is unavailable. Start `npm run dev:server` to enable authoritative resource updates.',
              serverError
            );
            hasLoggedLocalServerIssue = true;
          }
        }
      }

      return didPersistState || nextSnapshot === lastAppliedSnapshot;
    } finally {
      isPushingState = false;
    }
  }

  async function pushState(options = {}) {
    const runPush = () => pushStateNow(options);
    const nextPush = pushQueue.then(runPush, runPush);
    pushQueue = nextPush.catch(() => {});
    return nextPush;
  }

  async function resetRemoteState() {
    try {
      await resetServerGalaxyState(state.galaxySeed);
      lastAppliedSnapshot = null;
      hasLoggedLocalServerIssue = false;
      return true;
    } catch (serverError) {
      if (!hasLoggedLocalServerIssue) {
        console.warn(
          'Local resource server is unavailable. Start `npm run dev:server` to enable authoritative resource updates.',
          serverError
        );
        hasLoggedLocalServerIssue = true;
      }
      return false;
    }
  }

  async function resetGalaxyMapState() {
    try {
      await resetServerGalaxyMapState(state.galaxySeed);
      lastAppliedSnapshot = null;
      hasLoggedLocalServerIssue = false;
      return true;
    } catch (serverError) {
      if (!hasLoggedLocalServerIssue) {
        console.warn(
          'Local resource server is unavailable. Start `npm run dev:server` to enable authoritative resource updates.',
          serverError
        );
        hasLoggedLocalServerIssue = true;
      }
      return false;
    }
  }

  async function start() {
    await pullServerGalaxyState({ force: true });
    if (lastAppliedSnapshot === null) {
      lastAppliedSnapshot = snapshotState();
    }
    startRemoteStatePolling();
  }

  function stop() {
    if (remoteStatePollIntervalId !== null) {
      window.clearInterval(remoteStatePollIntervalId);
      remoteStatePollIntervalId = null;
    }
  }

  return {
    start,
    stop,
    pushState,
    resetRemoteState,
    resetGalaxyMapState,
    fetchPlayerState(playerId) {
      return fetchAuthoritativePlayerState(state.galaxySeed, playerId);
    },
    collectStarSystemPool(playerId, starId) {
      return collectStarSystemPool(state.galaxySeed, playerId, starId);
    },
    uploadProfileImage(playerId, imageDataUrl) {
      return uploadProfileImageRequest(state.galaxySeed, playerId, imageDataUrl);
    },
    isLocalServerUnavailable,
  };
}
