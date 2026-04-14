FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/integrations/pasarguard/package.json packages/integrations/pasarguard/package.json
COPY packages/integrations/platega/package.json packages/integrations/platega/package.json
RUN npm install
COPY . .
WORKDIR /app/apps/api
CMD ["npm", "run", "dev"]
