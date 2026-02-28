import jwt from "jsonwebtoken";
import logger from "../utils/logger.js";

export const authenticateToken = (req, res, next) => {
    try {
        const authHeader = req.headers["authorization"];
        const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Token tidak ditemukan",
            });
        }

        jwt.verify(token, process.env.JWT_ACCESS_TOKEN_SECRET, (err, user) => {
            if (err) {
                logger.warn(`Token verification failed: ${err.message}`);
                return res.status(401).json({
                    success: false,
                    message: "Token tidak valid atau sudah kadaluarsa",
                });
            }

            req.user = user;
            next();
        });
    } catch (error) {
        logger.error(`Auth middleware error: ${error.message}`);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

export const authenticateApiKey = (req, res, next) => {
    try {
        const apiKey = req.headers["x-api-key"];
        const expectedApiKey = process.env.BANK_API_KEY || "bank-secret-key-123";

        if (!apiKey) {
            return res.status(401).json({
                success: false,
                message: "API key tidak ditemukan",
            });
        }

        if (apiKey !== expectedApiKey) {
            logger.warn(`Invalid API key attempted: ${apiKey}`);
            return res.status(401).json({
                success: false,
                message: "API key tidak valid",
            });
        }

        next();
    } catch (error) {
        logger.error(`API key auth middleware error: ${error.message}`);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

export const optionalAuth = (req, res, next) => {
    try {
        const authHeader = req.headers["authorization"];
        const token = authHeader && authHeader.split(" ")[1];

        if (token) {
            jwt.verify(token, process.env.JWT_ACCESS_TOKEN_SECRET, (err, user) => {
                if (!err) {
                    req.user = user;
                }
            });
        }

        next();
    } catch (error) {
        logger.error(`Optional auth middleware error: ${error.message}`);
        next();
    }
};
