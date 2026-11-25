FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
USER node
CMD ["node", "-r", "./src/tracing.js", "src/server.js"]
