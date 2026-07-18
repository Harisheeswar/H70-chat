// ----------------------------------------------------
// H70 AR Camera Engine
// Real-time face-tracked filters for video calls.
// Runs entirely client-side (MediaPipe FaceLandmarker,
// WASM + GPU delegate) — draws an overlay onto a canvas,
// then hands off canvas.captureStream() as the outgoing
// video track so both the local preview and the remote
// peer see the exact same filtered picture.
// ----------------------------------------------------

let visionModulePromise = null;
function loadVisionModule() {
  if (!visionModulePromise) {
    // Loaded lazily so calls that never use AR effects never pay this cost.
    visionModulePromise = import('@mediapipe/tasks-vision');
  }
  return visionModulePromise;
}

export const AR_EFFECTS = [
  { id: 'none', label: 'No filter', emoji: '🚫' },
  { id: 'anime', label: 'Anime', emoji: '🌸' },
  { id: 'glasses', label: 'Shades', emoji: '🕶️' },
  { id: 'dog', label: 'Pup', emoji: '🐶' },
  { id: 'cat', label: 'Cat', emoji: '🐱' },
  { id: 'mustache', label: 'Stache', emoji: '👨' },
  { id: 'sparkle', label: 'Sparkle', emoji: '✨' },
];

// Landmark indices from MediaPipe's 478-point face mesh
const IDX = {
  noseTip: 1,
  noseBridge: 6,
  foreheadTop: 10,
  chin: 152,
  eyeOuterR: 33,
  eyeOuterL: 263,
  eyeInnerR: 133,
  eyeInnerL: 362,
  mouthL: 61,
  mouthR: 291,
  upperLip: 13,
  lowerLip: 14,
  cheekR: 234,
  cheekL: 454,
  eyeTopR: 159,
  eyeBottomR: 145,
  eyeTopL: 386,
  eyeBottomL: 374,
};

function pt(landmarks, i, w, h) {
  const p = landmarks[i];
  return { x: p.x * w, y: p.y * h };
}

