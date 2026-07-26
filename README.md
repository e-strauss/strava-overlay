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
2. **Strava overlay** — pick the exported PNG (transparent background). A **crop
   step** opens: tap **Auto-trim** to snap the crop to the content (Strava exports
   have lots of empty space top/bottom), or drag the edges/corners to fine-tune,
   then **Use crop**. Transparency is preserved (unlike the iPhone Photos crop,
   which flattens it onto white). You can reopen it later with the **Crop** button.
3. **Move** — drag with the mouse, or your finger on mobile.
4. **Resize** — the *Size* slider, the mouse wheel, or a two-finger pinch on mobile.
   It caps when the overlay fills the frame and won't shrink to nothing.
5. **Shade** — Strava exports are white, which disappears on bright photos. The
   *Shade* slider fades the overlay from white to black, and **Flip W/B** snaps
   between the two in one tap. (Only the colour is changed — the transparent
   background stays transparent.)
6. **Download PNG** — exports at the base photo's full native resolution, with the
   current shade baked in.

## Deploy (optional)

It's just static files, so any static host works. For **GitHub Pages**:

1. Push this folder to a GitHub repo.
2. Repo → Settings → Pages → Source: `main` branch, `/ (root)`.
3. Your tool is live at `https://<user>.github.io/<repo>/`.

## Files
- `index.html` — page structure
- `styles.css` — styling / layout
- `app.js` — image loading, drag/pinch/scale, and canvas export
