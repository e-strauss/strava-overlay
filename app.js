"use strict";

/* ------------------------------------------------------------------ *
 * Strava Overlay Tool
 *
 * Everything is expressed as FRACTIONS of the base image, so the on-screen
 * preview size never matters — we can export at the base image's full
 * native resolution from the exact same numbers.
 *
 *   sw       overlay width  ÷ base width          (0..1)
 *   fx, fy   overlay CENTER  ÷ base width/height   (0..1)
 * ------------------------------------------------------------------ */

// --- DOM ---
const baseInput     = document.getElementById("baseInput");
const overlayInput  = document.getElementById("overlayInput");
const overlayLabel  = document.getElementById("overlayLabel");
const stage         = document.getElementById("stage");
const baseImg       = document.getElementById("baseImg");
const overlayImg    = document.getElementById("overlayImg");
const placeholder   = document.getElementById("placeholder");
const bottomControls= document.getElementById("bottomControls");
const sizeSlider    = document.getElementById("sizeSlider");
const resetBtn      = document.getElementById("resetBtn");
const downloadBtn   = document.getElementById("downloadBtn");

// --- State ---
const state = {
  hasBase: false,
  hasOverlay: false,
  BW: 0, BH: 0,      // base natural pixel size
  OW: 0, OH: 0,      // overlay natural pixel size
  sw: 0.4,           // overlay width as a fraction of base width
  fx: 0.5, fy: 0.5,  // overlay center, as a fraction of base
  swMax: 1,          // biggest sw that still fits fully inside the base
  swMin: 0.05,
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// --- Derived geometry --------------------------------------------------

// Overlay height as a fraction of base height, for the current sw.
function overlayHeightFraction() {
  if (!state.OW || !state.BH) return 0;
  return state.sw * (state.BW * state.OH) / (state.BH * state.OW);
}

// Largest width fraction where the overlay still fits inside the base in
// BOTH dimensions (aka "contain" fit).
function computeSwMax() {
  if (!state.OW || !state.OH) return 1;
  return Math.min(1, (state.BH * state.OW) / (state.BW * state.OH));
}

// Keep the overlay fully inside the base image.
function clampPosition() {
  const halfW = state.sw / 2;
  const halfH = overlayHeightFraction() / 2;
  state.fx = clamp(state.fx, halfW, 1 - halfW);
  state.fy = clamp(state.fy, halfH, 1 - halfH);
}

// --- Rendering the preview --------------------------------------------

function applyOverlayStyle() {
  overlayImg.style.width = (state.sw * 100) + "%";
  overlayImg.style.left  = (state.fx * 100) + "%";
  overlayImg.style.top   = (state.fy * 100) + "%";
}

// Set sw (from slider / wheel / pinch), keeping everything consistent.
function setSw(newSw) {
  state.sw = clamp(newSw, state.swMin, state.swMax);
  clampPosition();
  applyOverlayStyle();
  syncSlider();
}

// The slider runs 5..100 = percentage of swMax ("how much of the frame").
function syncSlider() {
  if (state.swMax > 0) {
    sizeSlider.value = clamp((state.sw / state.swMax) * 100, 5, 100);
  }
}

// (Re)compute limits + a sensible default once both images are known.
function initOverlayLayout() {
  state.swMax = computeSwMax();
  state.swMin = state.swMax * 0.05;
  // Default: overlay at its own native size relative to the base, capped to fit.
  state.sw = clamp(state.OW / state.BW, state.swMin, state.swMax);
  state.fx = 0.5;
  state.fy = 0.5;
  clampPosition();
  applyOverlayStyle();
  syncSlider();
}

// --- Loading images ----------------------------------------------------

function loadImageFile(file, imgEl) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    imgEl.onload = () => {
      URL.revokeObjectURL(imgEl.dataset.prevUrl || "");
      imgEl.dataset.prevUrl = url;
      resolve();
    };
    imgEl.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad image")); };
    imgEl.src = url;
  });
}

baseInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  await loadImageFile(file, baseImg);
  state.BW = baseImg.naturalWidth;
  state.BH = baseImg.naturalHeight;
  state.hasBase = true;

  placeholder.hidden = true;
  stage.hidden = false;
  bottomControls.hidden = false;
  overlayLabel.classList.remove("is-disabled");
  baseInput.closest(".filebtn").classList.add("is-set");

  if (state.hasOverlay) initOverlayLayout();
});

overlayInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  await loadImageFile(file, overlayImg);
  state.OW = overlayImg.naturalWidth;
  state.OH = overlayImg.naturalHeight;
  state.hasOverlay = true;

  overlayImg.hidden = false;
  overlayLabel.classList.add("is-set");
  downloadBtn.disabled = false;

  initOverlayLayout();
});

// Disable the overlay picker until a base image is chosen.
overlayLabel.classList.add("is-disabled");

// --- Slider / wheel / reset -------------------------------------------

sizeSlider.addEventListener("input", () => {
  setSw(state.swMax * (Number(sizeSlider.value) / 100));
});

stage.addEventListener("wheel", (e) => {
  if (!state.hasOverlay) return;
  e.preventDefault();
  setSw(state.sw * (e.deltaY < 0 ? 1.05 : 0.95));
}, { passive: false });

resetBtn.addEventListener("click", () => {
  if (state.hasOverlay) initOverlayLayout();
});

// --- Drag + pinch (Pointer Events: one path for mouse AND touch) -------

const pointers = new Map();   // pointerId -> {x, y}
let gesture = null;           // baseline captured when the pointer count changes

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Snapshot the current state as the baseline for the active pointers.
function startGesture() {
  const pts = [...pointers.values()];
  gesture = { startFx: state.fx, startFy: state.fy, startSw: state.sw };
  if (pts.length === 1) {
    gesture.startX = pts[0].x;
    gesture.startY = pts[0].y;
  } else if (pts.length >= 2) {
    gesture.startDist = dist(pts[0], pts[1]) || 1;
    gesture.startCx = (pts[0].x + pts[1].x) / 2;
    gesture.startCy = (pts[0].y + pts[1].y) / 2;
  }
}

stage.addEventListener("pointerdown", (e) => {
  if (!state.hasOverlay) return;
  stage.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  overlayImg.classList.add("dragging");
  startGesture();
  e.preventDefault();
});

stage.addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId) || !gesture) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  const rect = stage.getBoundingClientRect();
  const pts = [...pointers.values()];

  if (pts.length === 1) {
    // Drag: move by pointer delta (in fractions of the base).
    state.fx = gesture.startFx + (pts[0].x - gesture.startX) / rect.width;
    state.fy = gesture.startFy + (pts[0].y - gesture.startY) / rect.height;
  } else {
    // Pinch: scale by finger-distance ratio, and pan by pinch-center delta.
    const ratio = dist(pts[0], pts[1]) / gesture.startDist;
    state.sw = clamp(gesture.startSw * ratio, state.swMin, state.swMax);
    const cx = (pts[0].x + pts[1].x) / 2;
    const cy = (pts[0].y + pts[1].y) / 2;
    state.fx = gesture.startFx + (cx - gesture.startCx) / rect.width;
    state.fy = gesture.startFy + (cy - gesture.startCy) / rect.height;
    syncSlider();
  }
  clampPosition();
  applyOverlayStyle();
  e.preventDefault();
});

function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (pointers.size > 0) {
    startGesture();          // re-baseline the remaining finger(s)
  } else {
    gesture = null;
    overlayImg.classList.remove("dragging");
  }
}
stage.addEventListener("pointerup", endPointer);
stage.addEventListener("pointercancel", endPointer);

// --- Export ------------------------------------------------------------

downloadBtn.addEventListener("click", () => {
  if (!state.hasBase || !state.hasOverlay) return;

  // Compose at the base image's FULL native resolution.
  const canvas = document.createElement("canvas");
  canvas.width = state.BW;
  canvas.height = state.BH;
  const ctx = canvas.getContext("2d");

  ctx.drawImage(baseImg, 0, 0, state.BW, state.BH);

  const destW = state.sw * state.BW;
  const destH = destW * (state.OH / state.OW);
  const cx = state.fx * state.BW;
  const cy = state.fy * state.BH;
  ctx.drawImage(overlayImg, cx - destW / 2, cy - destH / 2, destW, destH);

  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "strava-overlay.png";
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
});
