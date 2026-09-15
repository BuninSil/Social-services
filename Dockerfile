FROM node:22-bookworm-slim

# Обложки и длительность видео делает ffmpeg. Без него всё работает,
# просто без превью — раскомментируйте, если превью нужны (образ потяжелеет).
# RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
#     && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

COPY src ./src
COPY views ./views
COPY public ./public
COPY scripts ./scripts

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    VO_DATA_DIR=/app/data \
    VO_UPLOAD_DIR=/app/uploads

RUN mkdir -p /app/data /app/uploads

EXPOSE 8080
CMD ["node", "src/server.js"]
