import { applyStoredState, restoreBaselineState, serializeGameState } from './galaxyState.js';
import {
  collectStarSystemPool,
  fetchPlayerState as fetchAuthoritativePlayerState,
  fetchServerGalaxyState,
  isLocalServerUnavailable,
  resetServerGalaxyState,
  savePlayerState,
  saveServerGalaxyState,
} from './serverApi.js';

export function createMultiplayerSync({ state, baselineState, onStateApplied }) {
  let lastAppliedSnapshot = null;
  let hasLoggedLocalServerIssue = false;

  function getSerializablePlayerState() {
    const playerId = state.currentPlayerId ?? state.currentTerritoryId;
    if (!playerId || !state.playerState) {
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
            capitalStarId: territory.capitalStarId ?? null,
            stars: Array.from(territory.stars ?? []),
          }
        : playerState.territory ?? null,
    };
  }

  function snapshotState() {
    return JSON.stringify(serializeGameState(state, baselineState));
  }

  async function pushState() {
    const nextState = serializeGameState(state, baselineState);
    const nextSnapshot = JSON.stringify(nextState);
    const serializablePlayerState = getSerializablePlayerState();

    if (nextSnapshot === lastAppliedSnapshot && !serializablePlayerState) {
      return;
    }

    if (nextSnapshot !== lastAppliedSnapshot) {
      try {
        await saveServerGalaxyState(state.galaxySeed, nextState);
        lastAppliedSnapshot = nextSnapshot;
        hasLoggedLocalServerIssue = false;
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

  async function start() {
    try {
      const serverSnapshot = await fetchServerGalaxyState(state.galaxySeed);
      if (serverSnapshot?.state) {
        restoreBaselineState(state, baselineState);
        applyStoredState(state, serverSnapshot.state);
        lastAppliedSnapshot = snapshotState();
        onStateApplied?.();
        state.invalidateRender?.();
      }
      hasLoggedLocalServerIssue = false;
    } catch (error) {
      if (!hasLoggedLocalServerIssue) {
        console.warn(
          'Local resource server is unavailable. Start `npm run dev:server` to enable authoritative resource updates.',
          error
        );
        hasLoggedLocalServerIssue = true;
      }
    }
  }

  function stop() {}

  return {
    start,
    stop,
    pushState,
    resetRemoteState,
    fetchPlayerState(playerId) {
      return fetchAuthoritativePlayerState(state.galaxySeed, playerId);
    },
    collectStarSystemPool(playerId, starId) {
      return collectStarSystemPool(state.galaxySeed, playerId, starId);
    },
    isLocalServerUnavailable,
  };
}
