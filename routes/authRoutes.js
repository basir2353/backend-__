const express = require('express');
const router = express.Router();
const {
  register,
  login,
  verifyOTP,
  resendOTP,
  getProfile,
  getAllUsers,
  acceptTerms,
  determineQuestionnaire
} = require('../controllers/authController');
const jwt = require('jsonwebtoken');

// Middleware to verify JWT for private routes
const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'No token provided, authorization denied'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Attach userId and role to req.user
    next();
  } catch (error) {
    console.error('JWT verification error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
};

// Middleware to restrict admin-only routes
const adminMiddleware = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied, admin only'
    });
  }
  next();
};

// Debug middleware to log incoming requests
router.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - Body:`, req.body);
  next();
});

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/verify-otp', verifyOTP);
router.post('/resend-otp', resendOTP);
router.get('/test', (req, res) => {
  res.status(200).json({ message: 'Test route working' });
});

// Private routes
router.get('/profile', authMiddleware, getProfile);
router.post('/accept-terms', authMiddleware, acceptTerms);
router.post('/determine-questionnaire', authMiddleware, determineQuestionnaire);

// Admin-only route
router.get('/admin/users', authMiddleware, adminMiddleware, getAllUsers);

module.exports = router;