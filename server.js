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
    secret: 'genz_bot_super_secret_key_2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// ==================== DATABASE SCHEMAS (Defined First) ====================
const AdminSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, default: 'admin' },
    password: { type: String, required: true }
});
const Admin = mongoose.model('Admin', AdminSchema);

const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, default: 'N/A' },
    activeDeviceId: { type: String, default: null },
    sessionToken: { type: String, default: null },
    planExpiresAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

const KeySchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    durationDays: { type: Number, required: true },
    targetEmail: { type: String, default: null },
    isUsed: { type: Boolean, default: false },
    usedBy: { type: String, default: null },
    createdAt: { type: Date, default: Date.now }
});
const Key = mongoose.model('Key', KeySchema);


// ==================== MONGODB CONNECTION ====================
const MONGO_URI = process.env.MONGO_URI || 'YOUR_MONGODB_ATLAS_URI';
mongoose.connect(MONGO_URI)
.then(async () => {
    console.log('MongoDB Atlas Connected Successfully!');
    const adminCount = await Admin.countDocuments();
    if (adminCount === 0) {
        const hashedPassword = await bcrypt.hash('admin12345', 10);
        await Admin.create({ username: 'admin', password: hashedPassword });
        console.log('Default Admin Account Created');
    }
})
.catch(err => console.error('MongoDB Connection Error:', err));


// ==================== HELPERS & MIDDLEWARES ====================
function isAdmin(req, res, next) {
    if (req.session && req.session.isAdmin) {
        return next();
    }
    return res.status(403).json({ success: false, message: 'Access Denied: Admin privileges required.' });
}

function generateActivationKey(length = 16) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let key = '';
    for (let i = 0; i < length; i++) {
        if (i > 0 && i % 4 === 0) key += '-';
        key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
}


// ==================== ADMIN API ROUTES ====================
app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const adminDoc = await Admin.findOne({ username });
        if (!adminDoc) {
            return res.json({ success: false, message: 'Invalid Admin Credentials!' });
        }
        const isMatch = await bcrypt.compare(password, adminDoc.password);
        if (isMatch) {
            req.session.isAdmin = true;
            return res.json({ success: true, message: 'Admin authenticated successfully!' });
        }
        return res.json({ success: false, message: 'Invalid Admin Credentials!' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/admin/change-password', isAdmin, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const adminDoc = await Admin.findOne();
        
        const isMatch = await bcrypt.compare(currentPassword, adminDoc.password);
        if (!isMatch) {
            return res.json({ success: false, message: 'Current password is incorrect!' });
        }

        const hashedNewPassword = await bcrypt.hash(newPassword, 10);
        adminDoc.password = hashedNewPassword;
        await adminDoc.save();

        res.json({ success: true, message: 'Admin password updated successfully!' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/admin/generate-key', isAdmin, async (req, res) => {
    try {
        const { durationDays, targetEmail } = req.body;
        const newKey = generateActivationKey();

        const keyDoc = new Key({
            key: newKey,
            durationDays: parseInt(durationDays) || 30,
            targetEmail: targetEmail ? targetEmail.trim().toLowerCase() : null
        });

        await keyDoc.save();
        res.json({ success: true, key: newKey, durationDays: keyDoc.durationDays, targetEmail: keyDoc.targetEmail });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/admin/dashboard-data', isAdmin, async (req, res) => {
    try {
        const keys = await Key.find().sort({ createdAt: -1 });
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json({ success: true, keys, users });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/admin/user-action', isAdmin, async (req, res) => {
    try {
        const { userId, action } = req.body;
        if (action === 'delete') {
            await User.findByIdAndDelete(userId);
            return res.json({ success: true, message: 'User account removed.' });
        } else if (action === 'unlock_device') {
            await User.findByIdAndUpdate(userId, { activeDeviceId: null, sessionToken: null });
            return res.json({ success: true, message: 'Device lock reset successfully.' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


// ==================== USER ACTIVATION & LOGIN API ====================
app.post('/api/activate', async (req, res) => {
    try {
        const { key, email, deviceId } = req.body;

        if (!key || !email) {
            return res.json({ success: false, message: 'Please provide both Key and Email!' });
        }

        const cleanKey = key.trim();
        const cleanEmail = email.trim().toLowerCase();

        // 1. Check if Key exists
        const keyDoc = await Key.findOne({ key: cleanKey });
        if (!keyDoc) {
            return res.json({ success: false, message: 'Invalid Activation Key!' });
        }

        // 2. Check if Key is already used
        if (keyDoc.isUsed) {
            return res.json({ success: false, message: 'This Key has already been used!' });
        }

        // 3. Check target email binding
        if (keyDoc.targetEmail && keyDoc.targetEmail !== cleanEmail) {
            return res.json({ success: false, message: 'This Key is assigned to a different email address!' });
        }

        // 4. Calculate expiration
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + keyDoc.durationDays);

        // 5. Register or update user
        let user = await User.findOne({ email: cleanEmail });
        if (!user) {
            user = new User({
                email: cleanEmail,
                password: 'N/A',
                activeDeviceId: deviceId || 'device_' + Math.random(),
                planExpiresAt: expiresAt
            });
        } else {
            user.planExpiresAt = expiresAt;
            if (!user.activeDeviceId) {
                user.activeDeviceId = deviceId || 'device_' + Math.random();
            }
        }
        await user.save();

        // 6. Mark key as used
        keyDoc.isUsed = true;
        keyDoc.usedBy = cleanEmail;
        await keyDoc.save();

        res.json({ success: true, message: 'AI Activated Successfully!', redirectUrl: '/dashboard.html' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


// ==================== STATIC ROUTES ====================
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => console.log(`Server live on port ${PORT}`));
