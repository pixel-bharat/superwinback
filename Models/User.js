const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  _id: { type: String, default: () => new mongoose.Types.ObjectId().toHexString() }, // If you want to keep using default ObjectId generated as strings
  email: { type: String, unique: true, required: true, lowercase: true },
  password: { type: String, required: true },
  verificationOTPToken: { type: String },
  isVerified: { type: Boolean, default: false },
  uniqueId: { type: String, default: uuidv4 }, // Ensures each user gets a unique UUID
  name: String,
  avatar: String,
  walletBalance: { type: Number, default: 0 },
});

const User = mongoose.model('User', userSchema);
module.exports = User;
