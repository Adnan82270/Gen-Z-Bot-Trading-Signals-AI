const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // فرنٹ اینڈ فائلز کے لیے پبلک فولڈر

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected Successfully'))
  .catch(err => console.log('MongoDB Connection Error:', err));

// License Schema & Model (Mapped explicitly to 'licenses' collection)
const licenseSchema = new mongoose.Schema({
  key: String,
  status: String,
  deviceId: String,
  expiresAt: Date
}, { collection: 'licenses' });

const License = mongoose.model('License', licenseSchema);

// Verify Key API Endpoint
app.post('/api/verify-key', async (req, res) => {
  try {
    const { key, deviceId } = req.body;
    
    if (!key) {
      return res.json({ success: false, message: 'Please enter a license key!' });
    }

    const cleanKey = key.trim();
    console.log('Searching for key:', cleanKey);

    const license = await License.findOne({ key: cleanKey });

    if (!license) {
      console.log('Key not found in database!');
      return res.json({ success: false, message: 'Invalid license key!' });
    }

    console.log('Found license:', license);

    if (license.status === 'expired' || (license.expiresAt && new Date() > new Date(license.expiresAt))) {
      return res.json({ success: false, message: 'License key has expired!' });
    }

    if (license.deviceId && deviceId && license.deviceId !== deviceId) {
      return res.json({ success: false, message: 'Key already locked to another device!' });
    }

    if (!license.deviceId && deviceId) {
      license.deviceId = deviceId;
      license.status = 'active';
      await license.save();
    }

    res.json({ success: true, expiresAt: license.expiresAt });
  } catch (err) {
    console.error('Verify Error:', err);
    res.status(500).json({ success: false, message: 'Server error!' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
