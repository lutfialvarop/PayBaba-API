import { Op } from "sequelize";
import Merchant from "../models/Merchant.js";
import Transaction from "../models/Transaction.js";
import DailyRevenue from "../models/DailyRevenue.js";
import CreditScore from "../models/CreditScore.js";
import { generateScoreExplanation } from "./qwenService.js";
import logger from "../utils/logger.js";

/* =====================================================
   COMPONENT SCORE CALCULATORS
===================================================== */

const calculateTransactionVolumeScore = (transactionCount) => {
    return Math.min(100, (transactionCount / 100) * 100);
};

const calculateRevenueConsistencyScore = (volatility) => {
    return Math.max(0, 100 - volatility);
};

const calculateGrowthTrendScore = (growthMoM) => {
    const score = 50 + growthMoM * 2.5;
    return Math.max(0, Math.min(100, score));
};

const calculateRefundRateScore = (refundRate) => {
    const score = 100 - refundRate * 20;
    return Math.max(0, Math.min(100, score));
};

const calculateSettlementTimeScore = (avgSettlementDays) => {
    if (avgSettlementDays <= 1) return 100;
    if (avgSettlementDays <= 3) return Math.max(50, 100 - avgSettlementDays * 15);
    if (avgSettlementDays <= 7) return Math.max(0, 50 - (avgSettlementDays - 3) * 10);
    return 0;
};

/* =====================================================
   CALCULATE CREDIT SCORE
===================================================== */

export const calculateCreditScore = async (merchantId) => {
    try {
        logger.info(`Calculating credit score for merchant: ${merchantId}`);

        const merchant = await Merchant.findByPk(merchantId);
        if (!merchant) {
            throw new Error(`Merchant ${merchantId} tidak ditemukan`);
        }

        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

        const transactions = await Transaction.findAll({
            where: {
                merchantId,
                transactionDate: { [Op.gte]: threeMonthsAgo },
            },
            raw: true,
        });

        if (transactions.length === 0) {
            logger.warn(`Tidak ada transaksi untuk merchant ${merchantId}`);
            return null;
        }

        const transactionCount = transactions.length;
        const successfulCount = transactions.filter((t) => t.status === "Success").length;
        const refundedCount = transactions.filter((t) => t.status === "Refunded").length;
        const refundRate = successfulCount > 0 ? (refundedCount / successfulCount) * 100 : 0;

        // Daily revenue untuk volatility & MoM
        const dailyRevenues = await DailyRevenue.findAll({
            where: {
                merchantId,
                transactionDate: { [Op.gte]: threeMonthsAgo },
            },
            order: [["transactionDate", "DESC"]],
            raw: true,
        });

        const revenues = dailyRevenues.map((d) => parseFloat(d.totalAmount || 0));
        const totalRevenueFromDaily = revenues.reduce((a, b) => a + b, 0);
        const avgMonthlyRevenue = totalRevenueFromDaily / 3;

        // Volatility
        let volatility = 0;
        if (revenues.length > 1) {
            const mean = totalRevenueFromDaily / revenues.length;
            const variance = revenues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / revenues.length;
            volatility = mean !== 0 ? (Math.sqrt(variance) / mean) * 100 : 0;
            volatility = Math.min(100, volatility);
        }

        // Settlement time — filter null settlementDate
        const settledTransactions = transactions.filter((t) => t.settlementDate !== null && t.settlementDate !== undefined);
        let avgSettlementDays = 0;
        if (settledTransactions.length > 0) {
            const days = settledTransactions.map((t) => {
                const d = (new Date(t.settlementDate) - new Date(t.transactionDate)) / (1000 * 60 * 60 * 24);
                return isNaN(d) ? 0 : d;
            });
            avgSettlementDays = days.reduce((a, b) => a + b, 0) / days.length;
        }

        // MoM Growth
        const now = new Date();
        const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

        const currentMonthRevenue = dailyRevenues.filter((d) => new Date(d.transactionDate) >= startOfThisMonth).reduce((sum, d) => sum + parseFloat(d.totalAmount || 0), 0);

        const previousMonthRevenue = dailyRevenues
            .filter((d) => {
                const date = new Date(d.transactionDate);
                return date >= startOfLastMonth && date < startOfThisMonth;
            })
            .reduce((sum, d) => sum + parseFloat(d.totalAmount || 0), 0);

        const growthMoM = previousMonthRevenue > 0 ? ((currentMonthRevenue - previousMonthRevenue) / previousMonthRevenue) * 100 : 0;

        // Component scores
        const transactionVolumeScore = Math.round(calculateTransactionVolumeScore(transactionCount));
        const revenueConsistencyScore = Math.round(calculateRevenueConsistencyScore(volatility));
        const growthTrendScore = Math.round(calculateGrowthTrendScore(growthMoM));
        const refundRateScore = Math.round(calculateRefundRateScore(refundRate));
        const settlementTimeScore = Math.round(calculateSettlementTimeScore(avgSettlementDays));

        // Final weighted score
        const weights = {
            transactionVolume: 0.25,
            revenueConsistency: 0.25,
            growthTrend: 0.2,
            refundRate: 0.1,
            settlementTime: 0.2,
        };

        const finalScore = Math.round(
            transactionVolumeScore * weights.transactionVolume +
                revenueConsistencyScore * weights.revenueConsistency +
                growthTrendScore * weights.growthTrend +
                refundRateScore * weights.refundRate +
                settlementTimeScore * weights.settlementTime,
        );

        // Risk band & loan limits
        let riskBand = "High";
        if (finalScore >= 80) riskBand = "Low";
        else if (finalScore >= 60) riskBand = "Medium";

        let limitMultiplier = 0.5;
        if (riskBand === "Low") limitMultiplier = 1.5;
        else if (riskBand === "Medium") limitMultiplier = 1.0;

        const estimatedMinLimit = avgMonthlyRevenue * limitMultiplier * 0.8;
        const estimatedMaxLimit = avgMonthlyRevenue * limitMultiplier * 1.2;

        const scoreData = {
            merchantId,
            calculationDate: new Date(),
            creditScore: finalScore,
            riskBand,
            estimatedMinLimit,
            estimatedMaxLimit,
            transactionVolumeScore,
            revenueConsistencyScore,
            growthTrendScore,
            refundRateScore,
            settlementTimeScore,
            avgMonthlyRevenue,
            revenueVolatility: parseFloat(volatility.toFixed(2)),
            growthPercentageMoM: parseFloat(growthMoM.toFixed(2)),
            refundRatePercentage: parseFloat(refundRate.toFixed(2)),
            avgSettlementDays: parseFloat(avgSettlementDays.toFixed(1)),
            transactionCount3m: transactionCount,
            featureImportance: weights,
        };

        logger.info(`Credit score calculated for ${merchantId}: ${finalScore} (${riskBand})`);
        return scoreData;
    } catch (error) {
        logger.error(`Error calculating credit score: ${error.message}`);
        throw error;
    }
};

