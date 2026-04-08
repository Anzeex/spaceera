import { deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { applyStoredState, restoreBaselineState, serializeGameState } from './galaxyState.js';
import { db } from './firebase.js';
import {
  collectStarSystemPool,
  fetchPlayerState as fetchAuthoritativePlayerState,
  fetchServerGalaxyState,
  isLocalServerUnavailable,
  resetServerGalaxyState,
  saveServerGalaxyState,
} from './serverApi.js';

export function createMultiplayerSync({ state, baselineState, onStateApplied }) {
  let unsubscribe = null;
  let lastAppliedSnapshot = null;
  let hasLoggedConnectionIssue = false;
  let hasLoggedLocalServerIssue = false;

  function getStateRef() {
    return doc(db, 'galaxies', state.galaxySeed);
  }

  function snapshotState() {
    return JSON.stringify(serializeGameState(state, baselineState));
  }

  async function pushState() {
    const nextState = serializeGameState(state, baselineState);
    const nextSnapshot = JSON.stringify(nextState);
    if (nextSnapshot === lastAppliedSnapshot) {
      return;
    }

    try {
      await setDoc(getStateRef(), {
        seed: state.galaxySeed,
        state: nextState,
        updatedAt: Date.now(),
      });
      try {
        await saveServerGalaxyState(state.galaxySeed, nextState);
      } catch (serverError) {
        if (!hasLoggedLocalServerIssue) {
          console.warn(
            'Local resource server is unavailable. Start `npm run dev:server` to enable authoritative resource updates.',
            serverError
          );
          hasLoggedLocalServerIssue = true;
        }
      }
      lastAppliedSnapshot = nextSnapshot;
      hasLoggedConnectionIssue = false;
    } catch (error) {
      if (!hasLoggedConnectionIssue) {
        console.warn('Failed to save multiplayer galaxy state to Firestore.', error);
        hasLoggedConnectionIssue = true;
      }
    }
  }

  async function resetRemoteState() {
    try {
      await deleteDoc(getStateRef());
      try {
        await resetServerGalaxyState(state.galaxySeed);
      } catch (serverError) {
        if (!hasLoggedLocalServerIssue) {
          console.warn(
            'Local resource server is unavailable. Start `npm run dev:server` to enable authoritative resource updates.',
            serverError
          );
          hasLoggedLocalServerIssue = true;
        }
      }
      lastAppliedSnapshot = null;
      hasLoggedConnectionIssue = false;
    } catch (error) {
      if (!hasLoggedConnectionIssue) {
        console.warn('Failed to reset multiplayer galaxy state in Firestore.', error);
        hasLoggedConnectionIssue = true;
      }
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

    unsubscribe = onSnapshot(
      getStateRef(),
      (snapshot) => {
        const remoteState = snapshot.data()?.state || null;
        restoreBaselineState(state, baselineState);
        applyStoredState(state, remoteState);
        lastAppliedSnapshot = snapshotState();
        hasLoggedConnectionIssue = false;
        onStateApplied?.();
        state.invalidateRender?.();
      },
      (error) => {
        if (!hasLoggedConnectionIssue) {
          console.warn('Failed to subscribe to Firestore galaxy state.', error);
          hasLoggedConnectionIssue = true;
        }
      }
    );
  }

  function stop() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  }

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
