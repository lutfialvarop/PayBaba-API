import request from "supertest";
import app from "../src/app.js";
import User from "../src/models/User.js";
import Merchant from "../src/models/Merchant.js";

// Mock data with unique timestamps to avoid conflicts
const uniqueId = Date.now();
const testUser = {
    email: `test-${uniqueId}@merchant.com`,
    password: "Test@123456",
    companyName: "Test Company",
    fullName: "Test Merchant",
    city: "Jakarta",
    address: "Jl Test 123",
    phoneNumber: "081234567890",
};

const testUser2 = {
    email: `test2-${uniqueId}@merchant.com`,
    password: "Test@123456",
    companyName: "Test Company 2",
    fullName: "Test Merchant 2",
    city: "Bandung",
    address: "Jl Test 456",
    phoneNumber: "081234567891",
};

let authToken = "";
let refreshToken = "";

describe("Authentication API", () => {
    describe("POST /api/auth/register", () => {
        test("Should register new merchant successfully", async () => {
            const response = await request(app).post("/api/auth/register").send(testUser).expect(201);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty("userId");
            expect(response.body.data.email).toBe(testUser.email);
        });

        test("Should return 400 if email already registered", async () => {
            await request(app).post("/api/auth/register").send(testUser2);

            const response = await request(app).post("/api/auth/register").send(testUser2).expect(400);

            expect(response.body.success).toBe(false);
        });

        test("Should return 400 for invalid email", async () => {
            const response = await request(app)
                .post("/api/auth/register")
                .send({
                    ...testUser,
                    email: "invalid-email",
                })
                .expect(400);

            expect(response.body.success).toBe(false);
        });

        test("Should return 400 for weak password", async () => {
            const response = await request(app)
                .post("/api/auth/register")
                .send({
                    ...testUser,
                    password: "123",
                })
                .expect(400);

            expect(response.body.success).toBe(false);
        });

        test("Should return 400 for missing required fields", async () => {
            const response = await request(app)
                .post("/api/auth/register")
                .send({
                    email: "test@example.com",
                    password: "Test@123456",
                })
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.errors).toBeDefined();
        });
    });

    describe("POST /api/auth/login", () => {
        test("Should login successfully and return tokens", async () => {
            const response = await request(app)
                .post("/api/auth/login")
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty("accessToken");
            expect(response.body.data).toHaveProperty("refreshToken");
            expect(response.body.data.user.email).toBe(testUser.email);

            authToken = response.body.data.accessToken;
            refreshToken = response.body.data.refreshToken;
        });

        test("Should return 401 for wrong password", async () => {
            const response = await request(app)
                .post("/api/auth/login")
                .send({
                    email: testUser.email,
                    password: "WrongPassword123",
                })
                .expect(401);

            expect(response.body.success).toBe(false);
        });

        test("Should return 401 for non-existent user", async () => {
            const response = await request(app)
                .post("/api/auth/login")
                .send({
                    email: "nonexistent@example.com",
                    password: "Test@123456",
                })
                .expect(401);

            expect(response.body.success).toBe(false);
        });

        test("Should return 400 for invalid email format", async () => {
            const response = await request(app)
                .post("/api/auth/login")
                .send({
                    email: "invalid-email",
                    password: testUser.password,
                })
                .expect(400);

            expect(response.body.success).toBe(false);
        });
    });

    describe("POST /api/auth/refresh", () => {
        test("Should refresh access token", async () => {
            const response = await request(app).post("/api/auth/refresh").send({ refreshToken }).expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty("accessToken");
            // Just check that we got a valid JWT token
            const parts = response.body.data.accessToken.split(".");
            expect(parts.length).toBe(3);
        });

        test("Should return 401 for invalid refresh token", async () => {
            const response = await request(app).post("/api/auth/refresh").send({ refreshToken: "invalid-token" }).expect(401);

            expect(response.body.success).toBe(false);
        });
    });
});

