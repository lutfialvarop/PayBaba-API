import { DataTypes } from "sequelize";
import sequelize from "../database/connection.js";
import User from "./User.js";

const Merchant = sequelize.define(
    "Merchant",
    {
        merchantId: {
            type: DataTypes.STRING(50),
            primaryKey: true,
            allowNull: false,
        },
        userId: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        businessCategory: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        subCategory: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        joinDate: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
        businessScale: {
            type: DataTypes.ENUM("Micro", "Small", "Medium", "Large"),
            defaultValue: "Micro",
        },
        taxId: {
            type: DataTypes.STRING(30),
            allowNull: true,
        },
        businessLicenseNumber: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
    },
    {
        tableName: "merchants",
        timestamps: true,
    },
);

Merchant.belongsTo(User, { foreignKey: "userId" });
User.hasOne(Merchant, { foreignKey: "userId" });

export default Merchant;
