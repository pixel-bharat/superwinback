const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const dotenv = require("dotenv");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const randomstring = require("randomstring");
const { v4: uuidv4 } = require("uuid"); // Corrected import
const validator = require("validator");
const axios = require("axios");

dotenv.config();

const app = express();
app.use(express.json());
const cors = require("cors");
app.use(cors());

mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Setup Nodemailer transporter
const transporter = nodemailer.createTransport({
  host: "smtp.ethereal.email",
  port: 587,
  auth: {
    user: "korbin28@ethereal.email",
    pass: "H87UBGc5ByMVpHMujT",
  },
});

const userSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true, lowercase: true },
  password: { type: String, required: true },
  verificationOTPToken: { type: String },
  isVerified: { type: Boolean, default: false },
  uniqueId: { type: String, default: uuidv4 },
  name: String,
  avatar: String,
  walletBalance: { type: Number, default: 0 },
});

const User = mongoose.model("User", userSchema);

const generateUniqueId = () => {
  return "uuidv4" + Math.floor(Math.random() * 100000);
};
// Generate a random username
const generateRandomUsername = () => {
  return "SWID" + Math.floor(Math.random() * 10000);
};
// Temporarily store user session data
let userSessions = {};
app.post("/api/signup", async (req, res) => {
  const { email, password } = req.body;
  console.log("Received registration request for:", email);
  try {
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      console.log("Registration failed: User already exists with email", email);
      return res.status(409).json({ message: "Email already registered" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationOTPToken = randomstring.generate({
      length: 4,
      charset: "numeric",
    });
    const uid = generateUniqueId();
    const username = generateRandomUsername();

    console.log(`OTP generated for ${email}: ${verificationOTPToken}`);
    console.log(
      `Unique ID (${uid}) and username (${username}) assigned to ${email}`
    );

    const normalizedEmail = email.trim().toLowerCase();

    userSessions[normalizedEmail] = {
      uid,
      username,
      email: normalizedEmail,
      password: hashedPassword,
      verificationOTPToken,
      isVerified: false,
    };

    const mailOptions = {
      from: process.env.MAIL_USER,
      to: email,
      subject: "Verify Your Email",
      text: `Please use the following OTP to verify your email: ${verificationOTPToken}`,
    };
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Failed to send OTP email to", email, ":", error);
        return res.status(500).json({ message: "Failed to send OTP email" });
      }
      console.log("OTP email successfully sent to", email);
      res.status(200).json({
        message:
          "OTP sent to your email. Please verify to complete registration.",
        uid: uid,
      });
    });
  } catch (error) {
    console.error("Signup error for", email, ":", error);
    res.status(500).json({ message: "Failed to process your request" });
  }
});

//
// verify OTP API Here
//
app.post("/api/verifyOTP", async (req, res) => {
  const { email, otp, uid } = req.body;
  if (!email || !otp || !uid) {
    return res.status(400).json({ message: "Missing email, OTP, or UID." });
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (
    !userSessions[normalizedEmail] ||
    userSessions[normalizedEmail].uid !== uid
  ) {
    return res
      .status(400)
      .json({ message: "No session found for " + email + " or UID mismatch." });
  }

  if (userSessions[normalizedEmail].verificationOTPToken !== otp) {
    console.log(
      `Verification failed for ${normalizedEmail}: Incorrect OTP provided`
    );
    return res
      .status(400)
      .json({ message: "Invalid OTP. Verification failed." });
  }

  console.log(
    `OTP verified for ${normalizedEmail} with UID ${uid}: Proceeding to save user data`
  );

  const newUser = new User({
    email: normalizedEmail,
    password: userSessions[normalizedEmail].password,
    isVerified: true,
    uniqueId: uid,
    name: null,
    avatar: null,
  });

  try {
    await newUser.save();
    console.log("User successfully saved:", newUser);
    delete userSessions[normalizedEmail];
    res
      .status(201)
      .json({ message: "User verified and registered successfully." });
  } catch (error) {
    console.error("Error saving user", normalizedEmail, ":", error);
    res.status(500).json({ message: "Failed to save user." });
  }
});

//
// Resend OTP API Here
//
app.post("/api/resendOTP", async (req, res) => {
  const { email } = req.body;

  if (!userSessions[email]) {
    console.log("Resend OTP failed: No session found for", email);
    return res.status(400).json({
      message:
        "No ongoing registration found or session expired. Start registration again.",
    });
  }
  // Generate a new OTP and update the session
  const newOTPToken = randomstring.generate({ length: 4, charset: "numeric" });
  userSessions[email].verificationOTPToken = newOTPToken;
  console.log(`New OTP generated for ${email}: ${newOTPToken}`);
  // Send the new OTP via email
  const mailOptions = {
    from: process.env.MAIL_USER,
    to: email,
    subject: "Your new OTP",
    text: `Here is your new OTP: ${newOTPToken}`,
  };
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Failed to resend OTP email to", email, ":", error);
      return res.status(500).json({ message: "Failed to resend OTP email" });
    }
    console.log("OTP email successfully resent to", email);
    return res
      .status(200)
      .json({ message: "OTP resent successfully. Please check your email." });
  });
});


