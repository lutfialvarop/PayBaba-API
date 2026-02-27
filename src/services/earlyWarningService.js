import logger from "../utils/logger.js";
import { analyzeAnomaly } from "./qwenService.js";
import EarlyWarningAlert from "../models/EarlyWarningAlert.js";
import DailyRevenue from "../models/DailyRevenue.js";
import Transaction from "../models/Transaction.js";
import CreditScore from "../models/CreditScore.js";

/**
 * Detect transaction anomalies for a merchant
 */
export async function detectAnomalies(merchantId) {
    try {
        const alerts = [];

        // 1. Revenue Drop Detection
        const revenueDrop = await detectRevenueDropAnomaly(merchantId);
        if (revenueDrop) alerts.push(revenueDrop);

        // 2. Refund Spike Detection
        const refundSpike = await detectRefundSpikeAnomaly(merchantId);
        if (refundSpike) alerts.push(refundSpike);

        // 3. Settlement Delay Detection
        const settlementDelay = await detectSettlementDelayAnomaly(merchantId);
        if (settlementDelay) alerts.push(settlementDelay);

        // 4. Transaction Drop Detection
        const transactionDrop = await detectTransactionDropAnomaly(merchantId);
        if (transactionDrop) alerts.push(transactionDrop);

        // 5. Credit Score Drop Detection
        const scoreDrop = await detectScoreDropAnomaly(merchantId);
        if (scoreDrop) alerts.push(scoreDrop);

        // 6. Save alerts to database
        for (const alert of alerts) {
            await EarlyWarningAlert.create(alert);
        }

        logger.info(`[Early Warning] Detected ${alerts.length} anomalies for merchant ${merchantId}`);
        return alerts;
    } catch (error) {
        logger.error(`Early Warning Detection Error: ${error.message}`);
        return [];
    }
}

/**
 * Detect revenue drop anomaly
 */
async function detectRevenueDropAnomaly(merchantId) {
    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const dailyRevenues = await DailyRevenue.findAll({
            where: {
                merchantId,
                transactionDate: { [require("sequelize").gte]: thirtyDaysAgo },
            },
            order: [["transactionDate", "DESC"]],
            limit: 30,
        });

        if (dailyRevenues.length < 10) return null;

        // Calculate average of past 20 days vs last 10 days
        const past20 = dailyRevenues.slice(10, 30);
        const last10 = dailyRevenues.slice(0, 10);

        const avgPast20 = past20.reduce((sum, r) => sum + parseFloat(r.totalAmount), 0) / past20.length;
        const avgLast10 = last10.reduce((sum, r) => sum + parseFloat(r.totalAmount), 0) / last10.length;

        const dropPercentage = ((avgPast20 - avgLast10) / avgPast20) * 100;

        // Alert if revenue dropped more than 30%
        const REVENUE_DROP_THRESHOLD = 30;
        if (dropPercentage > REVENUE_DROP_THRESHOLD) {
            const severity = dropPercentage > 50 ? "Critical" : dropPercentage > 40 ? "Medium" : "Low";

            const analysis = await analyzeAnomaly({
                merchantId,
                alertType: "Revenue Drop",
                metricName: "Daily Revenue",
                currentValue: avgLast10,
                thresholdValue: avgPast20 * 0.7,
                historicalAvg: avgPast20,
            });

            return {
                merchantId,
                alertType: "Revenue Drop",
                severity,
                metricName: "Daily Revenue",
                metricValue: avgLast10,
                thresholdValue: avgPast20 * 0.7,
                detectedDate: new Date(),
                qwenAnalysis: analysis,
                isResolved: false,
            };
        }
    } catch (error) {
        logger.error(`Revenue Drop Detection Error: ${error.message}`);
    }

    return null;
}

/**
 * Detect refund spike anomaly
 */
