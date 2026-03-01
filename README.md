# PayBaba API

**Merchant Credit Intelligence System** — Backend API untuk platform Payment Gateway dengan fitur credit scoring berbasis transaksi, early warning system, dan AI-powered insights menggunakan Qwen (Alibaba Cloud).

---

## Tech Stack

- **Runtime**: Node.js v18+ (ESM)
- **Framework**: Express.js
- **Database**: PostgreSQL 12+ via Sequelize ORM
- **Authentication**: JWT (access + refresh token)
- **AI Integration**: Qwen via OpenAI-compatible SDK (Alibaba Cloud DashScope)
- **Validation**: Joi
- **Logging**: Winston
- **Docs**: Swagger UI (`/api-docs`)

---

## Prerequisites

```bash
node --version   # v18.x.x atau lebih tinggi
npm --version    # 9.x.x atau lebih tinggi
psql --version   # 12 atau lebih tinggi
```

---

## Quick Start

### 1. Clone & Install

```bash
git clone <repository-url>
cd "PayBab API"
npm install
```

### 2. Environment Variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Server
NODE_ENV=development
PORT=3000
BASE_URL=http://localhost:3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=paybaba
DB_USER=postgres
DB_PASSWORD=your_password

# JWT
JWT_ACCESS_TOKEN_SECRET=your_secret_min_32_chars
JWT_REFRESH_TOKEN_SECRET=your_refresh_secret_min_32_chars
JWT_ACCESS_TOKEN_EXPIRY=15m
JWT_REFRESH_TOKEN_EXPIRY=7d

# Paylabs Payment Gateway
MID=
PRIVATE_KEY=
PUBLIC_KEY=
PAYLABS_SERVER=SIT
NOTIFY_URL=http://localhost:3000/api/webhook/paylabs

# Qwen AI (Alibaba Cloud)
QWEN_API_KEY=sk-your-key-here
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

# Alert Thresholds
ALERT_REVENUE_DROP_THRESHOLD=20
ALERT_REFUND_SPIKE_THRESHOLD=5
ALERT_SETTLEMENT_DELAY_HOURS=72
ALERT_TRANSACTION_DROP_THRESHOLD=50
```

### 3. Database Setup & Seed

```bash
# Buat database
psql -U postgres -c "CREATE DATABASE paybaba;"

npm run migrate

# Seed dummy data (merchant + bank accounts + transaksi)
npm run seed

# Jalankan server
npm run dev
```

### 4. Verifikasi

Buka browser: [http://localhost:3000/api-docs](http://localhost:3000/api-docs)

---

## NPM Scripts

```bash
npm run dev      # Development server dengan hot reload (nodemon)
npm start        # Production server
npm run migrate
npm run seed     # Seed dummy data ke database
npm test         # Run tests (Jest)
```

---

## Dummy Accounts

### Merchant Accounts

| Risk Level | Email                  | Password     |
| ---------- | ---------------------- | ------------ |
| High Score | merchant.a@example.com | DummyPass123 |
| Mid Score  | merchant.b@example.com | DummyPass123 |
| Low Score  | merchant.c@example.com | DummyPass123 |

### Bank Portal Accounts

| Bank    | Email             | Password    |
| ------- | ----------------- | ----------- |
| BCA     | bank1@bca.com     | BankPass123 |
| Mandiri | bank2@mandiri.com | BankPass123 |
| BNI     | bank3@bni.com     | BankPass123 |

---

## API Endpoints

### Auth

```
POST   /api/auth/register                 Register merchant baru
POST   /api/auth/login                    Login (merchant atau bank)
POST   /api/auth/refresh                  Refresh access token
POST   /api/auth/request-password-reset  Request reset password
POST   /api/auth/reset-password          Reset password dengan token
```

### Merchant _(Bearer Token Required)_

```
GET    /api/merchant/profile              Profile & company info
GET    /api/merchant/dashboard            Dashboard + credit score summary
GET    /api/merchant/credit-detail        Detail komponen credit score + AI explanation
GET    /api/merchant/loan-timing          Rekomendasi waktu optimal pengajuan pinjaman (AI)
GET    /api/merchant/product-insights     Analisis performa produk + saran inventaris (AI)
GET    /api/merchant/alerts               Active early warning alerts
POST   /api/merchant/recalculate          Trigger manual recalculation credit score
```

### Transactions _(Bearer Token Required)_

```
POST   /api/transactions/create           Buat transaksi baru (QRIS / CASH)
GET    /api/transactions                  List transaksi merchant
GET    /api/transactions/:id              Detail transaksi
POST   /api/webhook/paylabs              Webhook callback dari Paylabs
```

### Bank Portal _(Bearer Token Required)_

```
GET    /api/bank/merchants/all            List semua merchant + monthly revenue
POST   /api/bank/merchants/search        Search merchant by criteria
GET    /api/bank/merchants/:id            Profile merchant
GET    /api/bank/merchants/:id/credit    Detail credit score merchant
GET    /api/bank/merchants/:id/alerts    Active alerts merchant
GET    /api/bank/loan-applications/:merchantId   List loan applications
POST   /api/bank/loan-applications       Buat loan application (bank-initiated)
```

---

## Credit Score System

Credit score dikalkulasi dari data transaksi 3 bulan terakhir dengan 5 komponen:

| Komponen            | Bobot | Keterangan                                      |
| ------------------- | ----- | ----------------------------------------------- |
| Transaction Volume  | 25%   | Jumlah transaksi per bulan                      |
| Revenue Consistency | 25%   | Stabilitas pendapatan (volatility)              |
| Growth Trend        | 20%   | Month-over-Month revenue growth                 |
| Refund Rate         | 10%   | Persentase refund (semakin rendah semakin baik) |
| Settlement Time     | 20%   | Rata-rata hari settlement                       |

**Risk Band:**

- `Low` → Score ≥ 80
- `Medium` → Score 60–79
- `High` → Score < 60

### Flow Kalkulasi

```
calculateAndSaveCreditScore(merchantId)
    ├── calculateCreditScore()     ← hitung metrics dari Transaction & DailyRevenue
    ├── generateScoreExplanation() ← generate AI explanation via Qwen
    └── CreditScore.create()       ← INSERT 1 row baru (historical record)
