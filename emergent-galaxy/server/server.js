import { createServer } from 'node:http';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  advanceGalaxyPopulation,
  collectPlayerSystemPool,
  createInitialPlayerState,
  updatePlayerResources,
} from './resourceProduction.js';
import {
  applyRuntimeStateToPlayerRecord,
  normalizePlayerRecord,
  playerRecordToRuntimeState,
} from '../src/core/playerRecord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(__dirname, 'uploads', 'profile-images');
const port = Number(process.env.PORT || 8787);

async function ensureDataDir() {
  await mkdir(dataDir, { recursive: true });
}

async function ensureUploadsDir() {
  await mkdir(uploadsDir, { recursive: true });
}

function getStatePath(seed) {
  const safeSeed = String(seed || 'default').replace(/[^a-zA-Z0-9-_]/g, '_');
  return path.join(dataDir, `${safeSeed}.json`);
}

function sanitizeFileSegment(value, fallback = 'default') {
  const sanitized = String(value || fallback).replace(/[^a-zA-Z0-9-_]/g, '_');
  return sanitized || fallback;
}

function getProfileImageFilename(seed, playerId) {
  return `${sanitizeFileSegment(seed)}-${sanitizeFileSegment(playerId)}.png`;
}

function getProfileImagePath(seed, playerId) {
  return path.join(uploadsDir, getProfileImageFilename(seed, playerId));
}

function getProfileImageUrl(seed, playerId) {
  return `/uploads/profile-images/${getProfileImageFilename(seed, playerId)}`;
}

function isDataImageUrl(value) {
  return typeof value === 'string' && value.startsWith('data:image/');
}

function sanitizeAvatarUrl(value) {
  return isDataImageUrl(value) ? '' : value ?? '';
}

const REMOVED_RESOURCE_KEYS = new Set(['Gas', 'Water']);
const REMOVED_INFRASTRUCTURE_KEYS = new Set(['gasExtraction', 'waterExtraction']);

function sanitizeResourceMap(resourceMap) {
  const nextResources = {};

  for (const [key, value] of Object.entries(resourceMap ?? {})) {
    if (REMOVED_RESOURCE_KEYS.has(key)) {
      continue;
    }
    nextResources[key] = value;
  }

  return nextResources;
}

function sanitizeInfrastructureMap(infrastructureMap) {
  const nextInfrastructure = {};

  for (const [key, value] of Object.entries(infrastructureMap ?? {})) {
    if (REMOVED_INFRASTRUCTURE_KEYS.has(key)) {
      continue;
    }
    nextInfrastructure[key] = value;
  }

  return nextInfrastructure;
}

function sanitizeStoredDocument(documentState) {
  const nextState = documentState?.state
    ? {
        ...documentState.state,
        territories: (documentState.state.territories ?? []).map((territory) => ({
          ...territory,
          avatarImageUrl: sanitizeAvatarUrl(territory.avatarImageUrl),
        })),
        starOverrides: Object.fromEntries(
          Object.entries(documentState.state.starOverrides ?? {}).map(([starId, starOverride]) => [
            starId,
            {
              ...starOverride,
              planets: Object.fromEntries(
                Object.entries(starOverride?.planets ?? {}).map(([planetId, planetOverride]) => [
                  planetId,
                  {
                    ...planetOverride,
                    infrastructure: sanitizeInfrastructureMap(planetOverride?.infrastructure),
                  },
                ])
              ),
            },
          ])
        ),
      }
    : null;

  const nextPlayers = Object.fromEntries(
    Object.entries(documentState?.players ?? {}).map(([playerId, playerRecord]) => [
      playerId,
      {
        ...playerRecord,
        profile: {
          ...(playerRecord?.profile ?? {}),
          avatarImageUrl: sanitizeAvatarUrl(playerRecord?.profile?.avatarImageUrl),
        },
        economy: {
          ...(playerRecord?.economy ?? {}),
          resources: sanitizeResourceMap(playerRecord?.economy?.resources),
          hourlyProduction: sanitizeResourceMap(playerRecord?.economy?.hourlyProduction),
        },
        logistics: {
          ...(playerRecord?.logistics ?? {}),
          systemPools: Object.fromEntries(
            Object.entries(playerRecord?.logistics?.systemPools ?? {}).map(([starId, poolEntry]) => [
              starId,
              {
                ...poolEntry,
                resources: sanitizeResourceMap(poolEntry?.resources ?? poolEntry),
              },
            ])
          ),
        },
      },
    ])
  );

  return {
    state: nextState,
    players: nextPlayers,
    updatedAt: documentState?.updatedAt ?? null,
  };
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : null;
}

