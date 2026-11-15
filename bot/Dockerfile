FROM node:24-alpine
WORKDIR /app/bot
COPY bot/package.json bot/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY bot/index.js bot/protocol.js bot/control.js bot/reaction-roles.js bot/participation.js bot/onboarding.js bot/server-stats.js bot/membership-roles.js bot/trivia.js bot/dice.js bot/workshop-jobs.js bot/profile.js bot/profile-db.js bot/trivia-questions.json bot/trivia.test.js bot/dice.test.js bot/workshop-jobs.test.js bot/profile.test.js bot/profile-db.test.js ./
COPY shared/discord-signing.js shared/discord-control.js /app/shared/
RUN test -f membership-roles.js && node --check index.js && node --check trivia.js && node --check dice.js && node --check workshop-jobs.js && node --check profile.js && node --check profile-db.js && node --test trivia.test.js dice.test.js workshop-jobs.test.js profile.test.js profile-db.test.js
ENV NODE_ENV=production
USER node
CMD ["node","index.js"]
