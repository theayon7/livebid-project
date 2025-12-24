const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');

// Using standard Gemini 1.5 Flash for better production stability
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

// Pull the key from Render's environment variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

const SYSTEM_INSTRUCTION = "You are a helpful Auction Support Specialist named 'Aucto'. Answer questions about bidding, payments, and LiveBid procedures concisely.";

router.post('/ask', protect, async (req, res) => {
    const { query } = req.body;
    
    if (!query) {
        return res.status(400).json({ msg: 'Query is required.' });
    }

    // Safety check for the API Key
    if (!GEMINI_API_KEY) {
        console.error("ERROR: GEMINI_API_KEY is missing on the server.");
        return res.status(500).json({ response: "Aucto is currently offline due to a configuration error." });
    }

    try {
        const payload = {
            contents: [{ parts: [{ text: query }] }],
            systemInstruction: {
                parts: [{ text: SYSTEM_INSTRUCTION }]
            }
        };

        const apiResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const result = await apiResponse.json();

        if (result.error) {
            console.error('Gemini API Error:', result.error);
            return res.status(500).json({ response: "I'm having trouble connecting to my AI brain. Please try again in a moment." });
        }

        const generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text || "Aucto is thinking... please try asking again.";
        
        res.json({ response: generatedText });

    } catch (error) {
        console.error('Server Error:', error);
        res.status(500).json({ msg: 'Internal server error connecting to AI.' });
    }
});

module.exports = router;