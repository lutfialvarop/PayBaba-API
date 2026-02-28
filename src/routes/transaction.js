import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import { validateRequest, createTransactionSchema } from "../utils/validators.js";
import Merchant from "../models/Merchant.js";
import Transaction from "../models/Transaction.js";
import DailyRevenue from "../models/DailyRevenue.js";
import { v4 as uuidv4 } from "uuid";
import logger from "../utils/logger.js";

const router = express.Router();

/**
 * @swagger
 * /api/transactions/create:
 *   post:
 *     summary: Create new transaction
 *     description: Create QRIS or CASH transaction
 *     tags: [Transactions]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, amount]
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [QRIS, CASH]
 *                 example: QRIS
 *               amount:
 *                 type: number
 *                 minimum: 1000
 *                 example: 50000
 *               description:
 *                 type: string
 *                 example: Pembayaran order #123
 *               productName:
 *                 type: string
 *                 example: Produk ABC
 *               productInfo:
 *                 type: object
 *                 description: Detailed product information
 *                 example:
 *                   sku: SKU-001
 *                   name: Smartphone X
 *                   category: Electronics
 *                   quantity: 2
 *                   unitPrice: 25000
 *                   details: Smartphone X - Color Blue
 *                   merchant: ABC Store
 *     responses:
 *       201:
 *         description: Transaction created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     transactionId: { type: string }
 *                     amount: { type: number }
 *                     status: { type: string }
 *       401:
 *         description: Unauthorized
 */
router.post("/create", authenticateToken, validateRequest(createTransactionSchema), async (req, res, next) => {
    try {
        const merchant = await Merchant.findOne({ where: { userId: req.user.userId } });
        if (!merchant) {
            return res.status(404).json({
                success: false,
                message: "Merchant tidak ditemukan",
            });
        }

        const { type, amount, description, productName, productInfo } = req.validatedData;

        // Generate transaction ID
        const transactionId = `TXN${Date.now()}${Math.random().toString(36).substr(2, 9)}`;

        if (type === "QRIS") {
            // TODO: Call Paylabs QRIS API
            // For now, create pending transaction
            const transaction = await Transaction.create({
                transactionId,
                merchantId: merchant.merchantId,
                amount,
                paymentMethod: "QRIS",
                status: "Pending",
                metadata: { productInfo, description },
            });

            res.status(201).json({
                success: true,
                message: "Transaksi QRIS dibuat",
                data: {
                    transactionId: transaction.transactionId,
                    amount: transaction.amount,
                    status: transaction.status,
                    qrCode: "mock-qr-code", // From Paylabs
                    qrisUrl: "https://qr.example.com/xxx",
                },
            });
        } else if (type === "CASH") {
            // Cash transaction - auto complete
            const transaction = await Transaction.create({
                transactionId,
                merchantId: merchant.merchantId,
                amount,
                paymentMethod: "CASH",
                status: "Success",
                settlementDate: new Date(),
                settlementTime: new Date().toTimeString().split(" ")[0],
                metadata: { description },
            });

            // Update daily revenue
            const today = new Date().toISOString().split("T")[0];
            await DailyRevenue.create(
                {
                    merchantId: merchant.merchantId,
                    transactionDate: today,
                    totalAmount: amount,
                    transactionCount: 1,
                    successfulCount: 1,
                },
                { ignoreDuplicates: false },
            ).catch(async () => {
                // If duplicate, upsert
                const daily = await DailyRevenue.findOne({
                    where: { merchantId: merchant.merchantId, transactionDate: today },
                });
                if (daily) {
                    await daily.update({
                        totalAmount: daily.totalAmount.add(amount),
                        transactionCount: daily.transactionCount + 1,
                        successfulCount: daily.successfulCount + 1,
                    });
                }
            });

            res.status(201).json({
                success: true,
                message: "Transaksi CASH berhasil dicatat",
                data: {
                    transactionId: transaction.transactionId,
                    amount: transaction.amount,
                    status: transaction.status,
                    settlementDate: transaction.settlementDate,
                },
            });
        }
    } catch (error) {
        logger.error(`Create transaction error: ${error.message}`);
        next(error);
    }
});

