FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY public ./public
COPY src ./src
COPY data ./data
ENV HOST=0.0.0.0 PORT=4173 MOONSTAKE_DB_PATH=/data/db.json
VOLUME ["/data"]
EXPOSE 4173
CMD ["node","src/server.mjs"]
