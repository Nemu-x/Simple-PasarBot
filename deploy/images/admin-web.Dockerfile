FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm install
WORKDIR /app/apps/admin-web
CMD ["npm", "run", "dev"]
