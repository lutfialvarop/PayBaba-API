import express from "express";
import { Op } from "sequelize";
import Merchant from "../models/Merchant.js";
import User from "../models/User.js";
import CreditScore from "../models/CreditScore.js";
import EarlyWarningAlert from "../models/EarlyWarningAlert.js";
import LoanApplication from "../models/LoanApplication.js";
import DailyRevenue from "../models/DailyRevenue.js";
import logger from "../utils/logger.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

/**
 * Bank Portal uses Bearer Token authentication (same as merchants)
 * X-API-Key is only for Paylabs payment gateway integration
 */
router.use(authenticateToken);

/**
 * @swagger
 * /api/bank/merchants/all:
 *   get:
 *     summary: Get all merchants with credit score
 *     description: |
 *       Retrieve a paginated list of all merchants sorted by credit score (descending).
 *       Intended for bank portal use to browse and evaluate merchant creditworthiness.
 *     tags:
 *       - Bank Portal
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of merchants to return
 *         example: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of records to skip for pagination
 *         example: 0
 *     responses:
 *       200:
 *         description: Merchants retrieved successfully
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
 *                     count:
 *                       type: integer
 *                       description: Number of merchants returned
 *                       example: 10
 *                     merchants:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           merchantId:
 *                             type: string
 *                             example: MRC123456
 *                           companyName:
 *                             type: string
 *                             example: PT Toko Maju Jaya
 *                           city:
 *                             type: string
 *                             example: Jakarta
 *                           businessCategory:
 *                             type: string
 *                             example: Retail
 *                           businessScale:
 *                             type: string
 *                             enum: [Micro, Small, Medium, Large]
 *                             example: Small
 *                           creditScore:
 *                             type: integer
 *                             description: Credit score 0–100
 *                             example: 82
 *                           riskBand:
 *                             type: string
 *                             enum: [Low, Medium, High]
 *                             example: Low
 *                           estimatedMaxLimit:
 *                             type: number
 *                             description: Estimated maximum loan limit in IDR
 *                             example: 500000000
 *             example:
 *               success: true
 *               data:
 *                 count: 2
 *                 merchants:
 *                   - merchantId: MRC123456
 *                     companyName: PT Toko Maju Jaya
 *                     city: Jakarta
 *                     businessCategory: Retail
 *                     businessScale: Small
 *                     creditScore: 82
 *                     riskBand: Low
 *                     estimatedMaxLimit: 500000000
 *                   - merchantId: MRC789012
 *                     companyName: CV Berkah Bersama
 *                     city: Surabaya
 *                     businessCategory: F&B
 *                     businessScale: Micro
 *                     creditScore: 65
 *                     riskBand: Medium
 *                     estimatedMaxLimit: 150000000
 *       401:
 *         description: Unauthorized – token missing or invalid
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: Unauthorized
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: Internal Server Error
 */
router.get("/merchants/all", async (req, res, next) => {
    try {
        // name merchant, category, monthly rev, risk, score, category
        // fe use pagination and sort by score desc
        const { limit = 50, offset = 0 } = req.query;

        const scores = await CreditScore.findAll({
            order: [["creditScore", "DESC"]],
            limit,
            offset,
            raw: true,
        });

        const merchantIds = scores.map((s) => s.merchantId);

        const merchants = await Merchant.findAll({
            where: { merchantId: { [Op.in]: merchantIds } },
            attributes: ["merchantId", "businessCategory", "businessScale", "joinDate"],
            include: [
                {
                    model: User,
                    attributes: ["email", "companyName", "city"],
                },
            ],
            raw: true,
            subQuery: false,
        });

        // Enrich with score data
        const results = merchants.map((m) => {
            const score = scores.find((s) => s.merchantId === m.merchantId);
            return {
                merchantId: m.merchantId,
                companyName: m["User.companyName"],
                city: m["User.city"],
                businessCategory: m.businessCategory,
                businessScale: m.businessScale,
                creditScore: score?.creditScore,
                riskBand: score?.riskBand,
                estimatedMaxLimit: score?.estimatedMaxLimit,
            };
        });

        res.json({
            success: true,
            data: {
                count: results.length,
                merchants: results,
            },
        });
    } catch (error) {
        logger.error(`Get all merchants error: ${error.message}`);
        next(error);
    }
});

