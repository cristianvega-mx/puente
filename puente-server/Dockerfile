FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ENV NODE_ENV=production PORT=3000 PUENTE_BIND=0.0.0.0
EXPOSE 3000
USER node
CMD ["npx", "tsx", "src/server.ts"]
