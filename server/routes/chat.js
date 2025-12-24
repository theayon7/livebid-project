const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware'); // Ensures only logged-in users can chat

// --- Configuration for Gemini ---
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent';

// IMPORTANT: Using the valid key provided by the user for the Gemini service.
const GEMINI_API_KEY = "AIzaSyC4g8zB9u6U82bOZiAUtaurvWTTcrUbam8"; 

// Define the system persona for the chatbot
const SYSTEM_INSTRUCTION = "You are a helpful and knowledgeable Auction Support Specialist named 'Aucto'. Your goal is to answer user questions about online bidding rules, auction items, payment processes, and general procedures on the LiveBid platform. Keep responses concise and supportive.";


router.post('/ask', protect, async (req, res) => {
    const { query } = req.body;
    
    if (!query) {
        return res.status(400).json({ msg: 'Query is required.' });
    }

    try {
        const payload = {
            contents: [{ parts: [{ text: query }] }],
            systemInstruction: {
                parts: [{ text: SYSTEM_INSTRUCTION }]
            },
            // Use Google Search for grounding to ensure accurate policy/process answers
            tools: [{ "google_search": {} }], 
        };

        // Make the POST request to the Gemini API, appending the key to the URL
        const apiResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const result = await apiResponse.json();

        // Extract the generated text
        const generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, Aucto is having technical difficulties connecting to the knowledge base right now.";
        
        res.json({ response: generatedText });

    } catch (error) {
        console.error('Gemini API Error:', error);
        res.status(500).json({ msg: 'Internal server error while connecting to AI service.' });
    }
});

module.exports = router;