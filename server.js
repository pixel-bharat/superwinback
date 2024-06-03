const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const otpGenerator = require('otp-generator');
const twilio = require('twilio');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const validator = require('validator');
require('dotenv').config();
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(bodyParser.json());
app.use(cors());

// MongoDB connection
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

// Debug logs to check Twilio credentials (Remove these in production)
console.log("Twilio Account SID:", accountSid);
console.log("Twilio Auth Token:", authToken);

const client = twilio(accountSid, authToken);

// Define User schema and model
const userSchema = new mongoose.Schema({
  phoneNumber: { type: String, required: true, unique: true },
  name: String,
  avatar: String,
  isNameSet: { type: Boolean, default: false },
  isAvatarSet: { type: Boolean, default: false },
  uniqueId: String,
  walletBalance: { type: Number, default: 0 },
});
const User = mongoose.model('User', userSchema);

const generateUniqueId = () => {
  return 'uuidv4' + Math.floor(Math.random() * 100000);
};

const userSessions = {}; // Global or appropriate scoped session storage

app.post('/send-otp', async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) {
    return res.status(400).send('Phone number is required');
  }

  const cleanedPhoneNumber = phoneNumber.replace(/\D/g, '');
  const otp = otpGenerator.generate(4, {
    digits: true,
    upperCase: false,
    specialChars: false,
    alphabets: false,
    lowerCaseAlphabets: false,
  });

  try {
    let user = await User.findOne({ phoneNumber: cleanedPhoneNumber });

    if (!user) {
      console.log(`New User Register with Phone number ${cleanedPhoneNumber}`);
      user = new User({ phoneNumber: cleanedPhoneNumber });
      const uid = generateUniqueId();
      user.uniqueId = uid;
      console.log(`Generated UID for ${cleanedPhoneNumber}: ${uid}`);
    } else {
      console.log(`User found. Phone number: ${user.phoneNumber}, UID: ${user.uniqueId}`);
    }

    // Store OTP, phone number, and unique ID in local session using cleanedPhoneNumber as the key
    userSessions[cleanedPhoneNumber] = {
      otp,
      phoneNumber: cleanedPhoneNumber,
      uid: user.uniqueId,
    };
    console.log(`Stored session data for ${cleanedPhoneNumber}: `, userSessions[cleanedPhoneNumber]);

    await client.messages.create({
      body: `Your OTP code is ${otp}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: `+${cleanedPhoneNumber}`,
    });

    console.log(`OTP sent to ${phoneNumber}: ${otp}`);
    res.status(200).send('OTP sent successfully');
  } catch (error) {
    console.error(`Error sending OTP to ${phoneNumber}: `, error);
    res.status(500).send('Error sending OTP');
  }
});

app.post('/verify-otp', async (req, res) => {
  const { phoneNumber, otp } = req.body;
  if (!phoneNumber || !otp) {
    return res.status(400).send('Phone number and OTP are required');
  }

  const cleanedPhoneNumber = phoneNumber.replace(/\D/g, '');
  console.log(`Verifying OTP for phone number: ${cleanedPhoneNumber}, OTP: ${otp}`);

  try {
    const sessionData = userSessions[cleanedPhoneNumber];
    console.log(`Session data for ${cleanedPhoneNumber}: `, sessionData);

    if (!sessionData) {
      console.log(`No session data found for phone number: ${cleanedPhoneNumber}`);
      return res.status(400).send('Invalid phone number or OTP');
    }

    if (sessionData.otp !== otp) {
      console.log(`Invalid OTP for phone number: ${cleanedPhoneNumber}. Expected: ${sessionData.otp}, Received: ${otp}`);
      return res.status(400).send('Invalid OTP');
    }

    let user = await User.findOne({ phoneNumber: cleanedPhoneNumber });

    if (!user) {
      user = new User({
        phoneNumber: cleanedPhoneNumber,
        uniqueId: sessionData.uid,
      });
      await user.save();
      console.log(`New user registered. Phone number: ${cleanedPhoneNumber}, UID: ${sessionData.uid}`);
    } else {
      console.log(`Existing user verified. Phone number: ${user.phoneNumber}, UID: ${user.uniqueId}`);
    }

    // OTP verification successful, cleanup session data
    delete userSessions[cleanedPhoneNumber];

    // Check if profile setup is required
    const profileSetupRequired = !(user.isNameSet && user.isAvatarSet);

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.uniqueId,
        phoneNumber: user.phoneNumber,
        name: user.name,
        avatar: user.avatar,
        walletBalance: user.walletBalance,
        profileSetupRequired,
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    console.log(`OTP verified successfully for phone number: ${cleanedPhoneNumber}`);
    res.status(200).send({
      message: 'OTP verified successfully',
      uid: user.uniqueId,
      token,
      profileSetupRequired,
      name: user.name,
      phoneNumber: user.phoneNumber,
      walletBalance: user.walletBalance,
    });
  } catch (error) {
    console.error(`Error verifying OTP for phone number: ${cleanedPhoneNumber}: `, error);
    res.status(500).send('Error verifying OTP');
  }
});

// POST endpoint to update user profile avatar and name
function validateAvatar(avatar) {
  const allowedAvatars = [
    'avatar_1',
    'avatar_2',
    'avatar_3',
    'avatar_4',
    'avatar_5',
    'upload_avatar',
  ];

  if (
    validator.isURL(avatar, {
      protocols: ['http', 'https'],
      require_protocol: true,
    })
  ) {
    return true;
  }

  if (allowedAvatars.includes(avatar)) {
    return true;
  }

  throw new Error('Invalid avatar provided. Must be a valid URL or a recognized filename.');
}

app.post('/avatar', async (req, res) => {
  const { uid, memberName, avatar, phoneNumber } = req.body;

  if (!uid || !phoneNumber) {
    return res.status(400).json({ message: 'User ID and phone number are required' });
  }

  try {
    const user = await User.findOne({ uniqueId: uid });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (memberName && memberName.trim()) {
      user.name = memberName.trim();
      user.isNameSet = true;
    }

    if (avatar) {
      if (!validateAvatar(avatar)) {
        return res.status(400).json({ message: 'Invalid avatar reference' });
      }
      user.avatar = avatar;
      user.isAvatarSet = true;
    }

    const profileSetupRequired = !(user.isNameSet && user.isAvatarSet);

    const token = jwt.sign(
      {
        userId: user.uniqueId,
        phoneNumber: user.phoneNumber,
        name: user.name,
        avatar: user.avatar,
        profileSetupRequired,
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    await user.save();

    res.status(200).json({
      message: 'Profile update successful',
      profile: {
        phoneNumber: user.phoneNumber,
        name: user.name,
        avatar: user.avatar,
        uid: user.uniqueId,
        profileSetupRequired,
      },
      token,
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});





//
//
//Token Verification Middleware  here
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    console.log("No token provided");
    return res
      .status(401)
      .json({ message: "Access denied. No token provided." });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    console.log("Token verified:", decoded);
    next();
  } catch (error) {
    console.error("Invalid token:", error);
    res.status(400).json({ message: "Invalid token." });
  }
};

const Schema = mongoose.Schema;

const transactionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User" },
  uniqueId: { type: String, required: true }, // Assuming uniqueId is a string identifier for users
  amount: { type: Number, required: true },
  transactionDate: { type: Date, default: Date.now },
  transactionType: { type: String, enum: ["credit", "debit"], required: true },
  description: { type: String },
});

const Transaction = mongoose.model("Transaction", transactionSchema);

//
//// Middleware to verify token

app.post('/api/add_money', authenticateToken, async (req, res) => {
  const { amount } = req.body;
  const numericAmount = parseFloat(amount);
  console.log('Add money request for amount:', numericAmount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    console.log('Invalid amount:', numericAmount);
    return res.status(400).json({ message: 'Invalid amount' });
  }
  try {
    const user = await User.findOne({ uniqueId: req.user.userId });
    if (!user) {
      console.log('User not found with uniqueId:', req.user.userId);
      return res.status(404).json({ message: 'User not found' });
    }
    user.walletBalance += numericAmount;
    await user.save();
    console.log('Wallet balance updated for user:', req.user.userId);

    const transaction = new Transaction({
      uniqueId: user.uniqueId,
      userId: user._id,
      amount: numericAmount,
      transactionType: 'credit',
      description: 'Add money to wallet',
    });
    await transaction.save();
    console.log('Transaction saved for user:', req.user.userId);

    res.json({
      message: 'Money added successfully',
      walletBalance: user.walletBalance,
    });
  } catch (error) {
    console.error('Error adding money:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


//
//
//Spend money API here
app.post('/api/spend', authenticateToken, async (req, res) => {
  const { amount } = req.body;
  console.log('Spend money request:', amount);
  try {
    const user = await User.findOne({ uniqueId: req.user.userId });
    if (!user) {
      console.log('User not found with uniqueId:', req.user.userId);
      return res.status(404).json({ message: 'User not found' });
    }
    if (user.walletBalance < amount) {
      console.log('Insufficient balance for user:', req.user.userId);
      return res.status(400).json({ message: 'Insufficient balance' });
    }
    user.walletBalance -= amount;
    await user.save();
    console.log('Balance updated after spending for user:', req.user.userId);

    const transaction = new Transaction({
      uniqueId: user.uniqueId,
      userId: user._id,
      amount,
      transactionType: 'debit',
      description: 'Spent from wallet',
    });
    await transaction.save();
    console.log('Debit transaction recorded for user:', req.user.userId);

    res.json({
      message: 'Amount spent successfully',
      newBalance: user.walletBalance,
    });
  } catch (error) {
    console.error('Spend money error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


//
//
//Transaction History Endpoint

app.get('/api/transactions', authenticateToken, async (req, res) => {
  try {
    console.log('Fetching transactions for user:', req.user.userId);
    const transactions = await Transaction.find({
      uniqueId: req.user.userId,
    }).sort({ transactionDate: -1 });
    console.log('Transactions retrieved:', transactions.length);
    res.json(transactions);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// User Data Endpoint
app.get("/api/userdata", authenticateToken, async (req, res) => {
  try {
    console.log("Fetching data for user:", req.user.userId);
    const user = await User.findOne({ uniqueId: req.user.userId }).select(
      "-password"
    ); // Exclude password from the response
    if (!user) {
      console.log("User not found:", req.user.userId);
      return res.status(404).json({ message: "User not found" });
    }
    console.log("User data retrieved:", user.phoneNumber);
    res.json({
      phone: user.phoneNumber,
      name: user.name,
      avatar: user.avatar,
      uid: user.uniqueId, // Ensure consistency in naming, might be 'uid' or 'uniqueId'
      walletBalance: user.walletBalance,
    });
  } catch (error) {
    console.error("Failed to retrieve user data:", error);
    res.status(500).json({ message: "Server error" });
  }
});
// User Data Endpoint








app.listen(process.env.PORT, () => {
  console.log(`Server is running on port ${process.env.PORT}`);
});
