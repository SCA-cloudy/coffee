# KLOAD 워게임: 게임 화면 + 2장 문제 서버 + 검사 봇(크로미움)
FROM node:20-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-noto-cjk \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app/server
COPY server/package*.json ./
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm ci --omit=dev

WORKDIR /app
COPY index.html ./
COPY css ./css
COPY js ./js
COPY assets ./assets
COPY server ./server

# 컨테이너 안에서는 크롬 샌드박스를 못 쓰므로 끄고, 대신 일반 사용자로 실행한다
ENV CHROME_PATH=/usr/bin/chromium \
    CHROME_ARGS="--no-sandbox --disable-dev-shm-usage --disable-gpu" \
    NODE_ENV=production
# COPY는 root 소유로 올라오는데, 3장 문제 서버가 실행 중에 uploads/data 폴더를
# 만들어야 해서 node 사용자가 쓸 수 있도록 소유권을 넘긴다
RUN chown -R node:node /app
USER node
WORKDIR /app/server
EXPOSE 3000
CMD ["node", "server.js"]
