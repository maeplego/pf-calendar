FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/worker/package.json apps/worker/package.json
RUN npm ci --workspace=@pf-calendar/worker
COPY apps/worker apps/worker
ENV NODE_ENV=production
CMD ["npm", "run", "start", "-w", "@pf-calendar/worker"]
