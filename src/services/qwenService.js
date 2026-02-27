import OpenAI from "openai";
import logger from "../utils/logger.js";

/**
 * Qwen client (Alibaba Cloud – OpenAI compatible interface)
 * Pastikan environment sudah diarahkan ke endpoint Qwen
 */
const qwen = new OpenAI({
    apiKey: process.env.QWEN_API_KEY,
    baseURL: process.env.QWEN_BASE_URL,
    // contoh:
    // https://dashscope.aliyuncs.com/compatible-mode/v1
});

/* =====================================================
   GLOBAL SYSTEM PROMPT — QWEN CREDIT INTELLIGENCE
   ===================================================== */

const QWEN_SYSTEM_PROMPT = `
You are Qwen, an AI Credit Intelligence Assistant operating inside a Payment Gateway ecosystem.

Your role:
- Translate transaction data into credit readiness insights
- Explain strengths, risks, and cashflow behavior
- Provide timing intelligence for business financing activities
- Support decision-making, NOT decision-taking

Strict limitations:
- Do NOT approve or reject loans
- Do NOT determine credit eligibility
- Do NOT mention interest rates, tenors, or legal decisions
- Do NOT provide financial guarantees

Principles:
- Use neutral, professional, and informative language
- Focus only on transaction behavior, revenue stability, and operational risk
- Be concise, explainable, and structured

All responses must be factual and based only on provided data.
`;

/* =====================================================
   1️⃣ CREDIT READINESS + EXPLAINABLE INSIGHT
   ===================================================== */

export async function generateScoreExplanation(scoreData) {
    try {
        const {
            merchantId,
            creditScore,
            riskBand,

            transactionVolumeScore,
            revenueConsistencyScore,
            growthTrendScore,
            refundRateScore,
            settlementTimeScore,

            avgMonthlyRevenue,
            growthPercentageMoM,
            refundRatePercentage,
            avgSettlementDays,
        } = scoreData;

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
  "summary": "",
  "strengths": [],
  "risk_factors": [],
  "improvement_suggestion": ""
}
`;

        const response = await qwen.chat.completions.create({
            model: "qwen-plus", // 🔒 FULL QWEN
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
            return {
                summary: "Insight kesiapan pembiayaan sedang diproses.",
                strengths: [],
                risk_factors: [],
                improvement_suggestion: "Lanjutkan aktivitas transaksi untuk membangun histori data yang lebih stabil.",
            };
        }

        return JSON.parse(jsonMatch[0]);
    } catch (error) {
        logger.error(`Qwen Credit Insight Error: ${error.message}`);
        return {
            summary: "Skor dihitung menggunakan credit intelligence layer berbasis transaksi.",
            strengths: ["Aktivitas transaksi terdeteksi"],
            risk_factors: ["Data historis masih terbatas"],
            improvement_suggestion: "Tingkatkan konsistensi transaksi dan minimalkan refund.",
        };
    }
}

/* =====================================================
   2️⃣ EARLY SIGNAL / ANOMALY INSIGHT
   ===================================================== */

export async function analyzeAnomaly(anomalyData) {
    try {
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

        const response = await qwen.chat.completions.create({
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
   3️⃣ SMART LOAN TIMING (CASHFLOW-BASED)
   ===================================================== */

export async function generateLoanTiming(merchantData) {
    try {
        const { merchantId, dailyRevenues, avgMonthlyRevenue, volatility, pattern } = merchantData;

        const prompt = `
CASHFLOW TIMING ANALYSIS (TRANSACTION-BASED)

Merchant ID: ${merchantId}

Revenue Overview:
- Average Monthly Revenue: Rp ${avgMonthlyRevenue.toLocaleString("id-ID")}
- Revenue Volatility: ${volatility} %
- Transaction Pattern Summary: ${pattern}

Daily Revenue (Last 30 Days):
[${dailyRevenues.join(", ")}]

Tasks:
1. Select the healthiest week of the month (1–4) from a cashflow perspective.
2. Provide a confidence score (0–100).
3. Explain reasoning based on revenue stability and transaction risk.
4. Express the timing in a human-readable date range.

Rules:
- Do NOT approve or reject loans.
- Do NOT provide credit decisions.
- Focus only on timing and cashflow health.

Output MUST be valid JSON:
{
  "recommended_week": 1,
  "confidence": 0,
  "reasoning": "",
  "date_range": ""
}
`;

        const response = await qwen.chat.completions.create({
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
                reasoning: "Rekomendasi berbasis pola transaksi historis.",
                date_range: "Minggu ke-2 bulan berikutnya",
            };
        }

        return JSON.parse(jsonMatch[0]);
    } catch (error) {
        logger.error(`Qwen Loan Timing Error: ${error.message}`);
        return {
            recommended_week: 2,
            confidence: 50,
            reasoning: "Gunakan rekomendasi default berbasis cashflow.",
            date_range: "Minggu ke-2 bulan berikutnya",
        };
    }
}

export default {
    generateScoreExplanation,
    analyzeAnomaly,
    generateLoanTiming,
};
