import { DataTypes } from "sequelize";
import sequelize from "../database/connection.js";
import Merchant from "./Merchant.js";

const CreditScore = sequelize.define(
    "CreditScore",
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
        calculationDate: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
        },
        creditScore: {
            type: DataTypes.INTEGER,
            allowNull: false,
            validate: {
                min: 0,
                max: 100,
            },
        },
        riskBand: {
            type: DataTypes.ENUM("Low", "Medium", "High"),
            allowNull: false,
        },
        estimatedMinLimit: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
        },
        estimatedMaxLimit: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
        },
        // Component Scores
        transactionVolumeScore: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        revenueConsistencyScore: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        growthTrendScore: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        refundRateScore: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        settlementTimeScore: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        // Metrics
        avgMonthlyRevenue: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
        },
        revenueVolatility: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: false,
        },
        growthPercentageMoM: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: true,
        },
        refundRatePercentage: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: false,
        },
        avgSettlementDays: {
            type: DataTypes.DECIMAL(3, 1),
            allowNull: false,
        },
        transactionCount3m: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        // Explainability
        featureImportance: {
            type: DataTypes.JSONB,
            allowNull: true,
        },
        qwenExplanation: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        qwenRecommendation: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
    },
    {
        tableName: "credit_scores",
        timestamps: true,
    },
);

CreditScore.belongsTo(Merchant, { foreignKey: "merchantId" });
Merchant.hasMany(CreditScore, { foreignKey: "merchantId" });

export default CreditScore;
