FROM node:lts-alpine

WORKDIR /usr/src/app

COPY package*.json ./
COPY *.js ./

RUN npm install --omit=dev

CMD ["node", "."]
