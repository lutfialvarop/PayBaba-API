import sequelize from "../database/connection.js";
import User from "../models/User.js";
import Merchant from "../models/Merchant.js";
import bcrypt from "bcryptjs";
import logger from "../utils/logger.js";

const seedDatabase = async () => {
    try {
        logger.info("Starting database seed...");

        // Check if data already exists
        const existingUser = await User.findOne({ where: { email: "demo@example.com" } });
        if (existingUser) {
            logger.info("Database already seeded");
            return;
        }

        // Create demo merchant 1
        const user1 = await User.create({
            email: "warung.budi@email.com",
            passwordHash: await bcrypt.hash("password123", 10),
            companyName: "Warung Budi",
            fullName: "Budi Rahman",
            city: "Jakarta",
            address: "Jl. Merdeka No. 123",
            phoneNumber: "081234567890",
            isEmailVerified: true,
        });

        const merchant1 = await Merchant.create({
            merchantId: "M1702000001",
            userId: user1.id,
            businessCategory: "Makanan & Minuman",
            subCategory: "Warung Makan",
            businessScale: "Micro",
        });

        logger.info(`Created merchant 1: ${merchant1.merchantId}`);

        // Create demo merchant 2
        const user2 = await User.create({
            email: "toko.sari@email.com",
            passwordHash: await bcrypt.hash("password123", 10),
            companyName: "Toko Sari",
            fullName: "Sari Dewi",
            city: "Bandung",
            address: "Jl. Raya Bandung No. 456",
            phoneNumber: "082345678901",
            isEmailVerified: true,
        });

        const merchant2 = await Merchant.create({
            merchantId: "M1702000002",
            userId: user2.id,
            businessCategory: "Fashion",
            subCategory: "Toko Pakaian",
            businessScale: "Small",
        });

        logger.info(`Created merchant 2: ${merchant2.merchantId}`);

        // Create demo merchant 3
        const user3 = await User.create({
            email: "ayam.geprek@email.com",
            passwordHash: await bcrypt.hash("password123", 10),
            companyName: "Ayam Geprek House",
            fullName: "Ahmad Wijaya",
            city: "Surabaya",
            address: "Jl. Veteran No. 789",
            phoneNumber: "083456789012",
            isEmailVerified: true,
        });

        const merchant3 = await Merchant.create({
            merchantId: "M1702000003",
            userId: user3.id,
            businessCategory: "Makanan & Minuman",
            subCategory: "Restoran",
            businessScale: "Small",
        });

        logger.info(`Created merchant 3: ${merchant3.merchantId}`);

        logger.info("Database seed completed successfully");
    } catch (error) {
        logger.error(`Seed error: ${error.message}`);
        throw error;
    }
};

export default seedDatabase;
