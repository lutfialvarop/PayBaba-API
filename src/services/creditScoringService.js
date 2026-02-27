import Merchant from "../models/Merchant.js";
import Transaction from "../models/Transaction.js";
import DailyRevenue from "../models/DailyRevenue.js";
import CreditScore from "../models/CreditScore.js";
import logger from "../utils/logger.js";

/**
 * Normalize value ke skala 0-1
 */
const normalize = (value, min = 0, max = 100) => {
    if (max === min) return 0;
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
};

/**
 * Calculate transaction volume score (0-100)
 * Berdasarkan jumlah transaksi per bulan
 */
const calculateTransactionVolumeScore = (transactionCount) => {
    // Benchmark: 100 transaksi = score 100
    return Math.min(100, (transactionCount / 100) * 100);
};

/**
 * Calculate revenue consistency score (0-100)
 * Berdasarkan volatility - semakin stabil semakin tinggi
 */
const calculateRevenueConsistencyScore = (volatility) => {
    // volatility dari 0-100
    // Jika volatility 0 (fully consistent) = score 100
    // Jika volatility 100 (fully volatile) = score 0
    return Math.max(0, 100 - volatility);
};

/**
 * Calculate growth trend score (0-100)
 * Berdasarkan Month-over-Month growth percentage
 */
const calculateGrowthTrendScore = (growthMoM) => {
    // growthMoM dalam persentase
    // 0% = score 50
    // +20% = score 100
    // -20% = score 0
    const score = 50 + growthMoM * 2.5;
    return Math.max(0, Math.min(100, score));
};

/**
 * Calculate refund rate score (0-100)
 * Semakin rendah refund rate semakin tinggi score
 */
const calculateRefundRateScore = (refundRate) => {
    // refundRate dalam persentase
    // 0% = score 100
    // 5% = score 0
    const score = 100 - refundRate * 20;
    return Math.max(0, Math.min(100, score));
};

/**
 * Calculate settlement time score (0-100)
 * Berdasarkan rata-rata hari settlement
 */
const calculateSettlementTimeScore = (avgSettlementDays) => {
    // 0-1 hari = score 100
    // 3+ hari = score 50 (suboptimal)
    // 7+ hari = score 0 (problematic)
    if (avgSettlementDays <= 1) return 100;
    if (avgSettlementDays <= 3) return Math.max(50, 100 - avgSettlementDays * 15);
    if (avgSettlementDays <= 7) return Math.max(0, 50 - (avgSettlementDays - 3) * 10);
    return 0;
};

/**
 * Hitung credit score untuk merchant
 */
export const calculateCreditScore = async (merchantId) => {
    try {
        logger.info(`Calculating credit score for merchant: ${merchantId}`);

        const merchant = await Merchant.findByPk(merchantId);
        if (!merchant) {
            throw new Error(`Merchant ${merchantId} tidak ditemukan`);
        }

        // Get transactions dari 3 bulan terakhir
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

        const transactions = await Transaction.findAll({
            where: {
                merchantId,
                transactionDate: { [Symbol.for("gte")]: threeMonthsAgo },
            },
        });

        if (transactions.length === 0) {
            logger.warn(`Tidak ada transaksi untuk merchant ${merchantId}`);
            return null;
        }

        // Calculate metrics
        const totalAmount = transactions.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
        const avgTransactionAmount = totalAmount / transactions.length;
        const transactionCount = transactions.length;
        const successfulCount = transactions.filter((t) => t.status === "Success").length;
        const refundedCount = transactions.filter((t) => t.status === "Refunded").length;
        const failedCount = transactions.filter((t) => t.status === "Failed").length;

        const successRate = (successfulCount / transactionCount) * 100;
        const refundRate = refundedCount > 0 ? (refundedCount / successfulCount) * 100 : 0;

        // Get daily revenue untuk volatility calculation
        const dailyRevenues = await DailyRevenue.findAll({
            where: { merchantId },
            order: [["transactionDate", "DESC"]],
            limit: 90, // 3 bulan
        });

        const revenues = dailyRevenues.map((d) => parseFloat(d.totalAmount || 0));
        const avgMonthlyRevenue = totalAmount / 3; // Rough average
        const avgDailyRevenue = revenues.length > 0 ? revenues.reduce((a, b) => a + b, 0) / revenues.length : 0;

        // Calculate volatility (coefficient of variation)
        let volatility = 0;
        if (revenues.length > 1) {
            const mean = revenues.reduce((a, b) => a + b, 0) / revenues.length;
            const variance = revenues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / revenues.length;
            const stdev = Math.sqrt(variance);
            volatility = mean !== 0 ? (stdev / mean) * 100 : 0;
            volatility = Math.min(100, volatility); // Cap at 100%
        }

        // Calculate settlement time
        const settledTransactions = transactions.filter((t) => t.settlementDate);
        let avgSettlementDays = 0;
        if (settledTransactions.length > 0) {
            const settlementDays = settledTransactions.map((t) => {
                const txDate = new Date(t.transactionDate);
                const settlementDate = new Date(t.settlementDate);
                return (settlementDate - txDate) / (1000 * 60 * 60 * 24);
            });
            avgSettlementDays = settlementDays.reduce((a, b) => a + b, 0) / settlementDays.length;
        }

        // MoM Growth
        const currentMonth = dailyRevenues.filter((d) => d.transactionDate.getMonth() === new Date().getMonth()).reduce((sum, d) => sum + parseFloat(d.totalAmount || 0), 0);

        const previousMonth = dailyRevenues
            .filter((d) => {
                const date = new Date(d.transactionDate);
                const now = new Date();
                return date.getMonth() === now.getMonth() - 1;
            })
            .reduce((sum, d) => sum + parseFloat(d.totalAmount || 0), 0);

        const growthMoM = previousMonth > 0 ? ((currentMonth - previousMonth) / previousMonth) * 100 : 0;

        // Calculate component scores
        const transactionVolumeScore = calculateTransactionVolumeScore(transactionCount);
        const revenueConsistencyScore = calculateRevenueConsistencyScore(volatility);
        const growthTrendScore = calculateGrowthTrendScore(growthMoM);
        const refundRateScore = calculateRefundRateScore(refundRate);
        const settlementTimeScore = calculateSettlementTimeScore(avgSettlementDays);

        // Calculate final score with weights
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

        // Determine risk band
        let riskBand = "High";
        if (finalScore >= 80) {
            riskBand = "Low";
        } else if (finalScore >= 60) {
            riskBand = "Medium";
        }

        // Calculate estimated limits
        let limitMultiplier = 0.5; // High risk
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
            revenueVolatility: volatility,
            growthPercentageMoM: growthMoM,
            refundRatePercentage: refundRate,
            avgSettlementDays,
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

export const saveCreditScore = async (scoreData, qwenExplanation = null, qwenRecommendation = null) => {
    try {
        return await CreditScore.create({
            ...scoreData,
            qwenExplanation,
            qwenRecommendation,
        });
    } catch (error) {
        logger.error(`Error saving credit score: ${error.message}`);
        throw error;
    }
};

export default {
    calculateCreditScore,
    saveCreditScore,
};
