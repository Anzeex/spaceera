import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  createPlanetGeneratorPreviewDescriptor,
  renderPlanetGeneratorPreviewFrame,
} from '../planetGen/page.js';

const PREVIEW_FRAME_COUNT = 144;
const PREVIEW_LOOP_SECONDS = 20;
const PREVIEW_DISPLAY_SIZE = 196;
const PREVIEW_FRAME_SIZE = 112;
const SPRITE_SIZE = 112;
const PREVIEW_RENDER_SCALE = 0.74;
const LIVE_PREVIEW_FPS = 8;
const MAX_CACHED_PREVIEWS = 2;
const PREVIEW_CACHE_TTL_MS = 60_000;

const previewCache = new Map();

function clearExpiredPreviews() {
  const now = Date.now();
  for (const [cacheKey, cached] of previewCache.entries()) {
    if (cached.expiresAt <= now) {
      previewCache.delete(cacheKey);
    }
  }
}

function getCachedPreview(cacheKey) {
  clearExpiredPreviews();
  const cached = previewCache.get(cacheKey);
  if (!cached) {
    return null;
  }
  previewCache.delete(cacheKey);
  previewCache.set(cacheKey, cached);
  return cached.stripCanvas;
}

function setCachedPreview(cacheKey, stripCanvas) {
  clearExpiredPreviews();
  previewCache.set(cacheKey, {
    stripCanvas,
    expiresAt: Date.now() + PREVIEW_CACHE_TTL_MS,
  });

  while (previewCache.size > MAX_CACHED_PREVIEWS) {
    const oldestKey = previewCache.keys().next().value;
    previewCache.delete(oldestKey);
  }
}

