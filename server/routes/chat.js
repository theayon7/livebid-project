const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');

// Change v1beta to v1 for better production stability on Render
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

router.post('/ask', protect, async (req, res) => {
    const { query } = req.body;
    
    if (!query) return res.status(400).json({ msg: 'Query is required.' });

    try {
        // Simplified Payload: We put the Persona inside the text parts
        const payload = {
            contents: [{ 
                parts: [{ 
                    text: `Persona: You are Aucto, a helpful auction support assistant for the LiveBid platform. 
                           User Question: ${query}` 
                }] 
            }]
        };

        const apiResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const result = await apiResponse.json();

        // THIS IS THE CRITICAL PART: Check Render Logs for this output!
        if (result.error) {
            console.error("CRITICAL GOOGLE ERROR:", JSON.stringify(result.error));
            
            // If the error is 'User location is not supported', we know the region is the issue
            if (result.error.message.includes("location")) {
                return res.json({ response: "I'm sorry! My AI brain is hosted in a region Google doesn't support yet. Please check back later!" });
            }
            
            return res.json({ response: "Aucto is having trouble connecting to Google. Please verify your API Key." });
        }

        if (result.candidates && result.candidates[0].content && result.candidates[0].content.parts) {
            res.json({ response: result.candidates[0].content.parts[0].text });
        } else {
            res.json({ response: "I'm here, but I couldn't generate an answer. Try asking something else!" });
        }

    } catch (error) {
        console.error('Chat Catch Error:', error);
        res.status(500).json({ msg: 'Server connection error.' });
    }
});

module.exports = router;