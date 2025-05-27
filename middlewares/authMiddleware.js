const jwt = require('jsonwebtoken');

/**
 * Authentication middleware
 * Verifies JWT token and attaches user data to request
 */
const auth = (req, res, next) => {
  // Get token from header
  const token = req.header('x-auth-token');
  
  // Check if no token
  if (!token) {
    return res.status(401).json({ 
      success: false,
      message: 'No token, authorization denied' 
    });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Add user data to request
    req.user = decoded;
    next();
  } catch (err) {
    console.error('Token verification failed:', err.message);
    res.status(401).json({ 
      success: false,
      message: 'Token is not valid' 
    });
  }
};

module.exports = auth;