# Use Node 20 as required by your package.json engines field
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy dependency manifests + .npmrc first for better layer caching.
# .npmrc (omit=optional, fund=false, audit=false) must be present BEFORE
# npm install runs, or those speed/size savings are silently skipped.
COPY package*.json .npmrc ./

# The postinstall step applies the small Baileys decrypt fix, so its files
# must exist before `npm install` runs.
COPY scripts ./scripts
COPY patches ./patches

# Install only production dependencies, then drop npm's cache from the layer
# (keeps the image small on a 512MB-disk host).
RUN npm install --omit=dev && npm cache clean --force

# Copy the rest of your bot code
COPY . .

# Persistent data: session + small JSON state + text logs (no media is ever stored)
RUN mkdir -p /app/session /app/state /app/logs

# Declare volumes so Kubeletto can mount persistent storage
VOLUME ["/app/session", "/app/state", "/app/logs"]

# 256MB-RAM default: leaves headroom for Node's own baseline + the OS above
# the V8 heap. Change the CMD flags below for a bigger box.
ENV UV_THREADPOOL_SIZE=2

# Start a single session (this repo's package.json main entry). For multiple
# sessions in one container use `node index.js` instead — see README.
CMD ["node", "--max-old-space-size=200", "--max-semi-space-size=8", "start.js"]
