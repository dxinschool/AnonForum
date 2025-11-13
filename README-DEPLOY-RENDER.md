Render deployment notes for the Forum project

Quick copy/paste values for Render (UI or render.yaml)

- Language / Runtime: Node (use Node 18)
- Branch: main
- Root Directory: forum

Build command (paste into Render build command):

npm --prefix client install && npm --prefix client run build && npm --prefix server install

Start command (paste into Render start command):

npm --prefix server start

Environment variables to add in Render dashboard (recommended):

- ADMIN_PASSWORD = <secure-password>
- NODE_ENV = production
- SITE_NAME = <your site name> (optional)
- DEFAULT_OG_IMAGE = <public image url> (optional)

Health check (optional):
- Path: /api/threads

Notes about persistence and uploads

- This app stores data using lowdb (JSON file) and saves uploaded files under `forum/server/uploads`.
- Render service disks are ephemeral across deploys and instance restarts. To persist data across deploys you should:
  - Use a managed Postgres database (Render Postgres) and migrate data from lowdb
  - Move file uploads to S3-compatible storage (AWS S3, DigitalOcean Spaces, or Supabase Storage)
  - Alternatively, attach a Render Persistent Disk (paid) and update `server` to store files there.

How Render will build & run (what happens):
1. Render runs the Build Command from the `forum` root. That installs and builds the client into `forum/client/dist` and installs server dependencies.
2. The Start Command runs `server/index.js`. The server checks for `../client/dist` and serves it as static files if present. The server also exposes API endpoints under `/api/*` and a websocket endpoint at `/ws`.

  - When split, configure the client to use `VITE_API_BASE` and `VITE_WS_URL` environment variables so it can target the backend domain.
    - Example: set `VITE_API_BASE=https://forum-server.onrender.com` and `VITE_WS_URL=wss://forum-server.onrender.com/ws` in the Render Static Site settings under "Environment". Replace the domain with your server's domain.
    - The client now reads those env vars at build time and will call the server domain for API and websocket connections.
- If the build fails with errors related to `sharp` or other native modules, try switching Node version to 18 in the Render runtime.
- If the server starts but client isn't served, check build logs to ensure `client/dist` was produced and the server logs that it's serving the client.

Next suggested repo improvements (I can implement any of these for you):
- Add Vite env-variable support so the client can be hosted separately (VITE_API_BASE, VITE_WS_URL)
- Add a `render.yaml` (already added) to codify service settings
- Add `engines` field to `server/package.json` (already added) to pin Node version
- Replace local lowdb + uploads with Postgres + S3/Supabase Storage for production readiness