async function detectRefundSpikeAnomaly(merchantId) {
    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const transactions = await Transaction.findAll({
            where: {
                merchantId,
                transactionDate: { [require("sequelize").gte]: thirtyDaysAgo },
            },
            raw: true,
        });

        if (transactions.length < 50) return null;

        // Split into two periods
        const mid = Math.floor(transactions.length / 2);
        const past15 = transactions.slice(mid);
        const last15 = transactions.slice(0, mid);

        // Calculate refund rates
        const pastRefunds = past15.filter((t) => t.refundStatus === "Processed").length;
        const lastRefunds = last15.filter((t) => t.refundStatus === "Processed").length;

        const pastRefundRate = (pastRefunds / past15.length) * 100;
        const lastRefundRate = (lastRefunds / last15.length) * 100;

        const spikePercentage = lastRefundRate - pastRefundRate;

        // Alert if refund rate increased by more than 5%
        const REFUND_SPIKE_THRESHOLD = 5;
        if (spikePercentage > REFUND_SPIKE_THRESHOLD) {
            const severity = spikePercentage > 15 ? "Critical" : spikePercentage > 10 ? "Medium" : "Low";

            const analysis = await analyzeAnomaly({
                merchantId,
                alertType: "Refund Spike",
                metricName: "Refund Rate",
                currentValue: lastRefundRate,
                thresholdValue: pastRefundRate,
                historicalAvg: pastRefundRate,
            });

            return {
                merchantId,
                alertType: "Refund Spike",
                severity,
                metricName: "Refund Rate (%)",
                metricValue: lastRefundRate,
                thresholdValue: pastRefundRate,
                detectedDate: new Date(),
                qwenAnalysis: analysis,
                isResolved: false,
            };
        }
    } catch (error) {
        logger.error(`Refund Spike Detection Error: ${error.message}`);
    }

    return null;
}

/**
 * Detect settlement delay anomaly
 */
async function detectSettlementDelayAnomaly(merchantId) {
    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const transactions = await Transaction.findAll({
            where: {
                merchantId,
                transactionDate: { [require("sequelize").gte]: thirtyDaysAgo },
                status: "Success",
            },
            raw: true,
        });

        if (transactions.length < 10) return null;

        // Calculate settlement days
        const settlementDays = transactions.map((t) => {
            const settled = new Date(t.settlementDate);
            const transacted = new Date(t.transactionDate);
            return (settled - transacted) / (1000 * 60 * 60 * 24);
        });

        const avgSettlementDays = settlementDays.reduce((a, b) => a + b) / settlementDays.length;
        const maxSettlementDays = Math.max(...settlementDays);

        // Alert if average settlement is more than 3 days
        const SETTLEMENT_THRESHOLD = 3;
        if (avgSettlementDays > SETTLEMENT_THRESHOLD) {
            const severity = maxSettlementDays > 7 ? "Critical" : avgSettlementDays > 5 ? "Medium" : "Low";

            const analysis = await analyzeAnomaly({
                merchantId,
                alertType: "Settlement Delay",
                metricName: "Settlement Days",
                currentValue: avgSettlementDays,
                thresholdValue: SETTLEMENT_THRESHOLD,
                historicalAvg: SETTLEMENT_THRESHOLD,
            });

            return {
                merchantId,
                alertType: "Settlement Delay",
                severity,
                metricName: "Settlement Days",
                metricValue: avgSettlementDays,
                thresholdValue: SETTLEMENT_THRESHOLD,
                detectedDate: new Date(),
                qwenAnalysis: analysis,
                isResolved: false,
            };
        }
    } catch (error) {
        logger.error(`Settlement Delay Detection Error: ${error.message}`);
    }

    return null;
}

/**
 * Detect transaction drop anomaly
 */
