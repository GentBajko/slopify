FROM node:26-bookworm-slim AS build

WORKDIR /src
COPY package.json package-lock.json ./
COPY packages/app/package.json packages/app/package.json
COPY packages/web/package.json packages/web/package.json
COPY packages/collector/package.json packages/collector/package.json
COPY packages/site/package.json packages/site/package.json
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:26-bookworm-slim

LABEL org.opencontainers.image.source="https://github.com/GentBajko/slopify" \
      org.opencontainers.image.description="Local prompt-to-video studio" \
      org.opencontainers.image.licenses="MIT" \
      io.slopify.host-cli-protocol="1"

ENV NODE_ENV=production \
    HOME=/data/home \
    SLOPIFY_HOST=0.0.0.0 \
    SLOPIFY_PORT=6969 \
    SLOPIFY_DATA_DIR=/data \
    SLOPIFY_NO_OPEN=1 \
    SLOPIFY_SKIP_MANAGED_UPDATE=1 \
    SLOPIFY_DISABLE_UPDATES=1 \
    SLOPIFY_CONTAINER=1

WORKDIR /opt/slopify
COPY package.json package-lock.json ./
COPY packages/app/package.json packages/app/package.json
COPY packages/web/package.json packages/web/package.json
COPY packages/collector/package.json packages/collector/package.json
COPY packages/site/package.json packages/site/package.json
RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/* \
    && npm ci --ignore-scripts --omit=dev --workspace @gentbajko/slopify --include-workspace-root=false \
    && XDG_CACHE_HOME=/tmp/slopify-ffmpeg-cache node node_modules/ffmpeg-static/install.js \
    && node -e "const fs=require('node:fs'); const bin=require('ffmpeg-static'); for (const path of [bin, bin+'.LICENSE', bin+'.README']) { if (!fs.statSync(path).size) throw new Error('Missing FFmpeg file: '+path); } require('node:child_process').execFileSync(bin, ['-version']);" \
    && rm -rf /tmp/slopify-ffmpeg-cache \
    && mkdir -p /data/home \
    && chown -R node:node /data
COPY --from=build /src/packages/app/dist packages/app/dist

USER node
VOLUME ["/data"]
EXPOSE 6969
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s \
  CMD node -e "fetch('http://127.0.0.1:6969/api/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"
CMD ["node", "packages/app/dist/edge/cli.js", "--no-open"]
