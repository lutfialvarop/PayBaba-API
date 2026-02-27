import swaggerJsdoc from "swagger-jsdoc";
import dotenv from "dotenv";

dotenv.config();

// Get base URL from environment variable, fallback to localhost for development
const baseUrl = process.env.BASE_URL || "http://localhost:3000";

const options = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "PayBaba API Documentation",
            version: "1.0.0",
            description: "Merchant Credit Intelligence System with AI-Powered Scoring & Early Warning",
            contact: {
                name: "PayBab Team",
                email: "support@paybaba.id",
            },
            license: {
                name: "MIT",
            },
        },
        servers: [
            {
                url: baseUrl,
                description: process.env.NODE_ENV === "production" ? "Production Server" : "Development Server",
            },
        ],
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
            schemas: {
                User: {
                    type: "object",
                    properties: {
                        id: { type: "string", format: "uuid" },
                        email: { type: "string", format: "email" },
                        companyName: { type: "string" },
                        fullName: { type: "string" },
                        city: { type: "string" },
                        address: { type: "string" },
                        phoneNumber: { type: "string" },
                        status: { type: "string", enum: ["Active", "Inactive", "Suspended"] },
                    },
                },
                Merchant: {
                    type: "object",
                    properties: {
                        merchantId: { type: "string" },
                        userId: { type: "string", format: "uuid" },
                        businessCategory: { type: "string" },
                        businessScale: { type: "string", enum: ["Micro", "Small", "Medium", "Large"] },
                        joinDate: { type: "string", format: "date-time" },
                    },
                },
                CreditScore: {
                    type: "object",
                    properties: {
                        id: { type: "string", format: "uuid" },
                        merchantId: { type: "string" },
                        creditScore: { type: "integer", minimum: 0, maximum: 100 },
                        riskBand: { type: "string", enum: ["Low", "Medium", "High"] },
                        estimatedMinLimit: { type: "number" },
                        estimatedMaxLimit: { type: "number" },
                        calculationDate: { type: "string", format: "date-time" },
                    },
                },
                Error: {
                    type: "object",
                    properties: {
                        success: { type: "boolean" },
                        message: { type: "string" },
                        errors: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    field: { type: "string" },
                                    message: { type: "string" },
                                },
                            },
                        },
                    },
                },
            },
        },
    },
    apis: ["./src/routes/auth.js", "./src/routes/merchant.js", "./src/routes/transaction.js", "./src/routes/bank.js"],
};

export const swaggerSpec = swaggerJsdoc(options);
