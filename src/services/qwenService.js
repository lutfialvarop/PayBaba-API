import OpenAI from "openai";
import logger from "../utils/logger.js";
import MerchantService from "./merchantService.js";

/**
 * Qwen client (Alibaba Cloud – OpenAI compatible interface)
 * Lazy initialization - only create when needed
 */
let qwen = null;

function getQwenClient() {
    if (!qwen && process.env.QWEN_API_KEY) {
        qwen = new OpenAI({
            apiKey: process.env.QWEN_API_KEY,
            baseURL: process.env.QWEN_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
        });
    }
    return qwen;
}

/* =====================================================
   GLOBAL SYSTEM PROMPT — QWEN CREDIT INTELLIGENCE
===================================================== */

const QWEN_SYSTEM_PROMPT = `
You are Qwen, an AI Credit Intelligence Assistant operating inside a Payment Gateway ecosystem.

Your role:
• Explain transaction and cashflow patterns
• Provide timing intelligence for business financing activities
• Support decision-making, NOT decision-taking

Strict limitations:
• Do NOT approve or reject loans
• Do NOT determine credit eligibility
• Do NOT mention interest rates, limits, exposure, or financing amounts
• Do NOT provide financial guarantees

Principles:
• Use neutral, professional, and informative language
• Focus only on transaction behavior and cashflow stability
• Be concise, explainable, and structured

All responses must be factual and based only on the provided data.
`;

/* =====================================================
   1. CREDIT READINESS + EXPLAINABLE INSIGHT
===================================================== */

export async function generateScoreExplanation(scoreData) {
    try {
        const qwenClient = getQwenClient();
        if (!qwenClient) {
            logger.warn("Qwen API key not configured, returning fallback response");
            return buildScoreExplanationFallback(scoreData);
        }

        const { merchantId, creditScore, riskBand, transactionVolumeScore, revenueConsistencyScore, growthTrendScore, refundRateScore, settlementTimeScore, avgMonthlyRevenue, growthPercentageMoM, refundRatePercentage, avgSettlementDays } =
            scoreData;

        const prompt = `
CREDIT INTELLIGENCE DATA (TRANSACTION-BASED)

Merchant ID: ${merchantId}

Credit Readiness Result:
- Score: ${creditScore} / 100
- Risk Band: ${riskBand}

Component Scores (0–100):
- Transaction Strength: ${transactionVolumeScore}
- Revenue Stability: ${revenueConsistencyScore}
- Growth Quality (MoM): ${growthTrendScore}
- Transaction Risk (refund / failure): ${refundRateScore}
- Settlement Reliability: ${settlementTimeScore}

Business Context:
- Average Monthly Revenue: Rp ${avgMonthlyRevenue.toLocaleString("id-ID")}
- Revenue Growth MoM: ${growthPercentageMoM} %
- Refund Rate: ${refundRatePercentage} %
- Average Settlement Time: ${avgSettlementDays} days

Tasks:
1. Explain the credit readiness score in simple business language (Bahasa Indonesia).
2. Identify up to 2 main strengths based on transaction behavior.
3. Identify up to 2 key risk factors or areas of attention.
4. Provide 1 practical suggestion to improve readiness.

Rules:
- Do NOT state approval, rejection, or eligibility.
- Do NOT give financial or legal decisions.

Output MUST be valid JSON:
{
  "explanation": "",
  "recommendation": ""
}
`;

        const response = await qwenClient.chat.completions.create({
            model: "qwen-plus",
            messages: [
                { role: "system", content: QWEN_SYSTEM_PROMPT },
                { role: "user", content: prompt },
            ],
            temperature: 0.4,
            max_tokens: 500,
        });

        const content = response.choices[0].message.content;
        const jsonMatch = content.match(/\{[\s\S]*\}/);

        if (!jsonMatch) {
            logger.warn(`Failed to parse Qwen response for merchant ${merchantId}`);
            return buildScoreExplanationFallback(scoreData);
        }

        return JSON.parse(jsonMatch[0]);
    } catch (error) {
        logger.warn(`Qwen API failed (${error.message}), using fallback explanation`);
        return buildScoreExplanationFallback(scoreData);
    }
}

