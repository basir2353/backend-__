# -------------------
# Stage 1: Build
# -------------------
FROM node:16.15.0-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy the rest of the code
COPY . .

# -------------------
# Stage 2: Production
# -------------------
FROM node:16.15.0-alpine

# Set working directory
WORKDIR /app

# Copy built app from builder
COPY --from=builder /app /app

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5000

# Expose port
EXPOSE 5000

# Start the application
CMD ["node", "src/server.js"]
