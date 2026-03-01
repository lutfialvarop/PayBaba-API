import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import { validateRequest, createTransactionSchema } from "../utils/validators.js";
import Merchant from "../models/Merchant.js";
import Transaction from "../models/Transaction.js";
import DailyRevenue from "../models/DailyRevenue.js";
import logger from "../utils/logger.js";
import { PaylabsClient } from "../utils/Paylabs.js";

const router = express.Router();

/* ================================
   PAYLABS INIT
================================ */
const paylabs = new PaylabsClient({
    server: process.env.PAYLABS_SERVER || "SIT",
    mid: process.env.MID,
    privateKey: process.env.PRIVATE_KEY,
    publicKey: process.env.PUBLIC_KEY,
    log: process.env.NODE_ENV !== "production",
});

/* =====================================================
   CREATE TRANSACTION
===================================================== */
/**
 * @swagger
 * /api/transactions/create:
 *   post:
 *     summary: Create new transaction (QRIS or CASH)
 *     description: |
 *       Create a new transaction.
 *
 *       - If type = QRIS → will generate QRIS via Paylabs API.
 *       - If type = CASH → will record transaction as Success immediately.
 *
 *       For QRIS, productInfo will be stored in metadata in database.
 *     tags:
 *       - Transactions
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - amount
 *             properties:
 *               type:
 *                 type: string
 *                 enum:
 *                   - QRIS
 *                   - CASH
 *                 example: QRIS
 *               amount:
 *                 type: number
 *                 minimum: 1000
 *                 example: 10000
 *               description:
 *                 type: string
 *                 example: Pembayaran Order #INV-001
 *               productName:
 *                 type: string
 *                 example: Paket Premium
 *               productInfo:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - id
 *                     - name
 *                     - price
 *                     - quantity
 *                     - type
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: ITEM1
 *                     name:
 *                       type: string
 *                       example: Paket Premium
 *                     price:
 *                       type: number
 *                       example: 10000
 *                     quantity:
 *                       type: integer
 *                       example: 1
 *                     type:
 *                       type: string
 *                       example: General
 *                     url:
 *                       type: string
 *                       example: https://paybaba.id/product/1
 *           example:
 *             type: QRIS
 *             amount: 10000
 *             description: Pembayaran Order #INV-001
 *             productName: Paket Premium
 *             productInfo:
 *               - id: ITEM1
 *                 name: Paket Premium
 *                 price: 10000
 *                 quantity: 1
 *                 type: General
 *                 url: https://paybaba.id/product/1
 *     responses:
 *       201:
 *         description: Transaction created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Transaksi QRIS berhasil dibuat
 *                 data:
 *                   type: object
 *                   properties:
 *                     transactionId:
 *                       type: string
 *                       example: TXN1719999999999
 *                     amount:
 *                       type: string
 *                       example: "10000.00"
 *                     status:
 *                       type: string
 *                       enum:
 *                         - Pending
 *                         - Success
 *                         - Failed
 *                       example: Pending
 *                     qrCode:
 *                       type: string
 *                       example: 00020101021126690011ID.CO.QRIS.WWW...
 *                     qrisUrl:
 *                       type: string
 *                       example: https://sit-api.paylabs.co.id/payment/qr/img?url=xxxx
 *                     expiredTime:
 *                       type: string
 *                       example: "20260301120000"
 *                     productInfo:
 *                       type: array
 *                       items:
 *                         type: object
 *       400:
 *         description: Validation error or Paylabs error
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: Paylabs Error: paramInvalid
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: Unauthorized
 *       404:
 *         description: Merchant not found
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: Merchant tidak ditemukan
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: Internal Server Error
 */
