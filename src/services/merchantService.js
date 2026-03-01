import { Op } from "sequelize";
import Transaction from "../models/Transaction.js";
import e from "express";

export const getMerchantProductStats = async (merchantId) => {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const transactions = await Transaction.findAll({
        where: {
            merchantId,
            status: "Success",
            transactionDate: { [Op.gte]: threeMonthsAgo },
        },
        attributes: ["transactionDate", "amount", "metadata"],
        raw: true,
    });

    const productCounts = {};
    const monthlySales = [0, 0, 0];
    const currentMonth = new Date().getMonth();

    transactions.forEach((txn) => {
        // Tren Penjualan
        const txnMonth = new Date(txn.transactionDate).getMonth();
        const monthDiff = (currentMonth - txnMonth + 12) % 12;
        if (monthDiff < 3) monthlySales[2 - monthDiff] += parseFloat(txn.amount);

        // Statistik Produk dari Metadata
        const info = txn.metadata?.productInfo;
        if (info && info.name) {
            const id = info.sku || info.name;
            if (!productCounts[id]) {
                productCounts[id] = { name: info.name, sku: info.sku || "N/A", totalQty: 0, count: 0 };
            }
            productCounts[id].totalQty += info.quantity || 1;
            productCounts[id].count += 1;
        }
    });

    return {
        salesTrend: monthlySales,
        topProducts: Object.values(productCounts)
            .sort((a, b) => b.totalQty - a.totalQty)
            .slice(0, 5),
    };
};

export const calculateRefundRate = async (merchantId) => {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const transactions = await Transaction.findAll({
        where: {
            merchantId,
            transactionDate: { [Op.gte]: threeMonthsAgo },
        },
        attributes: ["status"],
        raw: true,
    });

    const total = transactions.length;
    const refunded = transactions.filter((t) => t.status === "Refunded").length;

    return total > 0 ? (refunded / total) * 100 : 0;
};

export const calculateMonthlyGrowth = async (merchantId) => {
    const totalRevenue = await Transaction.sum("amount", {
        where: {
            merchantId,
            status: "Success",
        },
    });

    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const pastRevenue = await Transaction.sum("amount", {
        where: {
            merchantId,
            status: "Success",
            transactionDate: { [Op.gte]: threeMonthsAgo },
        },
    });

    if (pastRevenue === 0) return totalRevenue > 0 ? 100 : 0;
    return ((totalRevenue - pastRevenue) / pastRevenue) * 100;
};

export default {
    getMerchantProductStats,
    calculateRefundRate,
    calculateMonthlyGrowth,
};