// ✅ FIX: Extract fallback logic ke fungsi terpisah agar reusable
function buildScoreExplanationFallback(scoreData) {
    const { creditScore, riskBand, transactionVolumeScore, revenueConsistencyScore, growthTrendScore, refundRateScore, avgMonthlyRevenue } = scoreData || {};

    const strengths = [];
    if (transactionVolumeScore > 75) strengths.push("Volume transaksi yang solid");
    if (revenueConsistencyScore > 75) strengths.push("Stabilitas revenue yang konsisten");
    if (growthTrendScore > 70) strengths.push("Trend pertumbuhan positif");
    if (refundRateScore > 80) strengths.push("Tingkat refund yang rendah");
    if (strengths.length === 0) strengths.push("Aktivitas transaksi terdeteksi");

    const riskFactors = [];
    if (transactionVolumeScore < 50) riskFactors.push("Volume transaksi masih terbatas");
    if (revenueConsistencyScore < 60) riskFactors.push("Fluktuasi revenue cukup tinggi");
    if (refundRateScore < 70) riskFactors.push("Tingkat refund perlu diperhatikan");
    if (riskFactors.length === 0) riskFactors.push("Data historis sedang diakumulasi");

    return {
        explanation: `Skor kredit Anda mencapai ${creditScore}/100 dengan kategori ${riskBand} Risk. Berdasarkan analisis data transaksi, merchant ini menunjukkan aktivitas pembayaran terukur dengan rata-rata revenue bulanan Rp ${avgMonthlyRevenue?.toLocaleString("id-ID") || "N/A"}. Profil ini dibangun dari evaluasi mendalam terhadap volume transaksi, konsistensi revenue, dan perilaku penyelesaian pembayaran.`,
        recommendation:
            creditScore >= 80
                ? "Skor ini menunjukkan profil kreditworthiness yang baik. Pertahankan konsistensi transaksi dan terus tingkatkan volume untuk membuka akses ke produk pembiayaan yang lebih komprehensif."
                : creditScore >= 60
                  ? "Profil kreditworthiness sudah mulai terbentuk dengan baik. Fokus pada peningkatan stabilitas revenue dan pengurangan tingkat refund untuk menaikkan skor kredit."
                  : "Lanjutkan aktivitas transaksi rutin dan bangun histori data yang lebih stabil untuk meningkatkan skor kredit Anda.",
        strengths,
        risk_factors: riskFactors,
        improvement_suggestion: "Tingkatkan konsistensi transaksi harian dan pertahankan refund rate di bawah 5% untuk meningkatkan peluang persetujuan pinjaman.",
    };
}

/* =====================================================
   2. EARLY SIGNAL / ANOMALY INSIGHT
===================================================== */

export async function analyzeAnomaly(anomalyData) {
    try {
        const qwenClient = getQwenClient();
        if (!qwenClient) {
            logger.warn("Qwen API key not configured, returning fallback response for anomaly");
            return `Terjadi perubahan pada ${anomalyData.metricName}. Disarankan untuk memantau tren transaksi secara berkala.`;
        }

        const { merchantId, alertType, metricName, currentValue, thresholdValue, historicalAvg } = anomalyData;

        const prompt = `
TRANSACTION EARLY SIGNAL DETECTED

Merchant ID: ${merchantId}
Alert Type: ${alertType}
Metric: ${metricName}

Current Value: ${currentValue}
Threshold: ${thresholdValue}
Historical Average: ${historicalAvg}

Tasks:
1. Explain briefly what change is happening in transaction behavior.
2. Describe potential business risk (not a credit decision).
3. Suggest one monitoring or mitigation action.

Rules:
- Do NOT use alarmist language.
- Do NOT imply default or loan failure.
- Keep explanation concise (2–3 sentences).
`;

        const response = await qwenClient.chat.completions.create({
            model: "qwen-plus",
            messages: [
                { role: "system", content: QWEN_SYSTEM_PROMPT },
                { role: "user", content: prompt },
            ],
            temperature: 0.4,
            max_tokens: 300,
        });

        return response.choices[0].message.content;
    } catch (error) {
        logger.error(`Qwen Anomaly Analysis Error: ${error.message}`);
        return `Terjadi perubahan pada ${anomalyData.metricName}. Disarankan untuk memantau tren transaksi secara berkala.`;
    }
}

/* =====================================================
   3. SMART LOAN TIMING (CASHFLOW-BASED)
===================================================== */

