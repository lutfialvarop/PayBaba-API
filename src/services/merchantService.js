import { Op } from "sequelize";
import Transaction from "../models/Transaction.js";
// ✅ FIX: hapus unused `import e from "express"`

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

        // ✅ FIX: productInfo adalah ARRAY, bukan object langsung
        const infos = txn.metadata?.productInfo;
        if (Array.isArray(infos)) {
            infos.forEach((info) => {
                if (!info || !info.name) return;
                const id = info.id || info.name;
                if (!productCounts[id]) {
                    productCounts[id] = {
                        name: info.name,
                        sku: info.id || "N/A",
                        totalQty: 0,
                        count: 0,
                    };
                }
                productCounts[id].totalQty += info.quantity || 1;
                productCounts[id].count += 1;
            });
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
    // ✅ FIX: bandingkan bulan ini vs bulan lalu, bukan allTime vs 3 bulan
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const thisMonthRevenue =
        (await Transaction.sum("amount", {
            where: {
                merchantId,
                status: "Success",
                transactionDate: { [Op.gte]: startOfThisMonth },
            },
        })) || 0;

    const lastMonthRevenue =
        (await Transaction.sum("amount", {
            where: {
                merchantId,
                status: "Success",
                transactionDate: {
                    [Op.gte]: startOfLastMonth,
                    [Op.lt]: startOfThisMonth,
                },
            },
        })) || 0;

    if (lastMonthRevenue === 0) return thisMonthRevenue > 0 ? 100 : 0;
    return ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100;
};

export default {
    getMerchantProductStats,
    calculateRefundRate,
    calculateMonthlyGrowth,
};
