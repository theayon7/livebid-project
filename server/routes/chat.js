const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');

// Using the most stable production URL
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

const SYSTEM_INSTRUCTION = "You are Aucto, an Auction Support Specialist. Answer questions about LiveBid bidding and payments concisely.";

router.post('/ask', protect, async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ msg: 'Query is required.' });

    try {
        const payload = {
            contents: [{ parts: [{ text: query }] }],
            systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
            // Removed "Tools" and "Google Search" to prevent safety blocks
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

        // Check if Google sent an error in the JSON
        if (result.error) {
            console.error("Gemini API Error:", result.error.message);
            return res.json({ response: "Aucto is having a moment. Please try again!" });
        }

        // Extract text carefully
        if (result.candidates && result.candidates[0].content && result.candidates[0].content.parts) {
            res.json({ response: result.candidates[0].content.parts[0].text });
        } else {
            // This happens if the AI refuses to answer
            res.json({ response: "I'm sorry, I can't answer that. Can we talk about auctions instead?" });
        }

    } catch (error) {
        console.error('Chat Route Error:', error);
        res.status(500).json({ msg: 'Server error.' });
    }
});

module.exports = router;