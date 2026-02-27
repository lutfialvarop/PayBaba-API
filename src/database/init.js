import sequelize from "../database/connection.js";
import User from "../models/User.js";
import Merchant from "../models/Merchant.js";
import Transaction from "../models/Transaction.js";
import CreditScore from "../models/CreditScore.js";
import DailyRevenue from "../models/DailyRevenue.js";
import LoanApplication from "../models/LoanApplication.js";
import EarlyWarningAlert from "../models/EarlyWarningAlert.js";
import logger from "../utils/logger.js";

export const initDatabase = async () => {
    try {
        logger.info("Initializing database...");

        // Authenticate connection
        await sequelize.authenticate();
        logger.info("Database connection established");

        // Sync all models
        await sequelize.sync({ alter: process.env.NODE_ENV === "development" });
        logger.info("Database models synced");

        return sequelize;
    } catch (error) {
        logger.error(`Database initialization error: ${error.message}`);
        throw error;
    }
};

export default initDatabase;
