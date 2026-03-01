import dotenv from "dotenv";
import sequelize from "../database/connection.js";
import User from "../models/User.js";
import Merchant from "../models/Merchant.js";
import DailyRevenue from "../models/DailyRevenue.js";
import Transaction from "../models/Transaction.js";
import CreditScore from "../models/CreditScore.js";
import EarlyWarningAlert from "../models/EarlyWarningAlert.js";
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
 * A = Ratusan juta  → Score tinggi (Low risk)
 * B = Puluhan juta  → Score menengah (Medium risk)
 * C = Belasan juta  → Score rendah (High risk)
 */
const MERCHANTS = [
    {
        email: "merchant.a@example.com",
        companyName: "PT Mega Jaya Commerce",
        scale: "Medium",
        txPerDay: [22, 28],
        amount: [500000, 650000],
        successRate: 0.97,
        // Historical score trend (6 bulan ke belakang) — untuk grafik dashboard
        scoreTrend: [72, 75, 79, 82, 85, 88],
        riskTrend: ["Medium", "Medium", "Low", "Low", "Low", "Low"],
        // AI explanation yang akan disimpan di baris terbaru
        aiExplanation: `Skor kredit Anda mencapai 88/100 dengan kategori Low Risk. Merchant ini menunjukkan performa transaksi yang sangat solid dengan volume tinggi dan konsistensi revenue yang baik selama 3 bulan terakhir. Rata-rata pendapatan bulanan mencapai ratusan juta rupiah dengan volatilitas yang terkendali, mencerminkan bisnis yang stabil dan berkembang.`,
        aiRecommendation: `Pertahankan konsistensi volume transaksi dan terus diversifikasi produk unggulan seperti Smartphone X1 Pro yang menjadi kontributor utama revenue. Untuk meningkatkan skor lebih lanjut, pertimbangkan untuk mempercepat proses settlement agar rata-rata hari settlement dapat turun di bawah 2 hari.`,
        // Alert — merchant A tidak punya alert aktif (performa bagus)
        alerts: [],
    },
    {
        email: "merchant.b@example.com",
        companyName: "CV Maju Bersama",
        scale: "Small",
        txPerDay: [9, 11],
        amount: [130000, 180000],
        successRate: 0.92,
        // Score naik-turun — medium risk, ada sedikit volatilitas
        scoreTrend: [58, 61, 65, 62, 67, 70],
        riskTrend: ["High", "Medium", "Medium", "Medium", "Medium", "Medium"],
        aiExplanation: `Skor kredit Anda mencapai 70/100 dengan kategori Medium Risk. Data transaksi menunjukkan pertumbuhan yang positif dalam 3 bulan terakhir, meskipun terdapat fluktuasi revenue yang cukup terlihat terutama di akhir bulan. Volume transaksi harian rata-rata 10 transaksi dengan tingkat keberhasilan 92% mencerminkan operasional yang cukup stabil.`,
        aiRecommendation: `Fokus pada peningkatan konsistensi penjualan di hari-hari weekday yang cenderung lebih rendah. Pertimbangkan program loyalitas pelanggan untuk menstabilkan revenue harian. Menjaga refund rate di bawah 5% akan secara signifikan meningkatkan komponen Transaction Risk dan mendorong skor ke kategori Low Risk.`,
        // Alert — ada 1 revenue drop yang aktif
        alerts: [
            {
                alertType: "Revenue Drop",
                severity: "Medium",
                metricName: "Daily Revenue",
                metricValue: 950000,
                thresholdValue: 1350000,
                deviationPercentage: 29.63,
                description: "Revenue rata-rata turun 29.6% dalam 10 hari terakhir dibanding periode sebelumnya",
                qwenAnalysis:
                    "Terjadi penurunan pendapatan harian yang signifikan dalam 10 hari terakhir, kemungkinan disebabkan oleh penurunan traffic pelanggan. Disarankan untuk melakukan evaluasi strategi promosi dan memantau kompetitor di area sekitar untuk memahami perubahan pola konsumen.",
                isResolved: false,
                status: "Active",
            },
        ],
    },
    {
        email: "merchant.c@example.com",
        companyName: "UD Sederhana",
        scale: "Micro",
        txPerDay: [3, 5],
        amount: [80000, 100000],
        successRate: 0.85,
        // Score rendah dan sempat turun — high risk
        scoreTrend: [40, 38, 42, 45, 43, 47],
        riskTrend: ["High", "High", "High", "High", "High", "High"],
        aiExplanation: `Skor kredit Anda mencapai 47/100 dengan kategori High Risk. Data transaksi menunjukkan volume yang masih terbatas dengan rata-rata 4 transaksi per hari dan tingkat keberhasilan 85%. Fluktuasi pendapatan harian yang tinggi dan waktu settlement yang relatif panjang (rata-rata 5 hari) menjadi faktor pemberat utama pada skor saat ini.`,
        aiRecommendation: `Langkah prioritas untuk meningkatkan skor adalah dengan menjaga konsistensi transaksi harian tanpa jeda lebih dari 2 hari. Upayakan peningkatan volume transaksi secara bertahap — bahkan penambahan 2-3 transaksi per hari dapat memberikan dampak signifikan pada komponen Transaction Volume Score. Pantau dan minimalisir transaksi yang gagal untuk menekan refund rate.`,
        // Alert — ada multiple alerts aktif (performa buruk)
        alerts: [
            {
                alertType: "Transaction Drop",
                severity: "Critical",
                metricName: "Transaction Count",
                metricValue: 2.1,
                thresholdValue: 3.375,
                deviationPercentage: 37.78,
                description: "Jumlah transaksi turun 37.8% dalam 10 hari terakhir",
                qwenAnalysis:
                    "Penurunan jumlah transaksi yang signifikan terdeteksi dalam periode 10 hari terakhir. Pola ini dapat mengindikasikan berkurangnya traffic pelanggan atau adanya gangguan operasional. Disarankan untuk segera mengevaluasi ketersediaan stok produk utama dan memastikan sistem pembayaran berjalan normal.",
                isResolved: false,
                status: "Active",
            },
            {
                alertType: "Settlement Delay",
                severity: "Medium",
                metricName: "Settlement Days",
                metricValue: 5.2,
                thresholdValue: 3.0,
                deviationPercentage: 73.33,
                description: "Rata-rata waktu settlement 5.2 hari, melebihi threshold 3 hari",
                qwenAnalysis:
                    "Waktu penyelesaian transaksi melebihi standar yang diharapkan. Settlement yang lebih lambat dapat mempengaruhi arus kas operasional bisnis. Disarankan untuk berkoordinasi dengan payment processor untuk memastikan tidak ada hambatan teknis dalam proses settlement.",
                isResolved: false,
                status: "Active",
            },
            {
                alertType: "Score Drop",
                severity: "Low",
                metricName: "Credit Score",
                metricValue: 43,
                thresholdValue: 45,
                deviationPercentage: 4.44,
                description: "Credit score turun 2 poin dari 45 menjadi 43",
                qwenAnalysis:
                    "Terjadi penurunan kecil pada credit score akibat penurunan konsistensi transaksi minggu lalu. Meskipun penurunan ini belum signifikan, perlu diwaspadai agar tidak berlanjut. Fokus pada peningkatan volume dan konsistensi transaksi harian untuk menstabilkan skor.",
                isResolved: false,
                status: "Active",
            },
        ],
    },
];

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * Generate historical credit score records untuk grafik dashboard
 * Menghasilkan 6 data point (bulanan, 6 bulan ke belakang)
 */
