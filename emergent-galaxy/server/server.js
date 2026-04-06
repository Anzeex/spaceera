import { createServer } from 'node:http';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, 'data');
const port = Number(process.env.PORT || 8787);

async function ensureDataDir() {
  await mkdir(dataDir, { recursive: true });
}

function getStatePath(seed) {
  const safeSeed = String(seed || 'default').replace(/[^a-zA-Z0-9-_]/g, '_');
  return path.join(dataDir, `${safeSeed}.json`);
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
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { state: null };
    }

    throw error;
  }
}

async function saveState(seed, state) {
  await ensureDataDir();
  await writeFile(
    getStatePath(seed),
    JSON.stringify({
      state,
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
  });
  response.end(JSON.stringify(payload));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname !== '/api/galaxy-state') {
    sendJson(response, 404, { error: 'Not found' });
    return;
  }

  const seed = url.searchParams.get('seed') || 'default';

  try {
    if (request.method === 'GET') {
      sendJson(response, 200, await loadState(seed));
      return;
    }

    if (request.method === 'PUT') {
      const state = await readJsonBody(request);
      await saveState(seed, state);
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
  console.log(`Galaxy state server listening on http://localhost:${port}`);
});
