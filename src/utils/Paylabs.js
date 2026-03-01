import crypto from "crypto";
import moment from "moment-timezone";

// --- Zona waktu Asia/Jakarta ---
function nowJakarta() {
    return moment.tz("Asia/Jakarta").format("YYYY-MM-DDTHH:mm:ss.SSSZ");
}

// --- Util Helper ---
function toPemPrivate(key) {
    if (!key) return null;
    if (key.includes("BEGIN RSA PRIVATE KEY") || key.includes("BEGIN PRIVATE KEY")) return key;
    // Tambahkan header jika di .env hanya raw string
    return `-----BEGIN RSA PRIVATE KEY-----\n${key}\n-----END RSA PRIVATE KEY-----`;
}

function toPemPublic(key) {
    if (!key) return null;
    if (key.includes("BEGIN PUBLIC KEY")) return key;
    return `-----BEGIN PUBLIC KEY-----\n${key}\n-----END PUBLIC KEY-----`;
}

function sha256HexLower(input) {
    return crypto.createHash("sha256").update(input, "utf8").digest("hex").toLowerCase();
}

function genIds() {
    const d = new Date();
    const pad = (n, z = 2) => String(n).padStart(z, "0");
    const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    const rand = Math.floor(11111 + Math.random() * 88889);
    const id = `${ts}${rand}`;
    return { requestId: id, merchantTradeNo: id };
}

// --- CLASS UTAMA ---
export class PaylabsClient {
    constructor(config = {}) {
        this.server = config.server || "SIT";
        this.mid = config.mid || null;
        this.version = (config.version || "v2.3").replace(/^\/|\/$/g, ""); // Default v2.3
        this.log = !!config.log;

        // Convert key dari ENV ke format PEM yang valid
        this.privateKey = toPemPrivate(config.privateKey);
        this.publicKey = toPemPublic(config.publicKey);

        this.baseMap = {
            SIT: "https://sit-pay.paylabs.co.id/payment/",
            PROD: "https://pay.paylabs.co.id/payment/",
        };
    }

    getFullUrl(path) {
        const base = this.baseMap[this.server] || this.baseMap.SIT;
        const cleanPath = path.startsWith("/") ? path.slice(1) : path;
        // Jika path sudah mengandung '/payment/', jangan double
        if (cleanPath.startsWith("payment/")) {
            return `${base.replace("payment/", "")}${cleanPath}`;
        }
        return `${base}${cleanPath}`;
    }

    // --- Signature Builder (Sesuai Dokumentasi) ---
    buildSignStringForRequest(bodyObj, path, timestamp) {
        // Minify JSON (hapus spasi yang tidak perlu)
        const jsonString = JSON.stringify(bodyObj);
        const hash = sha256HexLower(jsonString);
        // Path harus dimulai dengan "/"
        const cleanPath = path.startsWith("/") ? path : `/${path}`;

        // Format: POST:EndpointUrl:Lowercase(SHA256Hex(minify(body))):TimeStamp
        const str = `POST:${cleanPath}:${hash}:${timestamp}`;

        if (this.log) console.log("[SignStringReq]", str);
        return str;
    }

    buildSignStringForCallback(path, bodyRaw, timestamp) {
        const hash = sha256HexLower(bodyRaw);
        const cleanPath = path.startsWith("/") ? path : `/${path}`;
        const str = `POST:${cleanPath}:${hash}:${timestamp}`;

        if (this.log) console.log("[SignStringCb]", str);
        return str;
    }

    signBase64(str) {
        if (!this.privateKey) throw new Error("Private key belum diset di .env");
        const sig = crypto.sign("RSA-SHA256", Buffer.from(str, "utf8"), this.privateKey);
        return sig.toString("base64");
    }

    verifyBase64(str, signatureB64) {
        if (!this.publicKey) throw new Error("Public key belum diset di .env");
        const ok = crypto.verify("RSA-SHA256", Buffer.from(str, "utf8"), this.publicKey, Buffer.from(signatureB64, "base64"));
        return !!ok;
    }

    // --- Request Method ---
    async request(path, body = {}, opts = {}) {
        if (!this.mid) throw new Error("MID belum diset di .env");

        const timestamp = opts.timestamp || nowJakarta();
        // Generate IDs jika tidak disediakan
        const { requestId, merchantTradeNo } = {
            ...genIds(),
            ...(opts.requestId ? { requestId: opts.requestId } : {}),
            ...(opts.merchantTradeNo ? { merchantTradeNo: opts.merchantTradeNo } : {}),
        };

        // Merge payload standar
        const payload = {
            merchantId: this.mid,
            requestId,
            merchantTradeNo,
            ...body,
        };

        // Buat Signature
        const signString = this.buildSignStringForRequest(payload, path, timestamp);
        const signature = this.signBase64(signString);

        const headers = {
            "X-TIMESTAMP": timestamp,
            "X-SIGNATURE": signature,
            "X-PARTNER-ID": this.mid,
            "X-REQUEST-ID": requestId,
            "Content-Type": "application/json;charset=utf-8",
        };

        const url = this.getFullUrl(path);

        if (this.log) {
            console.log("🚀 [Paylabs Request]");
            console.log("URL:", url);
            console.log("Headers:", JSON.stringify(headers, null, 2));
            console.log("Payload:", JSON.stringify(payload, null, 2));
        }

        const res = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
        });

        const text = await res.text();
        try {
            return JSON.parse(text);
        } catch {
            return { raw: text, status: res.status };
        }
    }

    // --- Helper Webhook ---
    verifySignature(path, bodyRaw, signatureB64, timestamp) {
        const str = this.buildSignStringForCallback(path, bodyRaw, timestamp);
        return this.verifyBase64(str, signatureB64);
    }

    buildResponseCallback(path) {
        const timestamp = nowJakarta();
        const payload = {
            responseCode: "success", // atau field lain sesuai doc callback spesifik
            responseMessage: "success",
        };
        // Paylabs biasanya minta format tertentu, tapi JSON standar OK
        // Untuk response callback, kita ttd body yang kita kirim
        const signStr = this.buildSignStringForRequest(payload, path, timestamp);
        const signature = this.signBase64(signStr);

        return {
            headers: {
                "Content-Type": "application/json;charset=utf-8",
                "X-TIMESTAMP": timestamp,
                "X-SIGNATURE": signature,
                "X-PARTNER-ID": this.mid,
            },
            body: payload,
        };
    }
}
