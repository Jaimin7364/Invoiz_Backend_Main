const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password_hash -otp');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. User not found.'
      });
    }

    if (user.account_status !== 'Active') {
      return res.status(401).json({
        success: false,
        message: 'Account is inactive. Please contact support.'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired. Please login again.'
      });
    }

    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error in authentication.'
    });
  }
};

// Middleware to check if user has active subscription
const requireActiveSubscription = (req, res, next) => {
  if (!req.user.hasActiveSubscription()) {
    return res.status(403).json({
      success: false,
      message: 'Active subscription required to access this feature.',
      subscription_required: true,
      subscription_info: req.user.getSubscriptionInfo()
    });
  }
  next();
};

// Middleware to check if user email is verified
const requireEmailVerified = (req, res, next) => {
  if (!req.user.email_verified) {
    return res.status(403).json({
      success: false,
      message: 'Email verification required.',
      email_verification_required: true
    });
  }
  next();
};

module.exports = {
  auth,
  requireActiveSubscription,
  requireEmailVerified
};