const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const ErrorResponse = require('../utils/errorHandler');

const protect = async (req, res, next) => {
  let token;
  
  // Check for token in Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } 
  // Check for token in cookies
  else if (req.cookies?.token) {
    token = req.cookies.token;
  }
  
  if (!token) {
    return next(new ErrorResponse('Not authorized to access this route', 401));
  }
  
  try {
    // Verify token
    const decoded = jwt.verify(token, env.JWT_SECRET);
    
    // Get user from DB
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return next(new ErrorResponse('User not found', 404));
    }
    
    // Check if account is verified (optional feature)
    if (!user.accountVerified) {
      return next(new ErrorResponse('Please verify your account', 401));
    }
    
    // Add user to request object
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new ErrorResponse('Authentication token expired', 401));
    }
    return next(new ErrorResponse('Not authorized to access this route', 401));
  }
};

// Role-based authorization
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new ErrorResponse(`User role ${req.user.role} is not authorized to access this route`, 403));
    }
    next();
  };
};

module.exports = {
  protect,
  authorize
};
