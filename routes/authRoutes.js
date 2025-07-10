
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

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/verify-otp', verifyOTP);
router.post('/resend-otp', resendOTP);
router.get('/test', (req, res) => {
  res.status(200).json({ message: 'Test route working' });
});

// Added to handle GET /api/auth/login and avoid 404
router.get('/login', (req, res) => {
  res.status(200).json({ 
    message: 'GET login endpoint - Not authenticated. Please use POST /api/auth/login to authenticate.' 
  });
});

// Debug log for registered routes
console.log('Auth routes registered:', router.stack.map(r => `${r.route.stack[0].method.toUpperCase()} ${r.route.path}`));

module.exports = router;
