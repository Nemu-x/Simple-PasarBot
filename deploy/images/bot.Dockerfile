FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY apps/bot/package.json apps/bot/package.json
RUN npm install
COPY . .
WORKDIR /app/apps/bot
CMD ["npm", "run", "dev"]
