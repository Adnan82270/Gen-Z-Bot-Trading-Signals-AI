const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'genz_bot_secret_key_998877',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 1 Day Session
}));

// MongoDB Atlas Database Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://your_atlas_connection_string_here'; // Apni Atlas URI yahan dein
mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('MongoDB Atlas Connected Successfully!'))
.catch(err => console.error('MongoDB Connection Error:', err));

// ==================== DATABASE SCHEMAS ====================

const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    activeDeviceId: { type: String, default: null },
    sessionToken: { type: String, default: null },
    planExpiresAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

const KeySchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    durationDays: { type: Number, required: true },
    isUsed: { type: Boolean, default: false },
    usedBy: { type: String, default: null },
    createdAt: { type: Date, default: Date.now }
});

const Key = mongoose.model('Key', KeySchema);


// ==================== ADMIN & AUTH MIDDLEWARES ====================

function isAdmin(req, res, next) {
    if (req.session && req.session.isAdmin) {
        return next();
    }
    return res.status(403).json({ success: false, message: 'Access Denied: Admin privileges required.' });
}

function isAuthenticated(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }
    return res.redirect('/login.html');
}


// ==================== ADMIN PANEL API ROUTES ====================

// Helper for generating keys
function generateActivationKey(length = 16) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let key = '';
    for (let i = 0; i < length; i++) {
        if (i > 0 && i % 4 === 0) key += '-';
        key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
}

// Admin Login
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'admin12345') {
        req.session.isAdmin = true;
        return res.json({ success: true, message: 'Admin login successful!' });
    }
    return res.json({ success: false, message: 'Invalid Admin Credentials!' });
});

// Generate Key
app.post('/api/admin/generate-key', isAdmin, async (req, res) => {
    try {
        const { durationDays } = req.body;
        const newKey = generateActivationKey();

        const keyDoc = new Key({
            key: newKey,
            durationDays: parseInt(durationDays) || 30
        });

        await keyDoc.save();
        res.json({ success: true, key: newKey, durationDays: keyDoc.durationDays });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Get Admin Data (Keys & Users)
app.get('/api/admin/dashboard-data', isAdmin, async (req, res) => {
    try {
        const keys = await Key.find().sort({ createdAt: -1 });
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json({ success: true, keys, users });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// User Management Actions (Delete / Unlock Device)
app.post('/api/admin/user-action', isAdmin, async (req, res) => {
    try {
        const { userId, action } = req.body;
        if (action === 'delete') {
            await User.findByIdAndDelete(userId);
            return res.json({ success: true, message: 'User deleted successfully.' });
        } else if (action === 'unlock_device') {
            await User.findByIdAndUpdate(userId, { activeDeviceId: null, sessionToken: null });
            return res.json({ success: true, message: 'User device lock reset successfully.' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


// ==================== USER ROUTES ====================

app.get('/dashboard', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});


// Start Server
app.listen(PORT, () => {
    console.log(`Server is running live on port ${PORT}`);
});
