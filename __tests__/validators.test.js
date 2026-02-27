import { registerSchema, loginSchema, createTransactionSchema, resetPasswordSchema, setNewPasswordSchema } from "../src/utils/validators.js";

describe("Input Validators", () => {
    describe("registerSchema", () => {
        const validData = {
            email: "merchant@example.com",
            password: "SecurePass123",
            companyName: "PT Example",
            fullName: "John Doe",
            city: "Jakarta",
            address: "Jl Sudirman 123",
            phoneNumber: "081234567890",
        };

        test("Should validate correct register data", () => {
            const { error } = registerSchema.validate(validData);
            expect(error).toBeUndefined();
        });

        test("Should reject invalid email", () => {
            const { error } = registerSchema.validate({
                ...validData,
                email: "invalid-email",
            });
            expect(error).toBeDefined();
        });

        test("Should reject password less than 8 characters", () => {
            const { error } = registerSchema.validate({
                ...validData,
                password: "Pass123",
            });
            expect(error).toBeDefined();
        });

        test("Should reject missing required fields", () => {
            const { error } = registerSchema.validate({
                email: "merchant@example.com",
            });
            expect(error).toBeDefined();
        });
    });

    describe("loginSchema", () => {
        const validData = {
            email: "merchant@example.com",
            password: "SecurePass123",
        };

        test("Should validate correct login data", () => {
            const { error } = loginSchema.validate(validData);
            expect(error).toBeUndefined();
        });

        test("Should reject invalid email", () => {
            const { error } = loginSchema.validate({
                ...validData,
                email: "invalid-email",
            });
            expect(error).toBeDefined();
        });

        test("Should reject missing email", () => {
            const { error } = loginSchema.validate({
                password: "SecurePass123",
            });
            expect(error).toBeDefined();
        });

        test("Should reject missing password", () => {
            const { error } = loginSchema.validate({
                email: "merchant@example.com",
            });
            expect(error).toBeDefined();
        });
    });

    describe("createTransactionSchema", () => {
        const validData = {
            type: "QRIS",
            amount: 100000,
            description: "Test transaction",
            productName: "Test Product",
            productInfo: [
                {
                    id: "1",
                    name: "Product 1",
                    price: 50000,
                    quantity: 2,
                    type: "physical",
                },
            ],
        };

        test("Should validate correct transaction data", () => {
            const { error } = createTransactionSchema.validate(validData);
            expect(error).toBeUndefined();
        });

        test("Should reject negative amount", () => {
            const { error } = createTransactionSchema.validate({
                ...validData,
                amount: -1000,
            });
            expect(error).toBeDefined();
        });

        test("Should reject zero amount", () => {
            const { error } = createTransactionSchema.validate({
                ...validData,
                amount: 0,
            });
            expect(error).toBeDefined();
        });

        test("Should reject invalid transaction type", () => {
            const { error } = createTransactionSchema.validate({
                ...validData,
                type: "INVALID",
            });
            expect(error).toBeDefined();
        });

        test("Should accept valid transaction types", () => {
            const validTypes = ["QRIS", "CASH"];
            validTypes.forEach((validType) => {
                const { error } = createTransactionSchema.validate({
                    ...validData,
                    type: validType,
                });
                expect(error).toBeUndefined();
            });
        });
    });

    describe("resetPasswordSchema", () => {
        const validData = {
            email: "merchant@example.com",
        };

        test("Should validate correct email for password reset request", () => {
            const { error } = resetPasswordSchema.validate(validData);
            expect(error).toBeUndefined();
        });

        test("Should reject invalid email format", () => {
            const { error } = resetPasswordSchema.validate({
                email: "invalid-email",
            });
            expect(error).toBeDefined();
        });

        test("Should reject missing email", () => {
            const { error } = resetPasswordSchema.validate({});
            expect(error).toBeDefined();
        });
    });

    describe("setNewPasswordSchema", () => {
        const validData = {
            newPassword: "NewSecurePass123",
            confirmPassword: "NewSecurePass123",
        };

        test("Should validate matching passwords", () => {
            const { error } = setNewPasswordSchema.validate(validData);
            expect(error).toBeUndefined();
        });

        test("Should reject weak new password", () => {
            const { error } = setNewPasswordSchema.validate({
                newPassword: "weak",
                confirmPassword: "weak",
            });
            expect(error).toBeDefined();
        });

        test("Should reject mismatched passwords", () => {
            const { error } = setNewPasswordSchema.validate({
                newPassword: "NewSecurePass123",
                confirmPassword: "DifferentPass123",
            });
            expect(error).toBeDefined();
        });
    });

    describe("Email validation", () => {
        test("Should accept valid email formats", () => {
            const validEmails = ["merchant@example.com", "test.user@domain.co.uk", "user+tag@example.com"];

            validEmails.forEach((email) => {
                const { error } = registerSchema.validate({
                    email,
                    password: "ValidPass123",
                    companyName: "Test",
                    fullName: "Test User",
                    city: "Jakarta",
                    address: "Test Address",
                    phoneNumber: "081234567890",
                });
                expect(error).toBeUndefined();
            });
        });

        test("Should reject invalid email formats", () => {
            const invalidEmails = ["invalid.email", "user@", "@example.com"];

            invalidEmails.forEach((email) => {
                const { error } = registerSchema.validate({
                    email,
                    password: "ValidPass123",
                    companyName: "Test",
                    fullName: "Test User",
                    city: "Jakarta",
                    address: "Test Address",
                    phoneNumber: "081234567890",
                });
                expect(error).toBeDefined();
            });
        });
    });

    describe("Password validation", () => {
        test("Should accept valid passwords (8+ characters)", () => {
            const validPasswords = ["SecurePassword123", "ValidPass@1234567890", "Password12345678"];

            validPasswords.forEach((password) => {
                const { error } = registerSchema.validate({
                    email: "user@example.com",
                    password,
                    companyName: "Test",
                    fullName: "Test User",
                    city: "Jakarta",
                    address: "Test Address",
                    phoneNumber: "081234567890",
                });
                expect(error).toBeUndefined();
            });
        });

        test("Should reject weak passwords (less than 8 characters)", () => {
            const weakPasswords = ["Pass123", "short", "1234567"];

            weakPasswords.forEach((password) => {
                const { error } = registerSchema.validate({
                    email: "user@example.com",
                    password,
                    companyName: "Test",
                    fullName: "Test User",
                    city: "Jakarta",
                    address: "Test Address",
                    phoneNumber: "081234567890",
                });
                expect(error).toBeDefined();
            });
        });
    });

    describe("Phone number validation", () => {
        test("Should accept valid Indonesian phone numbers", () => {
            const validNumbers = ["081234567890", "0811234567890", "+6281234567890"];

            validNumbers.forEach((phone) => {
                const { error } = registerSchema.validate({
                    email: "user@example.com",
                    password: "ValidPass123",
                    companyName: "Test",
                    fullName: "Test User",
                    city: "Jakarta",
                    address: "Test Address",
                    phoneNumber: phone,
                });
                expect(error).toBeUndefined();
            });
        });

        test("Should reject invalid phone numbers", () => {
            const invalidNumbers = ["12345", "081", "abcdefghijk"];

            invalidNumbers.forEach((phone) => {
                const { error } = registerSchema.validate({
                    email: "user@example.com",
                    password: "ValidPass123",
                    companyName: "Test",
                    fullName: "Test User",
                    city: "Jakarta",
                    address: "Test Address",
                    phoneNumber: phone,
                });
                expect(error).toBeDefined();
            });
        });
    });
});
