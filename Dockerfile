# ═══════════════════════════════════════════════════════════
# PayBab API - Production Dockerfile
# Optimized for Docker Swarm deployment
# ═══════════════════════════════════════════════════════════

# Use lightweight Node.js image
FROM node:18-alpine

# Set working directory inside container
WORKDIR /app

# Copy package files first (for faster builds)
COPY package*.json ./

# Install production dependencies only
RUN npm install --production && npm cache clean --force

# Copy entire application code
COPY . .

# Expose port 3000
EXPOSE 3000

# Install curl for health checks
RUN apk add --no-cache curl

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start application
CMD ["npm", "start"]