function buildHistoricalScores(merchantId, cfg, avgMonthlyRevenue, successTx, failedTx, refundRate) {
    const scores = [];
    const now = new Date();

    for (let monthOffset = 5; monthOffset >= 0; monthOffset--) {
        const scoreIndex = 5 - monthOffset; // 0 = paling lama, 5 = terbaru
        const creditScore = cfg.scoreTrend[scoreIndex];
        const riskBand = cfg.riskTrend[scoreIndex];

        const calcDate = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);

        // Variasikan metrics sedikit per bulan biar terlihat natural
        const volumeVariance = rand(-5, 5);
        const consistencyVariance = rand(-8, 8);

        // AI explanation hanya untuk record terbaru (monthOffset === 0)
        const isLatest = monthOffset === 0;

        scores.push({
            merchantId,
            calculationDate: calcDate,
            creditScore,
            riskBand,
            estimatedMinLimit: Math.round(avgMonthlyRevenue * 0.8),
            estimatedMaxLimit: Math.round(avgMonthlyRevenue * 1.5),
            transactionVolumeScore: Math.min(100, Math.round((successTx / (successTx + failedTx)) * 100) + volumeVariance),
            revenueConsistencyScore: Math.min(100, Math.max(0, (cfg.scale === "Medium" ? 85 : cfg.scale === "Small" ? 70 : 55) + consistencyVariance)),
            growthTrendScore: cfg.scale === "Medium" ? rand(70, 80) : cfg.scale === "Small" ? rand(55, 70) : rand(40, 55),
            refundRateScore: Math.min(100, Math.round(100 - refundRate * 100) + rand(-3, 3)),
            settlementTimeScore: cfg.scale === "Medium" ? rand(75, 85) : cfg.scale === "Small" ? rand(65, 75) : rand(50, 65),
            avgMonthlyRevenue: Math.round(avgMonthlyRevenue * (0.9 + Math.random() * 0.2)),
            revenueVolatility: parseFloat((Math.random() * 50).toFixed(2)),
            growthPercentageMoM: parseFloat(((Math.random() - 0.5) * 20).toFixed(2)),
            refundRatePercentage: parseFloat((refundRate * 100).toFixed(2)),
            avgSettlementDays: cfg.scale === "Medium" ? 2.0 : cfg.scale === "Small" ? 3.0 : 5.0,
            transactionCount3m: successTx + failedTx,
            featureImportance: {
                transactionVolume: 0.25,
                revenueConsistency: 0.25,
                growthTrend: 0.2,
                refundRate: 0.1,
                settlementTime: 0.2,
            },
            // ✅ AI explanation & recommendation hanya di record terbaru
            qwenExplanation: isLatest ? cfg.aiExplanation : null,
            qwenRecommendation: isLatest ? cfg.aiRecommendation : null,
        });
    }

    return scores;
}

