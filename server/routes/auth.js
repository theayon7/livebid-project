const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose'); // <--- CRUCIAL: Ensure Mongoose is imported here once

// Import Models
const User = require('../models/User'); 
const AuctionItem = require('../models/AuctionItem'); 
const Bid = require('../models/Bid'); 
const Wishlist = require('../models/Wishlist'); 
const { protect, admin } = require('../middleware/authMiddleware'); 

// Ensure JWT_SECRET is in your .env for production!
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key_for_course_project'; 

// --- User Authentication Routes (Register, Login, set-admin) remain the same ---

router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ msg: 'User already exists' });
        }
        user = new User({ username, email, password });
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        await user.save();
        const payload = { user: { id: user.id, role: user.role } };
        jwt.sign(payload, JWT_SECRET, { expiresIn: '5h' }, (err, token) => {
            if (err) throw err;
            res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error during registration.');
    }
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        let user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }
        const payload = { user: { id: user.id, role: user.role } };
        jwt.sign(payload, JWT_SECRET, { expiresIn: '5h' }, (err, token) => {
            if (err) throw err;
            res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error during login.');
    }
});

router.post('/set-admin', async (req, res) => {
    const { email } = req.body;
    try {
        let user = await User.findOneAndUpdate({ email }, { role: 'admin' }, { new: true });
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }
        res.json({ msg: `${user.email} is now an admin.`, role: user.role });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});


// ----------------------------------------------------
// BID HISTORY ROUTE (FIXED TO PREVENT AGGREGATION CRASH)
// ----------------------------------------------------

router.get('/bids', protect, async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Fetch all bids placed by the user, process them, and compare against the winning bid
        const bids = await Bid.aggregate([
            // 1. Filter: Match bids placed by the current user
            { $match: { bidder: new mongoose.Types.ObjectId(userId) } }, // <-- FIX APPLIED
            { $sort: { bidTime: -1 } },
            
            // 2. Lookup: Join with the AuctionItems collection to get item details
            { 
                $lookup: {
                    from: 'auctionitems', // Confirmed: Mongoose uses lowercase plural for collection names
                    localField: 'auctionItem',
                    foreignField: '_id',
                    as: 'itemDetails'
                }
            },
            { $unwind: '$itemDetails' },
            
            // 3. Project: Shape the initial output data
            {
                $project: {
                    _id: 0,
                    itemId: '$auctionItem',
                    title: '$itemDetails.title',
                    yourBid: '$amount',
                    
                    // Check if this user's ID matches the item's highest_bidder ID
                    isHighest: { 
                        $eq: ['$itemDetails.highest_bidder', new mongoose.Types.ObjectId(userId)] // <-- FIX APPLIED
                    },
                    status: {
                        $cond: {
                            if: '$itemDetails.is_active',
                            then: 'Active',
                            else: 'Closed'
                        }
                    },
                    bidTime: 1
                }
            },
            // 4. Grouping: Show only the user's latest/highest bid per unique item
            {
                $group: {
                    _id: '$itemId',
                    title: { $first: '$title' },
                    lastBidTime: { $first: '$bidTime' },
                    isHighest: { $first: '$isHighest' },
                    status: { $first: '$status' },
                    yourHighestBid: { $max: '$yourBid' }
                }
            },
            { $sort: { lastBidTime: -1 } }
        ]);
        
        // Reformat the grouped results for the frontend table
        const bidHistory = bids.map(bid => ({
            itemId: bid._id,
            title: bid.title,
            yourBid: bid.yourHighestBid,
            isHighest: bid.isHighest,
            status: bid.status,
            bidTime: bid.lastBidTime
        }));


        res.status(200).json(bidHistory); // Return success
    } catch (err) {
        // Log the error for server-side debugging
        console.error('Bid History AGGREGATION CRASH:', err.message);
        
        // Return a safe EMPTY ARRAY and 500 status code to prevent the frontend crash
        res.status(500).json([]); 
    }
});


// --- Wishlist Routes ---

router.post('/wishlist/:itemId', protect, async (req, res) => {
    try {
        const item = await AuctionItem.findById(req.params.itemId);
        if (!item) {
            return res.status(404).json({ msg: 'Auction item not found' });
        }

        const newWish = new Wishlist({
            user: req.user.id,
            auctionItem: req.params.itemId,
        });

        await newWish.save();
        res.json({ msg: 'Item added to wishlist.' });

    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ msg: 'Item is already in your wishlist.' });
        }
        console.error(err.message);
        res.status(500).send('Server error adding to wishlist.');
    }
});


router.delete('/wishlist/:itemId', protect, async (req, res) => {
    try {
        const result = await Wishlist.findOneAndDelete({
            user: req.user.id,
            auctionItem: req.params.itemId,
        });

        if (!result) {
            return res.status(404).json({ msg: 'Item not found in your wishlist.' });
        }
        res.json({ msg: 'Item removed from wishlist.' });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error removing from wishlist.');
    }
});

router.get('/wishlist', protect, async (req, res) => {
    try {
        const wishlist = await Wishlist.find({ user: req.user.id })
            .populate('auctionItem', 'title current_highest_bid end_time imageUrl'); // Fetch relevant item details

        res.json(wishlist);

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error retrieving wishlist.');
    }
});

module.exports = router;