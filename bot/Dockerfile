FROM node:24-alpine
WORKDIR /app/bot
COPY bot/package.json bot/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY bot/index.js bot/protocol.js ./
COPY shared/discord-signing.js /app/shared/discord-signing.js
ENV NODE_ENV=production
USER node
CMD ["node","index.js"]
