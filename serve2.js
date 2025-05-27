// Required packages
const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const User = require("./Models/lm_user"); // MongoDB User model
const cors  = require('cors')
const app = express();
app.use(cors());

app.use(bodyParser.json());
require('dotenv').config();
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
// Connect to the database
connectDB();

// SMTP Configuration
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  },
  tls: {
    rejectUnauthorized: false // Disables certificate verification (only for testing)
  }
});

// Generate OTP
function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

// Send OTP Email
async function sendOTPEmail(email, otp) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Your OTP Verification Code',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
        <h2>Email Verification</h2>
        <p>Your OTP verification code is:</p>
        <h1 style="text-align: center; letter-spacing: 5px; font-size: 32px; background-color: #f7f7f7; padding: 10px; border-radius: 5px;">${otp}</h1>
        <p>This code will expire in 10 minutes.</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

// Route 1: User Registration
app.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
    }

    // Check if email already exists in the database
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    // Create new user
    const newUser = new User({ name, email, password, isEmailVerified: false });

    // Save the user to the database
    await newUser.save();

    // Generate OTP
    const otp = generateOTP();

    // Update the user with OTP details
    newUser.emailVerificationOTP = otp;
    newUser.otpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes
    await newUser.save();

    // Send OTP email
    const emailSent = await sendOTPEmail(email, otp);

    if (!emailSent) {
      return res.status(500).json({ success: false, message: 'Failed to send OTP email' });
    }

    return res.status(201).json({
      success: true,
      message: 'Registration initiated. Please verify your email with the OTP sent.',
      userId: newUser._id
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Route 2: OTP Verification
app.post('/otp-verify', async (req, res) => {
    try {
      const { userId, otpCode } = req.body;
     
      
  
      // Validate input
      if (!userId || !otpCode) {
        return res.status(400).json({ success: false, message: 'User ID and OTP code are required' });
      }
  
      // Check if user exists in the database
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
  
      // Check if OTP data exists and is expired
      if (!user.emailVerificationOTP || Date.now() > user.otpExpiry) {
        return res.status(400).json({ success: false, message: 'OTP expired. Please register again.' });
      }
  
      // Verify OTP
      if (user.emailVerificationOTP !== otpCode) {
        return res.status(400).json({ success: false, message: 'Invalid OTP code' });
      }
  
      // Update user verification status
      user.isEmailVerified = true;
      user.emailVerificationOTP = null; // Clear OTP after successful verification
      user.otpExpiry = null; // Clear OTP expiry
      await user.save();
  
      return res.status(200).json({
        success: true,
        message: 'Email verified successfully. You can now access your profile.'
      });
    } catch (error) {
      console.error('OTP verification error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });
  

// Route 3: User Profile
app.get('/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if user exists in the database
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Check if user is verified
    if (!user.isEmailVerified) {
      return res.status(403).json({ success: false, message: 'Account not verified. Please verify your email first.' });
    }

    // Return user profile (excluding sensitive data like password)
    return res.status(200).json({
      success: true,
      message: `Hello ${user.name}!`,
      profile: {
        userId: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Profile retrieval error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Resend OTP endpoint
app.post('/resend-otp', async (req, res) => {
  try {
    const { userId } = req.body;

    // Check if user exists in the database
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Generate new OTP
    const newOtp = generateOTP();

    // Update OTP data
    user.emailVerificationOTP = newOtp;
    user.otpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    // Send OTP email
    const emailSent = await sendOTPEmail(user.email, newOtp);

    if (!emailSent) {
      return res.status(500).json({ success: false, message: 'Failed to send OTP email' });
    }

    return res.status(200).json({
      success: true,
      message: 'OTP sent successfully'
    });
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