async function loadState(seed) {
  try {
    const raw = await readFile(getStatePath(seed), 'utf8');
    const parsed = JSON.parse(raw);
    return sanitizeStoredDocument({
      state: parsed.state ?? null,
      players: parsed.players ?? {},
      updatedAt: parsed.updatedAt ?? null,
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { state: null, players: {}, updatedAt: null };
    }

    throw error;
  }
}

async function saveStateDocument(seed, documentState) {
  await ensureDataDir();
  const sanitizedDocument = sanitizeStoredDocument(documentState);
  await writeFile(
    getStatePath(seed),
    JSON.stringify({
      state: sanitizedDocument.state ?? null,
      players: sanitizedDocument.players ?? {},
      updatedAt: new Date().toISOString(),
    }, null, 2),
    'utf8'
  );
}

async function deleteState(seed) {
  await rm(getStatePath(seed), { force: true });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  response.end(JSON.stringify(payload));
}

function sendFile(response, statusCode, contentType, payload) {
  response.writeHead(statusCode, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  response.end(payload);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === 'OPTIONS') {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === 'GET' && url.pathname.startsWith('/uploads/profile-images/')) {
    try {
      const requestedName = path.basename(url.pathname);
      const fileBuffer = await readFile(path.join(uploadsDir, requestedName));
      sendFile(response, 200, 'image/png', fileBuffer);
    } catch (error) {
      sendJson(response, 404, { error: 'Not found' });
    }
    return;
  }

  if (url.pathname !== '/api/galaxy-state' && url.pathname !== '/api/player-state' && url.pathname !== '/api/profile-image') {
    sendJson(response, 404, { error: 'Not found' });
    return;
  }

  const seed = url.searchParams.get('seed') || 'default';

  try {
    if (url.pathname === '/api/profile-image') {
      const playerId = url.searchParams.get('playerId');
      if (!playerId) {
        sendJson(response, 400, { error: 'Missing playerId' });
        return;
      }

      if (request.method !== 'POST') {
        sendJson(response, 405, { error: 'Method not allowed' });
        return;
      }

      const body = await readJsonBody(request);
      const imageDataUrl = body?.imageDataUrl;
      const matched = typeof imageDataUrl === 'string'
        ? imageDataUrl.match(/^data:image\/png;base64,(.+)$/)
        : null;

      if (!matched) {
        sendJson(response, 400, { error: 'Expected PNG imageDataUrl' });
        return;
      }

      await ensureUploadsDir();
      const imageBuffer = Buffer.from(matched[1], 'base64');
      await writeFile(getProfileImagePath(seed, playerId), imageBuffer);
      sendJson(response, 200, { imageUrl: getProfileImageUrl(seed, playerId) });
      return;
    }

    if (url.pathname === '/api/player-state') {
      const playerId = url.searchParams.get('playerId');
      if (!playerId) {
        sendJson(response, 400, { error: 'Missing playerId' });
        return;
      }

      const documentState = await loadState(seed);
      const nowMs = Date.now();
      const existingPlayerRecord =
        documentState.players[playerId] ?? createInitialPlayerState(playerId, nowMs);
      documentState.state = advanceGalaxyPopulation({
        seed,
        storedState: documentState.state,
        playerId,
        lastResourceUpdate: playerRecordToRuntimeState(
          normalizePlayerRecord(existingPlayerRecord, playerId, nowMs)
        ).lastResourceUpdate,
        nowMs,
      });

      if (request.method === 'GET') {
        const nextPlayerRecord = updatePlayerResources({
          seed,
          storedState: documentState.state,
          playerId,
          existingPlayerState: existingPlayerRecord,
          nowMs,
        });

        documentState.players[playerId] = nextPlayerRecord;
        await saveStateDocument(seed, documentState);
        sendJson(response, 200, { player: playerRecordToRuntimeState(nextPlayerRecord) });
        return;
      }

      if (request.method === 'POST') {
        const body = await readJsonBody(request);
        const starId = body?.starId;
        if (!starId) {
          sendJson(response, 400, { error: 'Missing starId' });
          return;
        }

        const nextPlayerRecord = collectPlayerSystemPool({
          seed,
          storedState: documentState.state,
          playerId,
          existingPlayerState: existingPlayerRecord,
          starId,
          nowMs,
        });

        documentState.players[playerId] = nextPlayerRecord;
        await saveStateDocument(seed, documentState);
        sendJson(response, 200, { player: playerRecordToRuntimeState(nextPlayerRecord) });
        return;
      }

      if (request.method === 'PUT') {
        const body = await readJsonBody(request);
        const nextPlayerState = body?.playerState;
        if (!nextPlayerState) {
          sendJson(response, 400, { error: 'Missing playerState' });
          return;
        }

        const normalizedPlayerRecord = normalizePlayerRecord(existingPlayerRecord, playerId, nowMs);
        documentState.players[playerId] = applyRuntimeStateToPlayerRecord(
          normalizedPlayerRecord,
          {
            ...nextPlayerState,
            playerId,
          },
          nowMs
        );
        await saveStateDocument(seed, documentState);
        sendJson(response, 200, { ok: true });
        return;
      }

      sendJson(response, 405, { error: 'Method not allowed' });
      return;
    }

    if (request.method === 'GET') {
      sendJson(response, 200, await loadState(seed));
      return;
    }

    if (request.method === 'PUT') {
      const state = await readJsonBody(request);
      const currentState = await loadState(seed);
      await saveStateDocument(seed, {
        ...currentState,
        state,
      });
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === 'DELETE') {
      await deleteState(seed);
      sendJson(response, 200, { ok: true });
      return;
    }

    sendJson(response, 405, { error: 'Method not allowed' });
  } catch (error) {
    sendJson(response, 500, {
      error: 'Server error',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(port, async () => {
  await ensureDataDir();
  await ensureUploadsDir();
  console.log(`Galaxy state server listening on http://localhost:${port}`);
});
