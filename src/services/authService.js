import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import User from "../models/User.js";
import Merchant from "../models/Merchant.js";
import logger from "../utils/logger.js";

const SALT_ROUNDS = 10;

export const authService = {
    async register(data) {
        try {
            // Check if user already exists
            const existingUser = await User.findOne({ where: { email: data.email } });
            if (existingUser) {
                throw {
                    statusCode: 400,
                    message: "Email sudah terdaftar",
                };
            }

            // Hash password
            const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

            // Create user
            const user = await User.create({
                email: data.email,
                passwordHash,
                companyName: data.companyName,
                fullName: data.fullName,
                city: data.city,
                address: data.address,
                phoneNumber: data.phoneNumber,
            });

            // Create merchant record
            const merchantId = `M${Date.now()}`;
            await Merchant.create({
                merchantId,
                userId: user.id,
                businessScale: "Micro",
            });

            logger.info(`New user registered: ${user.email}`);

            return {
                userId: user.id,
                email: user.email,
                companyName: user.companyName,
                message: "Registrasi berhasil. Silakan login.",
            };
        } catch (error) {
            logger.error(`Registration error: ${error.message}`);
            throw error;
        }
    },

    async login(email, password) {
        try {
            // Find user
            const user = await User.findOne({ where: { email } });
            if (!user) {
                throw {
                    statusCode: 401,
                    message: "Email atau password salah",
                };
            }

            // Verify password
            const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
            if (!isPasswordValid) {
                throw {
                    statusCode: 401,
                    message: "Email atau password salah",
                };
            }

            // Generate tokens
            const accessToken = jwt.sign(
                {
                    userId: user.id,
                    email: user.email,
                    companyName: user.companyName,
                },
                process.env.JWT_ACCESS_TOKEN_SECRET,
                { expiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRY || "15m" },
            );

            const refreshToken = jwt.sign({ userId: user.id }, process.env.JWT_REFRESH_TOKEN_SECRET, { expiresIn: process.env.JWT_REFRESH_TOKEN_EXPIRY || "7d" });

            logger.info(`User logged in: ${email}`);

            return {
                accessToken,
                refreshToken,
                user: {
                    userId: user.id,
                    email: user.email,
                    companyName: user.companyName,
                    fullName: user.fullName,
                },
            };
        } catch (error) {
            logger.error(`Login error: ${error.message}`);
            throw error;
        }
    },

    async refreshToken(refreshToken) {
        try {
            const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_TOKEN_SECRET);

            const user = await User.findByPk(decoded.userId);
            if (!user) {
                throw {
                    statusCode: 401,
                    message: "User tidak ditemukan",
                };
            }

            const newAccessToken = jwt.sign(
                {
                    userId: user.id,
                    email: user.email,
                    companyName: user.companyName,
                },
                process.env.JWT_ACCESS_TOKEN_SECRET,
                { expiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRY || "15m" },
            );

            return {
                accessToken: newAccessToken,
            };
        } catch (error) {
            logger.error(`Refresh token error: ${error.message}`);
            throw {
                statusCode: 401,
                message: "Refresh token tidak valid",
            };
        }
    },

    async requestPasswordReset(email) {
        try {
            const user = await User.findOne({ where: { email } });
            if (!user) {
                // Don't reveal if email exists (security)
                return {
                    message: "Jika email terdaftar, link reset akan dikirim",
                };
            }

            // Generate reset token (valid for 1 hour)
            const resetToken = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_ACCESS_TOKEN_SECRET, { expiresIn: "1h" });

            // Save reset token to DB
            await user.update({
                resetPasswordToken: resetToken,
                resetPasswordExpiry: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
            });

            logger.info(`Password reset requested for: ${email}`);

            // In production, send email with reset link
            // For now, return token (frontned akan menggunakannya)
            return {
                message: "Link reset password telah dikirim ke email Anda",
                resetToken, // Return for demo purposes only - remove in production
            };
        } catch (error) {
            logger.error(`Password reset request error: ${error.message}`);
            throw error;
        }
    },

    async resetPassword(resetToken, newPassword) {
        try {
            // Verify token
            const decoded = jwt.verify(resetToken, process.env.JWT_ACCESS_TOKEN_SECRET);

            const user = await User.findByPk(decoded.userId);
            if (!user || user.resetPasswordToken !== resetToken) {
                throw {
                    statusCode: 400,
                    message: "Token reset tidak valid atau sudah kadaluarsa",
                };
            }

            // Check if token expired
            if (new Date() > user.resetPasswordExpiry) {
                throw {
                    statusCode: 400,
                    message: "Token reset sudah kadaluarsa",
                };
            }

            // Hash new password
            const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

            // Update password & clear reset token
            await user.update({
                passwordHash,
                resetPasswordToken: null,
                resetPasswordExpiry: null,
            });

            logger.info(`Password reset for: ${user.email}`);

            return {
                message: "Password berhasil direset. Silakan login dengan password baru.",
            };
        } catch (error) {
            logger.error(`Password reset error: ${error.message}`);
            throw error;
        }
    },
};