//
// Login API Here
//
// Login Endpoint

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  console.log("Attempting to login user:", email);
  try {
    const normalizedEmail = email.trim().toLowerCase();
    console.log("Normalized email:", normalizedEmail);
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      console.log("No user found with email:", normalizedEmail);
      return res.status(401).json({ message: "Email is not registered" });
    }
    if (!user.isVerified) {
      console.log("User not verified:", normalizedEmail);
      return res
        .status(401)
        .json({
          message: "Please verify your account.",
          redirectUrl: "/verify-account",
        });
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      console.log("Invalid password for user:", normalizedEmail);
      return res.status(401).json({ message: "Invalid email or password" });
    }
// Check if member name is set to determine if profile setup is required
const profileSetupRequired = !user.memberName; // true if memberName is not set
    console.log("User authenticated, generating token:", normalizedEmail);
    const token = jwt.sign(
      {
        userId: user.uniqueId,
        email: user.email,
        avatar: user.avatar,
        name: user.name,
        walletBalance: user.walletBalance,
      },
      process.env.JWT_SECRET
    ); 
    res.status(200).json({
      message: "Login successful",
      token,
      user: {
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        uid: user.uniqueId,
        name: user.name,
        profileSetupRequired
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error" });
  }
});














// POST endpoint to update user profile avatar and name

// Validation function to clean up main logic
function validateAvatar(avatar) {
  const allowedAvatars = [
    "avatar_1",
    "avatar_2",
    "avatar_3",
    "avatar_4",
    "avatar_5",
    "upload_avatar",
  ];

  // Check if the avatar is a valid URL
  if (
    validator.isURL(avatar, {
      protocols: ["http", "https"],
      require_protocol: true,
    })
  ) {
    return true; // The avatar is a valid URL
  }

  // If not a URL, check if it's a known avatar filename
  if (allowedAvatars.includes(avatar)) {
    return true; // The avatar is a recognized local filename
  }

  throw new Error(
    "Invalid avatar provided. Must be a valid URL or a recognized filename."
  );
}

