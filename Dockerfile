FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
ENV PORT=8321 DATA_DIR=/app/data
EXPOSE 8321
CMD ["node", "server.js"]
