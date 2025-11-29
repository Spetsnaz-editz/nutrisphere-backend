import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import multer from "multer";
import { createRequire } from "module";
import Tesseract from "tesseract.js";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

dotenv.config();

const app = express();

// CORS
app.use(cors({ origin: "*", methods: ["GET", "POST"], allowedHeaders: ["Content-Type"] }));
app.use(express.json());

// -------- GROQ CLIENT ----------
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// -------- MEMORY (OPTIONAL) ----------
let conversationMemory = [];
function saveMemory(user, bot) {
    conversationMemory.push({ role: "user", content: user });
    conversationMemory.push({ role: "assistant", content: bot });
    if (conversationMemory.length > 10) conversationMemory.shift();
}

// ===============================================================
// 1️⃣ CHATBOT ROUTE  — POST /api/chat
// ===============================================================
app.post("/api/chat", async (req, res) => {
    try {
        const userMessage = req.body.message;
        if (!userMessage) {
            return res.status(400).json({ error: "Missing 'message' field" });
        }

        const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",   // ACTIVE MODEL
            messages: [
                { role: "system", content: "You are Guilty Spark 343, a helpful, knowledgeable AI assistant. Specialist in human health and nutrition" },
                { role: "user", content: userMessage }
            ]
        });

        const botReply = completion.choices[0]?.message?.content || "No response";
        res.send(botReply);

    } catch (err) {
        console.error("GROQ ERROR:", err);
        res.status(500).json({ error: "AI error" });
    }
});

// ===============================================================
// 2️⃣ HEALTH REPORT OCR — POST /api/health
// ===============================================================
const upload = multer({ storage: multer.memoryStorage() });

app.post("/api/health", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });

        let text = "";

        if (req.file.mimetype === "application/pdf") {
            const pdfData = await pdfParse(req.file.buffer);
            text = pdfData.text;
        } else {
            const result = await Tesseract.recognize(req.file.buffer, "eng");
            text = result.data.text;
        }

        const ai = await groq.chat.completions.create({
            model: "llama3-70b-8192",
            messages: [
                { role: "system", content: "You are a medical report analyzer." },
                { role: "user", content: `Analyze this medical report:\n${text}` }
            ]
        });

        res.send(ai.choices[0].message.content);
    } catch (err) {
        console.error("HEALTH ERROR:", err);
        res.status(500).json({ error: "Failed to analyze report." });
    }
});

// ===============================================================
// 3️⃣ START SERVER
// ===============================================================
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 AI Server running at http://localhost:${PORT}`);
});
