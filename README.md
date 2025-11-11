# Anonymous Forum (minimal)

This folder contains a minimal anonymous forum example with a small Express + SQLite backend and a Vite + React frontend.

Structure:
- server/: Express API using SQLite (better-sqlite3)
- client/: Vite + React frontend

Quick start (from `forum`):

1. Install server deps and start server:

```cmd
cd server
npm install
npm run dev
```

2. In a new terminal start the client:

```cmd
cd client
npm install
npm run dev
```

The client dev server proxies `/api` to `http://localhost:4000`.

Notes:
- This is an educational starter. For production, add authentication, moderation tools, rate limiting, and move to Postgres/Redis for scale.