/* =====================================================
   SAVE CREDIT SCORE
   - Auto-generate Qwen explanation sebelum INSERT
   - Jika Qwen gagal, tetap INSERT dengan explanation null
   - Setiap panggil = 1 row baru di credit_scores (historical record)
===================================================== */

export const saveCreditScore = async (scoreData) => {
    let qwenExplanation = null;
    let qwenRecommendation = null;

    try {
        logger.info(`Generating Qwen explanation for merchant: ${scoreData.merchantId}`);

        const aiResponse = await generateScoreExplanation(scoreData);

        // Hanya simpan jika AI benar-benar menghasilkan konten (bukan fallback kosong)
        if (aiResponse?.explanation && aiResponse.explanation !== "Penjelasan akan segera tersedia") {
            qwenExplanation = aiResponse.explanation;
            qwenRecommendation = aiResponse.recommendation ?? null;
            logger.info(`Qwen explanation generated for merchant: ${scoreData.merchantId}`);
        } else {
            logger.warn(`Qwen returned empty/fallback explanation for merchant: ${scoreData.merchantId}`);
        }
    } catch (aiError) {
        // Qwen gagal → tetap lanjut save score, explanation null
        logger.warn(`Qwen explanation failed for ${scoreData.merchantId}: ${aiError.message}`);
    }

    try {
        const saved = await CreditScore.create({
            ...scoreData,
            qwenExplanation,
            qwenRecommendation,
        });

        logger.info(`Credit score saved for merchant: ${scoreData.merchantId} (id: ${saved.id})`);
        return saved;
    } catch (error) {
        logger.error(`Error saving credit score: ${error.message}`);
        throw error;
    }
};

/* =====================================================
   CALCULATE + SAVE (convenience wrapper)
   Panggil ini dari cron job atau trigger lainnya
===================================================== */

export const calculateAndSaveCreditScore = async (merchantId) => {
    const scoreData = await calculateCreditScore(merchantId);
    if (!scoreData) {
        logger.warn(`Skipping save — no score data for merchant: ${merchantId}`);
        return null;
    }
    return await saveCreditScore(scoreData);
};

export default {
    calculateCreditScore,
    saveCreditScore,
    calculateAndSaveCreditScore,
};
