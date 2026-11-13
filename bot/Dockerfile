FROM node:24-alpine
WORKDIR /app/bot
COPY bot/package.json bot/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY bot/index.js bot/protocol.js bot/control.js bot/reaction-roles.js bot/participation.js bot/onboarding.js bot/server-stats.js ./
COPY shared/discord-signing.js shared/discord-control.js /app/shared/
ENV NODE_ENV=production
USER node
CMD ["node","index.js"]
