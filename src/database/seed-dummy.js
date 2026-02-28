import dotenv from "dotenv";
import sequelize from "../database/connection.js";
import User from "../models/User.js";
import Merchant from "../models/Merchant.js";
import DailyRevenue from "../models/DailyRevenue.js";
import Transaction from "../models/Transaction.js";
import CreditScore from "../models/CreditScore.js";
import bcryptjs from "bcryptjs";
import logger from "../utils/logger.js";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

const PRODUCT_CATALOG = {
    Medium: [
        { name: "Smartphone X1 Pro", sku: "ELC-001", category: "Electronics", unitPrice: 3500000 },
        { name: "Wireless Earbuds G2", sku: "ELC-002", category: "Electronics", unitPrice: 850000 },
        { name: "Smartwatch Series 5", sku: "ELC-003", category: "Electronics", unitPrice: 1200000 },
        { name: "Mechanical Keyboard RGB", sku: "ELC-004", category: "Electronics", unitPrice: 650000 },
    ],
    Small: [
        { name: "Cafe Latte Large", sku: "BEV-001", category: "Beverage", unitPrice: 35000 },
        { name: "Caramel Macchiato", sku: "BEV-002", category: "Beverage", unitPrice: 42000 },
        { name: "Almond Croissant", sku: "FOD-001", category: "Food", unitPrice: 28000 },
        { name: "Beef Lasagna", sku: "FOD-002", category: "Food", unitPrice: 55000 },
    ],
    Micro: [
        { name: "Kopi Hitam Tubruk", sku: "WRG-001", category: "Beverage", unitPrice: 5000 },
        { name: "Nasi Goreng Telur", sku: "WRG-002", category: "Food", unitPrice: 15000 },
        { name: "Mie Instan Rebus + Telur", sku: "WRG-003", category: "Food", unitPrice: 12000 },
        { name: "Gorengan Tempe (Isi 5)", sku: "WRG-004", category: "Snack", unitPrice: 10000 },
    ],
};

/**
 * MERCHANT CONFIG
 * A = Ratusan juta
 * B = Puluhan juta
 * C = Belasan juta
 *
 * Avg Monthly Revenue approx:
 * A ≈ 22–28 tx × 500–650k × 0.97 × 30 ≈ 350–450 jt
 * B ≈ 9–11 tx × 130–180k × 0.92 × 30 ≈ 40–70 jt
 * C ≈ 3–5 tx × 80–100k × 0.85 × 30 ≈ 9–14 jt
 */
const MERCHANTS = [
    {
        email: "merchant.a@example.com",
        companyName: "PT Mega Jaya Commerce",
        scale: "Medium",
        txPerDay: [22, 28],
        amount: [500000, 650000],
        successRate: 0.97,
    },
    {
        email: "merchant.b@example.com",
        companyName: "CV Maju Bersama",
        scale: "Small",
        txPerDay: [9, 11],
        amount: [130000, 180000],
        successRate: 0.92,
    },
    {
        email: "merchant.c@example.com",
        companyName: "UD Sederhana",
        scale: "Micro",
        txPerDay: [3, 5],
        amount: [80000, 100000],
        successRate: 0.85,
    },
];

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

