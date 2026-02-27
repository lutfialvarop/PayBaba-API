import { DataTypes } from "sequelize";
import sequelize from "../database/connection.js";
import Merchant from "./Merchant.js";

const EarlyWarningAlert = sequelize.define(
    "EarlyWarningAlert",
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        merchantId: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
        alertType: {
            type: DataTypes.ENUM("Revenue Drop", "Refund Spike", "Settlement Delay", "Transaction Drop", "Score Drop"),
            allowNull: false,
        },
        severity: {
            type: DataTypes.ENUM("Critical", "Medium", "Low"),
            allowNull: false,
        },
        detectedDate: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
        metricName: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
        metricValue: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
        },
        thresholdValue: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
        },
        deviationPercentage: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: false,
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        qwenAnalysis: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        status: {
            type: DataTypes.ENUM("Active", "Monitoring", "Resolved"),
            defaultValue: "Active",
        },
        isResolved: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        resolvedDate: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        resolvedBy: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
    },
    {
        tableName: "early_warning_alerts",
        timestamps: true,
    },
);

EarlyWarningAlert.belongsTo(Merchant, { foreignKey: "merchantId" });
Merchant.hasMany(EarlyWarningAlert, { foreignKey: "merchantId" });

export default EarlyWarningAlert;
