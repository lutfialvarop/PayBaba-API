// Jest configuration and setup
import sequelize from "../src/database/connection.js";
import logger from "../src/utils/logger.js";

// Set test environment
process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = "test-secret-key";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.OPENAI_API_KEY = "test-api-key";
process.env.BANK_API_KEY = "bank-secret-key-123";

// Suppress logs during tests
logger.silent = true;

// Global test timeout
jest.setTimeout(10000);

// Setup database before tests
beforeAll(async () => {
    try {
        await sequelize.authenticate();
        await sequelize.sync({ alter: true });
    } catch (error) {
        console.error("Database setup failed:", error);
        process.exit(1);
    }
});

// Cleanup after tests
afterAll(async () => {
    try {
        await sequelize.close();
    } catch (error) {
        console.error("Database cleanup failed:", error);
    }
});