async function seedDummyData() {
    try {
        await sequelize.authenticate();
        logger.info("✅ Database connection established");

        logger.info("🔄 Syncing database models...");
        await sequelize.sync({ force: true });
        logger.info("✅ Database schema created");

        const today = new Date();

        // ═══════════════════════════════════════════════════════════
        // 1️⃣ CREATE 3 MERCHANTS + TRANSACTIONS + REVENUE
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
            await EarlyWarningAlert.destroy({ where: { merchantId: merchant.merchantId } });

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
                    const catalog = PRODUCT_CATALOG[cfg.scale];
                    const product = catalog[rand(0, catalog.length - 1)];
                    const quantity = rand(1, 5);
                    const calculatedTotal = product.unitPrice * quantity;
                    const finalAmount = isSuccess ? calculatedTotal : 0;

                    await Transaction.create({
                        transactionId: `TXN-${uuidv4()}`,
                        merchantId: merchant.merchantId,
                        transactionDate: date,
                        amount: finalAmount,
                        paymentMethod: "QRIS",
                        status: isSuccess ? "Success" : "Failed",
                        metadata: {
                            description: `Pembayaran ${quantity}x ${product.name}`,
                            productInfo: [
                                {
                                    id: product.sku,
                                    name: product.name,
                                    category: product.category,
                                    quantity: quantity,
                                    unitPrice: product.unitPrice,
                                    totalPrice: calculatedTotal,
                                },
                            ],
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

            // ═══════════════════════════════════════════════════════════
            // 2️⃣ CREATE HISTORICAL CREDIT SCORES (6 BULAN)
            //    → untuk grafik dashboard + record terbaru dengan AI explanation
            // ═══════════════════════════════════════════════════════════
            const historicalScores = buildHistoricalScores(merchant.merchantId, cfg, avgMonthlyRevenue, successTx, failedTx, refundRate);

            for (const scoreData of historicalScores) {
                await CreditScore.create(scoreData);
            }

            const latestScore = cfg.scoreTrend[cfg.scoreTrend.length - 1];
            const latestRisk = cfg.riskTrend[cfg.riskTrend.length - 1];

            logger.info(`✅ Merchant seeded: ${cfg.companyName} | ` + `Avg Monthly: Rp ${Math.round(avgMonthlyRevenue).toLocaleString("id-ID")} | ` + `Score: ${latestScore} (${latestRisk}) | ` + `History: ${cfg.scoreTrend.join(" → ")}`);

            // ═══════════════════════════════════════════════════════════
            // 3️⃣ CREATE EARLY WARNING ALERTS
            // ═══════════════════════════════════════════════════════════
            if (cfg.alerts.length > 0) {
                for (const alert of cfg.alerts) {
                    await EarlyWarningAlert.create({
                        id: uuidv4(),
                        merchantId: merchant.merchantId,
                        alertType: alert.alertType,
                        severity: alert.severity,
                        metricName: alert.metricName,
                        metricValue: alert.metricValue,
                        thresholdValue: alert.thresholdValue,
                        deviationPercentage: alert.deviationPercentage,
                        description: alert.description,
                        qwenAnalysis: alert.qwenAnalysis,
                        isResolved: alert.isResolved,
                        status: alert.status,
                        detectedDate: new Date(),
                    });
                }
                logger.info(`   ⚠️  ${cfg.alerts.length} alert(s) seeded untuk ${cfg.companyName}`);
            } else {
                logger.info(`   ✅ Tidak ada alert aktif untuk ${cfg.companyName}`);
            }
        }

        // ═══════════════════════════════════════════════════════════
        // 4️⃣ CREATE DUMMY BANK USERS
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
                logger.info(`✅ Bank user seeded: ${bankData.email}`);
            }
        }

        logger.info("\n🎉 DUMMY DATA CREATED SUCCESSFULLY");
        logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        logger.info("📊 Credit Score History: 6 bulan per merchant");
        logger.info("🤖 AI Explanation: tersimpan di record terbaru tiap merchant");
        logger.info("⚠️  Early Warning Alerts:");
        logger.info("   → merchant.a: tidak ada alert (performa bagus)");
        logger.info("   → merchant.b: 1 alert — Revenue Drop (Medium)");
        logger.info("   → merchant.c: 3 alerts — Transaction Drop (Critical), Settlement Delay (Medium), Score Drop (Low)");
        logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    } catch (error) {
        logger.error(`❌ Seed error: ${error.message}`);
        console.error(error);
    } finally {
        await sequelize.close();
    }
}

seedDummyData();
