const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const AuctionItem = require('../models/AuctionItem');
const Bid = require('../models/Bid'); 
const { protect, admin } = require('../middleware/authMiddleware');


// 1. Create Item (Admin Only)
router.post('/create', protect, admin, async (req, res) => { 
    const { title, description, starting_price, end_time, imageUrl } = req.body;
    
    try {
        const newItem = new AuctionItem({
            title,
            description,
            starting_price,
            current_highest_bid: starting_price,
            end_time: new Date(end_time), 
            seller: req.user.id,
            status: 'approved', 
            is_active: true,
            imageUrl
        });

        const item = await newItem.save();
        res.json(item);

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error creating item.' });
    }
});


// 2. Submit Item (User)
router.post('/submit', protect, async (req, res) => { 
    const { title, description, starting_price, end_time, imageUrl } = req.body;
    
    try {
        const newItem = new AuctionItem({
            title,
            description,
            starting_price,
            current_highest_bid: starting_price,
            end_time: new Date(end_time), 
            seller: req.user.id, // ID from the JWT token
            is_active: false, // Must be FALSE until approved by admin
            status: 'pending', // Set status to pending
            imageUrl // Save the image URL
        });

        const item = await newItem.save();
        res.json({ msg: 'Item submitted successfully. Waiting for admin approval.', item });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error submitting item.' });
    }
});


// 3. Get Pending Items (Admin Only)
router.get('/pending', protect, admin, async (req, res) => { 
    try {
        const items = await AuctionItem.find({ status: 'pending' }).sort({ createdAt: -1 });
        res.json(items);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error retrieving pending items.' });
    }
});


// 4. Approve Item (Admin Only)
router.post('/approve/:id', protect, admin, async (req, res) => {
    try {
        const item = await AuctionItem.findByIdAndUpdate(
            req.params.id,
            { status: 'approved', is_active: true }, 
            { new: true }
        );

        if (!item) {
            return res.status(404).json({ msg: 'Item not found' });
        }
        res.json({ msg: 'Item approved and now live!', item });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error during item approval.' });
    }
});

// 5. Analytics Summary (Admin Only)
router.get('/analytics/summary', protect, admin, async (req, res) => {
    try {
        // Find top 10 items by total number of bids recorded
        const topItems = await Bid.aggregate([
            {
                // Group all bids by the item they were placed on
                $group: {
                    _id: '$auctionItem',
                    totalBids: { $sum: 1 }, // Count total bids
                    maxBid: { $max: '$amount' }, // Find the max bid amount
                }
            },
            { $sort: { totalBids: -1 } }, // Sort by the items that received the most bids
            { $limit: 10 }, // Limit to the top 10 items
            
            // Join Bid data back to the AuctionItem to get the Title and Starting Price
            { 
                $lookup: {
                    from: 'auctionitems', // The MongoDB collection name (lowercase plural)
                    localField: '_id',
                    foreignField: '_id',
                    as: 'itemDetails'
                }
            },
            { $unwind: '$itemDetails' }, // Deconstruct the array created by $lookup
            { 
                $project: {
                    itemId: '$_id',
                    title: '$itemDetails.title',
                    totalBids: 1,
                    // minBid is the item's starting price for visualization purposes
                    minBid: '$itemDetails.starting_price', 
                    maxBid: 1
                }
            }
        ]);

        res.json(topItems);

    } catch (err) {
        console.error('Analytics Fetch Crash:', err.message);
        // Return a 500 error, but send an empty array to prevent client crash
        res.status(500).json([]); 
    }
});


// 6. Get All Approved Items (Public)
router.get('/', async (req, res) => { 
    try {
        const items = await AuctionItem.find({ status: 'approved' }).sort({ end_time: 1 });
        res.json(items);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error retrieving items.' });
    }
});


// 7. Get Closed Items
router.get('/closed', async (req, res) => { 
    try {
        // Find items that are NOT active and have a winner (highest_bidder is not null)
        const items = await AuctionItem.find({ is_active: false, highest_bidder: { $ne: null } })
            .populate('highest_bidder', 'username') // To display the winner's name
            .sort({ end_time: -1 });
        res.json(items);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error retrieving closed items.' });
    }
});


// 8. Get Single Item
router.get('/:id', async (req, res) => { 
    try {
        const item = await AuctionItem.findById(req.params.id)
            .populate('highest_bidder', 'username'); 

        if (!item) {
            return res.status(404).json({ msg: 'Item not found' });
        }
        res.json(item);
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'Item not found' });
        }
        res.status(500).json({ msg: 'Server error retrieving single item.' });
    }
});


// 9. Delete Item (Admin Only)
router.delete('/:id', protect, admin, async (req, res) => { 
    try {
        const item = await AuctionItem.findById(req.params.id);

        if (!item) {
            return res.status(404).json({ msg: 'Item not found' });
        }
        await item.deleteOne();
        res.json({ msg: 'Auction item removed' });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error deleting item.' });
    }
});


// 10. PAY FOR ITEM (New Fixed Payment Route)
router.post('/pay/:id', protect, async (req, res) => {
  try {
    const itemId = req.params.id;
    
    // 1. Find the item
    let item = await AuctionItem.findById(itemId);
    if (!item) {
      return res.status(404).json({ msg: 'Item not found' });
    }

    // 2. Validation Checks
    if (!item.highest_bidder) {
        return res.status(400).json({ msg: 'This item has no winner.' });
    }

    // 3. Security Check: Ensure the person paying is actually the winner
    if (item.highest_bidder.toString() !== req.user.id) {
       return res.status(401).json({ msg: 'Not authorized. You are not the winner.' });
    }

    // 4. Update Status
    item.isPaid = true; 
    item.status = 'sold';
    item.paymentStatus = 'paid'; // Add this for consistency
    
    await item.save();

    res.json({ msg: 'Payment successful', item });
    
  } catch (err) {
    console.error("PAYMENT ERROR:", err.message);
    // FIXED: Return JSON error so frontend doesn't crash
    res.status(500).json({ msg: 'Server Error: ' + err.message });
  }
});

router.get('/general/stats', async (req, res) => {
    try {
        // 1. Count Live Auctions
        const liveCount = await AuctionItem.countDocuments({ is_active: true });

        // 2. Calculate Total Volume (Sum of all sold items)
        const volumeData = await AuctionItem.aggregate([
            { $match: { status: 'sold' } },
            { $group: { _id: null, total: { $sum: "$current_highest_bid" } } }
        ]);
        const totalVolume = volumeData.length > 0 ? volumeData[0].total : 0;

        // 3. Count Active Users (Total users registered)
        // Note: You need to import User model at the top if not already there
        const User = require('../models/User'); 
        const activeBidders = await User.countDocuments({ role: 'user' });

        res.json({
            liveCount,
            totalVolume,
            activeBidders
        });

    } catch (err) {
        console.error("Stats Error:", err.message);
        res.status(500).json({ msg: 'Server Error fetching stats' });
    }
});

module.exports = router;