function angleOf(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function drawGlasses(ctx, lm, w, h) {
  const eR = pt(lm, IDX.eyeOuterR, w, h);
  const eL = pt(lm, IDX.eyeOuterL, w, h);
  const iR = pt(lm, IDX.eyeInnerR, w, h);
  const iL = pt(lm, IDX.eyeInnerL, w, h);
  const nose = pt(lm, IDX.noseBridge, w, h);
  const angle = angleOf(eR, eL);
  const lensW = dist(eR, iR) * 1.5;
  const lensH = lensW * 0.72;

  ctx.save();
  ctx.translate(nose.x, nose.y);
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(10, 12, 18, 0.92)';
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;

  const midOffset = dist(eR, eL) / 2;
  [-midOffset, midOffset].forEach((offsetX) => {
    ctx.beginPath();
    ctx.ellipse(offsetX, 0, lensW / 2, lensH / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // lens highlight
    ctx.beginPath();
    ctx.ellipse(offsetX - lensW * 0.15, -lensH * 0.15, lensW * 0.12, lensH * 0.08, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fill();
    ctx.fillStyle = 'rgba(10, 12, 18, 0.92)';
  });
  // bridge
  ctx.beginPath();
  ctx.moveTo(-midOffset + lensW / 2 - 4, 0);
  ctx.lineTo(midOffset - lensW / 2 + 4, 0);
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(10, 12, 18, 0.92)';
  ctx.stroke();
  ctx.restore();
}

function drawDog(ctx, lm, w, h) {
  const forehead = pt(lm, IDX.foreheadTop, w, h);
  const eR = pt(lm, IDX.eyeOuterR, w, h);
  const eL = pt(lm, IDX.eyeOuterL, w, h);
  const nose = pt(lm, IDX.noseTip, w, h);
  const angle = angleOf(eR, eL);
  const faceW = dist(eR, eL);

  ctx.save();
  ctx.translate(forehead.x, forehead.y);
  ctx.rotate(angle);
  ['#5b3a29', '#6b4630'].forEach((color, i) => {
    const side = i === 0 ? -1 : 1;
    ctx.save();
    ctx.translate(side * faceW * 0.62, -faceW * 0.1);
    ctx.rotate(side * 0.35);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, faceW * 0.28, faceW * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.ellipse(0, faceW * 0.05, faceW * 0.14, faceW * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
  ctx.restore();

  // Nose + snout freckles
  ctx.save();
  ctx.translate(nose.x, nose.y);
  ctx.rotate(angle);
  ctx.fillStyle = '#1c1410';
  ctx.beginPath();
  ctx.ellipse(0, faceW * 0.06, faceW * 0.16, faceW * 0.11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(-faceW * 0.05, 0, faceW * 0.04, faceW * 0.03, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCat(ctx, lm, w, h) {
  const forehead = pt(lm, IDX.foreheadTop, w, h);
  const eR = pt(lm, IDX.eyeOuterR, w, h);
  const eL = pt(lm, IDX.eyeOuterL, w, h);
  const nose = pt(lm, IDX.noseTip, w, h);
  const cheekR = pt(lm, IDX.cheekR, w, h);
  const cheekL = pt(lm, IDX.cheekL, w, h);
  const angle = angleOf(eR, eL);
  const faceW = dist(eR, eL);

  ctx.save();
  ctx.translate(forehead.x, forehead.y);
  ctx.rotate(angle);
  [-1, 1].forEach((side) => {
    ctx.save();
    ctx.translate(side * faceW * 0.55, -faceW * 0.25);
    ctx.rotate(side * 0.15);
    ctx.fillStyle = '#e0a45a';
    ctx.beginPath();
    ctx.moveTo(0, faceW * 0.35);
    ctx.lineTo(-faceW * 0.22, -faceW * 0.15);
    ctx.lineTo(faceW * 0.22, -faceW * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f4c692';
    ctx.beginPath();
    ctx.moveTo(0, faceW * 0.22);
    ctx.lineTo(-faceW * 0.11, -faceW * 0.02);
    ctx.lineTo(faceW * 0.11, -faceW * 0.02);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });
  ctx.restore();

  // Nose + whiskers
  ctx.save();
  ctx.translate(nose.x, nose.y);
  ctx.rotate(angle);
  ctx.fillStyle = '#e8779a';
  ctx.beginPath();
  ctx.moveTo(0, -faceW * 0.03);
  ctx.lineTo(-faceW * 0.05, faceW * 0.04);
  ctx.lineTo(faceW * 0.05, faceW * 0.04);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.5;
  [cheekR, cheekL].forEach((cheek, i) => {
    const dir = i === 0 ? -1 : 1;
    for (let n = -1; n <= 1; n++) {
      ctx.beginPath();
      ctx.moveTo(cheek.x, cheek.y + n * faceW * 0.045);
      ctx.lineTo(cheek.x + dir * faceW * 0.32, cheek.y + n * faceW * 0.09);
      ctx.stroke();
    }
  });
}

function drawMustache(ctx, lm, w, h) {
  const upperLip = pt(lm, IDX.upperLip, w, h);
  const mouthL = pt(lm, IDX.mouthL, w, h);
  const mouthR = pt(lm, IDX.mouthR, w, h);
  const angle = angleOf(mouthR, mouthL);
  const mouthW = dist(mouthL, mouthR);

  ctx.save();
  ctx.translate(upperLip.x, upperLip.y - mouthW * 0.18);
  ctx.rotate(angle + Math.PI);
  ctx.fillStyle = '#241a12';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(mouthW * 0.15, -mouthW * 0.25, mouthW * 0.55, -mouthW * 0.05, mouthW * 0.75, mouthW * 0.12);
  ctx.bezierCurveTo(mouthW * 0.5, mouthW * 0.02, mouthW * 0.2, mouthW * 0.05, 0, mouthW * 0.12);
  ctx.bezierCurveTo(-mouthW * 0.2, mouthW * 0.05, -mouthW * 0.5, mouthW * 0.02, -mouthW * 0.75, mouthW * 0.12);
  ctx.bezierCurveTo(-mouthW * 0.55, -mouthW * 0.05, -mouthW * 0.15, -mouthW * 0.25, 0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}



// Draws a soft-edged, scaled-up crop of `buffer` at `srcCenter` onto `ctx` at
// `destCenter`, using a small reusable offscreen canvas (`patch`) so we don't
// allocate a new canvas every video frame. This is what actually makes eyes
// look bigger — it's real pixels from the camera, stretched, not a drawing.
function warpPatch(ctx, buffer, patch, srcCenter, srcSize, destCenter, destSize, angle) {
  const pctx = patch.ctx;
  const PS = patch.size;
  pctx.clearRect(0, 0, PS, PS);
  pctx.drawImage(
    buffer,
    srcCenter.x - srcSize / 2, srcCenter.y - srcSize / 2, srcSize, srcSize,
    0, 0, PS, PS
  );
  // Feather the edges so the enlarged patch blends into the surrounding face
  // instead of showing a hard circular seam.
  pctx.globalCompositeOperation = 'destination-in';
  const grad = pctx.createRadialGradient(PS / 2, PS / 2, PS * 0.30, PS / 2, PS / 2, PS * 0.5);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  pctx.fillStyle = grad;
  pctx.fillRect(0, 0, PS, PS);
  pctx.globalCompositeOperation = 'source-over';

  ctx.save();
  ctx.translate(destCenter.x, destCenter.y);
  ctx.rotate(angle);
  ctx.drawImage(patch.canvas, 0, 0, PS, PS, -destSize / 2, -destSize / 2, destSize, destSize);
  ctx.restore();
}

function makePatch(size = 220) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return { canvas, ctx: canvas.getContext('2d'), size };
}

/**
 * "Cute" filter, Snapchat-lens style: this warps the person's *actual*
 * camera pixels rather than drawing cartoon shapes on top.
 *  - Eyes are cropped from the live frame and redrawn ~40% bigger, feathered
 *    so they blend into the real face.
 *  - Skin gets a soft blur pass (masked to the face, eyes/mouth excluded)
 *    for a smoothed "beauty cam" look.
 *  - Blush + a light glossy highlight finish the look.
 */
function drawCuteWarp(ctx, buffer, skinPatch, eyePatches, lm, w, h) {
  const forehead = pt(lm, IDX.foreheadTop, w, h);
  const chin = pt(lm, IDX.chin, w, h);
  const cheekR = pt(lm, IDX.cheekR, w, h);
  const cheekL = pt(lm, IDX.cheekL, w, h);
  const eyeOuterR = pt(lm, IDX.eyeOuterR, w, h);
  const eyeInnerR = pt(lm, IDX.eyeInnerR, w, h);
  const eyeOuterL = pt(lm, IDX.eyeOuterL, w, h);
  const eyeInnerL = pt(lm, IDX.eyeInnerL, w, h);
  const eyeTopR = pt(lm, IDX.eyeTopR, w, h);
  const eyeBottomR = pt(lm, IDX.eyeBottomR, w, h);
  const mouthL = pt(lm, IDX.mouthL, w, h);
  const mouthR = pt(lm, IDX.mouthR, w, h);
  const upperLip = pt(lm, IDX.upperLip, w, h);
  const lowerLip = pt(lm, IDX.lowerLip, w, h);

  const angle = angleOf(eyeOuterR, eyeOuterL);
  const centerR = { x: (eyeOuterR.x + eyeInnerR.x) / 2, y: (eyeOuterR.y + eyeInnerR.y) / 2 };
  const centerL = { x: (eyeOuterL.x + eyeInnerL.x) / 2, y: (eyeOuterL.y + eyeInnerL.y) / 2 };
  const eyeGapW = dist(eyeOuterR, eyeInnerR);
  const eyeGapH = dist(eyeTopR, eyeBottomR) || eyeGapW * 0.6;
  const mouthCenter = { x: (mouthL.x + mouthR.x) / 2, y: (upperLip.y + lowerLip.y) / 2 };
  const mouthW = dist(mouthL, mouthR);

  // --- 1. Skin smoothing, masked to the face and excluding eyes/mouth ---
  const faceCenter = {
    x: (forehead.x + chin.x + cheekR.x + cheekL.x) / 4,
    y: (forehead.y + chin.y) / 2,
  };
  const faceRx = (dist(cheekR, cheekL) / 2) * 1.1;
  const faceRy = (dist(forehead, chin) / 2) * 1.08;

  skinPatch.ctx.clearRect(0, 0, w, h);
  skinPatch.ctx.filter = 'blur(7px)';
  skinPatch.ctx.drawImage(buffer, 0, 0, w, h);
  skinPatch.ctx.filter = 'none';

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(faceCenter.x, faceCenter.y, faceRx, faceRy, angle, 0, Math.PI * 2);
  ctx.ellipse(centerR.x, centerR.y, eyeGapW * 1.3, eyeGapH * 2.2, angle, 0, Math.PI * 2);
  ctx.ellipse(centerL.x, centerL.y, eyeGapW * 1.3, eyeGapH * 2.2, angle, 0, Math.PI * 2);
  ctx.ellipse(mouthCenter.x, mouthCenter.y, mouthW * 0.55, mouthW * 0.32, angle, 0, Math.PI * 2);
  ctx.clip('evenodd');
  ctx.globalAlpha = 0.42;
  ctx.drawImage(skinPatch.canvas, 0, 0, w, h);
  ctx.globalAlpha = 1;
  ctx.restore();

  // --- 2. Real-pixel eye enlargement ---
  const eyeSrcSize = eyeGapW * 2.1;
  const eyeDestSize = eyeSrcSize * 1.42;
  warpPatch(ctx, buffer, eyePatches.r, centerR, eyeSrcSize, centerR, eyeDestSize, angle);
  warpPatch(ctx, buffer, eyePatches.l, centerL, eyeSrcSize, centerL, eyeDestSize, angle);

  // --- 3. Subtle lash definition + glossy catchlight on the (now bigger) eyes ---
  [centerR, centerL].forEach((center) => {
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(angle);
    const rw = eyeDestSize / 2;
    const rh = eyeDestSize / 2.7;
    ctx.strokeStyle = 'rgba(20,10,15,0.55)';
    ctx.lineWidth = Math.max(1.5, rw * 0.05);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(0, 0, rw, rh, 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.ellipse(-rw * 0.28, -rh * 0.3, rw * 0.12, rh * 0.16, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  // --- 4. Blush ---
  [cheekR, cheekL].forEach((cheek) => {
    const blushGrad = ctx.createRadialGradient(cheek.x, cheek.y, 0, cheek.x, cheek.y, eyeGapW * 1.6);
    blushGrad.addColorStop(0, 'rgba(255, 130, 160, 0.5)');
    blushGrad.addColorStop(1, 'rgba(255, 130, 160, 0)');
    ctx.fillStyle = blushGrad;
    ctx.beginPath();
    ctx.ellipse(cheek.x, cheek.y, eyeGapW * 1.6, eyeGapW * 1.25, angle, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawSparkles(ctx, w, h, t, faceBox) {
  const count = 14;
  for (let i = 0; i < count; i++) {
    const seed = i * 137.5;
    const radius = (faceBox ? faceBox.w : w * 0.5) * (0.55 + 0.4 * Math.sin(seed));
    const speed = 0.6 + (i % 5) * 0.15;
    const ang = t * speed + seed;
    const cx = faceBox ? faceBox.cx : w / 2;
    const cy = faceBox ? faceBox.cy : h / 2;
    const x = cx + Math.cos(ang) * radius;
    const y = cy + Math.sin(ang * 0.8) * radius * 0.6 - (faceBox ? faceBox.h * 0.3 : 0);
    const size = 4 + 3 * Math.sin(t * 3 + seed);
    const hue = (t * 40 + seed) % 360;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t + seed);
    ctx.fillStyle = `hsla(${hue}, 90%, 70%, 0.9)`;
    ctx.beginPath();
    for (let s = 0; s < 4; s++) {
      ctx.rotate(Math.PI / 2);
      ctx.moveTo(0, 0);
      ctx.lineTo(size, size * 0.35);
      ctx.lineTo(size * 2.2, 0);
      ctx.lineTo(size, -size * 0.35);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Wraps a raw camera MediaStream with a face-tracked AR overlay.
 * Returns a combined stream (filtered video + original audio) plus
 * controls to switch effects and tear everything down.
 */
export async function createARSession(rawStream, initialEffect = 'none') {
  const videoTrack = rawStream.getVideoTracks()[0];
  if (!videoTrack) {
    // Audio-only call — nothing to filter, hand the stream back as-is.
    return {
      stream: rawStream,
      setEffect: () => {},
      getEffect: () => 'none',
      ready: false,
      capturePhoto: () => Promise.reject(new Error('No camera in this stream')),
      stop: () => rawStream.getTracks().forEach((t) => t.stop()),
    };
  }

  const settings = videoTrack.getSettings();
  const width = settings.width || 640;
  const height = settings.height || 480;

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.style.position = 'fixed';
  video.style.left = '-9999px';
  video.style.width = '1px';
  video.style.height = '1px';
  video.srcObject = rawStream;
  document.body.appendChild(video);

  try {
    await video.play();
  } catch (err) {
    video.remove();
    throw new Error('Could not start camera preview (browser blocked autoplay): ' + err.message);
  }

  // Guard against a video element that "plays" but never actually produces
  // frames (seen on some browsers/permission edge-cases) — without this the
  // canvas would just stay blank forever with zero error shown anywhere.
  if (video.readyState < 2) {
    await Promise.race([
      new Promise((resolve) => video.addEventListener('loadeddata', resolve, { once: true })),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Camera did not produce any video frames (timed out after 8s)')), 8000)),
    ]).catch((err) => {
      video.remove();
      throw err;
    });
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Reusable offscreen canvases for the warp-based "cute" filter — allocated
  // once per session so we're not creating canvases every animation frame.
  const buffer = document.createElement('canvas');
  buffer.width = width;
  buffer.height = height;
  const bufferCtx = buffer.getContext('2d');
  const skinPatch = { canvas: document.createElement('canvas'), ctx: null };
  skinPatch.canvas.width = width;
  skinPatch.canvas.height = height;
  skinPatch.ctx = skinPatch.canvas.getContext('2d');
  const eyePatches = { r: makePatch(), l: makePatch() };

  let currentEffect = initialEffect;
  let faceLandmarker = null;
  let stopped = false;
  let rafId = null;

  // Kick off the (potentially slow, network-fetched) model load in the
  // background — filters simply stay off ('none' behaviour) until ready.
  // GPU delegate is preferred but a lot of devices (older phones, some
  // laptops, some browsers) don't support it reliably — fall back to CPU,
  // and don't let a stuck init hang forever.
  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
    ]);
  }

  (async () => {
    try {
      const { FaceLandmarker, FilesetResolver } = await withTimeout(
        loadVisionModule(),
        15000,
        'Loading @mediapipe/tasks-vision'
      );
      const filesetResolver = await withTimeout(
        FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'),
        15000,
        'Loading vision WASM fileset'
      );

      const baseModelOptions = {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
      };
      const commonOptions = {
        outputFaceBlendshapes: false,
        runningMode: 'VIDEO',
        numFaces: 1,
      };

      try {
        faceLandmarker = await withTimeout(
          FaceLandmarker.createFromOptions(filesetResolver, {
            baseOptions: { ...baseModelOptions, delegate: 'GPU' },
            ...commonOptions,
          }),
          10000,
          'Creating FaceLandmarker (GPU)'
        );
      } catch (gpuErr) {
        console.warn('[H70 AR] GPU delegate failed, falling back to CPU.', gpuErr);
        faceLandmarker = await withTimeout(
          FaceLandmarker.createFromOptions(filesetResolver, {
            baseOptions: { ...baseModelOptions, delegate: 'CPU' },
            ...commonOptions,
          }),
          15000,
          'Creating FaceLandmarker (CPU)'
        );
      }
    } catch (err) {
      // Face-tracked filters (anime/glasses/dog/cat/mustache) simply won't
      // draw — but the plain camera feed and 'sparkle'/'none' still work.
      console.error('[H70 AR] Face tracking unavailable — filters that need it will be skipped:', err);
      faceLandmarker = null;
    }
  })();

  const startTime = performance.now();
  function drawFrame() {
    if (stopped) return;
    rafId = requestAnimationFrame(drawFrame);
    if (video.readyState < 2) return;

    bufferCtx.save();
    bufferCtx.scale(-1, 1); // mirror, matches how people expect to see themselves
    bufferCtx.drawImage(video, -width, 0, width, height);
    bufferCtx.restore();
    ctx.drawImage(buffer, 0, 0);

    if (currentEffect === 'none') return;

    let landmarks = null;
    if (faceLandmarker) {
      try {
        const result = faceLandmarker.detectForVideo(video, performance.now());
        if (result.faceLandmarks && result.faceLandmarks.length > 0) {
          landmarks = result.faceLandmarks[0];
        }
      } catch (err) {
        // Detection can transiently fail on odd frame timings — just skip this frame's overlay.
      }
    }

    // Mirror landmark x-coordinates to match the mirrored video draw above.
    const mirrored = landmarks
      ? landmarks.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z }))
      : null;

    const t = (performance.now() - startTime) / 1000;

    if (mirrored) {
      if (currentEffect === 'anime') drawCuteWarp(ctx, buffer, skinPatch, eyePatches, mirrored, width, height);
      else if (currentEffect === 'glasses') drawGlasses(ctx, mirrored, width, height);
      else if (currentEffect === 'dog') drawDog(ctx, mirrored, width, height);
      else if (currentEffect === 'cat') drawCat(ctx, mirrored, width, height);
      else if (currentEffect === 'mustache') drawMustache(ctx, mirrored, width, height);
      else if (currentEffect === 'sparkle') {
        const nose = pt(mirrored, IDX.noseTip, width, height);
        const eR = pt(mirrored, IDX.eyeOuterR, width, height);
        const eL = pt(mirrored, IDX.eyeOuterL, width, height);
        const faceW = dist(eR, eL) * 3;
        drawSparkles(ctx, width, height, t, { cx: nose.x, cy: nose.y, w: faceW, h: faceW });
      }
    } else if (currentEffect === 'sparkle') {
      drawSparkles(ctx, width, height, t, null);
    }
  }
  drawFrame();

  const canvasStream = canvas.captureStream(30);
  const combined = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...rawStream.getAudioTracks(),
  ]);

  return {
    stream: combined,
    setEffect: (id) => {
      currentEffect = id;
    },
    getEffect: () => currentEffect,
    ready: true,
    /**
     * Grabs whatever is currently on the filtered canvas as a JPEG File,
     * ready to hand straight to the existing /api/upload flow.
     */
    capturePhoto: (filename = 'h70-live-photo.jpg') =>
      new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error('Capture failed'));
            resolve(new File([blob], filename, { type: 'image/jpeg' }));
          },
          'image/jpeg',
          0.92
        );
      }),
    stop: () => {
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (faceLandmarker) {
        try { faceLandmarker.close(); } catch (e) {}
      }
      rawStream.getTracks().forEach((t) => t.stop());
      combined.getTracks().forEach((t) => t.stop());
      video.pause();
      video.srcObject = null;
      video.remove();
    },
  };
}
