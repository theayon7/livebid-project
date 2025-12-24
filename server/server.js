const express = require('express');
const http = require('http'); 
const socketIo = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const cron = require('node-cron'); 

// --- CRITICAL MODEL IMPORTS ---
const AuctionItem = require('./models/AuctionItem');
const Bid = require('./models/Bid');
const User = require('./models/User'); // User model needed for winner lookup
// ------------------------------

// Load environment variables from .env file
require('dotenv').config(); 

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 8080;

// --- Database Connection ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB connection successful!'))
    .catch(err => console.error('❌ MongoDB connection error:', err.message));

// --- Middleware Setup ---
const corsOptions = {
    origin: '*', 
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.use(express.json()); 


// ------------------------------------
// 5. Define Routes
// ------------------------------------
app.use('/api/auth', require('./routes/auth')); 
app.use('/api/items', require('./routes/items'));
app.use('/api/chat', require('./routes/chat')); // Chatbot route


// --- Socket.io Setup ---
const io = socketIo(server, {
    cors: corsOptions 
});

// Real-Time Connection Handler (With Bid Save and Username Lookup)
io.on('connection', (socket) => {
    console.log(`📡 A user connected: ${socket.id}`);

    socket.on('joinAuction', (auctionId) => {
        socket.join(auctionId);
        console.log(`User ${socket.id} joined room: ${auctionId}`);
    });

    // 2. Place Bid Handler: Logic for placing a new bid
    socket.on('placeBid', async ({ auctionId, userId, amount }) => {
        try {
            const item = await AuctionItem.findById(auctionId);

            if (!item) {
                return socket.emit('bidError', { msg: 'Auction item not found.' });
            }

            // CRITICAL CHECK: Stop bidding if inactive or time is up
            if (!item.is_active || item.end_time < new Date()) {
                return socket.emit('bidError', { msg: 'Auction is closed or inactive. Bid rejected.' });
            }

            // A. Validation: Check if the bid is valid (FR 3.2)
            if (amount <= item.current_highest_bid) {
                return socket.emit('bidError', { msg: 'Bid must be higher than the current highest bid.' });
            }
            
            // 1. Record the Bid in the Bid Collection 
            const newBid = new Bid({
                bidder: userId,
                auctionItem: auctionId,
                amount: amount,
            });
            await newBid.save(); 
            
            // 2. Find the bidder's username for instant broadcast
            const bidderUser = await User.findById(userId).select('username');
            const highestBidderUsername = bidderUser ? bidderUser.username : 'Unknown';
            
            // 3. Update Auction Item (Highest Bidder)
            item.current_highest_bid = amount;
            item.highest_bidder = userId;
            await item.save();

            // 4. Broadcast the Update (FR 3.1)
            const updateData = {
                auctionId,
                newBid: amount,
                highestBidderId: userId,
                highestBidderUsername: highestBidderUsername, // Include username in broadcast
                timestamp: new Date()
            };

            io.to(auctionId).emit('bidUpdate', updateData);
            console.log(`Bid placed in room ${auctionId}: $${amount} by ${highestBidderUsername}`);

        } catch (err) {
            console.error('Bid error:', err.message);
            socket.emit('bidError', { msg: 'Internal server error while processing bid.' });
        }
    });

    socket.on('disconnect', () => {
        console.log(`🔌 User disconnected: ${socket.id}`);
    });
});


// ----------------------------------------------------
// CRON JOB: AUCTION CLOSING LOGIC (Part 17)
// ----------------------------------------------------

const startAuctionCloser = () => {
    // Cron job runs every minute: '*/1 * * * *'
    cron.schedule('*/1 * * * *', async () => {
        const now = new Date();
        console.log(`[CRON] Checking for closed auctions at ${now.toLocaleTimeString()}`);
        
        try {
            const closedAuctions = await AuctionItem.find({ 
                is_active: true, 
                end_time: { $lte: now } 
            });

            for (const auction of closedAuctions) {
                console.log(`[CRON] Closing auction: ${auction.title}`);
                
                // 1. Mark item as inactive and set payment status
                auction.is_active = false;
                auction.paymentStatus = 'pending'; // NEW: Mark item as needing payment
                await auction.save();

                if (auction.highest_bidder) {
                    const winner = await User.findById(auction.highest_bidder);
                    
                    if (winner) {
                        console.log(`[CRON] Winner Found! Item: ${auction.title}, Winner: ${winner.username}`);
                        
                        // 2. Mark the specific highest Bid record as isWinning: true (Part 17)
                        await Bid.findOneAndUpdate(
                            { bidder: auction.highest_bidder, auctionItem: auction._id },
                            { isWinning: true },
                            { sort: { amount: -1 } } 
                        );

                        // 3. Notify all clients
                        io.emit('auctionClosed', {
                            itemId: auction._id,
                            title: auction.title,
                            winnerUsername: winner.username,
                            finalBid: auction.current_highest_bid
                        });
                    }
                }
            }
        } catch (error) {
            console.error('[CRON ERROR] Failed to run auction closing job:', error.message);
        }
    });
    console.log('✅ Auction Closer Cron Job Initialized.');
};

// Call the function to start the job
startAuctionCloser(); 


// --- API Route Test ---
app.get('/', (req, res) => {
    res.send('LiveBid Server Running!');
});

// --- Start Server ---
server.listen(port, () => {
    console.log(`🚀 Server listening on port ${port}`);
    console.log(`Open http://localhost:${port} to view the server status.`);
});