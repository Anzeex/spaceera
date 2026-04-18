const API_BASE_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:8787';
let localServerUnavailable = false;

function markServerUnavailableIfNeeded(error) {
  if (error instanceof TypeError) {
    localServerUnavailable = true;
  }

  return error;
}

export function isLocalServerUnavailable() {
  return localServerUnavailable;
}

async function parseJsonResponse(response) {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return response.json();
}

export async function fetchServerGalaxyState(seed) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/galaxy-state?seed=${encodeURIComponent(seed)}`
    );
    localServerUnavailable = false;
    return parseJsonResponse(response);
  } catch (error) {
    throw markServerUnavailableIfNeeded(error);
  }
}

export async function saveServerGalaxyState(seed, state) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/galaxy-state?seed=${encodeURIComponent(seed)}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(state),
      }
    );

    localServerUnavailable = false;
    return parseJsonResponse(response);
  } catch (error) {
    throw markServerUnavailableIfNeeded(error);
  }
}

export async function resetServerGalaxyState(seed) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/galaxy-state?seed=${encodeURIComponent(seed)}`,
      {
        method: 'DELETE',
      }
    );

    localServerUnavailable = false;
    return parseJsonResponse(response);
  } catch (error) {
    throw markServerUnavailableIfNeeded(error);
  }
}

export async function fetchPlayerState(seed, playerId) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/player-state?seed=${encodeURIComponent(seed)}&playerId=${encodeURIComponent(playerId)}`
    );

    localServerUnavailable = false;
    return parseJsonResponse(response);
  } catch (error) {
    throw markServerUnavailableIfNeeded(error);
  }
}

export async function collectStarSystemPool(seed, playerId, starId) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/player-state?seed=${encodeURIComponent(seed)}&playerId=${encodeURIComponent(playerId)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ starId }),
      }
    );

    localServerUnavailable = false;
    return parseJsonResponse(response);
  } catch (error) {
    throw markServerUnavailableIfNeeded(error);
  }
}

export async function savePlayerState(seed, playerId, playerState) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/player-state?seed=${encodeURIComponent(seed)}&playerId=${encodeURIComponent(playerId)}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ playerState }),
      }
    );

    localServerUnavailable = false;
    return parseJsonResponse(response);
  } catch (error) {
    throw markServerUnavailableIfNeeded(error);
  }
}
