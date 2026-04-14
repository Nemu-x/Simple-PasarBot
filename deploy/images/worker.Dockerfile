FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY packages/worker/package.json packages/worker/package.json
RUN npm install
COPY . .
WORKDIR /app/packages/worker
CMD ["npm", "run", "dev"]
