const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { createOTPData } = require('../utils/otpUtils');
const { sendOTPEmail } = require('../services/emailService');

/**
 * Register a new user
 * @route POST /api/auth/register
 * @access Public
 */
exports.register = async (req, res) => {
  try {
    const {  
      name,
      email,
      password,
      experience,
      department,
      education,
      role,
      number
    } = req.body;

    // Input validation
  if (!name || !email || !password || !role ) {
  return res.status(400).json({ 
    success: false,
    message: 'Please provide name, email, password, and role' 
  });
}


    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ 
        success: false,
        message: 'User already exists with this email' 
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Generate OTP
    const { otp, otpExpiry } = createOTPData();
    
    // Create a new user with OTP
    const user = new User({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: role,
      number,
      emailVerificationOTP: otp,
      otpExpiry,
      experience,
      department,
      education,
    });
    
    await user.save();
    
    // Send verification email
    const emailSent = await sendOTPEmail(email, otp);
    
    if (!emailSent) {
      console.warn(`Failed to send OTP email to ${email}`);
    }
    
    res.status(201).json({
      success: true,
      message: 'Registration initiated. Please verify your email with the OTP sent.',
      user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      number: user.number,
      experience: user.experience,
      department: user.department,
      education: user.education,
      isEmailVerified: user.isEmailVerified,
      agreementAccepted: user.agreementAccepted
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during registration',
      error: error.message 
    });
  }
};

/**
 * Verify OTP
 * @route POST /api/auth/verify-otp
 * @access Public
 */
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    if (!email || !otp) {
      return res.status(400).json({ 
        success: false,
        message: 'Email and OTP are required' 
      });
    }
    
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    // Check if OTP matches and is not expired
    const now = new Date();
    if (user.emailVerificationOTP !== otp) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid OTP' 
      });
    }
    
    if (now > user.otpExpiry) {
      return res.status(400).json({ 
        success: false,
        message: 'OTP expired' 
      });
    }
    
    // Mark email as verified and clear OTP
    user.isEmailVerified = true;
    user.emailVerificationOTP = null;
    user.otpExpiry = null;
    await user.save();
    
    // Generate token for auto-login
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );  
    
    res.json({
      success: true,
      message: 'Email verified successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during OTP verification',
      error: error.message 
    });
  }
};

/**
 * Resend OTP
 * @route POST /api/auth/resend-otp
 * @access Public
 */
exports.resendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email is required' 
      });
    }
    
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    // Generate new OTP
    const { otp, otpExpiry } = createOTPData();
    
    user.emailVerificationOTP = otp;
    user.otpExpiry = otpExpiry;
    await user.save();
    
    // Send verification email
    const emailSent = await sendOTPEmail(email, otp);
    
    if (!emailSent) {
      return res.status(500).json({ 
        success: false,
        message: 'Failed to send verification email' 
      });
    }
    
    res.json({ 
      success: true,
      message: 'OTP resent successfully' 
    });
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error while resending OTP',
      error: error.message 
    });
  }
};

/**
 * User login
 * @route POST /api/auth/login
 * @access Public
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Email and password are required' 
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid credentials' 
      });
    }

    // Check if email is verified
    if (!user.isEmailVerified) {
      // Generate new OTP and send email
      const { otp, otpExpiry } = createOTPData();
      
      user.emailVerificationOTP = otp;
      user.otpExpiry = otpExpiry;
      await user.save();
      
      await sendOTPEmail(email, otp);
      
      return res.status(403).json({ 
        success: false,
        message: 'Email not verified. A new verification code has been sent.',
        requireVerification: true,
        userId: user._id,
        email: user.email
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid credentials' 
      });
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during login',
      error: error.message 
    });
  }
};

/**
 * Get user profile
 * @route GET /api/auth/profile
 * @access Private
 */
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .select('-password -emailVerificationOTP -otpExpiry');
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error while fetching profile',
      error: error.message 
    });
  }
};

/**
 * Get all users (admin only)
 * @route GET /api/auth/admin/users
 * @access Private/Admin
 */
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select('-password -emailVerificationOTP -otpExpiry');
    
    res.json({
      success: true,
      count: users.length,
      users
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error while fetching users',
      error: error.message 
    });
  }
};

/**
 * Accept terms and conditions
 * @route POST /api/auth/accept-terms
 * @access Private
 */
exports.acceptTerms = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    user.agreementAccepted = true;
    await user.save();
    
    res.json({ 
      success: true,
      message: 'Terms and conditions accepted' 
    });
  } catch (error) {
    console.error('Accept terms error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error while accepting terms',
      error: error.message 
    });
  }
};

/**
 * Calculate age from date of birth
 * @param {Date} dateOfBirth - Date of birth
 * @returns {Number} Age in years
 */
const calculateAge = (dateOfBirth) => {
  const today = new Date();
  let age = today.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = today.getMonth() - dateOfBirth.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) {
    age--;
  }
  
  return age;
};

/**
 * Determine questionnaire based on age
 * @route POST /api/auth/determine-questionnaire
 * @access Private
 */
exports.determineQuestionnaire = async (req, res) => {
  try {
    const { dateOfBirth } = req.body;
    
    if (!dateOfBirth) {
      return res.status(400).json({ 
        success: false,
        message: 'Date of birth is required' 
      });
    }
    
    const dob = new Date(dateOfBirth);
    const age = calculateAge(dob);
    
    let questionnaireId;
    
    if (age < 18) {
      questionnaireId = 'youth-questionnaire';
    } else if (age >= 18 && age < 35) {
      questionnaireId = 'young-adult-questionnaire';
    } else if (age >= 35 && age < 60) {
      questionnaireId = 'middle-age-questionnaire';
    } else {
      questionnaireId = 'senior-questionnaire';
    }
    
    res.json({ 
      success: true,
      questionnaireId 
    });
  } catch (error) {
    console.error('Determine questionnaire error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error while determining questionnaire',
      error: error.message 
    });
  }
};