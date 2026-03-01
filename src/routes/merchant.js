import express from "express";
import { Op } from "sequelize";
import { authenticateToken } from "../middleware/auth.js";
import User from "../models/User.js";
import Merchant from "../models/Merchant.js";
import CreditScore from "../models/CreditScore.js";
import DailyRevenue from "../models/DailyRevenue.js";
import logger from "../utils/logger.js";
import { generateLoanTiming, generateMerchantGrowthInsights } from "../services/qwenService.js";
import { getActiveAlerts } from "../services/earlyWarningService.js";
import { calculateMonthlyGrowth, calculateRefundRate } from "../services/merchantService.js";

// ✅ Import calculateAndSaveCreditScore untuk trigger manual jika diperlukan
import { calculateAndSaveCreditScore } from "../services/creditScoringService.js";

const router = express.Router();

/**
 * @swagger
 * /api/merchant/profile:
 *   get:
 *     summary: Get merchant profile
 *     description: Retrieve current merchant profile and company information
 *     tags:
 *       - Merchant
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *                     merchant:
 *                       $ref: '#/components/schemas/Merchant'
 *       401:
 *         description: Unauthorized - invalid token
 *       404:
 *         description: Merchant not found
 */
router.get("/profile", authenticateToken, async (req, res, next) => {
    try {
        const user = await User.findByPk(req.user.userId);
        const merchant = await Merchant.findOne({ where: { userId: req.user.userId } });

        if (!user || !merchant) {
            return res.status(404).json({ success: false, message: "Merchant tidak ditemukan" });
        }

        res.json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    fullName: user.fullName,
                    companyName: user.companyName,
                    phoneNumber: user.phoneNumber,
                    city: user.city,
                    address: user.address,
                },
                merchant: {
                    merchantId: merchant.merchantId,
                    businessCategory: merchant.businessCategory,
                    businessScale: merchant.businessScale,
                    joinDate: merchant.joinDate,
                },
            },
        });
    } catch (error) {
        logger.error(`Get profile error: ${error.message}`);
        next(error);
    }
});

/**
 * @swagger
 * /api/merchant/dashboard:
 *   get:
 *     summary: Get merchant dashboard
 *     description: Retrieve dashboard summary with credit score and metrics
 *     tags:
 *       - Merchant
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard data retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     merchantId:
 *                       type: string
 *                     companyName:
 *                       type: string
 *                     currentCreditScore:
 *                       type: integer
 *                     riskBand:
 *                       type: string
 *                       enum: [Low, Medium, High]
 *                     estimatedMinLimit:
 *                       type: number
 *                     estimatedMaxLimit:
 *                       type: number
 *       401:
 *         description: Unauthorized
 */