/**
 * @swagger
 * /api/transactions:
 *   get:
 *     summary: Get transaction list
 *     description: Retrieve transactions with pagination
 *     tags: [Transactions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Success, Pending, Failed, Refunded]
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [QRIS, CASH]
 *     responses:
 *       200:
 *         description: Transactions retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 pagination:
 *                   type: object
 *       401:
 *         description: Unauthorized
 */
router.get("/", authenticateToken, async (req, res, next) => {
    try {
        const merchant = await Merchant.findOne({ where: { userId: req.user.userId } });
        if (!merchant) {
            return res.status(404).json({
                success: false,
                message: "Merchant tidak ditemukan",
            });
        }

        const { page = 1, limit = 20, status, type } = req.query;
        const offset = (page - 1) * limit;

        const where = { merchantId: merchant.merchantId };
        if (status) where.status = status;
        if (type) where.paymentMethod = type;

        const { count, rows } = await Transaction.findAndCountAll({
            where,
            order: [["transactionDate", "DESC"]],
            limit: parseInt(limit),
            offset,
        });

        res.json({
            success: true,
            data: rows,
            pagination: {
                total: count,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(count / limit),
            },
        });
    } catch (error) {
        logger.error(`Get transactions error: ${error.message}`);
        next(error);
    }
});

/**
 * @swagger
 * /api/transactions/{id}:
 *   get:
 *     summary: Get transaction detail
 *     description: Retrieve detailed information of a specific transaction
 *     tags: [Transactions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: TXN123456789
 *     responses:
 *       200:
 *         description: Transaction details retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Transaction not found
 */
router.get("/:id", authenticateToken, async (req, res, next) => {
    try {
        const merchant = await Merchant.findOne({ where: { userId: req.user.userId } });
        if (!merchant) {
            return res.status(404).json({
                success: false,
                message: "Merchant tidak ditemukan",
            });
        }

        const transaction = await Transaction.findOne({
            where: { transactionId: req.params.id, merchantId: merchant.merchantId },
        });

        if (!transaction) {
            return res.status(404).json({
                success: false,
                message: "Transaksi tidak ditemukan",
            });
        }

        res.json({
            success: true,
            data: transaction,
        });
    } catch (error) {
        logger.error(`Get transaction detail error: ${error.message}`);
        next(error);
    }
});

/**
 * @swagger
 * /api/webhook/paylabs:
 *   post:
 *     summary: Paylabs webhook
 *     description: Receive payment status callback from Paylabs
 *     tags: [Webhooks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               merchantTradeNo:
 *                 type: string
 *                 example: TXN123456789
 *               status:
 *                 type: string
 *                 example: "02"
 *               amount:
 *                 type: number
 *                 example: 50000
 *     responses:
 *       200:
 *         description: Webhook processed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 merchantId: { type: string }
 *                 requestId: { type: string }
 *                 errCode: { type: string }
 *       404:
 *         description: Transaction not found
 */
router.post("/webhook/paylabs", async (req, res, next) => {
    try {
        // TODO: Verify signature from Paylabs
        const { merchantTradeNo, status, amount } = req.body;

        const transaction = await Transaction.findOne({
            where: { transactionId: merchantTradeNo },
        });

        if (!transaction) {
            return res.status(404).json({
                success: false,
                message: "Transaksi tidak ditemukan",
            });
        }

        // Update transaction status based on Paylabs callback
        const newStatus = status === "02" ? "Success" : status === "09" ? "Failed" : "Pending";
        await transaction.update({ status: newStatus });

        logger.info(`Webhook received for transaction ${merchantTradeNo}: ${newStatus}`);

        // Return required format for Paylabs
        res.json({
            merchantId: transaction.merchantId,
            requestId: merchantTradeNo,
            errCode: "0",
        });
    } catch (error) {
        logger.error(`Webhook error: ${error.message}`);
        next(error);
    }
});

export default router;
