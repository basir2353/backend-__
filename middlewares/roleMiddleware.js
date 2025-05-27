/**
 * Role-based authorization middleware
 * Checks if user has one of the allowed roles
 * @param {Array} roles - Array of allowed roles
 */
const authorize = (roles = []) => {
  return (req, res, next) => {
    // Ensure authentication middleware was run first
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        message: 'User not authenticated' 
      });
    }
    
    // Check if user's role is in the allowed roles
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false,
        message: 'Forbidden: Insufficient permissions' 
      });
    }
    
    next();
  };
};

module.exports = authorize;