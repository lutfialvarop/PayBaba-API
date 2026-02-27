import { DataTypes } from "sequelize";
import sequelize from "../database/connection.js";
import Merchant from "./Merchant.js";

const LoanApplication = sequelize.define(
    "LoanApplication",
    {
        applicationId: {
            type: DataTypes.STRING(50),
            primaryKey: true,
            allowNull: false,
        },
        merchantId: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
        bankId: {
            type: DataTypes.STRING(20),
            allowNull: true,
        },
        applicationDate: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
        requestedAmount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
        },
        recommendedAmount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: true,
        },
        recommendedTenorMonths: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        purpose: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        status: {
            type: DataTypes.ENUM("Draft", "Submitted", "Under Review", "Approved", "Rejected", "Disbursed"),
            defaultValue: "Draft",
        },
        creditScoreAtApplication: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        riskBandAtApplication: {
            type: DataTypes.ENUM("Low", "Medium", "High"),
            allowNull: true,
        },
        bankDecisionNotes: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        bankDecisionDate: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        disbursedAmount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: true,
        },
        disbursedDate: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        interestRate: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: true,
        },
    },
    {
        tableName: "loan_applications",
        timestamps: true,
    },
);

LoanApplication.belongsTo(Merchant, { foreignKey: "merchantId" });
Merchant.hasMany(LoanApplication, { foreignKey: "merchantId" });

export default LoanApplication;
