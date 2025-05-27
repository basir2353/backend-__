const User = require('../models/User');
const ErrorResponse = require('../utils/errorHandler');
const logger = require('../utils/logger');

/**
 * Register a new user
 * @param {Object} userData - User data for registration
 * @returns {Object} - Registered user object
 */
const registerUser = async (userData) => {
  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email: userData.email });
    
    if (existingUser) {
      throw new ErrorResponse('Email already in use', 400);
    }
    
    // Create user
    const user = await User.create({
      firstName: userData.firstName,
      lastName: userData.lastName,
      email: userData.email,
      password: userData.password
    });
    
    logger.info(`New user registered: ${user.email}`);
    
    // Don't return password in response
    user.password = undefined;
    
    return user;
  } catch (error) {
    logger.error(`Registration error: ${error.message}`);
    throw error;
  }
};

/**
 * Authenticate user and get token
 * @param {String} email - User email
 * @param {String} password - User password
 * @returns {Object} - User data and token
 */
const loginUser = async (email, password) => {
  try {
    // Find user
    const user = await User.findOne({ email }).select('+password');
    
    if (!user) {
      throw new ErrorResponse('Invalid credentials', 401);
    }
    
    // Check if account is locked
    if (user.isAccountLocked()) {
      const lockTime = new Date(user.lockUntil).toLocaleString();
      throw new ErrorResponse(`Account is locked until ${lockTime}`, 401);
    }
    
    // Check if password matches
    const isMatch = await user.matchPassword(password);
    
    if (!isMatch) {
      await user.incrementLoginAttempts();
      throw new ErrorResponse('Invalid credentials', 401);
    }
    
    // Reset failed login attempts on successful login
    if (user.failedLoginAttempts > 0) {
      user.failedLoginAttempts = 0;
      user.accountLocked = false;
      user.lockUntil = null;
      await user.save();
    }
    
    // Update last login time
    user.lastLogin = Date.now();
    await user.save();
    
    // Generate token
    const token = user.getSignedJwtToken();
    
    logger.info(`User logged in: ${user.email}`);
    
    // Don't return password in response
    user.password = undefined;
    
    return { user, token };
  } catch (error) {
    logger.error(`Login error: ${error.message}`);
    throw error;
  }
};

module.exports = {
  registerUser,
  loginUser
};