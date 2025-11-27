import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import multer from "multer";
import Tesseract from "tesseract.js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

dotenv.config();

const app = express();

// CORS FIX FOR RENDER
app.use(
    cors({
        origin: "*",
        methods: ["GET", "POST"],
        allowedHeaders: ["Content-Type"],
    })
);

app.use(express.json());

// ----------- GROQ CLIENT ----------
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ----------- MEMORY -----------
let conversationMemory = [];

// keep last 10 messages
function updateMemory(user, bot) {
    conversationMemory.push({ role: "user", content: user });
    conversationMemory.push({ role: "assistant", content: bot });

    if (conversationMemory.length > 10) {
        conversationMemory = conversationMemory.slice(-10);
    }
}

// --------------------------------
//         AI CHAT ROUTE
// --------------------------------
app.post("/api/ai", async (req, res) => {
    try {
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ error: "Message is required" });
        }

        const messages = [
            {
                role: "system",
                content: `You are Guilty Spark 343… futuristic health AI assistant.`,
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
    } catch (err) {
        console.error(err);
        res.status(500).end("ERROR");
    }
});

// --------------------------------
//     HEALTH REPORT ANALYSIS
// --------------------------------
const upload = multer();

app.post("/api/analyze-report", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send("No file uploaded.");
        }

        let text = "";

        // PDF
        if (req.file.mimetype === "application/pdf") {
            const pdf = await pdfParse(req.file.buffer);
            text = pdf.text;
        } 
        // IMAGE
        else {
            const result = await Tesseract.recognize(req.file.buffer, "eng");
            text = result.data.text;
        }

        const completion = await groq.chat.completions.create({
            model: "llama-3.1-70b-versatile",
            messages: [
                { role: "system", content: "You are a futuristic medical analyst…" },
                { role: "user", content: text },
            ],
        });

        const reply = completion.choices[0].message.content;
        res.send(reply);
    } catch (e) {
        console.error(e);
        res.status(500).send("Error analyzing health report.");
    }
});

// --------------------------------
//      START SERVER FOR RENDER
// --------------------------------
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Groq AI server running on port ${PORT}`);
});
