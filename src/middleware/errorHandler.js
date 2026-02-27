import logger from "../utils/logger.js";

export const errorHandler = (err, req, res, next) => {
    logger.error(`Error: ${err.message}`, {
        stack: err.stack,
        path: req.path,
        method: req.method,
    });

    // Sequelize validation error
    if (err.name === "SequelizeValidationError") {
        return res.status(400).json({
            success: false,
            message: "Validasi data gagal",
            errors: err.errors.map((e) => ({
                field: e.path,
                message: e.message,
            })),
        });
    }

    // Sequelize unique constraint error
    if (err.name === "SequelizeUniqueConstraintError") {
        return res.status(400).json({
            success: false,
            message: "Data sudah ada",
            field: err.errors[0].path,
        });
    }

    // JWT errors
    if (err.name === "JsonWebTokenError") {
        return res.status(403).json({
            success: false,
            message: "Token tidak valid",
        });
    }

    if (err.name === "TokenExpiredError") {
        return res.status(401).json({
            success: false,
            message: "Token sudah kadaluarsa",
        });
    }

    // Default error
    res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || "Internal server error",
    });
};

export const notFoundHandler = (req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.method} ${req.path} tidak ditemukan`,
    });
};
