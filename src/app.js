import express from "express";
import cors from "cors";
import helmet from "helmet";
import "express-async-errors";
import dotenv from "dotenv";
import swaggerUi from "swagger-ui-express";

import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import authRoutes from "./routes/auth.js";
import merchantRoutes from "./routes/merchant.js";
import transactionRoutes from "./routes/transaction.js";
import bankRoutes from "./routes/bank.js";
import logger from "./utils/logger.js";
import { swaggerSpec } from "./config/swagger.js";

dotenv.config();

const app = express();

// CORS Configuration - Allow frontend development and production
const corsOptions = {
    origin:
        process.env.NODE_ENV === "production"
            ? ["https://paybaba.id", "https://www.paybaba.id", process.env.FRONTEND_URL || "https://app.paybaba.id"]
            : [
                  "http://localhost:3000",
                  "http://localhost:3001",
                  "http://localhost:3002",
                  "http://127.0.0.1:3000",
                  "http://127.0.0.1:3001",
                  "http://127.0.0.1:3002",
                  "http://localhost:8080",
                  "http://localhost:5173", // Vite
                  "http://localhost:5174", // Vite
                  "*", // Allow all in development
              ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    maxAge: 86400, // 24 hours
};

// Helmet Configuration - Allow API calls from Swagger UI
const helmetOptions = {
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            connectSrc: process.env.NODE_ENV === "production" ? ["'self'", "https://api.paybaba.id"] : ["'self'", "http://localhost:3000", "http://127.0.0.1:3000", "*"], // Allow all in development
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            fontSrc: ["'self'", "data:"],
        },
    },
};

// Middleware
app.use(helmet(helmetOptions));
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`);
    next();
});

// Health check
app.get("/health", (req, res) => {
    res.json({
        success: true,
        message: "PayBaba API is running",
        timestamp: new Date().toISOString(),
    });
});

// Swagger Documentation
app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
        swaggerOptions: {
            url: "/api-docs/swagger.json",
        },
    }),
);

app.get("/api-docs/swagger.json", (req, res) => {
    try {
        // Fallback OpenAPI spec for test environment where swagger-jsdoc may not parse route files
        const fallbackSpec = {
            openapi: "3.0.0",
            info: {
                title: "PayBaba API Documentation",
                version: "1.0.0",
                description: "Merchant Credit Intelligence System with AI-Powered Scoring & Early Warning",
                contact: {
                    name: "PayBab Team",
                    email: "support@paybaba.id",
                },
            },
            servers: [
                {
                    url: process.env.BASE_URL || "http://localhost:3000",
                    description: process.env.NODE_ENV === "production" ? "Production Server" : "Development Server",
                },
            ],
            paths: {
                "/health": { get: {} },
                "/api-docs": { get: {} },
                "/api-docs/swagger.json": { get: {} },
            },
            components: {
                securitySchemes: {
                    BearerAuth: {
                        type: "http",
                        scheme: "bearer",
                        bearerFormat: "JWT",
                    },
                    ApiKeyAuth: {
                        type: "apiKey",
                        in: "header",
                        name: "X-API-Key",
                    },
                },
            },
        };

        // Check if swaggerSpec has valid OpenAPI structure
        const isValidSpec = swaggerSpec && typeof swaggerSpec === "object" && (swaggerSpec.openapi || swaggerSpec.swagger) && Object.keys(swaggerSpec).length > 2;
        const spec = isValidSpec ? swaggerSpec : fallbackSpec;

        res.setHeader("Content-Type", "application/json");
        return res.json(spec);
    } catch (error) {
        logger.error(`Swagger spec error: ${error.message}`);
        return res.status(500).json({ error: "Failed to get swagger spec" });
    }
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/merchant", merchantRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/bank", bankRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
