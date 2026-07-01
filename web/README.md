# Box3D Web Demo

Browser demo for Box3D + Three.js.

## Tested On

- Arch Linux

## Dependencies

You need:

- `git`
- `cmake`
- `node` and `npm`
- `emscripten` (`emcc`, `emcmake`)

On Arch Linux, install them with:

```bash
sudo pacman -S --needed git cmake nodejs npm emscripten
```

If you installed `emscripten` in an existing shell, load its environment first:

```bash
source /etc/profile.d/emscripten.sh
```

## Build And Run

1. Build the wasm target from the repo root:

```bash
emcmake cmake -S . -B build-web -DBOX3D_SAMPLES=OFF -DBOX3D_BENCHMARKS=OFF -DBOX3D_DOCS=OFF -DBOX3D_UNIT_TESTS=OFF
cmake --build build-web
```

2. Install the web app dependencies:

```bash
cd web
npm install
```

3. Start the Vite dev server:

```bash
npm run dev
```

4. Open the local URL Vite prints, usually `http://localhost:5173`.

## Iterate

If you change the C side or the wasm bridge, rebuild the wasm target and reload the page:

```bash
cd /path/to/box3d
source /etc/profile.d/emscripten.sh
emcmake cmake -S . -B build-web -DBOX3D_SAMPLES=OFF -DBOX3D_BENCHMARKS=OFF -DBOX3D_DOCS=OFF -DBOX3D_UNIT_TESTS=OFF
cmake --build build-web
```

Vite will pick up the regenerated `web/public/wasm/box3d-web.js` on refresh.

## Controls

- Drag dynamic bodies with the mouse.
- Orbit empty space.
- Press `Space` to shoot spheres.

## Notes

- This is a demo, not a production integration template.
- The wasm bridge is intentionally small and browser-focused.
