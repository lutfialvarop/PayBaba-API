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
   1. CREATE TRANSACTION
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
 *               message: "Paylabs Error: paramInvalid"
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
router.post("/create", authenticateToken, validateRequest(createTransactionSchema), async (req, res, next) => {
    try {
        const merchant = await Merchant.findOne({ where: { userId: req.user.userId } });
        if (!merchant) return res.status(404).json({ success: false, message: "Merchant tidak ditemukan" });

        const { type, amount, description, productName, productInfo } = req.validatedData;

        // Generate ID Unik (Tambahkan random string agar tidak tebak-tebakan)
        const transactionId = `TXN${Date.now()}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

        // --- FLOW QRIS ---
        if (type === "QRIS") {
            const paylabsPath = "/payment/v2.3/qris/create";

            // Format Product Info (Array of Object)
            const formattedProductInfo =
                productInfo && productInfo.length > 0
                    ? productInfo.map((item, index) => ({
                          id: (item.id || `ITEM${index + 1}`).toString(),
                          name: item.name || productName || "Item",
                          price: parseFloat(item.price || amount).toFixed(2),
                          type: item.type || "General",
                          quantity: item.quantity || 1,
                          url: item.url || "https://paybaba.id",
                      }))
                    : [
                          {
                              id: "ITEM01",
                              name: productName || "Payment",
                              price: parseFloat(amount).toFixed(2),
                              type: "General",
                              quantity: 1,
                              url: "https://paybaba.id",
                          },
                      ];

            const payload = {
                merchantId: process.env.MID,
                paymentType: "QRIS",
                amount: parseFloat(amount).toFixed(2),
                productName: productName || "Payment Order",
                notifyUrl: process.env.NOTIFY_URL,
                productInfo: formattedProductInfo,
            };

            // Request ke Paylabs
            // Ops: requestId & merchantTradeNo dikirim terpisah agar masuk header signature juga
            const response = await paylabs.request(paylabsPath, payload, {
                requestId: transactionId,
                merchantTradeNo: transactionId,
            });

            if (response.errCode !== "0") {
                logger.error(`Paylabs Error: ${JSON.stringify(response)}`);
                return res.status(400).json({ success: false, message: `Paylabs Error: ${response.errCodeDes || response.errMsg}` });
            }

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
                    transactionId: transaction.transactionId,
                    amount: response.amount,
                    status: response.status,
                    qrCode: response.qrCode,
                    qrisUrl: response.qrisUrl,
                    expiredTime: response.expiredTime,
                    productInfo: formattedProductInfo,
                },
            });
        }

        // --- FLOW CASH ---
        if (type === "CASH") {
            const transaction = await Transaction.create({
                transactionId,
                merchantId: merchant.merchantId,
                amount,
                paymentMethod: "CASH",
                status: "Success",
                settlementDate: new Date(),
                metadata: { description, productInfo },
            });

            // Update Revenue
            const today = new Date().toISOString().split("T")[0];
            await DailyRevenue.findOrCreate({
                where: { merchantId: merchant.merchantId, transactionDate: today },
                defaults: { totalAmount: 0, transactionCount: 0, successfulCount: 0 },
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
        next(error);
    }
});

/* =====================================================
   2. GET LIST TRANSACTIONS
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
 *     responses:
 *       200:
 *         description: Success
 */
router.get("/", authenticateToken, async (req, res, next) => {
    try {
        const merchant = await Merchant.findOne({ where: { userId: req.user.userId } });
        if (!merchant) return res.status(404).json({ success: false, message: "Merchant tidak ditemukan" });

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
        next(error);
    }
});

/* =====================================================
   3. [ADDED] GET DETAIL TRANSACTION
===================================================== */
/**
 * @swagger
 * /api/transactions/{id}:
 *   get:
 *     summary: Get transaction detail
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
 *         description: Detail retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       404:
 *         description: Not Found
 */
router.get("/:id", authenticateToken, async (req, res, next) => {
    try {
        const merchant = await Merchant.findOne({ where: { userId: req.user.userId } });
        if (!merchant) return res.status(404).json({ success: false, message: "Merchant tidak ditemukan" });

        const transaction = await Transaction.findOne({
            where: { transactionId: req.params.id, merchantId: merchant.merchantId },
        });

        if (!transaction) return res.status(404).json({ success: false, message: "Transaksi tidak ditemukan" });

        res.json({ success: true, data: transaction });
    } catch (error) {
        next(error);
    }
});

/* =====================================================
   4. CHECK STATUS (INQUIRY)
===================================================== */
/**
 * @swagger
 * /api/transactions/{id}/check-status:
 *   get:
 *     summary: Check transaction status from Paylabs
 *     description: |
 *       Force inquiry to Paylabs API and update local database.
 *       Only applicable for QRIS transactions.
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
 *           example: TXN1719999999999
 *     responses:
 *       200:
 *         description: Status successfully retrieved
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 transactionId: TXN1719999999999
 *                 status: Success
 *                 paylabsStatus: "02"
 *                 amount: "10000.00"
 *       400:
 *         description: Failed to check status
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: Gagal cek status
 *       404:
 *         description: Transaction not found
 */
router.get("/:id/check-status", authenticateToken, async (req, res, next) => {
    try {
        const merchant = await Merchant.findOne({ where: { userId: req.user.userId } });
        if (!merchant) return res.status(404).json({ success: false, message: "Merchant tidak ditemukan" });

        const transaction = await Transaction.findOne({
            where: { transactionId: req.params.id, merchantId: merchant.merchantId },
        });

        if (!transaction) return res.status(404).json({ success: false, message: "Transaksi tidak ditemukan" });

        if (transaction.paymentMethod === "CASH") {
            return res.json({ success: true, data: { status: transaction.status } });
        }

        // Inquiry ke Paylabs
        const inquiryPath = "/payment/v2.3/qris/query";
        const payload = {
            merchantId: process.env.MID,
            merchantTradeNo: transaction.transactionId,
            paymentType: "QRIS",
        };

        // Gunakan request ID baru untuk inquiry
        const response = await paylabs.request(inquiryPath, payload, {
            requestId: `CHK${Date.now()}`,
        });

        if (response.errCode !== "0") {
            return res.status(400).json({ success: false, message: `Inquiry Gagal: ${response.errCodeDes}` });
        }

        let newStatus = transaction.status;
        if (response.status === "02") newStatus = "Success";
        if (response.status === "09") newStatus = "Failed";

        // Update DB jika status berubah
        if (transaction.status !== newStatus) {
            await transaction.update({
                status: newStatus,
                settlementDate: newStatus === "Success" ? new Date() : transaction.settlementDate,
            });

            // [ADDED LOGIC] Jika jadi sukses, update Revenue
            if (newStatus === "Success") {
                const today = new Date().toISOString().split("T")[0];
                await DailyRevenue.findOrCreate({
                    where: { merchantId: merchant.merchantId, transactionDate: today },
                    defaults: { totalAmount: 0, transactionCount: 0, successfulCount: 0 },
                }).then(async ([daily]) => {
                    await daily.increment({
                        totalAmount: transaction.amount,
                        transactionCount: 1,
                        successfulCount: 1,
                    });
                });
            }
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
        next(error);
    }
});

/* =====================================================
   5. [ADDED] WEBHOOK PAYLABS
===================================================== */
/**
 * @swagger
 * /api/webhook/paylabs:
 *   post:
 *     summary: Paylabs Webhook Callback
 *     description: |
 *       Endpoint for receiving asynchronous payment notification from Paylabs.
 *       This endpoint verifies signature and updates transaction status.
 *     tags:
 *       - Webhooks
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *         content:
 *           application/json:
 *             example:
 *               responseCode: success
 *               responseMessage: success
 *       401:
 *         description: Invalid signature
 *         content:
 *           application/json:
 *             example:
 *               errCode: "401"
 *               errMsg: "Invalid Signature"
 */
router.post("/webhook/paylabs", async (req, res) => {
    const callbackPath = "/api/webhook/paylabs"; // Sesuaikan dengan path yang didaftarkan di Paylabs

    try {
        const timestamp = req.headers["x-timestamp"];
        const signature = req.headers["x-signature"];

        // Gunakan rawBody jika tersedia (middleware), atau JSON.stringify sebagai fallback
        const bodyString = req.rawBody || JSON.stringify(req.body);

        // 1. Verifikasi Signature
        const isValid = paylabs.verifySignature(callbackPath, bodyString, signature, timestamp);
        if (!isValid) {
            logger.warn(`Invalid Webhook Signature: ${req.body?.merchantTradeNo}`);
            return res.status(401).json({ errCode: "401", errMsg: "Invalid Signature" });
        }

        const { merchantTradeNo, status, errCode } = req.body;

        const transaction = await Transaction.findOne({ where: { transactionId: merchantTradeNo } });

        if (!transaction) {
            // Return 404 Signed
            const response = paylabs.buildResponseCallback(callbackPath);
            response.body.errCode = "404";
            return res.set(response.headers).status(404).json(response.body);
        }

        // 2. Update Status
        let newStatus = transaction.status;
        if (status === "02" && errCode === "0") newStatus = "Success";
        else if (status === "09") newStatus = "Failed";

        if (transaction.status !== newStatus) {
            await transaction.update({
                status: newStatus,
                settlementDate: newStatus === "Success" ? new Date() : transaction.settlementDate,
            });

            // Update Revenue jika Success
            if (newStatus === "Success") {
                const today = new Date().toISOString().split("T")[0];
                await DailyRevenue.findOrCreate({
                    where: { merchantId: transaction.merchantId, transactionDate: today },
                    defaults: { totalAmount: 0, transactionCount: 0, successfulCount: 0 },
                }).then(async ([daily]) => {
                    await daily.increment({
                        totalAmount: transaction.amount,
                        transactionCount: 1,
                        successfulCount: 1,
                    });
                });
            }
            logger.info(`Webhook: Transaction ${merchantTradeNo} updated to ${newStatus}`);
        }

        // 3. Return Signed Response (Wajib)
        const responseCallback = paylabs.buildResponseCallback(callbackPath);
        res.set(responseCallback.headers).json(responseCallback.body);
    } catch (error) {
        logger.error(`Webhook Error: ${error.message}`);
        res.status(500).json({ errCode: "500", errMsg: "Internal Error" });
    }
});

export default router;
