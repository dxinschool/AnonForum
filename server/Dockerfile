FROM node:20-bullseye-slim

# Install system deps required by some native modules (sharp)
RUN apt-get update && apt-get install -y --no-install-recommends \
  build-essential python3 pkg-config libvips-dev ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Install production dependencies first (leverage Docker cache)
COPY package*.json ./
ENV NODE_ENV=production
# Use npm install when lockfile and package.json are out-of-sync inside the image.
# `npm ci` fails if package-lock.json doesn't match package.json (seen with nanoid).
# `npm install --omit=dev` installs production deps and is more tolerant here.
RUN npm install --omit=dev --no-audit --no-fund

# Copy app source
COPY . .

# Ensure uploads dir exists and make the entire app dir writable by `node`.
# lowdb writes to `db.json` at runtime; container runs as `node` user so files
# need to be owned by that user to avoid EACCES when writing.
RUN mkdir -p uploads && chown -R node:node .

USER node
EXPOSE 4000
ENV PORT=4000
CMD ["node", "index.js"]
