const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  console.log('🔐 [Auth Middleware] Checking headers:', req.headers);

  let token = req.header('x-auth-token');
  console.log('🧾 x-auth-token:', token);

  // Fallback to Authorization header
  if (!token) {
    const authHeader = req.header('Authorization');
    console.log('🧾 Authorization header:', authHeader);
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7); // Remove "Bearer "
      console.log('🔓 Extracted token from Authorization:', token);
    }
  }

  if (!token) {
    console.warn('❌ No token provided');
    return res.status(401).json({
      message: 'Access denied. No token provided in x-auth-token or Authorization headers'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('✅ Token verified. Decoded payload:', decoded);

    req.user = {
      userId: decoded.id || decoded._id || decoded.userId,
      role: decoded.role || 'user'
    };

    console.log('🙋 User attached to req:', req.user);
    next();
  } catch (err) {
    console.error('❌ Invalid or expired token:', err.message);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};