export async function generateLoanTiming(merchantData) {
    try {
        const qwenClient = getQwenClient();
        if (!qwenClient) {
            logger.warn("Qwen API key not configured, returning fallback response for loan timing");
            return {
                recommended_week: 2,
                confidence: 60,
                reasoning: "Rekomendasi berbasis pola transaksi historis dan stabilitas arus kas.",
                date_range: "Minggu ke-2 bulan berikutnya",
            };
        }

        const { merchantId, dailyRevenues, avgMonthlyRevenue, volatility, pattern } = merchantData;

        const prompt = `
CASHFLOW TIMING ANALYSIS (TRANSACTION-BASED)

Context:
This analysis is ONLY to identify the healthiest time window for business financing
based on historical cashflow patterns.
It is NOT a credit decision and MUST NOT include any financing amount, limit, or eligibility.

Merchant ID: ${merchantId}

Revenue Summary:
• Average Monthly Revenue: Rp ${avgMonthlyRevenue.toLocaleString("id-ID")}
• Revenue Volatility: ${volatility} %
• Transaction Pattern: ${pattern}

Daily Revenue Data (Last 30 Days):
[${dailyRevenues.join(", ")}]

Tasks:
1. Select the healthiest week of the month (1–4) purely from a cashflow stability perspective.
2. Provide a confidence score from 0 to 100.
3. Explain the reasoning briefly using observed patterns (stability, consistency, volatility).
4. Provide a human-readable date range for the recommended week.

STRICT OUTPUT RULES:
• DO NOT include any financing amount, limit, exposure, or monetary value.
• DO NOT include approval, rejection, or eligibility language.
• DO NOT add any extra fields beyond those requested.

Output MUST be valid JSON with EXACTLY this structure and NO additional fields:
{
  "recommended_week": 1,
  "confidence": 0,
  "reasoning": "",
  "date_range": ""
}
`;

        const response = await qwenClient.chat.completions.create({
            model: "qwen-plus",
            messages: [
                { role: "system", content: QWEN_SYSTEM_PROMPT },
                { role: "user", content: prompt },
            ],
            temperature: 0.3,
            max_tokens: 300,
        });

        const content = response.choices[0].message.content;
        const jsonMatch = content.match(/\{[\s\S]*\}/);

        if (!jsonMatch) {
            return {
                recommended_week: 2,
                confidence: 60,
                reasoning: "Rekomendasi berbasis pola transaksi historis dan stabilitas arus kas.",
                date_range: "Minggu ke-2 bulan berikutnya",
            };
        }

        const parsed = JSON.parse(jsonMatch[0]);
        return {
            recommended_week: parsed.recommended_week,
            confidence: parsed.confidence,
            reasoning: parsed.reasoning,
            date_range: parsed.date_range,
        };
    } catch (error) {
        logger.error(`Qwen Loan Timing Error: ${error.message}`);
        return {
            recommended_week: 2,
            confidence: 50,
            reasoning: "Gunakan rekomendasi default berbasis stabilitas cashflow.",
            date_range: "Minggu ke-2 bulan berikutnya",
        };
    }
}

/* =====================================================
   4. MERCHANT GROWTH INSIGHTS
===================================================== */

export async function generateMerchantGrowthInsights(merchantId) {
    try {
        // Ambil data produk & tren dari database
        const stats = await MerchantService.getMerchantProductStats(merchantId);

        const qwenClient = getQwenClient();

        // ✅ FIX: tambahkan fallback jika qwenClient null
        if (!qwenClient) {
            logger.warn("Qwen API key not configured, returning fallback for growth insights");
            return {
                performance_summary: "Data penjualan sedang dianalisis. Pastikan API key Qwen sudah dikonfigurasi untuk mendapatkan insight lengkap.",
                top_trending_products: stats.topProducts.slice(0, 3).map((p) => ({
                    name: p.name,
                    reason: `Terjual ${p.totalQty} unit dalam 3 bulan terakhir`,
                })),
                inventory_advice: "Pantau stok produk terlaris dan pastikan ketersediaan untuk memenuhi permintaan.",
                growth_opportunity: "Tingkatkan promosi pada produk yang belum optimal untuk meningkatkan volume penjualan.",
            };
        }

        const prompt = `
ANALISIS PERTUMBUHAN BISNIS (3 BULAN TERAKHIR)
Merchant ID: ${merchantId}

Tren Penjualan Bulanan (3 bulan terakhir): ${JSON.stringify(stats.salesTrend)}
Daftar Produk Terlaris (Top Products):
${JSON.stringify(stats.topProducts)}

Tugas Anda:
1. Berikan ringkasan performa penjualan dalam Bahasa Indonesia.
2. Identifikasi produk yang "Rising Star" (paling banyak terjual).
3. Berikan saran stok (inventory) spesifik berdasarkan nama produk atau SKU yang ada.
4. Berikan 1 strategi pemasaran singkat untuk meningkatkan produk yang kurang laku.

Output harus valid JSON:
{
  "performance_summary": "",
  "top_trending_products": [{"name": "", "reason": ""}],
  "inventory_advice": "",
  "growth_opportunity": ""
}
`;

        const response = await qwenClient.chat.completions.create({
            model: "qwen-plus",
            messages: [
                { role: "system", content: QWEN_SYSTEM_PROMPT },
                { role: "user", content: prompt },
            ],
            temperature: 0.4,
            max_tokens: 600,
        });

        const content = response.choices[0].message.content;
        const jsonMatch = content.match(/\{[\s\S]*\}/);

        if (!jsonMatch) {
            throw new Error("Failed to parse Qwen JSON response");
        }

        return JSON.parse(jsonMatch[0]);
    } catch (error) {
        logger.error(`Error generating insights: ${error.message}`);
        return {
            performance_summary: "Gagal memproses insight merchant saat ini. Silakan coba beberapa saat lagi.",
            top_trending_products: [],
            inventory_advice: "Pantau stok produk utama secara rutin.",
            growth_opportunity: "Data tidak tersedia saat ini.",
        };
    }
}

export default {
    generateScoreExplanation,
    analyzeAnomaly,
    generateLoanTiming,
    generateMerchantGrowthInsights,
};
