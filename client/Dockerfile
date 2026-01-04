FROM node:lts-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy source
COPY . .

# Expose Vite port
EXPOSE 5173

# Run dev server
CMD ["npm", "run", "dev", "--", "--host"]
