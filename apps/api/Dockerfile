FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/slot-engine/package.json packages/slot-engine/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci
COPY packages/slot-engine packages/slot-engine
COPY apps/api apps/api
ENV NODE_ENV=production
EXPOSE 8095
CMD ["npm", "run", "start", "-w", "@pf-calendar/api"]