/**
 * @swagger
 * /api/bank/merchants/search:
 *   post:
 *     summary: Search merchants by criteria
 *     description: Search merchants for loan partner banks with credit score filter
 *     tags: [Bank Portal]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               minCreditScore:
 *                 type: integer
 *                 default: 0
 *                 example: 60
 *               maxCreditScore:
 *                 type: integer
 *                 default: 100
 *                 example: 100
 *               riskBand:
 *                 type: string
 *                 enum: [Low, Medium, High]
 *               businessCategory:
 *                 type: string
 *                 example: Retail
 *               limit:
 *                 type: integer
 *                 default: 50
 *               offset:
 *                 type: integer
 *                 default: 0
 *     responses:
 *       200:
 *         description: Merchants found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     count: { type: integer }
 *                     merchants:
 *                       type: array
 *                       items:
 *                         type: object
 *       401:
 *         description: Invalid API Key
 */
router.post("/merchants/search", async (req, res, next) => {
    try {
        const { minCreditScore = 0, maxCreditScore = 100, riskBand = null, businessCategory = null, limit = 50, offset = 0 } = req.body;

        // Build where condition for CreditScore
        const scoreWhere = {
            creditScore: {
                [Op.between]: [minCreditScore, maxCreditScore],
            },
        };

        if (riskBand) {
            scoreWhere.riskBand = riskBand;
        }

        const scores = await CreditScore.findAll({
            where: scoreWhere,
            order: [["creditScore", "DESC"]],
            limit,
            offset,
            raw: true,
        });

        const merchantIds = [...new Set(scores.map((s) => s.merchantId))];

        const whereCondition = {};
        if (businessCategory) {
            whereCondition.businessCategory = businessCategory;
        }

        const merchants = await Merchant.findAll({
            where: {
                merchantId: { [Op.in]: merchantIds },
                ...whereCondition,
            },
            attributes: ["merchantId", "businessCategory", "businessScale", "joinDate"],
            include: [
                {
                    model: User,
                    attributes: ["email", "companyName", "city"],
                },
            ],
            raw: true,
            subQuery: false,
        });

        // Enrich with score data
        const results = merchants.map((m) => {
            const score = scores.find((s) => s.merchantId === m.merchantId);
            return {
                merchantId: m.merchantId,
                companyName: m["User.companyName"],
                city: m["User.city"],
                businessCategory: m.businessCategory,
                businessScale: m.businessScale,
                creditScore: score?.creditScore,
                riskBand: score?.riskBand,
                estimatedMaxLimit: score?.estimatedMaxLimit,
            };
        });

        res.json({
            success: true,
            data: {
                count: results.length,
                merchants: results,
            },
        });
    } catch (error) {
        logger.error(`Search merchants error: ${error.message}`);
        next(error);
    }
});

/**
 * @swagger
 * /api/bank/merchants/{merchantId}:
 *   get:
 *     summary: Get merchant detail
 *     description: Retrieve detailed merchant profile with credit and financial data
 *     tags: [Bank Portal]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: merchantId
 *         required: true
 *         schema:
 *           type: string
 *         example: MRC123456
 *     responses:
 *       200:
 *         description: Merchant profile retrieved
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
 *                     creditScore: { type: integer }
 *                     riskBand: { type: string }
 *                     financialMetrics: { type: object }
 *                     loanEligibility: { type: object }
 *       401:
 *         description: Invalid API Key
 *       404:
 *         description: Merchant not found
 */
router.get("/merchants/:merchantId", async (req, res, next) => {
    try {
        const { merchantId } = req.params;

        const merchant = await Merchant.findByPk(merchantId, {
            include: [{ model: User, attributes: ["email", "companyName", "city", "address", "phoneNumber"] }],
            raw: true,
            subQuery: false,
        });

        if (!merchant) {
            return res.status(404).json({
                success: false,
                message: "Merchant tidak ditemukan",
            });
        }

        // Get latest credit score
        const scores = await CreditScore.findAll({
            where: { merchantId },
            order: [["calculationDate", "DESC"]],
            limit: 12,
            raw: true,
        });

        const latestScore = scores[0];

        // Get revenue metrics
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const revenues = await DailyRevenue.findAll({
            where: {
                merchantId,
                transactionDate: { [Op.gte]: thirtyDaysAgo },
            },
            raw: true,
        });

        const totalRevenue30d = revenues.reduce((sum, r) => sum + parseFloat(r.totalAmount), 0);
        const totalTransactions30d = revenues.reduce((sum, r) => sum + r.transactionCount, 0);

        // Get active alerts
        const activeAlerts = await EarlyWarningAlert.findAll({
            where: { merchantId, isResolved: false },
            raw: true,
        });

        const profile = {
            merchantId,
            companyName: merchant["User.companyName"],
            email: merchant["User.email"],
            city: merchant["User.city"],
            address: merchant["User.address"],
            phone: merchant["User.phoneNumber"],
            businessCategory: merchant.businessCategory,
            businessScale: merchant.businessScale,
            joinDate: merchant.joinDate,
            creditScore: latestScore?.creditScore || null,
            riskBand: latestScore?.riskBand || "N/A",
            scoreHistory: scores.map((s) => ({
                date: s.calculationDate,
                score: s.creditScore,
                riskBand: s.riskBand,
            })),
            financialMetrics: {
                revenue30d: totalRevenue30d,
                transactions30d: totalTransactions30d,
                avgMonthlyRevenue: latestScore?.avgMonthlyRevenue || 0,
                revenueGrowth: latestScore?.growthPercentageMoM || 0,
                refundRate: latestScore?.refundRatePercentage || 0,
                avgSettlementDays: latestScore?.avgSettlementDays || 0,
            },
            loanEligibility: {
                estimatedMinLimit: latestScore?.estimatedMinLimit || 0,
                estimatedMaxLimit: latestScore?.estimatedMaxLimit || 0,
                isEligible: latestScore?.creditScore >= 60,
                canBorrow: totalRevenue30d > 0,
            },
            riskFlags: activeAlerts.map((a) => ({
                type: a.alertType,
                severity: a.severity,
                detected: a.detectedDate,
            })),
        };

        res.json({
            success: true,
            data: profile,
        });
    } catch (error) {
        logger.error(`Get merchant detail error: ${error.message}`);
        next(error);
    }
});

