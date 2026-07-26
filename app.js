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
const shadeSlider   = document.getElementById("shadeSlider");
const flipBtn       = document.getElementById("flipBtn");
const cropBtn       = document.getElementById("cropBtn");
const resetBtn      = document.getElementById("resetBtn");
const downloadBtn   = document.getElementById("downloadBtn");

// Crop modal
const cropModal     = document.getElementById("cropModal");
const cropStage     = document.getElementById("cropStage");
const cropImg       = document.getElementById("cropImg");
const cropBox       = document.getElementById("cropBox");
const cropAutoBtn   = document.getElementById("cropAutoBtn");
const cropFullBtn   = document.getElementById("cropFullBtn");
const cropCancelBtn = document.getElementById("cropCancelBtn");
const cropApplyBtn  = document.getElementById("cropApplyBtn");

// The originally-picked overlay at full resolution (never mutated); the on-screen
// overlayImg holds the CROPPED result. currentCrop remembers the last-applied box.
const rawOverlay = new Image();
let cropState = { x0: 0, y0: 0, x1: 1, y1: 1 };   // live crop rect (fractions of rawOverlay)
let currentCrop = null;                            // last applied crop rect

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
  brightness: 1,     // overlay shade: 1 = original (white), 0 = black
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

// --- Shade (white <-> dark) -------------------------------------------
// The overlay's shape lives in its ALPHA channel; we only darken its RGB.
// Preview uses a CSS brightness() filter (multiplies RGB by the factor,
// leaves alpha untouched).

function applyOverlayFilter() {
  overlayImg.style.filter =
    state.brightness < 1 ? `brightness(${state.brightness})` : "none";
}

// b: 0 (black) .. 1 (original white). Keeps the slider in sync.
function setBrightness(b) {
  state.brightness = clamp(b, 0, 1);
  shadeSlider.value = state.brightness * 100;
  applyOverlayFilter();
}

// A copy of the overlay with the same brightness tint baked in — used for
// export, so the PNG matches the preview without relying on canvas ctx.filter.
// Multiplying RGB by b (keeping alpha) == painting black at alpha (1-b) with
// the "source-atop" rule, which only touches already-opaque pixels.
function tintedOverlayCanvas() {
  const c = document.createElement("canvas");
  c.width = state.OW;
  c.height = state.OH;
  const cx = c.getContext("2d");
  cx.drawImage(overlayImg, 0, 0, state.OW, state.OH);
  if (state.brightness < 1) {
    cx.globalCompositeOperation = "source-atop";
    cx.fillStyle = `rgba(0,0,0,${1 - state.brightness})`;
    cx.fillRect(0, 0, state.OW, state.OH);
  }
  return c;
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
  setBrightness(1);   // back to the original (white) overlay
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
  await loadImageFile(file, rawOverlay);
  currentCrop = null;
  openCropModal(true);   // fresh pick -> default to auto-trim
});

// Disable the overlay picker until a base image is chosen.
overlayLabel.classList.add("is-disabled");

// --- Crop step ---------------------------------------------------------

// Tight bounding box of the non-transparent pixels, as fractions of the image.
// This is what "Auto-trim" uses to strip the empty margins.
function contentBounds(img) {
  const w = img.naturalWidth, h = img.naturalHeight;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const cx = c.getContext("2d");
  cx.drawImage(img, 0, 0);
  const data = cx.getImageData(0, 0, w, h).data;
  const ALPHA = 8;                     // ignore near-transparent anti-aliasing
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > ALPHA) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { x0: 0, y0: 0, x1: 1, y1: 1 };   // fully transparent
  const pad = Math.round(Math.min(w, h) * 0.01);         // tiny breathing room
  minX = Math.max(0, minX - pad);  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);  maxY = Math.min(h - 1, maxY + pad);
  return { x0: minX / w, y0: minY / h, x1: (maxX + 1) / w, y1: (maxY + 1) / h };
}

function renderCropBox() {
  cropBox.style.left   = (cropState.x0 * 100) + "%";
  cropBox.style.top    = (cropState.y0 * 100) + "%";
  cropBox.style.width  = ((cropState.x1 - cropState.x0) * 100) + "%";
  cropBox.style.height = ((cropState.y1 - cropState.y0) * 100) + "%";
}

function openCropModal(autoTrim) {
  cropImg.src = rawOverlay.src;
  cropState = autoTrim
    ? contentBounds(rawOverlay)
    : (currentCrop ? { ...currentCrop } : { x0: 0, y0: 0, x1: 1, y1: 1 });
  renderCropBox();
  cropModal.hidden = false;
}