async function seedDummyData() {
    try {
        await sequelize.authenticate();
        logger.info("✅ Database connection established");

        logger.info("🔄 Syncing database models...");
        await sequelize.sync({ force: true }); // force: true to recreate all tables
        logger.info("✅ Database schema created");

        const today = new Date();

        // ═══════════════════════════════════════════════════════════
        // 1️⃣ CREATE 3 MERCHANTS
        // ═══════════════════════════════════════════════════════════
        for (const cfg of MERCHANTS) {
            const password = "DummyPass123";

            let user = await User.findOne({ where: { email: cfg.email } });
            let merchant;

            if (!user) {
                user = await User.create({
                    id: uuidv4(),
                    email: cfg.email,
                    passwordHash: await bcryptjs.hash(password, 10),
                    companyName: cfg.companyName,
                    fullName: "Owner",
                    city: "Jakarta",
                    address: "Jl. Dummy No. 1",
                    phoneNumber: "081234567890",
                    status: "Active",
                    isEmailVerified: true,
                });
            }

            merchant = await Merchant.findOne({ where: { userId: user.id } });
            if (!merchant) {
                merchant = await Merchant.create({
                    merchantId: `MRC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                    userId: user.id,
                    businessCategory: "Retail",
                    subCategory: "General",
                    businessScale: cfg.scale,
                    joinDate: new Date(),
                });
            }

            await Transaction.destroy({ where: { merchantId: merchant.merchantId } });
            await DailyRevenue.destroy({ where: { merchantId: merchant.merchantId } });
            await CreditScore.destroy({ where: { merchantId: merchant.merchantId } });

            let totalRevenue = 0;
            let successTx = 0;
            let failedTx = 0;

            for (let i = 30; i >= 0; i--) {
                const date = new Date(today);
                date.setDate(today.getDate() - i);

                const txCount = rand(cfg.txPerDay[0], cfg.txPerDay[1]);
                let dailyTotal = 0;
                let dailySuccess = 0;
                let dailyFail = 0;

                for (let j = 0; j < txCount; j++) {
                    const isSuccess = Math.random() < cfg.successRate;

                    // 1. Pilih produk dari katalog berdasarkan skala merchant
                    const catalog = PRODUCT_CATALOG[cfg.scale];
                    const product = catalog[rand(0, catalog.length - 1)];

                    // 2. Tentukan jumlah pembelian (misal 1 sampai 5 barang)
                    const quantity = rand(1, 5);

                    // 3. HITUNG TOTAL HARGA (Sangat Penting: Grand Total harus sinkron)
                    // Harga per item dikali jumlah item
                    const calculatedTotal = product.unitPrice * quantity;

                    // Jika transaksi gagal, amount tetap 0, tapi info barang tetap ada di metadata
                    const finalAmount = isSuccess ? calculatedTotal : 0;

                    await Transaction.create({
                        transactionId: `TXN-${uuidv4()}`,
                        merchantId: merchant.merchantId,
                        transactionDate: date,
                        amount: finalAmount, // Ini adalah Grand Total transaksi
                        paymentMethod: "QRIS",
                        status: isSuccess ? "Success" : "Failed",
                        metadata: {
                            description: `Pembayaran ${quantity}x ${product.name}`,
                            productInfo: {
                                sku: product.sku,
                                name: product.name,
                                category: product.category,
                                quantity: quantity,
                                unitPrice: product.unitPrice, // Harga satuan
                                totalPrice: calculatedTotal, // Total harga barang (Quantity * unitPrice)
                                details: `${product.name} - ${quantity} pcs`,
                            },
                        },
                        createdAt: date,
                        updatedAt: date,
                    });

                    if (isSuccess) {
                        dailyTotal += finalAmount;
                        dailySuccess++;
                        successTx++;
                    } else {
                        dailyFail++;
                        failedTx++;
                    }
                }

                if (dailyTotal > 0) {
                    totalRevenue += dailyTotal;
                    await DailyRevenue.create({
                        merchantId: merchant.merchantId,
                        transactionDate: date,
                        totalAmount: dailyTotal,
                        transactionCount: txCount,
                        successfulCount: dailySuccess,
                        failedCount: dailyFail,
                    });
                }
            }

            const avgMonthlyRevenue = totalRevenue / 30;
            const refundRate = failedTx / (successTx + failedTx);

            const creditScore = Math.round((successTx / (successTx + failedTx)) * 60 + (avgMonthlyRevenue > 300_000_000 ? 25 : avgMonthlyRevenue > 50_000_000 ? 15 : 5));

            const riskBand = creditScore >= 80 ? "Low" : creditScore >= 60 ? "Medium" : "High";

            await CreditScore.create({
                merchantId: merchant.merchantId,
                calculationDate: new Date(),
                creditScore,
                riskBand,
                estimatedMinLimit: 50000000,
                estimatedMaxLimit: Math.round(avgMonthlyRevenue * 1.5),
                transactionVolumeScore: Math.round((successTx / (successTx + failedTx)) * 100),
                revenueConsistencyScore: cfg.scale === "Medium" ? 85 : cfg.scale === "Small" ? 70 : 55,
                growthTrendScore: cfg.scale === "Medium" ? 75 : cfg.scale === "Small" ? 60 : 45,
                refundRateScore: Math.round(100 - refundRate * 100),
                settlementTimeScore: cfg.scale === "Medium" ? 80 : 70,
                avgMonthlyRevenue: Math.round(avgMonthlyRevenue),
                revenueVolatility: Math.random() * 50,
                growthPercentageMoM: (Math.random() - 0.5) * 20,
                refundRatePercentage: Math.round(refundRate * 100),
                avgSettlementDays: cfg.scale === "Medium" ? 2 : cfg.scale === "Small" ? 3 : 5,
                transactionCount3m: successTx + failedTx,
            });

            logger.info(`✅ Merchant seeded: ${cfg.companyName} | Avg Monthly: Rp ${Math.round(avgMonthlyRevenue).toLocaleString("id-ID")} | Score: ${creditScore} (${riskBand})`);
        }

        // ═══════════════════════════════════════════════════════════
        // 2️⃣ CREATE DUMMY BANK USERS (UNCHANGED)
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
                await User.create({
                    id: uuidv4(),
                    email: bankData.email,
                    passwordHash: await bcryptjs.hash(bankData.password, 10),
                    companyName: bankData.companyName,
                    fullName: bankData.fullName,
                    city: bankData.city,
                    address: bankData.address,
                    phoneNumber: bankData.phoneNumber,
                    status: "Active",
                    isEmailVerified: true,
                });
            }
        }

        logger.info("🎉 Dummy merchant + bank data created successfully");
    } catch (error) {
        logger.error(`❌ Seed error: ${error.message}`);
    } finally {
        await sequelize.close();
    }
}

seedDummyData();
