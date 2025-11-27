import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import multer from "multer";
import Tesseract from "tesseract.js";

// Fix for pdf-parse (CommonJS module in Node v24 + ESM)
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

dotenv.config();

// ---------------------- SERVER SETUP ----------------------

const app = express();
app.use(cors());
app.use(express.json());

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

let conversationMemory = [];

// Maintain last 10 messages
function updateMemory(userMsg, botMsg) {
    conversationMemory.push({ role: "user", content: userMsg });
    conversationMemory.push({ role: "assistant", content: botMsg });

    if (conversationMemory.length > 10) {
        conversationMemory = conversationMemory.slice(-10);
    }
}

// ---------------------- MAIN AI CHATBOT ----------------------

app.post("/api/ai", async (req, res) => {
    try {
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ error: "Message is required" });
        }

        const messages = [
            {
                role: "system",
                content: `
You are Guilty Spark 343 — but reimagined for a health & wellness universe.

Personality:
- Friendly, scientific, supportive, slightly humorous
- Futuristic, glowing Forerunner-like tone
- Light references only (Halo ring, scans, monitoring)
- No deep lore, no battles, no characters

Your purpose:
Guide users in health, fitness, habits, mental well-being, nutrition, sleep, stress, metabolic health, productivity.

Example style:
"Greetings, Reclaimer. My sensors detect elevated stress patterns — allow me to help."
"On the Halo ring we valued balance — your hydration looks slightly low today."
"Scanning… optimized pathway to progress detected."

You are the Health Monitor of VitaSphere.
                `
            },
            ...conversationMemory,
            { role: "user", content: message },
        ];

        const stream = await groq.chat.completions.create({
            model: "llama-3.1-8b-instant",
            messages,
            stream: true,
        });

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        let fullReply = "";

        for await (const chunk of stream) {
            const token = chunk.choices?.[0]?.delta?.content || "";
            fullReply += token;
            res.write(token);
        }

        updateMemory(message, fullReply);
        res.end();

    } catch (error) {
        console.error("Streaming error:", error);
        res.status(500).end("ERROR");
    }
});

// ---------------------- FILE UPLOAD & HEALTH REPORT ANALYSIS ----------------------

const upload = multer();

app.post("/api/analyze-report", upload.single("file"), async (req, res) => {
    try {
        const file = req.file;

        if (!file) {
            return res.status(400).send("No file uploaded.");
        }

        let extractedText = "";

        // ----- PDF FILES -----
        if (file.mimetype === "application/pdf") {
            const data = await pdfParse(file.buffer);
            extractedText = data.text;
        }

        // ----- IMAGE FILES -----
        else {
            const result = await Tesseract.recognize(file.buffer, "eng");
            extractedText = result.data.text;
        }

        // Send extracted report text to Groq
        const completion = await groq.chat.completions.create({
            model: "llama-3.1-70b-versatile",
            messages: [
                {
                    role: "system",
                    content: `
You are a futuristic medical AI analyst from VitaSphere.

Your mission:
- Analyze lab reports
- Detect abnormalities
- Summarize results simply
- Explain risks and solutions
- Suggest improvements
- Stay friendly & supportive

Tone: 
Warm, scientific, helpful, Forerunner-inspired but easy to understand.
                    `
                },
                { role: "user", content: extractedText }
            ]
        });

        const aiReply = completion.choices[0].message.content;
        return res.send(aiReply);

    } catch (err) {
        console.error(err);
        return res.status(500).send("Error analyzing health report.");
    }
});

// ---------------------- START SERVER ----------------------

app.listen(3000, () => {
    console.log("🚀 Groq Streaming AI server ready at: http://localhost:3000");
});



