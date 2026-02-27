import dotenv from "dotenv";
import app from "./src/app.js";
import initDatabase from "./src/database/init.js";
import seedDatabase from "./src/database/seed.js";
import logger from "./src/utils/logger.js";

dotenv.config();

const PORT = process.env.PORT || 3000;

const startServer = async () => {
    try {
        // Initialize database
        await initDatabase();
        logger.info("Database initialized");

        // Seed database (commented out after first run)
        // await seedDatabase();

        // Start server
        app.listen(PORT, () => {
            logger.info(`🚀 PayBaba API server running on http://localhost:${PORT}`);
            logger.info(`📊 Health check: http://localhost:${PORT}/health`);
            logger.info(`🔐 Auth endpoints: http://localhost:${PORT}/api/auth/*`);
            logger.info(`👤 Merchant endpoints: http://localhost:${PORT}/api/merchant/*`);
            logger.info(`💰 Transaction endpoints: http://localhost:${PORT}/api/transactions/*`);
        });
    } catch (error) {
        logger.error(`Failed to start server: ${error.message}`);
        process.exit(1);
    }
};

// Handle graceful shutdown
process.on("SIGTERM", () => {
    logger.info("SIGTERM signal received: closing HTTP server");
    process.exit(0);
});

process.on("SIGINT", () => {
    logger.info("SIGINT signal received: closing HTTP server");
    process.exit(0);
});

startServer();