describe("Merchant API", () => {
    describe("GET /api/merchant/profile", () => {
        test("Should get merchant profile with valid token", async () => {
            const response = await request(app).get("/api/merchant/profile").set("Authorization", `Bearer ${authToken}`).expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty("user");
            expect(response.body.data).toHaveProperty("merchant");
            expect(response.body.data.user.email).toBe(testUser.email);
        });

        test("Should return 401 without auth token", async () => {
            const response = await request(app).get("/api/merchant/profile").expect(401);

            expect(response.body.success).toBe(false);
        });

        test("Should return 401 with invalid token", async () => {
            const response = await request(app).get("/api/merchant/profile").set("Authorization", "Bearer invalid-token").expect(401);

            expect(response.body.success).toBe(false);
        });
    });

    describe("GET /api/merchant/dashboard", () => {
        test("Should get merchant dashboard", async () => {
            const response = await request(app).get("/api/merchant/dashboard").set("Authorization", `Bearer ${authToken}`).expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty("merchantId");
            expect(response.body.data).toHaveProperty("currentCreditScore");
            expect(response.body.data).toHaveProperty("riskBand");
        });
    });

    describe("GET /api/merchant/alerts", () => {
        test("Should get merchant alerts", async () => {
            const response = await request(app).get("/api/merchant/alerts").set("Authorization", `Bearer ${authToken}`).expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty("totalAlerts");
            expect(response.body.data).toHaveProperty("alerts");
        });
    });

    describe("GET /api/merchant/loan-timing", () => {
        test("Should get loan timing recommendation", async () => {
            const response = await request(app).get("/api/merchant/loan-timing").set("Authorization", `Bearer ${authToken}`).expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toBeDefined();
        });
    });
});

describe("Bank API", () => {
    describe("POST /api/bank/merchants/search", () => {
        test("Should search merchants with valid API key", async () => {
            const response = await request(app).post("/api/bank/merchants/search").set("X-API-Key", "bank-secret-key-123").send({ minCreditScore: 0, maxCreditScore: 100 }).expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty("count");
            expect(response.body.data).toHaveProperty("merchants");
        });

        test("Should return 401 without API key", async () => {
            const response = await request(app).post("/api/bank/merchants/search").send({ minCreditScore: 0, maxCreditScore: 100 }).expect(401);

            expect(response.body.success).toBe(false);
        });

        test("Should return 401 with invalid API key", async () => {
            const response = await request(app).post("/api/bank/merchants/search").set("X-API-Key", "invalid-key").send({ minCreditScore: 0, maxCreditScore: 100 }).expect(401);

            expect(response.body.success).toBe(false);
        });

        test("Should filter merchants by credit score", async () => {
            const response = await request(app).post("/api/bank/merchants/search").set("X-API-Key", "bank-secret-key-123").send({ minCreditScore: 80, maxCreditScore: 100 }).expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty("merchants");
        });
    });

    describe("GET /api/bank/merchants/:merchantId", () => {
        let merchantId = "";

        test("Should get merchant detail by ID", async () => {
            // First get the merchant ID
            const merchant = await Merchant.findOne({
                where: { userId: (await User.findOne({ where: { email: testUser.email } })).id },
            });

            if (merchant) {
                merchantId = merchant.merchantId;
                const response = await request(app).get(`/api/bank/merchants/${merchantId}`).set("X-API-Key", "bank-secret-key-123").expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.data.merchantId).toBe(merchantId);
            }
        });

        test("Should return 404 for non-existent merchant", async () => {
            const response = await request(app).get("/api/bank/merchants/NONEXISTENT").set("X-API-Key", "bank-secret-key-123").expect(404);

            expect(response.body.success).toBe(false);
        });
    });

    describe("POST /api/bank/batch-assessment", () => {
        test("Should assess multiple merchants", async () => {
            const response = await request(app)
                .post("/api/bank/batch-assessment")
                .set("X-API-Key", "bank-secret-key-123")
                .send({ merchantIds: ["M001", "M002"] })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty("summary");
        });

        test("Should return 400 for empty merchant list", async () => {
            const response = await request(app).post("/api/bank/batch-assessment").set("X-API-Key", "bank-secret-key-123").send({ merchantIds: [] }).expect(400);

            expect(response.body.success).toBe(false);
        });
    });
});

describe("Health Check", () => {
    test("GET /health should return 200", async () => {
        const response = await request(app).get("/health").expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe("PayBaba API is running");
    });
});

describe("API Documentation", () => {
    test("GET /api-docs should be accessible", async () => {
        const response = await request(app).get("/api-docs/").expect(200);

        expect(response.text).toContain("Swagger UI");
    });

    test("GET /api-docs/swagger.json should return OpenAPI spec", async () => {
        const response = await request(app).get("/api-docs/swagger.json").expect(200);

        expect(response.body).toHaveProperty("openapi");
        expect(response.body).toHaveProperty("info");
        expect(response.body).toHaveProperty("paths");
    });
});
