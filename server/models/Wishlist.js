const mongoose = require('mongoose');

const WishlistSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    auctionItem: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AuctionItem',
        required: true,
    },
    // Ensure one user can only add one item once
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// Enforce unique combination of user and auctionItem
WishlistSchema.index({ user: 1, auctionItem: 1 }, { unique: true });

module.exports = mongoose.model('Wishlist', WishlistSchema);