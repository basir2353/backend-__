
const { body, validationResult } = require('express-validator');

// Validation result middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

// Registration validation rules
const registerValidation = [
  body('firstName')
    .notEmpty().withMessage('First name is required')
    .isLength({ max: 50 }).withMessage('First name cannot be more than 50 characters')
    .trim(),
  
  body('lastName')
    .notEmpty().withMessage('Last name is required')
    .isLength({ max: 50 }).withMessage('Last name cannot be more than 50 characters')
    .trim(),
  
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail(),
  
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*])/).withMessage('Password must contain at least one number, one uppercase letter, one lowercase letter, and one special character'),
  
  body('confirmPassword')
    .notEmpty().withMessage('Confirm password is required')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match');
      }
      return true;
    }),
    
  validate
];

// Login validation rules
const loginValidation = [
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail(),
  
  body('password')
    .notEmpty().withMessage('Password is required'),
    
  validate
];

module.exports = {
  registerValidation,
  loginValidation
};