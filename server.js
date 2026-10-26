// ==================== ADMIN SYSTEM & KEY GENERATOR ====================

// Key Generator Helper Function
function generateActivationKey(length = 16) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let key = '';
    for (let i = 0; i < length; i++) {
        if (i > 0 && i % 4 === 0) key += '-';
        key += chars.charAt(floor(Math.random() * chars.length));
    }
    return key; // Format: XXXX-XXXX-XXXX-XXXX
}

// Admin Schema / Key Schema in MongoDB (or add to your existing schemas)
const KeySchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    durationDays: { type: Number, required: true }, // e.g. 1, 7, 30, 365
    isUsed: { type: Boolean, default: false },
    usedBy: { type: String, default: null }, // User Email
    createdAt: { type: Date, default: Date.now }
});

const Key = mongoose.model('Key', KeySchema);

// Admin Middleware Check
function isAdmin(req, res, next) {
    // Basic Admin Protection (session or admin secret header)
    if (req.session && req.session.isAdmin) {
        return next();
    }
    return res.status(403).json({ success: false, message: 'Access Denied: Admin privileges required.' });
}

// 1. Admin Login API Route
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    // Set your secure Admin credentials
    if (username === 'admin' && password === 'admin12345') {
        req.session.isAdmin = true;
        return res.json({ success: true, message: 'Admin authenticated successfully!' });
    }
    return res.json({ success: false, message: 'Invalid Admin Credentials!' });
});

// 2. Generate New License / Activation Key
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
        res.status(500).json({ success: false, message: 'Error generating key: ' + err.message });
    }
});

// 3. Get All Keys & All Registered Users
app.get('/api/admin/dashboard-data', isAdmin, async (req, res) => {
    try {
        const keys = await Key.find().sort({ createdAt: -1 });
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json({ success: true, keys, users });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 4. Revoke / Delete User or Reset Session Lock
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
