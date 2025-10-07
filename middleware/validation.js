const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

const registerValidation = [
  body('full_name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters'),
  
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  
  body('mobile_number')
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Please provide a valid 10-digit mobile number'),
  
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  
  handleValidationErrors
];

const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  
  handleValidationErrors
];

const otpValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  
  body('otp')
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('OTP must be a 6-digit number'),
  
  handleValidationErrors
];

const businessValidation = [
  body('business_name')
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Business name must be between 2 and 200 characters'),
  
  body('business_type')
    .isIn([
      'Grocery', 'Electronics', 'Pharmacy', 'Restaurant', 'Clothing',
      'Hardware', 'Stationery', 'Mobile Shop', 'Medical Store', 'General Store',
      'Automobile', 'Beauty & Cosmetics', 'Books & Media', 'Furniture',
      'Jewelry', 'Sports & Fitness', 'Toys & Games', 'Other'
    ])
    .withMessage('Please select a valid business type'),
  
  body('business_address.street')
    .trim()
    .notEmpty()
    .withMessage('Street address is required'),
  
  body('business_address.city')
    .trim()
    .notEmpty()
    .withMessage('City is required'),
  
  body('business_address.state')
    .trim()
    .notEmpty()
    .withMessage('State is required'),
  
  body('business_address.pincode')
    .matches(/^[1-9][0-9]{5}$/)
    .withMessage('Please provide a valid 6-digit pincode'),
  
  body('gst_number')
    .optional()
    .matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
    .withMessage('Please provide a valid GST number'),
  
  body('upi_id')
    .matches(/^[\w.-]+@[\w.-]+$/)
    .withMessage('Please provide a valid UPI ID'),
  
  handleValidationErrors
];

const passwordResetValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  
  handleValidationErrors
];

module.exports = {
  registerValidation,
  loginValidation,
  otpValidation,
  businessValidation,
  passwordResetValidation,
  handleValidationErrors
};