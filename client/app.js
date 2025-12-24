const API_URL = 'http://localhost:8080/api';
const SOCKET_URL = 'http://localhost:8080';

// Global state
const bootstrap = window.bootstrap;
const Chart = window.Chart;

let currentToken = localStorage.getItem('token');
let currentUser = JSON.parse(localStorage.getItem('user'));
let currentAuctionId = null;
let auctionSocket = null;
let timerInterval;

document.addEventListener('DOMContentLoaded', () => {
    console.log('LiveBid Frontend Loaded. Initializing...');

    // Selectors
    const authLink = document.getElementById('auth-link');
    const authArea = document.getElementById('auth-area');
    const auctionCatalog = document.getElementById('auction-catalog');
    const catalogSection = document.getElementById('catalog-section');

    // Chat selectors
    const chatModalElement = document.getElementById('chatModal');
    const chatModal = chatModalElement ? new bootstrap.Modal(chatModalElement) : null;
    const openChatBtn = document.getElementById('open-chat-btn');
    const chatForm = document.getElementById('chat-form');
    const chatMessages = document.getElementById('chat-messages');

    // ================================================================
    // 🌐 REAL-TIME PLATFORM STATS FETCHER + ANIMATED COUNTERS
    // ================================================================
    async function fetchPlatformStats() {
        try {
            const response = await fetch(`${API_URL}/items/general/stats`);
            if (!response.ok) return;
            const data = await response.json();

            // Animate platform numbers
            animateValue("live-auction-count", 0, data.liveCount || 0, 1000);
            animateValue("active-bidders", 0, data.activeBidders || 0, 1500);
            animateValue("total-bids", 0, data.totalVolume || 0, 2000, true);
        } catch (error) {
            console.warn("⚠️ Could not fetch stats. Is the server running?");
        }
    }

    function animateValue(id, start, end, duration, isCurrency = false) {
        const el = document.getElementById(id);
        if (!el) return;

        let startTime = null;
        const step = (timestamp) => {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);
            const value = Math.floor(progress * (end - start) + start);
            el.innerHTML = isCurrency
                ? "$" + value.toLocaleString()
                : value.toLocaleString();
            if (progress < 1) window.requestAnimationFrame(step);
        };
        window.requestAnimationFrame(step);
    }

    // Initial load + refresh every 30 s
    fetchPlatformStats();
    setInterval(fetchPlatformStats, 30000);
    // ================================================================

    renderUI();
    setupChatListeners();

    // ---------------- COUNTDOWN TIMER ----------------
    function startCountdownTimers(items) {
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            let activeLeft = false;
            items.forEach(item => {
                const el = document.getElementById(`timer-${item._id}`);
                if (!el) return;
                const dist = new Date(item.end_time).getTime() - Date.now();
                if (dist < 0) {
                    el.textContent = 'AUCTION ENDED';
                    el.classList.remove('text-danger');
                    el.classList.add('text-secondary');
                } else {
                    activeLeft = true;
                    const d = Math.floor(dist / (1000 * 60 * 60 * 24));
                    const h = Math.floor((dist % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    const m = Math.floor((dist % (1000 * 60 * 60)) / (1000 * 60));
                    const s = Math.floor((dist % (1000 * 60)) / 1000);
                    el.textContent =
                        (d > 0 ? d + "d " : "") +
                        String(h).padStart(2, '0') + "h " +
                        String(m).padStart(2, '0') + "m " +
                        String(s).padStart(2, '0') + "s";
                }
            });
            if (!activeLeft) clearInterval(timerInterval);
        }, 1000);
    }

    // ---------------- CHATBOT ----------------
    function setupChatListeners() {
        if (openChatBtn) {
            openChatBtn.addEventListener('click', () => {
                if (!currentToken) {
                    alert('Please log in to use the AI Support Chatbot.');
                } else {
                    chatModal.show();
                }
            });
        }
        if (chatForm) chatForm.addEventListener('submit', handleChatSubmit);
    }

    async function handleChatSubmit(e) {
        e.preventDefault();
        const input = document.getElementById('chat-input');
        const query = input.value.trim();
        if (!query) return;
        appendMessage(query, 'user');
        input.value = '';
        const loadingId = appendMessage('Aucto is typing...', 'ai-loading');
        try {
            const res = await fetch(`${API_URL}/chat/ask`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-auth-token': currentToken },
                body: JSON.stringify({ query })
            });
            const data = await res.json();
            removeMessage(loadingId);
            appendMessage(data.response || "Sorry, Aucto is having technical difficulties.", 'ai');
        } catch {
            removeMessage(loadingId);
            appendMessage("Network error: Could not reach the AI support server.", 'error');
        }
    }

    function appendMessage(text, type) {
        const id = `msg-${Date.now()}`;
        const isUser = type === 'user';
        const html = `
        <div class="d-flex mb-3 ${isUser ? 'justify-content-end' : 'justify-content-start'}" id="${id}">
            ${!isUser ? `<img src="https://placehold.co/40x40/06b6d4/ffffff?text=AI" class="rounded-circle me-3" alt="Aucto">` : ''}
            <div class="p-3 ${isUser ? 'bg-primary text-white' :
                type === 'ai' ? 'bg-success-light text-dark' :
                    'bg-danger-light text-dark'} rounded shadow-sm" style="max-width:80%;">
                ${isUser ? `<b>${currentUser.username}:</b> ` : type === 'ai' ? '🤖 Aucto: ' : ''}${text}
            </div>
            ${isUser ? `<img src="https://placehold.co/40x40/3b82f6/ffffff?text=U" class="rounded-circle ms-3" alt="User">` : ''}
        </div>`;
        chatMessages.insertAdjacentHTML('beforeend', html);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return id;
    }
    const removeMessage = id => document.getElementById(id)?.remove();

        // --- A. UI Rendering ---
    function renderUI() {
        if (currentToken && currentUser) {
            authLink.innerHTML = `<a class="nav-link" href="#" id="profile-link">Welcome, ${currentUser.username}</a>`;
            authArea.innerHTML = `
                <div class="alert alert-success">
                    <h4 class="alert-heading">Welcome back, ${currentUser.username}!</h4>
                    <p>Your role: <strong>${currentUser.role.toUpperCase()}</strong></p>
                    <button id="logout-btn" class="btn btn-sm btn-danger">Logout</button>
                    ${currentUser.role === 'admin' ? '<p class="mt-2"><button id="admin-panel-btn">Go to Admin Panel</button></p>' : ''}
                </div>
            `;
            document.getElementById('logout-btn').addEventListener('click', logout);
            document.getElementById('profile-link').addEventListener('click', showProfileDashboard); 
            
        } else {
            authLink.innerHTML = 'Login / Register';
            authArea.innerHTML = renderAuthForm();
            
            document.getElementById('login-form').addEventListener('submit', handleLogin);
            document.getElementById('register-form').addEventListener('submit', handleRegister);
            document.getElementById('show-register').addEventListener('click', showRegisterForm);
            document.getElementById('show-login').addEventListener('click', showLoginForm);
        }
        
        fetchActiveAuctions();
    }
    
    
    // --- B. Helper Functions for Forms and Auth ---
    function renderAuthForm() {
        return `
            <div class="card p-4 shadow-lg mx-auto" style="max-width: 400px;">
                <div id="login-container">
                    <h3 class="card-title text-center text-primary mb-4">Account Login</h3>
                    <form id="login-form">
                        <div class="mb-3">
                            <label for="login-email" class="form-label">Email</label>
                            <input type="email" class="form-control" id="login-email" required>
                        </div>
                        <div class="mb-3">
                            <label for="login-password" class="form-label">Password</label>
                            <input type="password" class="form-control" id="login-password" required>
                        </div>
                        <p id="login-error" class="text-danger small"></p>
                        <button type="submit" class="btn btn-primary w-100">Login</button>
                    </form>
                    <p class="text-center mt-3">Need an account? <a href="#" id="show-register">Register Here</a></p>
                </div>

                <div id="register-container" style="display:none;">
                    <h3 class="card-title text-center text-success mb-4">New Account</h3>
                    <form id="register-form">
                        <div class="mb-3">
                            <label for="reg-username" class="form-label">Username</label>
                            <input type="text" class="form-control" id="reg-username" required>
                        </div>
                        <div class="mb-3">
                            <label for="reg-email" class="form-label">Email</label>
                            <input type="email" class="form-control" id="reg-email" required>
                        </div>
                        <div class="mb-3">
                            <label for="reg-password" class="form-label">Password</label>
                            <input type="password" class="form-control" id="reg-password" required>
                        </div>
                        <p id="register-error" class="text-danger small"></p>
                        <button type="submit" class="btn btn-success w-100">Register</button>
                    </form>
                    <p class="text-center mt-3"><a href="#" id="show-login">Back to Login</a></p>
                </div>
            </div>
        `;
    }

    function showRegisterForm(e) {
        e.preventDefault();
        document.getElementById('login-container').style.display = 'none';
        document.getElementById('register-container').style.display = 'block';
    }

    function showLoginForm(e) {
        e.preventDefault();
        document.getElementById('login-container').style.display = 'block';
        document.getElementById('register-container').style.display = 'none';
    }

    function logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        currentToken = null;
        currentUser = null;
        renderUI(); 
    }
    
    // C. API Handlers
    async function handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const errorElement = document.getElementById('login-error');
        errorElement.textContent = ''; 

        try {
            const response = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache', 
                    'Pragma': 'no-cache'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (!response.ok) {
                errorElement.textContent = data.msg || 'Login failed.';
                return;
            }

            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            
            currentToken = data.token;
            currentUser = data.user;
            renderUI(); 
            showProfileDashboard(); 

        } catch (error) {
            console.error('Login fetch error:', error);
            errorElement.textContent = 'Network error or server unavailable.';
        }
    }

    async function handleRegister(e) {
        e.preventDefault();
        const username = document.getElementById('reg-username').value;
        const email = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-password').value;
        const errorElement = document.getElementById('register-error');
        errorElement.textContent = ''; 

        try {
            const response = await fetch(`${API_URL}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password })
            });

            const data = await response.json();

            if (!response.ok) {
                errorElement.textContent = data.msg || 'Registration failed.';
                return;
            }

            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));

            currentToken = data.token;
            currentUser = data.user;
            renderUI();
            alert('Registration Successful! You are now logged in.');
            showProfileDashboard(); 

        } catch (error) {
            console.error('Registration fetch error:', error);
            errorElement.textContent = 'Network error or server unavailable.';
        }
    }


    // D. Fetch Auctions 
    async function fetchActiveAuctions() {
        try {
            const response = await fetch(`${API_URL}/items`);
            const items = await response.json();
            
            auctionCatalog.classList.remove('loaded'); 
            
            auctionCatalog.innerHTML = items.map(item => {
                const adminDeleteBtn = (currentUser && currentUser.role === 'admin') 
                    ? `<button class="btn btn-sm btn-danger ms-2 admin-delete-live-btn" data-id="${item._id}">🗑️ Delete</button>` 
                    : '';

                return `
                <div class="col-md-4 mb-4" data-id="${item._id}">
                    <div class="card shadow-sm h-100">
                        <img src="${item.imageUrl || 'https://placehold.co/400x300/F0F0F0/000000?text=LiveBid'}" 
                            class="card-img-top" 
                            alt="${item.title}" 
                            style="height: 200px; object-fit: cover;">
                        <div class="card-body">
                            <span class="badge ${item.is_active ? 'bg-live' : 'bg-secondary'} float-end">${item.is_active ? 'LIVE' : 'CLOSED'}</span>
                            <h5 class="card-title">${item.title}</h5>
                            <p class="card-text text-muted">${item.description.substring(0, 50)}...</p>
                            <p class="mb-1">Ends: <span class="fw-bold text-danger" id="timer-${item._id}">Calculating...</span></p>
                            <h4 class="text-success bid-amount" id="current-bid-${item._id}">$${item.current_highest_bid.toFixed(2)}</h4>
                            
                            <div class="d-flex justify-content-between mt-3 align-items-center">
                                <div>
                                    <button class="btn btn-sm btn-primary view-bid-btn" data-id="${item._id}">View / Bid</button>
                                    ${adminDeleteBtn}
                                </div>
                                ${currentToken ? `<button class="btn btn-sm btn-outline-warning add-wishlist-btn" data-id="${item._id}">Watch</button>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `}).join('');

            // Event Listeners
            document.querySelectorAll('.view-bid-btn').forEach(button => {
                button.addEventListener('click', (e) => showAuctionDetail(e.target.dataset.id));
            });
            document.querySelectorAll('.add-wishlist-btn').forEach(btn => btn.addEventListener('click', handleAddToWishlist));

            if (currentUser && currentUser.role === 'admin') {
                document.querySelectorAll('.admin-delete-live-btn').forEach(btn => {
                    btn.addEventListener('click', handleDeleteLiveAuction);
                });
            }
            
            startCountdownTimers(items); 
            
            const cards = document.querySelectorAll('#auction-catalog .col-md-4');
            cards.forEach((card, index) => {
                card.style.animationDelay = `${index * 0.1}s`; 
            });
            auctionCatalog.classList.add('loaded');


        } catch (error) {
            console.error('Error fetching auctions:', error);
            auctionCatalog.innerHTML = '<div class="alert alert-warning">Could not load active auctions. Check server status.</div>';
        }
    }

    // --- ADMIN: Handle Deleting a LIVE auction ---
    async function handleDeleteLiveAuction(e) {
        const itemId = e.target.dataset.id;
        const confirmed = confirm("⚠️ ADMIN WARNING ⚠️\n\nAre you sure you want to delete this LIVE auction? \nThis action cannot be undone and will remove it for all users immediately.");
        
        if (!confirmed) return;

        try {
            const response = await fetch(`${API_URL}/items/${itemId}`, {
                method: 'DELETE',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-auth-token': currentToken 
                }
            });

            const data = await response.json();

            if (response.ok) {
                alert('Success: Item deleted permanently.');
                fetchActiveAuctions(); 
            } else {
                alert(`Error: ${data.msg || 'Could not delete item'}`);
            }
        } catch (error) {
            console.error('Delete error:', error);
            alert('Network error. Could not delete item.');
        }
    }

    // --- Wishlist Handler ---
    async function handleAddToWishlist(e) {
        const itemId = e.target.dataset.id;
        try {
            const response = await fetch(`${API_URL}/auth/wishlist/${itemId}`, {
                method: 'POST',
                headers: { 'x-auth-token': currentToken }
            });

            const data = await response.json();
            alert(data.msg); 
        } catch (error) {
            console.error('Error adding to wishlist:', error);
            alert('Network error during wishlist operation.');
        }
    }


    // E. Auction Detail View Logic 
    async function showAuctionDetail(auctionId) {
        currentAuctionId = auctionId;
        const modalElement = document.getElementById('auctionModal');
        if (!modalElement) { console.error("Modal element not found."); return; }
        const modal = new bootstrap.Modal(modalElement);
        
        try {
            const response = await fetch(`${API_URL}/items/${auctionId}`); 
            const item = await response.json();

            if (!item) return;

            document.getElementById('modal-item-title').textContent = item.title;
            document.getElementById('modal-item-description').textContent = item.description;
            document.getElementById('modal-current-bid').textContent = `$${item.current_highest_bid.toFixed(2)}`;
            document.getElementById('new-bid-amount').value = (item.current_highest_bid + 5).toFixed(2);
            document.getElementById('modal-highest-bidder').textContent = item.highest_bidder ? item.highest_bidder.username : 'None';
            
            const submitBtn = document.getElementById('submit-bid-btn');
            const requiredAlert = document.getElementById('login-required-alert');

            if (currentToken) {
                submitBtn.style.display = 'block';
                requiredAlert.style.display = 'none';
                document.getElementById('bid-form').addEventListener('submit', handleBidSubmission, { once: true });
            } else {
                submitBtn.style.display = 'none';
                requiredAlert.style.display = 'block';
            }

            if (auctionSocket) auctionSocket.disconnect(); 
            auctionSocket = io(SOCKET_URL);

            auctionSocket.on('connect', () => {
                auctionSocket.emit('joinAuction', auctionId); 
                console.log(`Socket connected and joined room: ${auctionId}`);
            });

            auctionSocket.on('bidUpdate', (data) => {
                document.getElementById('modal-current-bid').textContent = `$${data.newBid.toFixed(2)}`;
                document.getElementById('new-bid-amount').value = (data.newBid + 5).toFixed(2);
                document.getElementById('modal-highest-bidder').textContent = data.highestBidderUsername || 'None'; 
                
                const msgEl = document.getElementById('bid-message');
                document.getElementById('modal-current-bid').classList.add('price-flash');
                setTimeout(() => {
                    document.getElementById('modal-current-bid').classList.remove('price-flash');
                }, 500); 

                msgEl.className = 'alert alert-info';
                msgEl.textContent = `A new bid of $${data.newBid.toFixed(2)} was placed by ${data.highestBidderUsername || 'an unknown user'}!`;
                msgEl.style.display = 'block';
                setTimeout(() => msgEl.style.display = 'none', 3000);
            });

            auctionSocket.on('bidError', (data) => {
                const msgEl = document.getElementById('bid-message');
                msgEl.className = 'alert alert-danger';
                msgEl.textContent = `Error: ${data.msg}`;
                msgEl.style.display = 'block';
            });
            
            auctionSocket.on('auctionClosed', (data) => {
                if (data.itemId === currentAuctionId) {
                    modal.hide();
                    alert(`Auction Closed! Winner is ${data.winnerUsername} with a final bid of $${data.finalBid.toFixed(2)}.`);
                    renderUI(); 
                }
            });

            modal.show(); 

        } catch (error) {
            console.error('Error viewing auction detail:', error);
            alert('Could not load auction details. Check console.');
        }

        modalElement.addEventListener('hidden.bs.modal', () => {
            if (auctionSocket) {
                auctionSocket.disconnect();
                console.log('Socket disconnected on modal close.');
            }
        });
    }

    function handleBidSubmission(e) {
        e.preventDefault();
        
        const bidAmount = parseFloat(document.getElementById('new-bid-amount').value);
        
        if (auctionSocket && auctionSocket.connected && currentUser && currentAuctionId) {
            
            auctionSocket.emit('placeBid', {
                auctionId: currentAuctionId,
                userId: currentUser.id,
                amount: bidAmount
            });
            
            console.log(`Sending bid of $${bidAmount}`);
            
            document.getElementById('bid-form').addEventListener('submit', handleBidSubmission, { once: true });
            
        } else {
            alert('Error: Connection or User not authenticated.');
        }
    }


    // F. User Dashboard Functions
    async function showProfileDashboard() {
        catalogSection.style.display = 'none';

        authArea.innerHTML = `
            <div class="card p-4 shadow-lg my-5">
                <h3 class="card-title text-primary mb-4">👋 Welcome, ${currentUser.username}</h3>
                <div class="row">
                    <div class="col-md-4">
                        <button class="btn btn-primary w-100 mb-2" id="show-bids-btn">My Bids & Wins</button>
                    </div>
                    <div class="col-md-4">
                        <button class="btn btn-info w-100 mb-2" id="show-sell-btn">Submit Item for Auction</button>
                    </div>
                    <div class="col-md-4">
                        <button class="btn btn-warning w-100 mb-2" id="show-wishlist-btn">My Watch List</button>
                    </div>
                </div>
                
                <div class="row mt-2">
                    <div class="col-12">
                         <button class="btn btn-outline-secondary w-100" id="show-ended-btn">View Ended Auctions (Winners)</button>
                    </div>
                </div>

                ${currentUser.role === 'admin' ? ` 
                    <div class="row mt-3">
                        <div class="col-12">
                            <button class="btn btn-danger w-100 mb-2" id="admin-panel-btn">🛡️ Admin Control Panel</button> 
                        </div>
                    </div>
                ` : ''}
                <hr>
                <div id="dashboard-content">
                    <p class="text-muted">Select an option above to view details.</p>
                </div>
            </div>
        `;

        setupDashboardListeners();

        authArea.insertAdjacentHTML('beforeend', '<button class="btn btn-outline-secondary mb-5" id="back-to-catalog">← Back to Active Auctions</button>');
        document.getElementById('back-to-catalog').addEventListener('click', showCatalog);
    }

    function setupDashboardListeners() {
        document.getElementById('show-bids-btn')?.addEventListener('click', fetchBidHistory); 
        document.getElementById('show-sell-btn')?.addEventListener('click', showItemSubmissionForm);
        document.getElementById('show-wishlist-btn')?.addEventListener('click', fetchWishlist); 
        document.getElementById('show-ended-btn')?.addEventListener('click', fetchEndedAuctions);
        document.getElementById('admin-panel-btn')?.addEventListener('click', showAdminPanel); 
    }

    function showCatalog() {
        catalogSection.style.display = 'block'; 
        authArea.innerHTML = ''; 
        renderUI(); 
    }


    // G. Item Submission Form Functions
    function showItemSubmissionForm() {
        document.getElementById('dashboard-content').innerHTML = `
            <h4 class="text-info mb-3">Submit Item for Review</h4>
            <div id="submission-message" class="alert d-none" role="alert"></div>
            <form id="submission-form">
                <div class="mb-3">
                    <label for="submit-title" class="form-label">Title</label>
                    <input type="text" class="form-control" id="submit-title" required>
                </div>
                <div class="mb-3">
                    <label for="submit-desc" class="form-label">Description</label>
                    <textarea class="form-control" id="submit-desc" rows="3" required></textarea>
                </div>
                <div class="mb-3">
                    <label for="submit-image-url" class="form-label">Product Image URL (e.g., from Google Images)</label>
                    <input type="text" class="form-control" id="submit-image-url" placeholder="Paste a link to the image">
                </div>
                <div class="mb-3">
                    <label for="submit-price" class="form-label">Starting Price ($)</label>
                    <input type="number" class="form-control" id="submit-price" step="10" min="10" required>
                </div>
                <div class="mb-3">
                    <label for="submit-end-time" class="form-label">Desired End Time (Date/Time)</label>
                    <input type="datetime-local" class="form-control" id="submit-end-time" required>
                </div>
                <button type="submit" id="submit-item-btn" class="btn btn-success w-100">Submit for Admin Review</button>
            </form>
        `;
        document.getElementById('submission-form').addEventListener('submit', handleItemSubmission);
    }

    async function handleItemSubmission(e) {
        e.preventDefault();
        const messageEl = document.getElementById('submission-message');
        
        const itemData = {
            title: document.getElementById('submit-title').value,
            description: document.getElementById('submit-desc').value,
            imageUrl: document.getElementById('submit-image-url').value, 
            starting_price: parseFloat(document.getElementById('submit-price').value),
            end_time: document.getElementById('submit-end-time').value,
        };

        try {
            const response = await fetch(`${API_URL}/items/submit`, { 
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-auth-token': currentToken 
                },
                body: JSON.stringify(itemData)
            });

            const data = await response.json();

            if (response.ok) {
                messageEl.className = 'alert alert-success';
                messageEl.textContent = 'Submission successful! Item is pending Admin review.';
                document.getElementById('submission-form').reset();
            } else {
                messageEl.className = 'alert alert-danger';
                messageEl.textContent = data.msg || 'Submission failed.';
            }
            messageEl.style.display = 'block';

        } catch (error) {
            messageEl.className = 'alert alert-danger';
            messageEl.textContent = 'Network error or server unavailable.';
            messageEl.style.display = 'block';
        }
    }


    // H. Admin Panel Functions
    async function showAdminPanel() {
        catalogSection.style.display = 'none';

        authArea.innerHTML = `
            <div class="card p-4 shadow-lg my-5">
                <h3 class="card-title text-danger mb-4">🛡️ Admin Control Panel</h3>
                <div class="row mb-3">
                    <div class="col-12">
                        <button class="btn btn-primary mb-2 me-2" id="admin-pending-btn">View Pending Submissions</button>
                        <button class="btn btn-success mb-2 me-2" id="admin-analytics-btn">View Analytics (Top Bids)</button> 
                        <button class="btn btn-secondary mb-2" id="admin-back-btn">← Back to Active Auctions</button>
                    </div>
                </div>
                <hr>
                <div id="admin-content">
                    <p class="text-muted">Select an option above to manage platform state.</p>
                </div>
            </div>
        `;

        document.getElementById('admin-pending-btn').addEventListener('click', fetchPendingSubmissions);
        document.getElementById('admin-back-btn').addEventListener('click', showCatalog);
        document.getElementById('admin-analytics-btn').addEventListener('click', showAnalytics);
    }
    
    // I. FINAL DASHBOARD FEATURE FUNCTIONS
    
    async function fetchPendingSubmissions() {
        const contentArea = document.getElementById('admin-content');
        contentArea.innerHTML = '<p>Loading pending items...</p>';
    
        try {
            const response = await fetch(`${API_URL}/items/pending`, { 
                method: 'GET',
                headers: { 
                    'x-auth-token': currentToken 
                }
            });
    
            if (!response.ok) {
                contentArea.innerHTML = '<div class="alert alert-danger">Access Denied: Only Admins can view this page.</div>';
                return;
            }
    
            const items = await response.json();
    
            if (items.length === 0) {
                contentArea.innerHTML = '<div class="alert alert-info">No items currently pending approval.</div>';
                return;
            }
    
            contentArea.innerHTML = items.map(item => `
                <div class="card mb-3 shadow-sm" data-id="${item._id}">
                    <div class="card-body">
                        <img src="${item.imageUrl || 'https://placehold.co/100x75/F0F0F0/000000?text=Item'}" 
                             alt="${item.title}" 
                             style="width: 100px; height: 75px; object-fit: cover; float: left; margin-right: 15px;">
                        <h5 class="card-title">${item.title}</h5>
                        <p class="card-text small text-muted">Submitted by User ID: ${item.seller} | Price: $${item.starting_price.toFixed(2)}</p>
                        <p>${item.description.substring(0, 70)}...</p>
                        <button class="btn btn-success btn-sm me-2 approve-btn" data-id="${item._id}">Approve</button>
                        <button class="btn btn-danger btn-sm delete-btn" data-id="${item._id}">Reject/Delete</button>
                    </div>
                </div>
            `).join('');
    
            document.querySelectorAll('.approve-btn').forEach(btn => btn.addEventListener('click', (e) => handleAdminAction(e.target.dataset.id, 'approved')));
            document.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', (e) => handleAdminAction(e.target.dataset.id, 'delete')));
    
    
        } catch (error) {
            console.error('Admin Fetch Error:', error);
            contentArea.innerHTML = '<div class="alert alert-danger">Network error during fetch. Check server logs.</div>';
        }
    }
    
    
    async function handleAdminAction(itemId, action) {
        const endpoint = action === 'delete' ? `${API_URL}/items/${itemId}` : `${API_URL}/items/approve/${itemId}`;
        const method = action === 'delete' ? 'DELETE' : 'POST';
        
        try {
            const response = await fetch(endpoint, {
                method: method,
                headers: { 'x-auth-token': currentToken }
            });
    
            const data = await response.json();
            if (response.ok) {
                alert(`${action === 'delete' ? 'Item deleted' : 'Item approved'} successfully!`);
                fetchPendingSubmissions(); 
            } else {
                alert(`Action Failed: ${data.msg || 'Server error.'}`);
            }
    
        } catch (error) {
            alert('Network error during admin action.');
        }
    }


    // J. WISHLIST AND BID HISTORY 

    async function fetchWishlist() {
        const contentArea = document.getElementById('dashboard-content');
        contentArea.innerHTML = '<p>Loading your watchlist...</p>';
    
        try {
            const response = await fetch(`${API_URL}/auth/wishlist`, {
                method: 'GET',
                headers: { 'x-auth-token': currentToken } 
            });
    
            const wishes = await response.json();
    
            if (wishes.length === 0) {
                contentArea.innerHTML = '<div class="alert alert-info">Your Watch List is empty! Add items from the homepage.</div>';
                return;
            }
    
            contentArea.innerHTML = `
                <h4 class="text-warning mb-3">My Watch List (${wishes.length})</h4>
                <div class="row">
                    ${wishes.map(wish => `
                        <div class="col-md-6 mb-4">
                            <div class="card shadow-sm h-100">
                                 <img src="${wish.auctionItem.imageUrl || 'https://placehold.co/400x300/F0F0F0/000000?text=LiveBid'}" 
                                      class="card-img-top" 
                                      alt="${wish.auctionItem.title}" 
                                      style="height: 150px; object-fit: cover;">
                                <div class="card-body">
                                    <h5 class="card-title">${wish.auctionItem.title}</h5>
                                    <p class="mb-1">Current Bid: <b>$${wish.auctionItem.current_highest_bid.toFixed(2)}</b></p>
                                    <p class="text-muted small">Ends: ${new Date(wish.auctionItem.end_time).toLocaleDateString()}</p>
                                    <button class="btn btn-sm btn-danger remove-wishlist-btn" data-id="${wish.auctionItem._id}">Remove</button>
                                    <button class="btn btn-sm btn-primary float-end view-bid-btn" data-id="${wish.auctionItem._id}">Go to Auction</button>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
            
            document.querySelectorAll('.remove-wishlist-btn').forEach(btn => btn.addEventListener('click', handleRemoveFromWishlist));
            document.querySelectorAll('.view-bid-btn').forEach(button => {
                button.addEventListener('click', (e) => showAuctionDetail(e.target.dataset.id));
            });
    
        } catch (error) {
            console.error('Error fetching wishlist:', error);
            contentArea.innerHTML = '<div class="alert alert-danger">Failed to load watchlist.</div>';
        }
    }
    
    async function handleRemoveFromWishlist(e) {
        const itemId = e.target.dataset.id;
        if (!confirm('Are you sure you want to remove this item from your watchlist?')) return; 
    
        try {
            const response = await fetch(`${API_URL}/auth/wishlist/${itemId}`, {
                method: 'DELETE',
                headers: { 'x-auth-token': currentToken }
            });
    
            if (response.ok) {
                alert('Item removed!');
                fetchWishlist(); 
            } else {
                alert('Failed to remove item.');
            }
        } catch (error) {
            alert('Network error during removal.');
        }
    }
    

    async function fetchBidHistory() {
        const contentArea = document.getElementById('dashboard-content');
        contentArea.innerHTML = '<p>Loading your bidding history...</p>';

        try {
            const response = await fetch(`${API_URL}/auth/bids`, {
                method: 'GET',
                headers: { 'x-auth-token': currentToken }
            });

            const history = await response.json();

            if (history.length === 0) {
                contentArea.innerHTML = '<div class="alert alert-info">You have not placed any bids yet.</div>';
                return;
            }

            contentArea.innerHTML = `
                <h4 class="text-primary mb-3">Your Bids & Wins (${history.length})</h4>
                <table class="table table-striped">
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th>Your Bid</th>
                            <th>Status</th>
                            <th>Time</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${history.map(bid => `
                            <tr class="${bid.isHighest ? 'table-success' : ''}">
                                <td>${bid.title}</td>
                                <td>$${bid.yourBid.toFixed(2)}</td>
                                <td>
                                    ${bid.isHighest ? '<span class="badge bg-success">CURRENT WINNER</span>' : `<span class="badge bg-warning">Outbid</span>`}
                                </td>
                                <td>${new Date(bid.bidTime).toLocaleTimeString()}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        } catch (error) {
            console.error('Error fetching bid history:', error);
            contentArea.innerHTML = '<div class="alert alert-danger">Failed to load bid history.</div>';
        }
    }
    
    // --- UPDATED: Fetch and display closed auctions WITH PAYMENT BUTTON ---
    async function fetchEndedAuctions() {
        const contentArea = document.getElementById('dashboard-content');
        contentArea.innerHTML = '<p>Loading ended auctions...</p>';

        try {
            const response = await fetch(`${API_URL}/items/closed`); 
            const items = await response.json();

            if (items.length === 0) {
                contentArea.innerHTML = '<div class="alert alert-info">No auctions have ended yet.</div>';
                return;
            }

            contentArea.innerHTML = `
                <h4 class="text-secondary mb-3">Concluded Auctions (${items.length})</h4>
                <div class="row">
                    ${items.map(item => {
                        // Check if current logged-in user is the winner
                        const isWinner = (currentUser && item.highest_bidder && item.highest_bidder._id === currentUser.id);
                        
                        let winnerActionHtml = '';

                        if (isWinner) {
                            if (item.isPaid) {
                                winnerActionHtml = `<div class="alert alert-success mt-2 py-1">PAID ✅</div>`;
                            } else {
                                // RENDER THE PAYMENT BUTTON HERE
                                winnerActionHtml = `
                                    <div class="mt-2">
                                        <div class="alert alert-warning py-1 small">You won this item!</div>
                                        <a href="bkash.html?itemId=${item._id}&amount=${item.current_highest_bid.toFixed(2)}" 
                                           class="btn btn-danger w-100" style="background-color: #E2136E;">
                                           Pay with bKash
                                        </a>
                                    </div>
                                `;
                            }
                        }

                        return `
                        <div class="col-md-6 mb-4">
                            <div class="card shadow-sm h-100 bg-light" style="border: 1px solid #ccc;">
                                <img src="${item.imageUrl || 'https://placehold.co/400x300/e0e0e0/555555?text=CLOSED'}" 
                                     class="card-img-top" 
                                     alt="${item.title}" 
                                     style="height: 150px; object-fit: cover; filter: grayscale(100%);">
                                <div class="card-body">
                                    <h5 class="card-title text-muted">${item.title}</h5>
                                    <p class="mb-1 fw-bold text-success">
                                        🏆 WINNER: ${item.highest_bidder ? item.highest_bidder.username : 'No Winner'}
                                    </p>
                                    <p class="mb-0 small">Final Price: <b>$${item.current_highest_bid.toFixed(2)}</b></p>
                                    <p class="text-muted small mt-2">Closed on: ${new Date(item.end_time).toLocaleDateString()}</p>
                                    
                                    ${winnerActionHtml}
                                </div>
                            </div>
                        </div>
                    `}).join('')}
                </div>
            `;

        } catch (error) {
            console.error('Error fetching ended auctions:', error);
            contentArea.innerHTML = '<div class="alert alert-danger">Failed to load ended auctions.</div>';
        }
    }


    // Function to fetch data and render the Chart.js graph
    async function showAnalytics() {
        const contentArea = document.getElementById('admin-content');
        contentArea.innerHTML = '<h4>Top 10 Bidding Items</h4><canvas id="bidChart" width="400" height="200"></canvas>';
        
        try {
            const response = await fetch(`${API_URL}/items/analytics/summary`, {
                method: 'GET',
                headers: { 'x-auth-token': currentToken }
            });

            if (!response.ok) {
                contentArea.innerHTML = '<div class="alert alert-warning">Failed to load analytics data.</div>';
                return;
            }

            const data = await response.json();
            if (data.length === 0) {
                contentArea.innerHTML = '<div class="alert alert-info">Not enough bids recorded yet for analytics.</div>';
                return;
            }

            const titles = data.map(item => item.title);
            const maxBids = data.map(item => item.maxBid);
            const minBids = data.map(item => item.minBid);

            const ctx = document.getElementById('bidChart').getContext('2d');
            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: titles,
                    datasets: [
                        {
                            label: 'Highest Bid ($)',
                            data: maxBids,
                            backgroundColor: 'rgba(75, 192, 192, 0.6)',
                            borderColor: 'rgba(75, 192, 192, 1)',
                            borderWidth: 1
                        },
                        {
                            label: 'Starting Price ($)',
                            data: minBids, 
                            backgroundColor: 'rgba(255, 99, 132, 0.6)',
                            borderColor: 'rgba(255, 99, 132, 1)',
                            borderWidth: 1
                        }
                    ]
                },
                options: {
                    responsive: true,
                    scales: {
                        y: { beginAtZero: true }
                    }
                }
            });
        } catch (error) {
            console.error('Chart rendering error:', error);
            contentArea.innerHTML = '<div class="alert alert-danger">Error rendering chart.</div>';
        }
    }
});
