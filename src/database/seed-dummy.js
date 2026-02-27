import dotenv from "dotenv";
import Sequelize from "sequelize";
import User from "../models/User.js";
import Merchant from "../models/Merchant.js";
import DailyRevenue from "../models/DailyRevenue.js";
import Transaction from "../models/Transaction.js";
import CreditScore from "../models/CreditScore.js";
import bcryptjs from "bcryptjs";
import logger from "../utils/logger.js";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: "postgres",
    logging: false,
});

async function seedDummyData() {
    try {
        await sequelize.authenticate();
        logger.info("✅ Database connection established");

        // Sync database
        await sequelize.sync({ alter: false });
        logger.info("✅ Database models synced");

        // ═══════════════════════════════════════════════════════════
        // 1️⃣ CREATE DUMMY MERCHANT USER
        // ═══════════════════════════════════════════════════════════
        const merchantEmail = "dummy-merchant@example.com";
        const merchantPassword = "DummyPass123";

        // Check if merchant already exists
        const existingUser = await User.findOne({ where: { email: merchantEmail } });

        let user, merchant;

        if (existingUser) {
            logger.info("✅ Merchant user already exists");
            user = existingUser;
            merchant = await Merchant.findOne({ where: { userId: user.id } });
        } else {
            // Create new user
            const hashedPassword = await bcryptjs.hash(merchantPassword, 10);
            user = await User.create({
                id: uuidv4(),
                email: merchantEmail,
                passwordHash: hashedPassword,
                companyName: "PT Maju Jaya Retail",
                fullName: "Budi Santoso",
                city: "Jakarta",
                address: "Jl. Gatot Subroto No 123, Jakarta Pusat",
                phoneNumber: "081234567890",
                status: "Active",
                isEmailVerified: true,
            });

            logger.info(`✅ Created user: ${user.email}`);

            // Create merchant
            const merchantId = `MRC${Date.now()}`;
            merchant = await Merchant.create({
                merchantId,
                userId: user.id,
                businessCategory: "Retail",
                subCategory: "Clothing & Fashion",
                joinDate: new Date(),
                businessScale: "Small",
                taxId: "12.345.678.9-012.345",
                businessLicenseNumber: "BL2024001234",
            });

            logger.info(`✅ Created merchant: ${merchant.merchantId}`);
        }

        // Create dummy transactions for the last 30 days
        const today = new Date();
        const transactions = [];
        const dailyRevenues = [];

        for (let i = 30; i >= 0; i--) {
            const transactionDate = new Date(today);
            transactionDate.setDate(transactionDate.getDate() - i);

            // Generate 3-8 random transactions per day
            const txCount = Math.floor(Math.random() * 6) + 3;
            let dailyTotal = 0;
            let dailySuccessful = 0;
            let dailyFailed = 0;

            for (let j = 0; j < txCount; j++) {
                const amount = Math.floor(Math.random() * 5000000) + 100000; // 100k - 5.1M
                const status = Math.random() > 0.05 ? "Success" : "Failed";
                const paymentMethod = ["QRIS", "Virtual Account", "E-Wallet"].at(Math.floor(Math.random() * 3));

                const transaction = {
                    transactionId: `TXN${Date.now()}${Math.random().toString(36).substr(2, 9)}`,
                    merchantId: merchant.merchantId,
                    transactionDate,
                    amount,
                    paymentMethod,
                    paymentChannel: paymentMethod === "QRIS" ? "Direct" : "Bank",
                    status,
                    refundStatus: "None",
                    refundAmount: 0,
                    chargebackFlag: false,
                    settlementDate: status === "Success" ? transactionDate : null,
                    settlementTime: status === "Success" ? "14:30:00" : null,
                    feeAmount: (amount * 0.015).toFixed(2),
                    netAmount: (amount * 0.985).toFixed(2),
                    customerId: `CUST${Math.floor(Math.random() * 10000)}`,
                    metadata: {
                        orderId: `ORD${Math.floor(Math.random() * 100000)}`,
                        description: "Pembayaran transaksi toko online",
                    },
                    createdAt: transactionDate,
                    updatedAt: transactionDate,
                };

                transactions.push(transaction);

                if (status === "Success") {
                    dailyTotal += amount;
                    dailySuccessful++;
                } else {
                    dailyFailed++;
                }
            }

            // Create daily revenue record
            if (dailyTotal > 0) {
                dailyRevenues.push({
                    merchantId: merchant.merchantId,
                    transactionDate,
                    totalAmount: dailyTotal,
                    transactionCount: txCount,
                    successfulCount: dailySuccessful,
                    failedCount: dailyFailed,
                    refundedCount: 0,
                    refundAmount: 0,
                    createdAt: transactionDate,
                    updatedAt: transactionDate,
                });
            }
        }

        // Bulk insert transactions
        await Transaction.bulkCreate(transactions, { ignoreDuplicates: true });
        logger.info(`✅ Created ${transactions.length} transactions`);

        // Bulk insert daily revenues
        await DailyRevenue.bulkCreate(dailyRevenues, { ignoreDuplicates: true });
        logger.info(`✅ Created ${dailyRevenues.length} daily revenue records`);

        // Calculate and create credit score
        const totalRevenue = dailyRevenues.reduce((sum, r) => sum + r.totalAmount, 0);
        const avgMonthlyRevenue = totalRevenue / 30;
        const successfulTx = transactions.filter((t) => t.status === "Success").length;
        const failedTx = transactions.filter((t) => t.status === "Failed").length;
        const refundRate = failedTx > 0 ? (failedTx / (successfulTx + failedTx)) * 100 : 0;

        // Simple scoring algorithm
        const volumeScore = Math.round(Math.min(100, (successfulTx / 100) * 100));
        const consistencyScore = Math.round(75 + Math.random() * 15);
        const growthScore = Math.round(60 + Math.random() * 25);
        const refundScore = Math.round(Math.max(50, 100 - refundRate * 2));
        const settlementScore = Math.round(85 + Math.random() * 15);

        const creditScore = Math.round(volumeScore * 0.25 + consistencyScore * 0.25 + growthScore * 0.2 + refundScore * 0.1 + settlementScore * 0.2);

        const riskBand = creditScore >= 80 ? "Low" : creditScore >= 60 ? "Medium" : "High";
        const estimatedMinLimit = Math.round(avgMonthlyRevenue * 0.5);
        const estimatedMaxLimit = Math.round(avgMonthlyRevenue * 2);

        const existingScore = await CreditScore.findOne({
            where: { merchantId: merchant.merchantId },
        });

        if (!existingScore) {
            await CreditScore.create({
                merchantId: merchant.merchantId,
                calculationDate: new Date(),
                creditScore,
                riskBand,
                estimatedMinLimit,
                estimatedMaxLimit,
                transactionVolumeScore: volumeScore,
                revenueConsistencyScore: consistencyScore,
                growthTrendScore: growthScore,
                refundRateScore: refundScore,
                settlementTimeScore: settlementScore,
                avgMonthlyRevenue: Math.round(avgMonthlyRevenue),
                revenueVolatility: (Math.random() * 20 + 5).toFixed(2),
                growthPercentageMoM: (Math.random() * 15 - 5).toFixed(2),
                refundRatePercentage: refundRate.toFixed(2),
                avgSettlementDays: (1 + Math.random() * 2).toFixed(1),
                transactionCount3m: successfulTx,
                featureImportance: {
                    transactionVolume: 0.28,
                    revenueConsistency: 0.22,
                    growthTrend: 0.18,
                    refundRate: 0.12,
                    settlementTime: 0.2,
                },
                qwenExplanation: `Skor kredit Anda mencapai ${creditScore} berdasarkan analisis ${successfulTx} transaksi sukses dalam 30 hari terakhir dengan rata-rata revenue ${Math.round(avgMonthlyRevenue).toLocaleString("id-ID")} per bulan.`,
                qwenRecommendation: `Tingkatkan konsistensi transaksi harian dan pertahankan refund rate di bawah 5% untuk meningkatkan peluang persetujuan pinjaman.`,
            });

            logger.info(`✅ Created credit score: ${creditScore} (${riskBand})`);
        }

        // ═══════════════════════════════════════════════════════════
        // 2️⃣ CREATE DUMMY BANK USERS
        // ═══════════════════════════════════════════════════════════

        const bankUsers = [
            {
                email: "bank1@bca.com",
                password: "BankPass123",
                companyName: "PT Bank Central Asia",
                fullName: "Dina Kusuma",
                city: "Jakarta",
                address: "Jl. Jend. Sudirman No 789, Jakarta Selatan",
                phoneNumber: "081555666777",
            },
            {
                email: "bank2@mandiri.com",
                password: "BankPass123",
                companyName: "PT Bank Mandiri",
                fullName: "Rudi Hermawan",
                city: "Jakarta",
                address: "Jl. Jend. Gatot Subroto No 36-38, Jakarta Selatan",
                phoneNumber: "081666777888",
            },
            {
                email: "bank3@bni.com",
                password: "BankPass123",
                companyName: "PT Bank BNI",
                fullName: "Siti Nurhaliza",
                city: "Jakarta",
                address: "Jl. Sudirman Kav No 7, Jakarta Pusat",
                phoneNumber: "081777888999",
            },
        ];

        for (const bankData of bankUsers) {
            const existingBank = await User.findOne({ where: { email: bankData.email } });

            if (!existingBank) {
                const hashedPassword = await bcryptjs.hash(bankData.password, 10);
                await User.create({
                    id: uuidv4(),
                    email: bankData.email,
                    passwordHash: hashedPassword,
                    companyName: bankData.companyName,
                    fullName: bankData.fullName,
                    city: bankData.city,
                    address: bankData.address,
                    phoneNumber: bankData.phoneNumber,
                    status: "Active",
                    isEmailVerified: true,
                });
                logger.info(`✅ Created bank user: ${bankData.email}`);
            } else {
                logger.info(`✅ Bank user already exists: ${bankData.email}`);
            }
        }

        logger.info(`
╔════════════════════════════════════════════════════════════╗
║          🎉 DUMMY DATA CREATED SUCCESSFULLY 🎉            ║
╠════════════════════════════════════════════════════════════╣
║ MERCHANT INFORMATION:                                      ║
║  Email: ${merchantEmail}
║  Password: ${merchantPassword}
║  Company: ${user.companyName}
║  Merchant ID: ${merchant.merchantId}
║  Business: ${merchant.businessCategory} / ${merchant.subCategory}
║  Scale: ${merchant.businessScale}
╠════════════════════════════════════════════════════════════╣
║ FINANCIAL DATA:                                            ║
║  Transactions (30 days): ${transactions.length}
║  Successful: ${successfulTx}
║  Failed: ${failedTx}
║  Total Revenue: ${totalRevenue.toLocaleString("id-ID")}
║  Avg Monthly: ${Math.round(avgMonthlyRevenue).toLocaleString("id-ID")}
║  Credit Score: ${creditScore} (${riskBand})
║  Loan Limit: ${estimatedMinLimit.toLocaleString("id-ID")} - ${estimatedMaxLimit.toLocaleString("id-ID")}
╠════════════════════════════════════════════════════════════╣
║ BANK PORTAL USERS:                                         ║
║  1. bank1@bca.com / BankPass123 (BCA)
║  2. bank2@mandiri.com / BankPass123 (Mandiri)
║  3. bank3@bni.com / BankPass123 (BNI)
╠════════════════════════════════════════════════════════════╣
║ NEXT STEPS:                                                ║
║ 1. Merchant: Login dengan email: ${merchantEmail}
║    Password: ${merchantPassword}
║ 2. Bank Portal: Login dengan email bank (lihat atas)
║    Password: BankPass123
║ 3. Akses dashboard dan lihat merchant data
║ 4. Cek transaksi, credit score, dan alerts
║ 5. Test loan application workflow
╚════════════════════════════════════════════════════════════╝
        `);
    } catch (error) {
        logger.error(`❌ Error seeding dummy data: ${error.message}`);
        console.error(error);
    } finally {
        await sequelize.close();
        logger.info("Database connection closed");
    }
}

// Run seeder
seedDummyData();
