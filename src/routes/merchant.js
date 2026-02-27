import express from "express";
import { Op } from "sequelize";
import { authenticateToken } from "../middleware/auth.js";
import User from "../models/User.js";
import Merchant from "../models/Merchant.js";
import CreditScore from "../models/CreditScore.js";
import DailyRevenue from "../models/DailyRevenue.js";
import EarlyWarningAlert from "../models/EarlyWarningAlert.js";
import logger from "../utils/logger.js";
import { generateScoreExplanation, generateLoanTiming } from "../services/qwenService.js";
import { detectAnomalies, getActiveAlerts } from "../services/earlyWarningService.js";

const router = express.Router();

/**
 * @swagger
 * /api/merchant/profile:
 *   get:
 *     summary: Get merchant profile
 *     description: Retrieve current merchant profile and company information
 *     tags: [Merchant]
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
 *                 success: { type: boolean }
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
            return res.status(404).json({
                success: false,
                message: "Merchant tidak ditemukan",
            });
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
 *     tags: [Merchant]
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
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     merchantId: { type: string }
 *                     companyName: { type: string }
 *                     currentCreditScore: { type: integer }
 *                     riskBand: { type: string, enum: [Low, Medium, High] }
 *                     estimatedMinLimit: { type: number }
 *                     estimatedMaxLimit: { type: number }
 *       401:
 *         description: Unauthorized
 */