router.get("/dashboard", authenticateToken, async (req, res, next) => {
    try {
        const merchant = await Merchant.findOne({ where: { userId: req.user.userId } });
        if (!merchant) {
            return res.status(404).json({ success: false, message: "Merchant tidak ditemukan" });
        }

        const latestScore = await CreditScore.findOne({
            where: { merchantId: merchant.merchantId },
            order: [["calculationDate", "DESC"]],
        });

        const scoreHistory = await CreditScore.findAll({
            where: {
                merchantId: merchant.merchantId,
                calculationDate: { [Op.gte]: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) },
            },
            order: [["calculationDate", "DESC"]],
            attributes: ["calculationDate", "creditScore"],
        });

        const monthlyTransactionVolume =
            (await DailyRevenue.sum("totalAmount", {
                where: {
                    merchantId: merchant.merchantId,
                    transactionDate: { [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
                },
            })) || 0;

        const monthlyGrowth = await calculateMonthlyGrowth(merchant.merchantId);
        const refundRate = await calculateRefundRate(merchant.merchantId);
        const totalTransactions = await DailyRevenue.count({
            where: {
                merchantId: merchant.merchantId,
                transactionDate: { [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
            },
        });

        res.json({
            success: true,
            data: {
                merchantId: merchant.merchantId,
                companyName: req.user.companyName,
                currentCreditScore: latestScore?.creditScore || 0,
                riskBand: latestScore?.riskBand || "N/A",
                estimatedMinLimit: latestScore?.estimatedMinLimit || 0,
                estimatedMaxLimit: latestScore?.estimatedMaxLimit || 0,
                monthlyTransactionVolume,
                monthlyGrowth,
                refundRate,
                totalTransactions,
                avgDailyTransaction: parseFloat((totalTransactions / 30).toFixed(2)),
                scoreHistory: scoreHistory.map((s) => ({ date: s.calculationDate, score: s.creditScore })),
            },
        });
    } catch (error) {
        logger.error(`Get dashboard error: ${error.message}`);
        next(error);
    }
});

/**
 * @swagger
 * /api/merchant/credit-detail:
 *   get:
 *     summary: Get detailed credit score
 *     description: |
 *       Retrieve detailed credit score components along with AI explanation
 *       and recommendation yang sudah tersimpan saat score terakhir dikalkulasi.
 *     tags:
 *       - Merchant
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Credit details retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     score:
 *                       type: integer
 *                     riskBand:
 *                       type: string
 *                     components:
 *                       type: object
 *                     metrics:
 *                       type: object
 *                     explanation:
 *                       type: string
 *                     recommendation:
 *                       type: string
 *                     calculatedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Skor kredit belum tersedia
 */
router.get("/credit-detail", authenticateToken, async (req, res, next) => {
    try {
        const merchant = await Merchant.findOne({ where: { userId: req.user.userId } });
        if (!merchant) {
            return res.status(404).json({ success: false, message: "Merchant tidak ditemukan" });
        }

        const latestScore = await CreditScore.findOne({
            where: { merchantId: merchant.merchantId },
            order: [["calculationDate", "DESC"]],
        });

        if (!latestScore) {
            return res.status(404).json({ success: false, message: "Skor kredit belum tersedia" });
        }

        // ✅ Langsung baca explanation & recommendation dari DB
        // Sudah di-generate + disimpan saat saveCreditScore() dipanggil (cron/trigger)
        // Tidak perlu re-call Qwen setiap request → hemat biaya API + response lebih cepat
        res.json({
            success: true,
            data: {
                score: latestScore.creditScore,
                riskBand: latestScore.riskBand,
                estimatedMinLimit: latestScore.estimatedMinLimit,
                estimatedMaxLimit: latestScore.estimatedMaxLimit,
                components: {
                    transactionVolume: { score: latestScore.transactionVolumeScore, weight: 0.25 },
                    revenueConsistency: { score: latestScore.revenueConsistencyScore, weight: 0.25 },
                    growthTrend: { score: latestScore.growthTrendScore, weight: 0.2 },
                    refundRate: { score: latestScore.refundRateScore, weight: 0.1 },
                    settlementTime: { score: latestScore.settlementTimeScore, weight: 0.2 },
                },
                metrics: {
                    avgMonthlyRevenue: latestScore.avgMonthlyRevenue,
                    revenueVolatility: latestScore.revenueVolatility,
                    growthPercentageMoM: latestScore.growthPercentageMoM,
                    refundRatePercentage: latestScore.refundRatePercentage,
                    avgSettlementDays: latestScore.avgSettlementDays,
                    transactionCount3m: latestScore.transactionCount3m,
                },
                // Bisa null jika Qwen gagal saat kalkulasi — FE harus handle gracefully
                explanation: latestScore.qwenExplanation ?? null,
                recommendation: latestScore.qwenRecommendation ?? null,
                calculatedAt: latestScore.calculationDate,
            },
        });
    } catch (error) {
        logger.error(`Get credit detail error: ${error.message}`);
        next(error);
    }
});

/**
 * @swagger
 * /api/merchant/recalculate:
 *   post:
 *     summary: Trigger manual credit score recalculation
 *     description: |
 *       Hitung ulang credit score sekarang beserta AI explanation.
 *       Biasanya dipanggil otomatis oleh cron job setiap malam.
 *       Endpoint ini untuk trigger manual jika diperlukan.
 *     tags:
 *       - Merchant
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Recalculation completed
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Credit score berhasil dikalkulasi ulang
 *               data:
 *                 creditScore: 82
 *                 riskBand: Low
 *                 calculatedAt: "2026-03-01T00:00:00.000Z"
 *       404:
 *         description: Tidak ada data transaksi
 *       401:
 *         description: Unauthorized
 */
router.post("/recalculate", authenticateToken, async (req, res, next) => {
    try {
        const merchant = await Merchant.findOne({ where: { userId: req.user.userId } });
        if (!merchant) {
            return res.status(404).json({ success: false, message: "Merchant tidak ditemukan" });
        }

        // ✅ Ini cara manggil calculateAndSaveCreditScore:
        // 1. Hitung semua metrics dari Transaction & DailyRevenue
        // 2. Generate Qwen explanation
        // 3. INSERT 1 row baru di credit_scores (historical record)
        const saved = await calculateAndSaveCreditScore(merchant.merchantId);

        if (!saved) {
            return res.status(404).json({
                success: false,
                message: "Tidak ada data transaksi untuk menghitung credit score",
            });
        }

        res.json({
            success: true,
            message: "Credit score berhasil dikalkulasi ulang",
            data: {
                creditScore: saved.creditScore,
                riskBand: saved.riskBand,
                calculatedAt: saved.calculationDate,
            },
        });
    } catch (error) {
        logger.error(`Recalculate credit score error: ${error.message}`);
        next(error);
    }
});

/**
 * @swagger
 * /api/merchant/loan-timing:
 *   get:
 *     summary: Get smart loan timing recommendation
 *     description: Get AI-powered recommendation for optimal loan application timing
 *     tags:
 *       - Merchant
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Loan timing recommendation retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     recommended_week:
 *                       type: integer
 *                     confidence:
 *                       type: number
 *                     reasoning:
 *                       type: string
 *                     date_range:
 *                       type: string
 *       401:
 *         description: Unauthorized
 */
router.get("/loan-timing", authenticateToken, async (req, res, next) => {
    try {
        const merchant = await Merchant.findOne({ where: { userId: req.user.userId } });
        if (!merchant) {
            return res.status(404).json({ success: false, message: "Merchant tidak ditemukan" });
        }

        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const dailyRevenues = await DailyRevenue.findAll({
            where: {
                merchantId: merchant.merchantId,
                transactionDate: { [Op.gte]: thirtyDaysAgo },
            },
            order: [["transactionDate", "DESC"]],
            raw: true,
        });

        if (dailyRevenues.length === 0) {
            return res.json({
                success: true,
                data: {
                    message: "Data transaksi belum cukup untuk rekomendasi",
                    recommended_week: null,
                    confidence: 0,
                },
            });
        }

        const revenues = dailyRevenues.map((r) => parseFloat(r.totalAmount));
        const totalRevenue = revenues.reduce((a, b) => a + b, 0);
        const avgRevenue = totalRevenue / revenues.length;
        const variance = revenues.reduce((sum, r) => sum + Math.pow(r - avgRevenue, 2), 0) / revenues.length;
        const volatility = avgRevenue !== 0 ? Math.sqrt(variance) / avgRevenue : 0;
        const avgMonthlyRevenue = (totalRevenue / dailyRevenues.length) * 30;

        let pattern = "Stable";
        if (volatility > 0.3) pattern = "High Volatility";
        else if (volatility > 0.15) pattern = "Moderate Volatility";

        const timing = await generateLoanTiming({
            merchantId: merchant.merchantId,
            dailyRevenues: revenues.slice(0, 7),
            avgMonthlyRevenue,
            volatility: volatility * 100,
            pattern,
        });

        res.json({ success: true, data: timing });
    } catch (error) {
        logger.error(`Get loan timing error: ${error.message}`);
        next(error);
    }
});

/**
 * @swagger
 * /api/merchant/alerts:
 *   get:
 *     summary: Get active early warning alerts
 *     description: Retrieve all active alerts for the merchant
 *     tags:
 *       - Merchant
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Alerts retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalAlerts:
 *                       type: integer
 *                     criticalCount:
 *                       type: integer
 *                     mediumCount:
 *                       type: integer
 *                     lowCount:
 *                       type: integer
 *                     alerts:
 *                       type: array
 *                       items:
 *                         type: object
 *       401:
 *         description: Unauthorized
 */
router.get("/alerts", authenticateToken, async (req, res, next) => {
    try {
        const merchant = await Merchant.findOne({ where: { userId: req.user.userId } });
        if (!merchant) {
            return res.status(404).json({ success: false, message: "Merchant tidak ditemukan" });
        }

        const alerts = await getActiveAlerts(merchant.merchantId);

        res.json({
            success: true,
            data: {
                totalAlerts: alerts.length,
                criticalCount: alerts.filter((a) => a.severity === "Critical").length,
                mediumCount: alerts.filter((a) => a.severity === "Medium").length,
                lowCount: alerts.filter((a) => a.severity === "Low").length,
                alerts: alerts.map((a) => ({
                    id: a.id,
                    type: a.alertType,
                    severity: a.severity,
                    metric: a.metricName,
                    currentValue: a.metricValue,
                    detectedAt: a.detectedDate,
                    analysis: a.qwenAnalysis,
                })),
            },
        });
    } catch (error) {
        logger.error(`Get alerts error: ${error.message}`);
        next(error);
    }
});

/**
 * @swagger
 * /api/merchant/product-insights:
 *   get:
 *     summary: Get AI-powered product growth insights
 *     description: Mendapatkan analisis AI tentang performa produk, tren penjualan, dan saran inventaris berdasarkan data 3 bulan terakhir.
 *     tags:
 *       - Merchant
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Berhasil mendapatkan insight produk
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     performance_summary:
 *                       type: string
 *                     top_trending_products:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                           reason:
 *                             type: string
 *                     inventory_advice:
 *                       type: string
 *                     growth_opportunity:
 *                       type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Merchant tidak ditemukan
 */
router.get("/product-insights", authenticateToken, async (req, res, next) => {
    try {
        const merchant = await Merchant.findOne({ where: { userId: req.user.userId } });
        if (!merchant) {
            return res.status(404).json({ success: false, message: "Merchant tidak ditemukan" });
        }

        const insights = await generateMerchantGrowthInsights(merchant.merchantId);

        res.json({ success: true, data: insights });
    } catch (error) {
        next(error);
    }
});

export default router;