/**
 * @swagger
 * /api/bank/loan-applications:
 *   post:
 *     summary: Create or update loan application
 *     description: Bank-initiated loan application creation
 *     tags: [Bank Portal]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [merchantId, requestedAmount]
 *             properties:
 *               merchantId:
 *                 type: string
 *                 example: MRC123456
 *               bankId:
 *                 type: string
 *                 example: BANK001
 *               requestedAmount:
 *                 type: number
 *                 example: 500000000
 *               recommendedAmount:
 *                 type: number
 *               recommendedTenor:
 *                 type: integer
 *                 example: 12
 *               bankDecision:
 *                 type: string
 *                 enum: [Pending, Approved, Rejected]
 *     responses:
 *       201:
 *         description: Application created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *       401:
 *         description: Invalid API Key
 *       404:
 *         description: Merchant not found
 */
router.post("/loan-applications", async (req, res, next) => {
    try {
        const { merchantId, bankId, applicationDate, requestedAmount, recommendedAmount, recommendedTenor, bankDecision, decisionDetails } = req.body;

        // Verify merchant exists
        const merchant = await Merchant.findByPk(merchantId);
        if (!merchant) {
            return res.status(404).json({
                success: false,
                message: "Merchant tidak ditemukan",
            });
        }

        // Check if application already exists
        const existingApp = await LoanApplication.findOne({
            where: { merchantId, bankId },
            order: [["applicationDate", "DESC"]],
        });

        const applicationId = `APP-${merchantId}-${bankId}-${Date.now()}`;

        const application = await LoanApplication.create({
            applicationId,
            merchantId,
            bankId: bankId || null,
            applicationDate: applicationDate || new Date(),
            requestedAmount,
            recommendedAmount,
            recommendedTenorMonths: recommendedTenor,
            bankDecision: bankDecision || "Pending",
            bankDecisionDetails: decisionDetails || null,
        });

        res.status(201).json({
            success: true,
            message: "Aplikasi pinjaman dibuat/diupdate",
            data: {
                applicationId: application.applicationId,
                merchantId,
                status: application.bankDecision,
                requestedAmount: application.requestedAmount,
                recommendedAmount: application.recommendedAmount,
            },
        });
    } catch (error) {
        logger.error(`Create loan application error: ${error.message}`);
        next(error);
    }
});

/**
 * @swagger
 * /api/bank/loan-applications/{merchantId}:
 *   get:
 *     summary: Get loan applications
 *     description: Retrieve loan applications for a merchant
 *     tags: [Bank Portal]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: merchantId
 *         required: true
 *         schema:
 *           type: string
 *         example: MRC123456
 *     responses:
 *       200:
 *         description: Applications retrieved
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
 *                     applications:
 *                       type: array
 *                       items:
 *                         type: object
 *       401:
 *         description: Invalid API Key
 */
router.get("/loan-applications/:merchantId", async (req, res, next) => {
    try {
        const { merchantId } = req.params;

        const applications = await LoanApplication.findAll({
            where: { merchantId },
            order: [["applicationDate", "DESC"]],
            raw: true,
        });

        res.json({
            success: true,
            data: {
                merchantId,
                applications: applications.map((a) => ({
                    applicationId: a.applicationId,
                    appliedAt: a.applicationDate,
                    requestedAmount: a.requestedAmount,
                    recommendedAmount: a.recommendedAmount,
                    status: a.bankDecision,
                    tenor: a.recommendedTenorMonths,
                    details: a.bankDecisionDetails,
                })),
            },
        });
    } catch (error) {
        logger.error(`Get loan applications error: ${error.message}`);
        next(error);
    }
});

