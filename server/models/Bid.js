const mongoose = require('mongoose');

const BidSchema = new mongoose.Schema({
    // Link to the user who placed the bid
    bidder: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    // Link to the auction item
    auctionItem: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AuctionItem',
        required: true,
    },
    amount: {
        type: Number,
        required: true,
    },
    isWinning: {
        type: Boolean,
        default: false,
    },
    bidTime: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('Bid', BidSchema);