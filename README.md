# PayBaba Backend API

Merchant Credit Intelligence System Backend dengan Express.js + PostgreSQL

## 🚀 Quick Start Setup

Panduan lengkap untuk menjalankan project ini dari awal setelah clone dari GitHub.

### A. Prerequisites (Persiapan)

Pastikan sudah install:

- **Node.js** v18+ - [Download](https://nodejs.org)
- **PostgreSQL** 12+ - [Download](https://www.postgresql.org)
- **Git** - [Download](https://git-scm.com)

Verifikasi:

```bash
node --version        # v18.x.x atau lebih tinggi
npm --version         # 9.x.x atau lebih tinggi
psql --version        # 12 atau lebih tinggi
```

---

### B. Clone & Install Dependencies

```bash
# 1. Clone repository
git clone <repository-url>
cd "Paylabs x Alibaba/PayBab API"

# 2. Install npm dependencies
npm install

# 3. Verify installation
npm list --depth=0
```

**Expected output:**

```
├── express@4.18.2
├── sequelize@6.x.x
├── postgresql@0.18.0
├── bcryptjs@2.4.3
├── jsonwebtoken@9.x.x
└── ... (other dependencies)
```

---

### C. Configure Environment Variables

```bash
# 1. Copy template ke .env
cp .env.example .env

# 2. Edit .env dengan text editor favorit
# atau gunakan nano/vim
nano .env
```

**Minimal Configuration:**

```env
# Server
NODE_ENV=development
PORT=3000
BASE_URL=http://localhost:3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=paybaba
DB_USER=postgres          # Sesuaikan dengan user PostgreSQL Anda
DB_PASSWORD=              # Isi dengan password PostgreSQL

# JWT (Generate your own)
JWT_ACCESS_TOKEN_SECRET=your_super_secret_access_key_min_32_chars_12345678
JWT_REFRESH_TOKEN_SECRET=your_super_secret_refresh_key_min_32_chars_12345678
JWT_ACCESS_TOKEN_EXPIRY=15m
JWT_REFRESH_TOKEN_EXPIRY=7d

# Payment Gateway (Paylabs)
PAYLABS_SERVER=SIT
MID=010612
NOTIFY_URL=http://localhost:3000/api/webhook/paylabs

# AI Service (Optional)
QWEN_API_KEY=sk-your-key-here
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
```

**Testing .env**:

```bash
# Verify PostgreSQL connection
psql -U postgres -h localhost -d template1 -c "SELECT 1"
```

---

### D. Database Setup & Run

#### Opsi 1: Automatic Setup (Recommended)

```bash
# 1. Create database
psql -U postgres -c "CREATE DATABASE paybaba;"

# 2. Seed dummy data (merchant + 3 bank users)
npm run seed

# 3. Start server
npm start
```

**Expected output:**

```
✅ Database connection established
✅ Database models synced
✅ Created user: dummy-merchant@example.com
✅ Created 167 transactions
✅ Created credit score: 90 (Low)
✅ Created bank user: bank1@bca.com
✅ Created bank user: bank2@mandiri.com
✅ Created bank user: bank3@bni.com
🎉 DUMMY DATA CREATED SUCCESSFULLY
```

#### Opsi 2: Manual Setup

```bash
# 1. Create database manually
psql -U postgres << EOF
CREATE DATABASE paybaba;
EOF

# 2. Start server (akan auto-sync models)
npm run dev

# 3. Open browser: http://localhost:3000/api-docs
# 4. Use register endpoint untuk create merchant baru
```

---

## ✅ Verify Installation

Test bahwa semuanya berjalan:

```bash
# 1. Check server berjalan
curl http://localhost:3000/api-docs

# 2. Login dengan dummy merchant
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "dummy-merchant@example.com",
    "password": "DummyPass123"
  }'

# Response seharusnya berisi accessToken
```

---

## 📋 Dummy Account Credentials

### Merchant Account

```
Email:    dummy-merchant@example.com
Password: DummyPass123
Company:  PT Maju Jaya Retail
```

### Bank Portal Accounts

```
1. Email: bank1@bca.com        | Password: BankPass123
2. Email: bank2@mandiri.com    | Password: BankPass123
3. Email: bank3@bni.com        | Password: BankPass123
```

---

## 🎯 Testing dengan Swagger UI

1. Buka browser: `http://localhost:3000/api-docs`
2. Klik "Authorize"
3. Paste token dari login response
4. Test endpoints langsung dari Swagger UI

---

## Development

### Available NPM Commands

```bash
# Install dependencies
npm install

# Start development server with hot reload
npm run dev

# Start production server
npm start

# Seed dummy data (merchant + 3 bank users)
npm run seed

# Run tests
npm test

# Run linter
npm run lint
```

### Quick Development Workflow

```bash
# 1. First time setup
npm install
cp .env.example .env
# Edit .env dengan database credentials Anda

# 2. Create and seed database
psql -U postgres -c "CREATE DATABASE paybaba;"
npm run seed

# 3. Start development server
npm run dev

# 4. Open Swagger UI
# Browser: http://localhost:3000/api-docs
```

### Reset Database During Development

```bash
# Drop and recreate database
psql -U postgres << EOF
DROP DATABASE IF EXISTS paybaba;
CREATE DATABASE paybaba;
EOF

# Reseed data
npm run seed

# Restart dev server
npm run dev
```

---

## API Endpoints

### Authentication

```
POST   /api/auth/register              - Register merchant
POST   /api/auth/login                 - Login merchant
POST   /api/auth/refresh               - Refresh access token
POST   /api/auth/request-password-reset - Request password reset
POST   /api/auth/reset-password        - Reset password with token
```

### Merchant

```
GET    /api/merchant/profile           - Get merchant profile
GET    /api/merchant/dashboard         - Get dashboard with credit score
GET    /api/merchant/credit-detail     - Get detailed credit score components
GET    /api/merchant/loan-timing       - Get smart loan timing recommendation
```

### Transactions

```
POST   /api/transactions/create        - Create transaction (QRIS/CASH)
GET    /api/transactions               - List merchant transactions
GET    /api/transactions/:id           - Get transaction detail
POST   /api/webhook/paylabs            - Webhook callback from Paylabs
```

### Bank Portal (Bearer Token Required)

```
POST   /api/bank/merchants/search      - Search merchants by criteria
GET    /api/bank/merchants/:merchantId - Get merchant profile
GET    /api/bank/merchants/:merchantId/credit - Get credit details
GET    /api/bank/merchants/:merchantId/alerts - Get active alerts
POST   /api/bank/loan-applications     - List loan applications
POST   /api/bank/loan-applications/create - Create loan application
POST   /api/bank/loan-applications/:appId/approve - Approve loan
POST   /api/bank/loan-applications/:appId/reject - Reject loan
```

## Example Requests

### Register (Merchant atau Bank)

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "merchant@example.com",
    "password": "SecurePass123",
    "companyName": "My Store",
    "fullName": "Merchant Name",
    "city": "Jakarta",
    "address": "Jl. Main St 123",
    "phoneNumber": "081234567890"
  }'
```

### Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "merchant@example.com",
    "password": "SecurePass123"
  }'
```

### Get Dashboard

```bash
curl -X GET http://localhost:3000/api/merchant/dashboard \
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
    "productInfo": {
      "sku": "SKU-001",
      "category": "Electronics",
      "quantity": 2,
      "unitPrice": 25000,
      "details": "Smartphone X - Color Blue",
      "merchant": "ABC Store"
    }
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

### Search Merchants (Bank Portal)

```bash
curl -X POST http://localhost:3000/api/bank/merchants/search \
  -H "Authorization: Bearer BANK_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "minCreditScore": 60,
    "riskBand": "Low",
    "limit": 10
  }'
```

## Project Structure

```
src/
├── app.js                    # Express app setup
├── config/                   # Configuration files
├── database/
│   ├── connection.js        # PostgreSQL connection
│   ├── init.js              # Database initialization
│   └── seed.js              # Seed demo data
├── middleware/
│   ├── auth.js              # JWT authentication
│   └── errorHandler.js      # Error handling
├── models/                  # Sequelize models
│   ├── User.js
│   ├── Merchant.js
│   ├── Transaction.js
│   ├── CreditScore.js
│   ├── DailyRevenue.js
│   ├── LoanApplication.js
│   └── EarlyWarningAlert.js
├── routes/
│   ├── auth.js              # Auth endpoints
│   ├── merchant.js          # Merchant endpoints
│   └── transaction.js       # Transaction endpoints
├── services/
│   ├── authService.js       # Auth business logic
│   ├── creditScoringService.js (TODO)
│   ├── qwenService.js       (TODO)
│   ├── earlyWarningService.js (TODO)
│   └── loanTimingService.js (TODO)
└── utils/
    ├── logger.js            # Winston logger
    └── validators.js        # Input validation (Joi)

logs/                         # Log files
index.js                      # Entry point
.env.example                  # Environment variables template
package.json                  # Dependencies
```

## Environment Variables

Lihat `.env.example` untuk daftar lengkap variables yang diperlukan.

### Key Variables

- `NODE_ENV` - development/production
- `PORT` - Server port (default: 3000)
- `DB_*` - PostgreSQL credentials
- `JWT_*` - JWT secrets dan expiry
- `OPENAI_API_KEY` - Untuk Qwen/OpenAI integration
- `MID`, `PRIVATE_KEY`, `PUBLIC_KEY` - Paylabs credentials

## Development

### Run dengan Hot Reload

```bash
npm run dev
```

### Testing

```bash
npm test
```

### Logging

Logs disimpan di folder `logs/`:

- `combined.log` - Semua logs
- `error.log` - Error logs saja

## TODO Features

- [x] Auth (Register, Login, Reset Password)
- [x] Transaction QRIS & CASH
- [x] Merchant profile & dashboard
- [ ] Credit Scoring system (rule-based)
- [ ] Qwen AI integration untuk explanation
- [ ] Early Warning system
- [ ] Smart Loan Timing recommendation
- [ ] Bank API endpoints
- [ ] Paylabs QRIS integration (full)
- [ ] Payment webhook verification
- [ ] Email notifications

## Architecture Notes

### Tech Stack

- **Framework**: Express.js
- **Database**: PostgreSQL 12+
- **ORM**: Sequelize
- **Authentication**: JWT (access + refresh tokens)
- **Validation**: Joi
- **Logging**: Winston
- **AI Integration**: OpenAI SDK (untuk Qwen via Alibaba)

### Key Design Decisions

1. **Modular Structure**: Services, Routes, Models terpisah
2. **Error Handling**: Global middleware untuk consistent error responses
3. **Validation**: Input validation di utils/validators.js
4. **Logging**: Winston untuk production-ready logging
5. **Database**: Sequelize ORM dengan model relationships
6. **Authentication**: JWT dengan access + refresh token pattern

## Next Steps

1. **Implement Credit Scoring Service** - Hitung skor berdasarkan transaksi history
2. **Integrate Qwen API** - Untuk AI explanation dari skor
3. **Early Warning System** - Deteksi anomali transaksi
4. **Smart Loan Timing** - Analisis pola transaksi mingguan
5. **Paylabs Integration** - Full QRIS implementation
6. **Bank Portal** - Separate API endpoints untuk bank partners

## Support

Untuk questions atau issues, hubungi tim development.

---

**Last Updated**: Feb 27, 2026
**Version**: 1.0.0-alpha
