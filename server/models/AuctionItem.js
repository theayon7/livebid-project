const mongoose = require('mongoose');

const AuctionItemSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    starting_price: {
        type: Number,
        required: true
    },
    current_highest_bid: {
        type: Number,
        default: 0
    },
    imageUrl: { 
        type: String,
        default: 'https://placehold.co/400x300/F0F0F0/000000?text=No+Image' 
    },
    highest_bidder: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    end_time: {
        type: Date,
        required: true
    },
    is_active: {
        type: Boolean,
        default: true 
    },
    // --- FIXED SECTION: Added 'sold' and 'closed' ---
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'closed', 'sold'],
        default: 'pending' 
    },
    // --- NEW FIELDS: To track payment status ---
    isPaid: {
        type: Boolean,
        default: false
    },
    paymentStatus: {
        type: String,
        default: 'unpaid'
    },
    seller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('AuctionItem', AuctionItemSchema);