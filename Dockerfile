FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p /app/auth /app/data /app/logs /app/backups

EXPOSE 3000

CMD ["node", "index.js"]