function closeCropModal() { cropModal.hidden = true; }

async function applyCrop() {
  const rw = rawOverlay.naturalWidth, rh = rawOverlay.naturalHeight;
  const sw = Math.max(1, Math.round((cropState.x1 - cropState.x0) * rw));
  const sh = Math.max(1, Math.round((cropState.y1 - cropState.y0) * rh));
  const c = document.createElement("canvas");
  c.width = sw; c.height = sh;
  c.getContext("2d").drawImage(
    rawOverlay, cropState.x0 * rw, cropState.y0 * rh, sw, sh, 0, 0, sw, sh
  );
  const blob = await new Promise((r) => c.toBlob(r, "image/png"));
  await loadImageFile(blob, overlayImg);

  state.OW = overlayImg.naturalWidth;
  state.OH = overlayImg.naturalHeight;
  state.hasOverlay = true;
  overlayImg.hidden = false;
  overlayLabel.classList.add("is-set");
  downloadBtn.disabled = false;
  currentCrop = { ...cropState };

  closeCropModal();
  initOverlayLayout();
}

// Crop-box drag / resize (single pointer; works for mouse and touch).
let cropDrag = null;
const CROP_MIN = 0.05;   // smallest crop size, as a fraction

cropBox.addEventListener("pointerdown", (e) => {
  cropDrag = {
    mode: e.target.dataset.h || "move",   // a handle's data-h, else move the box
    startX: e.clientX,
    startY: e.clientY,
    start: { ...cropState },
  };
  cropStage.setPointerCapture(e.pointerId);
  e.preventDefault();
});

cropStage.addEventListener("pointermove", (e) => {
  if (!cropDrag) return;
  const rect = cropStage.getBoundingClientRect();
  let dx = (e.clientX - cropDrag.startX) / rect.width;
  let dy = (e.clientY - cropDrag.startY) / rect.height;
  let { x0, y0, x1, y1 } = cropDrag.start;
  const m = cropDrag.mode;

  if (m === "move") {
    dx = clamp(dx, -x0, 1 - x1);
    dy = clamp(dy, -y0, 1 - y1);
    x0 += dx; x1 += dx; y0 += dy; y1 += dy;
  } else {
    if (m.includes("w")) x0 = clamp(x0 + dx, 0, x1 - CROP_MIN);
    if (m.includes("e")) x1 = clamp(x1 + dx, x0 + CROP_MIN, 1);
    if (m.includes("n")) y0 = clamp(y0 + dy, 0, y1 - CROP_MIN);
    if (m.includes("s")) y1 = clamp(y1 + dy, y0 + CROP_MIN, 1);
  }
  cropState = { x0, y0, x1, y1 };
  renderCropBox();
  e.preventDefault();
});

function endCropDrag() { cropDrag = null; }
cropStage.addEventListener("pointerup", endCropDrag);
cropStage.addEventListener("pointercancel", endCropDrag);

cropAutoBtn.addEventListener("click", () => {
  cropState = contentBounds(rawOverlay);
  renderCropBox();
});
cropFullBtn.addEventListener("click", () => {
  cropState = { x0: 0, y0: 0, x1: 1, y1: 1 };
  renderCropBox();
});
cropApplyBtn.addEventListener("click", applyCrop);
cropCancelBtn.addEventListener("click", closeCropModal);

// Re-open the crop step for the current overlay.
cropBtn.addEventListener("click", () => {
  if (state.hasOverlay || rawOverlay.src) openCropModal(false);
});

// --- Slider / wheel / reset -------------------------------------------

sizeSlider.addEventListener("input", () => {
  setSw(state.swMax * (Number(sizeSlider.value) / 100));
});

stage.addEventListener("wheel", (e) => {
  if (!state.hasOverlay) return;
  e.preventDefault();
  setSw(state.sw * (e.deltaY < 0 ? 1.05 : 0.95));
}, { passive: false });

shadeSlider.addEventListener("input", () => {
  setBrightness(Number(shadeSlider.value) / 100);
});

// One-tap flip between full white and full black.
flipBtn.addEventListener("click", () => {
  if (!state.hasOverlay) return;
  setBrightness(state.brightness > 0.5 ? 0 : 1);
});

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
  ctx.drawImage(tintedOverlayCanvas(), cx - destW / 2, cy - destH / 2, destW, destH);

  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "strava-overlay.png";
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
});