router.post("/create", authenticateToken, validateRequest(createTransactionSchema), async (req, res) => {
    try {
        const merchant = await Merchant.findOne({
            where: { userId: req.user.userId },
        });

        if (!merchant) {
            return res.status(404).json({
                success: false,
                message: "Merchant tidak ditemukan",
            });
        }

        const { type, amount, description, productName, productInfo } = req.validatedData;

        const transactionId = `TXN${Date.now()}`;

        if (type === "QRIS") {
            const paylabsPath = "/payment/v2.3/qris/create";

            // ===== FORMAT PRODUCT INFO SESUAI DOC =====
            const formattedProductInfo =
                productInfo && productInfo.length > 0
                    ? productInfo.map((item, index) => ({
                          id: (item.id || `ITEM${index + 1}`).toString(),
                          name: item.name || productName || "Product",
                          price: parseFloat(item.price || amount).toFixed(2),
                          type: item.type || "General",
                          quantity: item.quantity || 1,
                          url: item.url || "https://paybaba.id",
                      }))
                    : [
                          {
                              id: "ITEM1",
                              name: productName || "Payment",
                              price: parseFloat(amount).toFixed(2),
                              type: "General",
                              quantity: 1,
                              url: "https://paybaba.id",
                          },
                      ];

            // ===== PAYLOAD SESUAI DOKUMENTASI =====
            const payload = {
                merchantId: process.env.MID,
                paymentType: "QRIS",
                amount: parseFloat(amount).toFixed(2),
                productName: productName || "Payment",
                notifyUrl: process.env.NOTIFY_URL,
                productInfo: formattedProductInfo,
            };

            // ⚠️ PENTING: requestId & merchantTradeNo dikirim via opts
            const response = await paylabs.request(paylabsPath, payload, {
                requestId: transactionId,
                merchantTradeNo: transactionId,
            });

            if (response.errCode !== "0") {
                logger.error(`Paylabs Error: ${JSON.stringify(response)}`);
                return res.status(400).json({
                    success: false,
                    message: `Paylabs Error: ${response.errCodeDes || response.errCode}`,
                });
            }

            // ===== SIMPAN KE DB (productInfo masuk metadata) =====
            const transaction = await Transaction.create({
                transactionId,
                merchantId: merchant.merchantId,
                amount,
                paymentMethod: "QRIS",
                status: "Pending",
                metadata: {
                    description,
                    paylabsRef: response.platformTradeNo,
                    qrString: response.qrCode,
                    productInfo: formattedProductInfo,
                },
            });

            return res.status(201).json({
                success: true,
                message: "Transaksi QRIS berhasil dibuat",
                data: {
                    transactionId,
                    amount: response.amount,
                    status: response.status,
                    qrCode: response.qrCode,
                    qrisUrl: response.qrisUrl,
                    expiredTime: response.expiredTime,
                    productInfo: formattedProductInfo,
                },
            });
        }

        // ===== CASH FLOW =====
        if (type === "CASH") {
            const transaction = await Transaction.create({
                transactionId,
                merchantId: merchant.merchantId,
                amount,
                paymentMethod: "CASH",
                status: "Success",
                settlementDate: new Date(),
                metadata: {
                    description,
                    productInfo,
                },
            });

            const today = new Date().toISOString().split("T")[0];

            await DailyRevenue.findOrCreate({
                where: {
                    merchantId: merchant.merchantId,
                    transactionDate: today,
                },
                defaults: {
                    totalAmount: 0,
                    transactionCount: 0,
                    successfulCount: 0,
                },
            }).then(async ([daily]) => {
                await daily.increment({
                    totalAmount: amount,
                    transactionCount: 1,
                    successfulCount: 1,
                });
            });

            return res.status(201).json({
                success: true,
                message: "Transaksi CASH berhasil dicatat",
                data: transaction,
            });
        }
    } catch (error) {
        logger.error(`Create transaction error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});

/* =====================================================
   GET LIST
===================================================== */
/**
 * @swagger
 * /api/transactions:
 *   get:
 *     summary: Get transactions list
 *     tags:
 *       - Transactions
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 */
router.get("/", authenticateToken, async (req, res) => {
    try {
        const merchant = await Merchant.findOne({
            where: { userId: req.user.userId },
        });

        if (!merchant)
            return res.status(404).json({
                success: false,
                message: "Merchant tidak ditemukan",
            });

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const { count, rows } = await Transaction.findAndCountAll({
            where: { merchantId: merchant.merchantId },
            order: [["createdAt", "DESC"]],
            limit,
            offset,
        });

        res.json({
            success: true,
            data: rows,
            pagination: {
                total: count,
                page,
                limit,
                pages: Math.ceil(count / limit),
            },
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});

/* =====================================================
   CHECK STATUS
===================================================== */
/**
 * @swagger
 * /api/transactions/{id}/check-status:
 *   get:
 *     summary: Check transaction status to Paylabs
 *     tags:
 *       - Transactions
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Status updated
 *       404:
 *         description: Not found
 */
router.get("/:id/check-status", authenticateToken, async (req, res) => {
    try {
        const merchant = await Merchant.findOne({
            where: { userId: req.user.userId },
        });

        if (!merchant)
            return res.status(404).json({
                success: false,
                message: "Merchant tidak ditemukan",
            });

        const transaction = await Transaction.findOne({
            where: {
                transactionId: req.params.id,
                merchantId: merchant.merchantId,
            },
        });

        if (!transaction)
            return res.status(404).json({
                success: false,
                message: "Transaksi tidak ditemukan",
            });

        if (transaction.paymentMethod === "CASH") {
            return res.json({
                success: true,
                data: { status: transaction.status },
            });
        }

        const response = await paylabs.request("/payment/v2.3/qris/query", {
            merchantId: process.env.MID,
            merchantTradeNo: transaction.transactionId,
            requestId: `REQ-${Date.now()}`,
            paymentType: "QRIS",
        });

        let newStatus = transaction.status;

        if (response.status === "02") newStatus = "Success";
        if (response.status === "09") newStatus = "Failed";

        if (transaction.status !== newStatus) {
            await transaction.update({
                status: newStatus,
                settlementDate: newStatus === "Success" ? new Date() : transaction.settlementDate,
            });
        }

        res.json({
            success: true,
            data: {
                transactionId: transaction.transactionId,
                status: newStatus,
                paylabsStatus: response.status,
            },
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});

export default router;
