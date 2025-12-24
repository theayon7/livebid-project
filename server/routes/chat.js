const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');

// Using the most stable production endpoint
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

router.post('/ask', protect, async (req, res) => {
    const { query } = req.body;
    
    if (!query) return res.status(400).json({ msg: 'Query is required.' });

    try {
        // Simplified Payload: No system instructions or tools to avoid "Refusal" errors
        const payload = {
            contents: [{ 
                parts: [{ text: `You are Aucto, an Auction helper. Question: ${query}` }] 
            }],
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

        // LOG THE ERROR IN RENDER: This helps you see exactly why Google said no
        if (result.error) {
            console.error("GOOGLE API ERROR:", JSON.stringify(result.error));
            return res.json({ response: "Aucto is calibrating... please try one more time." });
        }

        if (result.candidates && result.candidates[0].content && result.candidates[0].content.parts) {
            res.json({ response: result.candidates[0].content.parts[0].text });
        } else {
            res.json({ response: "I'm sorry, I can't process that specific query. Try asking about bidding!" });
        }

    } catch (error) {
        console.error('Chat Catch Error:', error);
        res.status(500).json({ msg: 'Server connection error.' });
    }
});

module.exports = router;