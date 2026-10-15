FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY scripts ./scripts
COPY sql ./sql
COPY data ./data
EXPOSE 3001
CMD ["npm", "run", "dev"]
