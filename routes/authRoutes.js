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



module.exports = router;