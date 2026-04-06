import { deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { applyStoredState, restoreBaselineState, serializeGameState } from './galaxyState.js';
import { db } from './firebase.js';

export function createMultiplayerSync({ state, baselineState, onStateApplied }) {
  let unsubscribe = null;
  let lastAppliedSnapshot = null;
  let hasLoggedConnectionIssue = false;

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
    unsubscribe = onSnapshot(
      getStateRef(),
      (snapshot) => {
        const remoteState = snapshot.data()?.state || null;
        restoreBaselineState(state, baselineState);
        applyStoredState(state, remoteState);
        lastAppliedSnapshot = snapshotState();
        hasLoggedConnectionIssue = false;
        onStateApplied?.();
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
  };
}