async function detectTransactionDropAnomaly(merchantId) {
    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const dailyRevenues = await DailyRevenue.findAll({
            where: {
                merchantId,
                transactionDate: { [require("sequelize").gte]: thirtyDaysAgo },
            },
            order: [["transactionDate", "DESC"]],
            limit: 30,
            raw: true,
        });

        if (dailyRevenues.length < 10) return null;

        // Compare transaction counts
        const past20 = dailyRevenues.slice(10, 30);
        const last10 = dailyRevenues.slice(0, 10);

        const avgTransactionsPast20 = past20.reduce((sum, r) => sum + r.transactionCount, 0) / past20.length;
        const avgTransactionsLast10 = last10.reduce((sum, r) => sum + r.transactionCount, 0) / last10.length;

        const dropPercentage = ((avgTransactionsPast20 - avgTransactionsLast10) / avgTransactionsPast20) * 100;

        // Alert if transaction count dropped more than 25%
        const TRANSACTION_DROP_THRESHOLD = 25;
        if (dropPercentage > TRANSACTION_DROP_THRESHOLD) {
            const severity = dropPercentage > 50 ? "Critical" : dropPercentage > 40 ? "Medium" : "Low";

            const analysis = await analyzeAnomaly({
                merchantId,
                alertType: "Transaction Drop",
                metricName: "Transaction Count",
                currentValue: avgTransactionsLast10,
                thresholdValue: avgTransactionsPast20 * 0.75,
                historicalAvg: avgTransactionsPast20,
            });

            return {
                merchantId,
                alertType: "Transaction Drop",
                severity,
                metricName: "Transaction Count",
                metricValue: avgTransactionsLast10,
                thresholdValue: avgTransactionsPast20 * 0.75,
                detectedDate: new Date(),
                qwenAnalysis: analysis,
                isResolved: false,
            };
        }
    } catch (error) {
        logger.error(`Transaction Drop Detection Error: ${error.message}`);
    }

    return null;
}

/**
 * Detect credit score drop anomaly
 */
async function detectScoreDropAnomaly(merchantId) {
    try {
        const scores = await CreditScore.findAll({
            where: { merchantId },
            order: [["calculationDate", "DESC"]],
            limit: 2,
            raw: true,
        });

        if (scores.length < 2) return null;

        const latestScore = scores[0].creditScore;
        const previousScore = scores[1].creditScore;

        const scoreDrop = previousScore - latestScore;

        // Alert if score dropped by more than 15 points
        const SCORE_DROP_THRESHOLD = 15;
        if (scoreDrop > SCORE_DROP_THRESHOLD) {
            const severity = scoreDrop > 30 ? "Critical" : scoreDrop > 20 ? "Medium" : "Low";

            const analysis = await analyzeAnomaly({
                merchantId,
                alertType: "Score Drop",
                metricName: "Credit Score",
                currentValue: latestScore,
                thresholdValue: previousScore,
                historicalAvg: previousScore,
            });

            return {
                merchantId,
                alertType: "Score Drop",
                severity,
                metricName: "Credit Score",
                metricValue: latestScore,
                thresholdValue: previousScore,
                detectedDate: new Date(),
                qwenAnalysis: analysis,
                isResolved: false,
            };
        }
    } catch (error) {
        logger.error(`Score Drop Detection Error: ${error.message}`);
    }

    return null;
}

/**
 * Get active alerts for a merchant
 */
export async function getActiveAlerts(merchantId, status = "Unresolved") {
    try {
        return await EarlyWarningAlert.findAll({
            where: {
                merchantId,
                isResolved: false,
            },
            order: [["detectedDate", "DESC"]],
        });
    } catch (error) {
        logger.error(`Get Active Alerts Error: ${error.message}`);
        return [];
    }
}

/**
 * Mark alert as resolved
 */
export async function markAlertResolved(alertId) {
    try {
        return await EarlyWarningAlert.update({ isResolved: true }, { where: { id: alertId } });
    } catch (error) {
        logger.error(`Mark Alert Resolved Error: ${error.message}`);
        return null;
    }
}

export default {
    detectAnomalies,
    getActiveAlerts,
    markAlertResolved,
};
