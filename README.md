# Anonymous Forum (minimal)

This repository is a minimal, educational anonymous forum scaffold with a small Express backend and a Vite + React frontend. It demonstrates basic features you can build on:

- Threads and comments
- Upvotes/downvotes
- Emoji reactions
- Polls (create polls when posting and vote inline)
- Image uploads (thread images, chat images)
- Global realtime chat (websockets)
- Admin panel (announcements, blocklist, audit log, reports)
- Dark/light theme support with smooth toggling

Structure
- `server/`: Express API and lightweight JSON persistence used for the example
- `client/`: Vite + React frontend (components under `client/src/components`)

Quick start (development)

1) Start the backend server

```cmd
cd server
npm install
npm run dev
```

The server listens on port 4000 by default and exposes the REST + WebSocket endpoints under `/api`.

2) Start the frontend

```cmd
cd client
npm install
npm run dev
```

The Vite dev server proxies `/api` to the backend (see `client/vite.config.js`). If port 5173 is taken, Vite will try the next available port.

What changed recently
- Theme improvements: CSS variables and dark-mode tokens, early theme apply to avoid flashes, animated toggle helper
- Admin UI: blocklist editing, announcement posting, audit log and reports with a responsive admin panel (audit area is scrollable)
- Poll UI: create polls with threads and vote inline (thread list + thread view)
- Reactions: emoji reactions with defensive client parsing for various server shapes
- Chat: global realtime chat with dark-mode-friendly styles and image uploads
- Error handling: server validation errors (e.g., blocked content) show red error toasts in the UI

Notes and next steps
- This is a demo scaffold. For production use, add authentication, rate limiting, robust persistence (Postgres), proper media storage (S3), and hardened moderation workflows.

If you want, I can:
- Make a GitHub Actions workflow for lint/test and preview deploys
- Add a CONTRIBUTING guide and code-of-conduct
- Split client/server into separate repos and add Dockerfiles

License
This project is provided as-is for educational purposes.
