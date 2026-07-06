FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
# Copias explícitas (evita arrastrar .env, .git, node_modules u otros datos sensibles)
COPY server.js auth.js renderer.js importer.js openapi.js ./
COPY db ./db
COPY schemas ./schemas
COPY public ./public
ENV PORT=8321
EXPOSE 8321
USER node
CMD ["node", "server.js"]
