const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');

// Standard stable model
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

const SYSTEM_INSTRUCTION = "You are a helpful Auction Support Specialist named 'Aucto'. Answer questions about LiveBid procedures concisely.";

router.post('/ask', protect, async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ msg: 'Query is required.' });

    try {
        const payload = {
            contents: [{ parts: [{ text: query }] }],
            systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
            // Lower safety thresholds to prevent "undefined parts" errors
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
            ]
        };

        const apiResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const result = await apiResponse.json();

        // Safety check for the response structure
        if (result.candidates && result.candidates[0].content && result.candidates[0].content.parts) {
            const generatedText = result.candidates[0].content.parts[0].text;
            res.json({ response: generatedText });
        } else {
            // Log the reason Google blocked it (Check Render Logs for this!)
            const reason = result.candidates?.[0]?.finishReason || "UNKNOWN_ERROR";
            console.error("Gemini Refusal Reason:", reason);
            res.json({ response: "I cannot answer that specific question due to safety policies. Please ask something else!" });
        }

    } catch (error) {
        console.error('Gemini API Error:', error);
        res.status(500).json({ msg: 'Internal server error.' });
    }
});

module.exports = router;