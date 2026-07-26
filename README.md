# Strava Overlay

A tiny static web tool to place a Strava activity export (a stats image with a
transparent background) on top of a photo, move & resize it, and download the
result at full quality.

No build step, no dependencies, no server — just three files.

## Use it

**Easiest:** double-click `index.html` to open it in your browser.

Or serve it locally (handy on some phones / stricter browsers):

```bash
python3 -m http.server 8000
```

then open <http://localhost:8000>.

### How it works in the UI
1. **Base image** — pick the photo.
2. **Strava overlay** — pick the exported PNG (transparent background). It appears
   centered.
3. **Move** — drag with the mouse, or your finger on mobile.
4. **Resize** — the *Size* slider, the mouse wheel, or a two-finger pinch on mobile.
   It caps when the overlay fills the frame and won't shrink to nothing.
5. **Download PNG** — exports at the base photo's full native resolution.

## Deploy (optional)

It's just static files, so any static host works. For **GitHub Pages**:

1. Push this folder to a GitHub repo.
2. Repo → Settings → Pages → Source: `main` branch, `/ (root)`.
3. Your tool is live at `https://<user>.github.io/<repo>/`.

## Files
- `index.html` — page structure
- `styles.css` — styling / layout
- `app.js` — image loading, drag/pinch/scale, and canvas export