export function PlanetPreview({ planet }) {
  const liveCanvasRef = useRef(null);
  const stripCanvasRef = useRef(null);
  const modeRef = useRef('loading');
  const [mode, setMode] = useState('loading');
  const cacheKey = useMemo(() => {
    if (!planet) {
      return null;
    }
    return [
      'planet-preview-v6',
      planet.id ?? planet.name,
      planet.name,
      planet.type,
      PREVIEW_FRAME_COUNT,
      PREVIEW_LOOP_SECONDS,
      PREVIEW_FRAME_SIZE,
      SPRITE_SIZE,
      PREVIEW_RENDER_SCALE,
    ].join('|');
  }, [planet?.id, planet?.name, planet?.type]);
  const descriptor = useMemo(() => {
    if (!planet) {
      return null;
    }

    const baseDescriptor = createPlanetGeneratorPreviewDescriptor(planet);
    return {
      ...baseDescriptor,
      rotationSpeed: (Math.PI * 2) / PREVIEW_LOOP_SECONDS,
      ringSpinSpeed: ((Math.PI * 2) / PREVIEW_LOOP_SECONDS) * 0.28,
    };
  }, [planet?.id, planet?.name, planet?.type]);

  useEffect(() => {
    const liveCanvas = liveCanvasRef.current;
    const stripCanvas = stripCanvasRef.current;
    if (!liveCanvas || !stripCanvas || !descriptor || !cacheKey) {
      modeRef.current = 'loading';
      setMode('loading');
      return undefined;
    }

    const liveCtx = liveCanvas.getContext('2d');
    const stripCtx = stripCanvas.getContext('2d');
    if (!liveCtx || !stripCtx) {
      return undefined;
    }

    liveCtx.imageSmoothingEnabled = false;
    stripCtx.imageSmoothingEnabled = false;
    liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
    stripCtx.clearRect(0, 0, stripCanvas.width, stripCanvas.height);
    modeRef.current = 'loading';
    setMode('loading');

    let cancelled = false;
    let liveFrameId = 0;
    let buildId = 0;
    let idleId = 0;
    let builtFrames = 0;
    let cachedModeStarted = false;
    let lastLiveRenderAt = 0;

    const spriteCanvas = document.createElement('canvas');
    spriteCanvas.width = SPRITE_SIZE;
    spriteCanvas.height = SPRITE_SIZE;
    const spriteCtx = spriteCanvas.getContext('2d', { willReadFrequently: true });
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = PREVIEW_FRAME_SIZE;
    frameCanvas.height = PREVIEW_FRAME_SIZE;
    const frameCtx = frameCanvas.getContext('2d');

    if (!spriteCtx || !frameCtx) {
      return undefined;
    }

    spriteCtx.imageSmoothingEnabled = false;
    frameCtx.imageSmoothingEnabled = false;

    function setPreviewMode(nextMode) {
      if (modeRef.current === nextMode) {
        return;
      }
      modeRef.current = nextMode;
      setMode(nextMode);
    }

    function renderFrame(targetCtx, targetCanvas, elapsedSeconds) {
      renderPlanetGeneratorPreviewFrame({
        targetCtx,
        targetCanvas,
        spriteCtx,
        spriteCanvas,
        descriptor,
        elapsedSeconds,
        scaleOverride: PREVIEW_RENDER_SCALE,
        lowDetail: true,
      });
    }

    function copyCachedStrip(cachedStripCanvas) {
      stripCtx.clearRect(0, 0, stripCanvas.width, stripCanvas.height);
      stripCtx.drawImage(cachedStripCanvas, 0, 0);
      cachedModeStarted = true;
      setPreviewMode('strip');
    }

    const cachedStrip = getCachedPreview(cacheKey);
    if (cachedStrip) {
      copyCachedStrip(cachedStrip);
      return () => {
        cancelled = true;
      };
    }

    const startedAt = performance.now();

    function drawLiveFrame(now) {
      if (cancelled || cachedModeStarted) {
        return;
      }

      if (now - lastLiveRenderAt >= 1000 / LIVE_PREVIEW_FPS) {
        lastLiveRenderAt = now;
        renderFrame(liveCtx, liveCanvas, ((now - startedAt) / 1000) % PREVIEW_LOOP_SECONDS);
        setPreviewMode('live');
      }

      liveFrameId = window.requestAnimationFrame(drawLiveFrame);
    }

    liveFrameId = window.requestAnimationFrame(drawLiveFrame);

    function scheduleBuild() {
      if (cancelled || cachedModeStarted) {
        return;
      }
      if ('requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(buildStripFrames, { timeout: 140 });
      } else {
        buildId = window.setTimeout(() => {
          buildStripFrames({ didTimeout: true, timeRemaining: () => 0 });
        }, 0);
      }
    }

    function buildStripFrames(deadline) {
      let framesThisTurn = 0;

      while (
        !cancelled &&
        builtFrames < PREVIEW_FRAME_COUNT &&
        framesThisTurn < 3 &&
        (deadline.didTimeout || deadline.timeRemaining() > 5)
      ) {
        const elapsedSeconds = (builtFrames / PREVIEW_FRAME_COUNT) * PREVIEW_LOOP_SECONDS;
        renderFrame(frameCtx, frameCanvas, elapsedSeconds);
        stripCtx.drawImage(frameCanvas, builtFrames * PREVIEW_FRAME_SIZE, 0);
        builtFrames += 1;
        framesThisTurn += 1;
      }

      if (cancelled || cachedModeStarted) {
        return;
      }

      if (builtFrames >= PREVIEW_FRAME_COUNT) {
        const cachedStripCanvas = document.createElement('canvas');
        cachedStripCanvas.width = stripCanvas.width;
        cachedStripCanvas.height = stripCanvas.height;
        const cachedStripCtx = cachedStripCanvas.getContext('2d');
        if (cachedStripCtx) {
          cachedStripCtx.imageSmoothingEnabled = false;
          cachedStripCtx.drawImage(stripCanvas, 0, 0);
          setCachedPreview(cacheKey, cachedStripCanvas);
        }
        cachedModeStarted = true;
        window.cancelAnimationFrame(liveFrameId);
        setPreviewMode('strip');
        return;
      }

      scheduleBuild();
    }

    scheduleBuild();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(liveFrameId);
      window.clearTimeout(buildId);
      if ('cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId);
      }
    };
  }, [descriptor, cacheKey]);

  if (!descriptor) {
    return null;
  }

  return (
    <div className="planet-preview" aria-label={`${planet.name} preview`}>
      {mode === 'loading' ? <div className="planet-preview__loading" /> : null}
      <div
        className="planet-preview__viewport"
        style={{
          '--planet-preview-display-size': `${PREVIEW_DISPLAY_SIZE}px`,
          '--planet-preview-frame-count': PREVIEW_FRAME_COUNT,
        }}
      >
        <canvas
          ref={liveCanvasRef}
          className={`planet-preview__canvas${mode === 'live' ? ' planet-preview__canvas--ready' : ''}`}
          width={PREVIEW_FRAME_SIZE}
          height={PREVIEW_FRAME_SIZE}
        />
        <canvas
          ref={stripCanvasRef}
          className={`planet-preview__strip${mode === 'strip' ? ' planet-preview__strip--ready' : ''}`}
          width={PREVIEW_FRAME_SIZE * PREVIEW_FRAME_COUNT}
          height={PREVIEW_FRAME_SIZE}
        />
      </div>
    </div>
  );
}
