import { DataTypes } from "sequelize";
import sequelize from "../database/connection.js";
import Merchant from "./Merchant.js";

const Transaction = sequelize.define(
    "Transaction",
    {
        transactionId: {
            type: DataTypes.STRING(100),
            primaryKey: true,
            allowNull: false,
        },
        merchantId: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
        transactionDate: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
        },
        amount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
        },
        paymentMethod: {
            type: DataTypes.ENUM("QRIS", "Virtual Account", "E-Wallet", "Credit Card", "Debit Card", "CASH"),
            allowNull: true,
        },
        paymentChannel: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        status: {
            type: DataTypes.ENUM("Success", "Pending", "Failed", "Refunded"),
            defaultValue: "Pending",
        },
        refundStatus: {
            type: DataTypes.ENUM("None", "Requested", "Processed", "Rejected"),
            defaultValue: "None",
        },
        refundAmount: {
            type: DataTypes.DECIMAL(15, 2),
            defaultValue: 0,
        },
        chargebackFlag: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        settlementDate: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        settlementTime: {
            type: DataTypes.TIME,
            allowNull: true,
        },
        feeAmount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: true,
        },
        netAmount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: true,
        },
        customerId: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        metadata: {
            type: DataTypes.JSONB,
            allowNull: true,
        },
    },
    {
        tableName: "transactions",
        timestamps: true,
    },
);

Transaction.belongsTo(Merchant, { foreignKey: "merchantId" });
Merchant.hasMany(Transaction, { foreignKey: "merchantId" });

export default Transaction;
