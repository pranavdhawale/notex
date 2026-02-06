# Stage 1: Base
FROM node:lts-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./

# Stage 2: Development
FROM base AS development
RUN npm install --legacy-peer-deps
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]

# Stage 3: Builder
FROM base AS builder
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

# Stage 4: Production
FROM nginx:alpine AS production
RUN apk add --no-cache tzdata
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