app.post("/api/avatar", async (req, res) => {
  const { uid, memberName, avatar, email } = req.body;

  if (!uid || !email) {
    return res.status(400).json({ message: "User ID and email are required" });
  }

  try {
    const user = await User.findOne({ uniqueId: uid });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update the name if provided
    if (memberName && memberName.trim()) {
      user.name = memberName.trim();
    }

    // Validate and optionally update the avatar
    if (avatar) {
      if (!validateAvatar(avatar)) {
        return res.status(400).json({ message: "Invalid avatar reference" });
      }
      user.avatar = avatar;
    }

    // Determine if the profile setup is required
    const profileSetupRequired = !(user.name && user.avatar);

    // Generate JWT token before saving user to avoid async timing issues
    const token = jwt.sign({
      userId: user.uniqueId,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      profileSetupRequired,
    }, process.env.JWT_SECRET, { expiresIn: "1h" }); // Token expiration is optional

    // Save updated user information
    await user.save();

    // Send a single response with all necessary information
    res.status(200).json({
      message: "Profile update successful",
      profile: {
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        uid: user.uniqueId,
        profileSetupRequired
      },
      token
    });

  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});


//
//
//Logout API here

const tokenBlacklistSchema = new mongoose.Schema({
  token: String,
  expiresAt: Date,
});

const TokenBlacklist = mongoose.model("TokenBlacklist", tokenBlacklistSchema);

app.post("/api/logout", async (req, res) => {
  try {
    const { token } = req.body; // Assuming the token is sent back on logout
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const blacklistedToken = new TokenBlacklist({
      token: token,
      expiresAt: new Date(decoded.exp * 1000),
    });

    await blacklistedToken.save();
    res.status(200).send("Logout successful and token blacklisted.");
  } catch (error) {
    res.status(500).json({ message: "Failed to logout" });
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

app.post("/api/add_money", authenticateToken, async (req, res) => {
  const { amount } = req.body;
  const numericAmount = parseFloat(amount);
  console.log("Add money request for amount:", numericAmount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    console.log("Invalid amount:", numericAmount);
    return res.status(400).json({ message: "Invalid amount" });
  }
  try {
    const user = await User.findOne({ uniqueId: req.user.userId });
    if (!user) {
      console.log("User not found with uniqueId:", req.user.userId);
      return res.status(404).json({ message: "User not found" });
    }
    user.walletBalance += numericAmount;
    await user.save();
    console.log("Wallet balance updated for user:", req.user.userId);

    const transaction = new Transaction({
      uniqueId: user.uniqueId, // Assuming transactions use `uniqueId`
      amount: numericAmount,
      transactionType: "Credit",
      description: "Add money to wallet",
    });
    await transaction.save();
    console.log("Transaction saved for user:", req.user.userId);

    res.json({
      message: "Money added successfully",
      walletBalance: user.walletBalance,
    });
  } catch (error) {
    console.error("Error adding money:", error);
    res.status(500).json({ message: "Server error" });
  }
});

//
//
//Spend money API here
app.post("/api/spend", authenticateToken, async (req, res) => {
  const { amount } = req.body;
  console.log("Spend money request:", amount);
  try {
    const user = await User.findOne({ uniqueId: req.user.userId });
    if (!user) {
      console.log("User not found with uniqueId:", req.user.userId);
      return res.status(404).json({ message: "User not found" });
    }
    if (user.walletBalance < amount) {
      console.log("Insufficient balance for user:", req.user.userId);
      return res.status(400).json({ message: "Insufficient balance" });
    }
    user.walletBalance -= amount;
    await user.save();
    console.log("Balance updated after spending for user:", req.user.userId);

    const transaction = new Transaction({
      uniqueId: user.uniqueId,
      amount,
      transactionType: "Debit",
      description: "Spent from wallet",
    });
    await transaction.save();
    console.log("Debit transaction recorded for user:", req.user.userId);

    res.json({
      message: "Amount spent successfully",
      newBalance: user.walletBalance,
    });
  } catch (error) {
    console.error("Spend money error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

//
//
//Transaction History Endpoint

app.get("/api/transactions", authenticateToken, async (req, res) => {
  try {
    console.log("Fetching transactions for user:", req.user.userId);
    const transactions = await Transaction.find({
      uniqueId: req.user.userId,
    }).sort({ transactionDate: -1 });
    console.log("Transactions retrieved:", transactions.length);
    res.json(transactions);
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({ message: "Server error" });
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
    console.log("User data retrieved:", user.email);
    res.json({
      email: user.email,
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






//
//
// forgot-password Start from here

// Generate a 4-digit OTP
function generateOTP() {
  return Math.floor(1000 + Math.random() * 9000);
}

// Store OTPs for verification
const otpStore = {};

// Define the POST endpoint for forgot password
app.post("/api/forgot-password", async (req, res) => {
  const { email } = req.body;
  console.log("Request received for forgot password:", email);
  try {
    const user = await User.findOne({ email });
    if (!user) {
      console.log("No user found with email:", email);
      return res.status(404).json({ message: "Email not found" });
    }

    // Generate and store OTP
    const otp = generateOTP();
    otpStore[email] = otp;

    // Log OTP for testing (remove this line in production)
    console.log("Generated OTP:", otp);
    // Send OTP to the user's email
    sendOTPByEmail(email, otp);

    console.log("OTP sent to:", email);
    res.status(200).json({ message: "OTP sent to your email" });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Define the POST endpoint for verifying OTP and resetting password
app.post("/api/reset-password", async (req, res) => {
  const { email, otp, newPassword } = req.body;
  console.log("Request received for password reset:", email);
  try {
    // Verify OTP
    const storedOTP = otpStore[email];
    if (!storedOTP || storedOTP !== otp) {
      console.log("Invalid OTP for email:", email);
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // Update password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const user = await User.findOneAndUpdate(
      { email },
      { password: hashedPassword },
      { new: true }
    );

    console.log("Password reset for:", email);
    res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Function to send OTP by email
function sendOTPByEmail(email, otp) {
  // Email options
  const mailOptions = {
    from: 'your-email@gmail.com',
    to: email,
    subject: 'OTP for Password Reset',
    text: `Your OTP for password reset is: ${otp}`
  };

  // Send email
  transporter.sendMail(mailOptions, function(error, info) {
    if (error) {
      console.error("Email sending error:", error);
    } else {
      console.log("OTP Email sent:", info.response);
    }
  });
}





const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
