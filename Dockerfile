# The MedicApp server and web app. There is no install step: the server uses
# only what ships with Node, including its built-in SQLite driver.
FROM node:24-slim

# Production mode: no sample data, and the first admin is created through the
# one-time setup screen. HOST 0.0.0.0 lets the host's proxy reach the server;
# the port comes from the PORT variable the host provides.
ENV NODE_ENV=production \
    HOST=0.0.0.0

WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public

# Stays root on purpose: a Railway volume is mounted as root, and the database
# file has to be writable on it.
EXPOSE 3000
CMD ["node", "server/index.js"]
