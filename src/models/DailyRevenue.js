import { DataTypes } from "sequelize";
import sequelize from "../database/connection.js";
import Merchant from "./Merchant.js";

const DailyRevenue = sequelize.define(
    "DailyRevenue",
    {
        id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            autoIncrement: true,
        },
        merchantId: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
        transactionDate: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        totalAmount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
        },
        transactionCount: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        successfulCount: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        failedCount: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        refundedCount: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        refundAmount: {
            type: DataTypes.DECIMAL(15, 2),
            defaultValue: 0,
        },
    },
    {
        tableName: "daily_revenue",
        timestamps: true,
    },
);

DailyRevenue.belongsTo(Merchant, { foreignKey: "merchantId" });
Merchant.hasMany(DailyRevenue, { foreignKey: "merchantId" });

export default DailyRevenue;