/**
 * @swagger
 * /api/bank/alerts/{merchantId}:
 *   get:
 *     summary: Get merchant risk alerts
 *     description: Retrieve all risk alerts for a merchant for risk assessment
 *     tags: [Bank Portal]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: merchantId
 *         required: true
 *         schema:
 *           type: string
 *         example: MRC123456
 *       - in: query
 *         name: resolved
 *         schema:
 *           type: string
 *           enum: [true, false]
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
 *                     merchantId: { type: string }
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total: { type: integer }
 *                         critical: { type: integer }
 *                     alerts:
 *                       type: array
 *       401:
 *         description: Invalid API Key
 */
router.get("/alerts/:merchantId", async (req, res, next) => {
    try {
        const { merchantId } = req.params;
        const { resolved = false } = req.query;

        const whereCondition = { merchantId };
        if (resolved === "true") {
            whereCondition.isResolved = true;
        } else if (resolved === "false") {
            whereCondition.isResolved = false;
        }

        const alerts = await EarlyWarningAlert.findAll({
            where: whereCondition,
            order: [["detectedDate", "DESC"]],
            raw: true,
        });

        const summary = {
            total: alerts.length,
            critical: alerts.filter((a) => a.severity === "Critical").length,
            medium: alerts.filter((a) => a.severity === "Medium").length,
            low: alerts.filter((a) => a.severity === "Low").length,
        };

        res.json({
            success: true,
            data: {
                merchantId,
                summary,
                alerts: alerts.map((a) => ({
                    id: a.id,
                    type: a.alertType,
                    severity: a.severity,
                    metric: a.metricName,
                    value: a.metricValue,
                    threshold: a.thresholdValue,
                    detected: a.detectedDate,
                    analysis: a.qwenAnalysis,
                    resolved: a.isResolved,
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
 * /api/bank/batch-assessment:
 *   post:
 *     summary: Batch merchant assessment
 *     description: Assess multiple merchants for portfolio analysis
 *     tags: [Bank Portal]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [merchantIds]
 *             properties:
 *               merchantIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: [MRC001, MRC002, MRC003]
 *     responses:
 *       200:
 *         description: Assessment completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalMerchants: { type: integer }
 *                     assessmentDate: { type: string, format: date-time }
 *                     summary:
 *                       type: object
 *                       properties:
 *                         avgCreditScore: { type: number }
 *                         highRisk: { type: integer }
 *                         mediumRisk: { type: integer }
 *                         lowRisk: { type: integer }
 *                     details:
 *                       type: array
 *       400:
 *         description: Invalid merchant IDs
 *       401:
 *         description: Invalid API Key
 */
router.post("/batch-assessment", async (req, res, next) => {
    try {
        const { merchantIds } = req.body;

        if (!Array.isArray(merchantIds) || merchantIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: "merchantIds harus berupa array dan tidak kosong",
            });
        }

        const scores = await CreditScore.findAll({
            where: {
                merchantId: { [Op.in]: merchantIds },
            },
            order: [["merchantId"], ["calculationDate", "DESC"]],
            raw: true,
        });

        // Get latest score per merchant
        const latestScores = new Map();
        scores.forEach((score) => {
            if (!latestScores.has(score.merchantId)) {
                latestScores.set(score.merchantId, score);
            }
        });

        const assessment = {
            totalMerchants: merchantIds.length,
            assessmentDate: new Date(),
            summary: {
                avgCreditScore: Array.from(latestScores.values()).reduce((sum, s) => sum + s.creditScore, 0) / latestScores.size,
                highRisk: Array.from(latestScores.values()).filter((s) => s.creditScore < 60).length,
                mediumRisk: Array.from(latestScores.values()).filter((s) => s.creditScore >= 60 && s.creditScore < 80).length,
                lowRisk: Array.from(latestScores.values()).filter((s) => s.creditScore >= 80).length,
            },
            details: Array.from(latestScores.values()).map((s) => ({
                merchantId: s.merchantId,
                creditScore: s.creditScore,
                riskBand: s.riskBand,
                loanLimit: s.estimatedMaxLimit,
            })),
        };

        res.json({
            success: true,
            data: assessment,
        });
    } catch (error) {
        logger.error(`Batch assessment error: ${error.message}`);
        next(error);
    }
});

export default router;
