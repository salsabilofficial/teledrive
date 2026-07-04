FROM node:22-alpine

# Install dependencies needed for rebuilds if any
RUN apk add --no-cache python3 make g++

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

CMD ["node", "src/index.js"]