router.get("/dashboard", authenticateToken, async (req, res, next) => {
    try {
        const merchant = await Merchant.findOne({ where: { userId: req.user.userId } });
        if (!merchant) {
            return res.status(404).json({
                success: false,
                message: "Merchant tidak ditemukan",
            });
        }

        // Get latest credit score
        const latestScore = await CreditScore.findOne({
            where: { merchantId: merchant.merchantId },
            order: [["calculationDate", "DESC"]],
        });

        // For now, return mock data (will be replaced with real calculations)
        const dashboardData = {
            merchantId: merchant.merchantId,
            companyName: req.user.companyName,
            currentCreditScore: latestScore?.creditScore || 0,
            riskBand: latestScore?.riskBand || "N/A",
            estimatedMinLimit: latestScore?.estimatedMinLimit || 0,
            estimatedMaxLimit: latestScore?.estimatedMaxLimit || 0,
            monthlyTransactionVolume: 0, // Will be calculated from transactions
            monthlyGrowth: 0,
            refundRate: 0,
            totalTransactions: 0,
            avgDailyTransaction: 0,
            scoreHistory: latestScore
                ? [
                      {
                          date: latestScore.calculationDate,
                          score: latestScore.creditScore,
                      },
                  ]
                : [],
        };

        res.json({
            success: true,
            data: dashboardData,
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
 *     description: Retrieve detailed credit score components with AI explanation
 *     tags: [Merchant]
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
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     score: { type: integer }
 *                     riskBand: { type: string }
 *                     components: { type: object }
 *                     metrics: { type: object }
 *                     explanation: { type: string }
 *                     recommendation: { type: string }
 *       401:
 *         description: Unauthorized
 */
router.get("/credit-detail", authenticateToken, async (req, res, next) => {
    try {
        const merchant = await Merchant.findOne({ where: { userId: req.user.userId } });
        if (!merchant) {
            return res.status(404).json({
                success: false,
                message: "Merchant tidak ditemukan",
            });
        }

        const latestScore = await CreditScore.findOne({
            where: { merchantId: merchant.merchantId },
            order: [["calculationDate", "DESC"]],
        });

        if (!latestScore) {
            return res.status(404).json({
                success: false,
                message: "Skor kredit belum tersedia",
            });
        }

        // Generate fresh AI explanation every time
        let explanation;
        let recommendation;

        try {
            const aiResponse = await generateScoreExplanation({
                creditScore: latestScore.creditScore,
                riskBand: latestScore.riskBand,
                merchantId: merchant.merchantId,
                transactionVolumeScore: latestScore.transactionVolumeScore,
                revenueConsistencyScore: latestScore.revenueConsistencyScore,
                growthTrendScore: latestScore.growthTrendScore,
                refundRateScore: latestScore.refundRateScore,
                settlementTimeScore: latestScore.settlementTimeScore,
                avgMonthlyRevenue: latestScore.avgMonthlyRevenue,
                growthPercentageMoM: latestScore.growthPercentageMoM,
                refundRatePercentage: latestScore.refundRatePercentage,
                avgSettlementDays: latestScore.avgSettlementDays,
            });

            explanation = aiResponse.explanation;
            recommendation = aiResponse.recommendation;

            // Update the score record with fresh AI explanation
            await latestScore.update({ qwenExplanation: explanation, qwenRecommendation: recommendation });
        } catch (aiError) {
            logger.warn(`Failed to generate AI explanation: ${aiError.message}`);
            explanation = "Penjelasan akan segera tersedia";
            recommendation = "Tingkatkan konsistensi transaksi";
        }

        const detail = {
            score: latestScore.creditScore,
            riskBand: latestScore.riskBand,
            estimatedMinLimit: latestScore.estimatedMinLimit,
            estimatedMaxLimit: latestScore.estimatedMaxLimit,
            components: {
                transactionVolume: {
                    score: latestScore.transactionVolumeScore,
                    weight: 0.25,
                },
                revenueConsistency: {
                    score: latestScore.revenueConsistencyScore,
                    weight: 0.25,
                },
                growthTrend: {
                    score: latestScore.growthTrendScore,
                    weight: 0.2,
                },
                refundRate: {
                    score: latestScore.refundRateScore,
                    weight: 0.1,
                },
                settlementTime: {
                    score: latestScore.settlementTimeScore,
                    weight: 0.2,
                },
            },
            metrics: {
                avgMonthlyRevenue: latestScore.avgMonthlyRevenue,
                revenueVolatility: latestScore.revenueVolatility,
                growthPercentageMoM: latestScore.growthPercentageMoM,
                refundRatePercentage: latestScore.refundRatePercentage,
                avgSettlementDays: latestScore.avgSettlementDays,
                transactionCount3m: latestScore.transactionCount3m,
            },
            explanation,
            recommendation,
            calculatedAt: latestScore.calculationDate,
        };

        res.json({
            success: true,
            data: detail,
        });
    } catch (error) {
        logger.error(`Get credit detail error: ${error.message}`);
        next(error);
    }
});

/**
 * @swagger
 * /api/merchant/loan-timing:
 *   get:
 *     summary: Get smart loan timing recommendation
 *     description: Get AI-powered recommendation for optimal loan application timing
 *     tags: [Merchant]
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
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     recommendedWeek: { type: integer }
 *                     confidence: { type: number }
 *                     reasoning: { type: string }
 *                     estimatedMinLimit: { type: number }
 *                     estimatedMaxLimit: { type: number }
 *       401:
 *         description: Unauthorized
 */
router.get("/loan-timing", authenticateToken, async (req, res, next) => {
    try {
        const merchant = await Merchant.findOne({ where: { userId: req.user.userId } });
        if (!merchant) {
            return res.status(404).json({
                success: false,
                message: "Merchant tidak ditemukan",
            });
        }

        // Get last 30 days of daily revenue data
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
                    recommendedWeek: null,
                    confidence: 0,
                },
            });
        }

        // Calculate metrics for AI
        const revenues = dailyRevenues.map((r) => parseFloat(r.totalAmount));
        const avgMonthlyRevenue = (revenues.reduce((a, b) => a + b, 0) / dailyRevenues.length) * Math.ceil(30 / dailyRevenues.length);
        const variance = revenues.reduce((sum, r) => sum + Math.pow(r - revenues.reduce((a, b) => a + b) / revenues.length, 2), 0) / revenues.length;
        const volatility = Math.sqrt(variance) / (revenues.reduce((a, b) => a + b) / revenues.length);

        // Detect pattern
        let pattern = "Stable";
        if (volatility > 0.3) pattern = "High Volatility";
        else if (volatility > 0.15) pattern = "Moderate Volatility";

        try {
            const timing = await generateLoanTiming({
                merchantId: merchant.merchantId,
                dailyRevenues: revenues.slice(0, 7),
                avgMonthlyRevenue,
                volatility: volatility * 100,
                pattern,
            });

            res.json({
                success: true,
                data: {
                    ...timing,
                },
            });
        } catch (aiError) {
            logger.warn(`AI loan timing failed: ${aiError.message}`);
            res.json({
                success: true,
                data: {
                    recommendedWeek: 2,
                    confidence: 60,
                    reasoning: "Rekomendasi berbasis pola dasar",
                    dateRange: "Minggu ke-2 bulan berikutnya",
                },
            });
        }
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
 *     tags: [Merchant]
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
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalAlerts: { type: integer }
 *                     criticalCount: { type: integer }
 *                     mediumCount: { type: integer }
 *                     lowCount: { type: integer }
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
            return res.status(404).json({
                success: false,
                message: "Merchant tidak ditemukan",
            });
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

export default router;
