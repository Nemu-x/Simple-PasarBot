FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm install
WORKDIR /app/packages/worker
CMD ["npm", "run", "dev"]
