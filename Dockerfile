# ---- HELL FIRE production image ----
# Builds the browser game and the combined game-host + relay server,
# then serves everything from a single Node process (no install needed
# for players — they just open the URL).

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:all

FROM node:22-alpine AS run
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server

ENV PORT=3000
EXPOSE 3000
CMD ["node", "server/dist/index.js"]