```

Setiap kalkulasi menghasilkan **row baru** di tabel `credit_scores` — data historis tidak ditimpa.

---

## Early Warning System

Sistem otomatis mendeteksi 5 jenis anomali:

| Alert Type       | Trigger Condition                                               |
| ---------------- | --------------------------------------------------------------- |
| Revenue Drop     | Revenue turun >30% dalam 10 hari terakhir vs 20 hari sebelumnya |
| Refund Spike     | Refund rate naik >5% dibanding periode sebelumnya               |
| Settlement Delay | Rata-rata settlement >3 hari                                    |
| Transaction Drop | Jumlah transaksi turun >25%                                     |
| Score Drop       | Credit score turun >15 poin                                     |

---

## Project Structure

```
src/
├── config/
│   └── swagger.js
├── database/
│   ├── connection.js
│   ├── init.js
│   ├── seed.js
│   └── seed-dummy.js
├── middleware/
│   ├── auth.js
│   └── errorHandler.js
├── models/
│   ├── User.js
│   ├── Merchant.js
│   ├── Transaction.js
│   ├── CreditScore.js
│   ├── DailyRevenue.js
│   ├── LoanApplication.js
│   └── EarlyWarningAlert.js
├── routes/
│   ├── auth.js
│   ├── merchant.js
│   ├── bank.js
│   └── transaction.js
├── services/
│   ├── authService.js
│   ├── creditScoringService.js   ← kalkulasi + save credit score
│   ├── qwenService.js            ← AI explanation, loan timing, product insights
│   ├── earlyWarningService.js    ← anomaly detection
│   └── merchantService.js        ← refund rate, monthly growth, product stats
└── utils/
    ├── logger.js
    └── validators.js

logs/
├── combined.log
└── error.log
index.js
```

---

## Example Requests

### Register Merchant

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "merchant@example.com",
    "password": "SecurePass123",
    "companyName": "Toko Saya",
    "fullName": "Nama Merchant",
    "city": "Jakarta",
    "address": "Jl. Contoh No. 123",
    "phoneNumber": "081234567890"
  }'
```

### Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "merchant@example.com", "password": "SecurePass123"}'
```

### Get Credit Detail

```bash
curl http://localhost:3000/api/merchant/credit-detail \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Trigger Manual Credit Score Recalculation

```bash
curl -X POST http://localhost:3000/api/merchant/recalculate \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Create Transaction (QRIS)

```bash
curl -X POST http://localhost:3000/api/transactions/create \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "QRIS",
    "amount": 50000,
    "description": "Pembayaran order #12345",
    "productName": "Produk ABC",
    "productInfo": [
      {
        "id": "SKU-001",
        "name": "Produk ABC",
        "quantity": 2,
        "unitPrice": 25000
      }
    ]
  }'
```

### Create Transaction (CASH)

```bash
curl -X POST http://localhost:3000/api/transactions/create \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "CASH",
    "amount": 50000,
    "description": "Penjualan barang",
    "productName": "Produk A"
  }'
```

### Bank — Get All Merchants

```bash
curl http://localhost:3000/api/bank/merchants/all \
  -H "Authorization: Bearer BANK_ACCESS_TOKEN"
```

---

## Reset Database

```bash
psql -U postgres -c "DROP DATABASE IF EXISTS paybaba;"
psql -U postgres -c "CREATE DATABASE paybaba;"
npm run migrate
npm run seed
npm run dev
```

---

## Logging

Log tersimpan di folder `logs/`:

- `combined.log` — semua log
- `error.log` — error log saja

---

**Version**: 1.0.0-alpha  
**Last Updated**: March 2026
