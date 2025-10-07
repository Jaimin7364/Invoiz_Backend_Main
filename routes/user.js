const express = require('express');
const User = require('../models/User');
const Business = require('../models/Business');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/user/profile
// @desc    Get complete user profile with business details
// @access  Private
router.get('/profile', auth, async (req, res) => {
  try {
    // Get business details if exists
    const business = await Business.findOne({ user_id: req.user._id });

    const userProfile = {
      user: {
        user_id: req.user.user_id,
        full_name: req.user.full_name,
        email: req.user.email,
        mobile_number: req.user.mobile_number,
        role: req.user.role,
        account_status: req.user.account_status,
        email_verified: req.user.email_verified,
        last_login: req.user.last_login,
        created_at: req.user.created_at
      },
      business: business ? {
        business_id: business.business_id,
        business_name: business.business_name,
        business_type: business.business_type,
        business_address: business.business_address,
        full_address: business.full_address,
        gst_number: business.gst_number,
        upi_id: business.upi_id,
        contact_details: business.contact_details,
        business_status: business.business_status,
        verification_status: business.verification_status
      } : null,
      subscription: req.user.getSubscriptionInfo()
    };

    res.json({
      success: true,
      data: userProfile
    });

  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user profile'
    });
  }
});

// @route   PUT /api/user/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', auth, async (req, res) => {
  try {
    const { full_name, mobile_number } = req.body;

    // Validation
    if (!full_name || !mobile_number) {
      return res.status(400).json({
        success: false,
        message: 'Full name and mobile number are required'
      });
    }

    if (!/^[6-9]\d{9}$/.test(mobile_number)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid 10-digit mobile number'
      });
    }

    // Check if mobile number is already taken by another user
    if (mobile_number !== req.user.mobile_number) {
      const existingUser = await User.findOne({ 
        mobile_number, 
        _id: { $ne: req.user._id } 
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Mobile number already registered with another account'
        });
      }
    }

    // Update user
    req.user.full_name = full_name;
    req.user.mobile_number = mobile_number;
    await req.user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: {
          user_id: req.user.user_id,
          full_name: req.user.full_name,
          email: req.user.email,
          mobile_number: req.user.mobile_number,
          role: req.user.role,
          account_status: req.user.account_status
        }
      }
    });

  } catch (error) {
    console.error('Update user profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
});

// @route   GET /api/user/dashboard
// @desc    Get dashboard data
// @access  Private
router.get('/dashboard', auth, async (req, res) => {
  try {
    const business = await Business.findOne({ user_id: req.user._id });
    const subscriptionInfo = req.user.getSubscriptionInfo();
    const hasActiveSubscription = req.user.hasActiveSubscription();

    const dashboardData = {
      user_info: {
        full_name: req.user.full_name,
        email: req.user.email,
        last_login: req.user.last_login
      },
      business_info: business ? {
        business_name: business.business_name,
        business_type: business.business_type,
        verification_status: business.verification_status
      } : null,
      subscription_info: {
        ...subscriptionInfo,
        has_active_subscription: hasActiveSubscription,
        subscription_required: !hasActiveSubscription
      },
      quick_stats: {
        account_age_days: Math.floor((new Date() - req.user.created_at) / (1000 * 60 * 60 * 24)),
        business_registered: !!business,
        email_verified: req.user.email_verified
      }
    };

    res.json({
      success: true,
      data: dashboardData
    });

  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get dashboard data'
    });
  }
});

// @route   DELETE /api/user/account
// @desc    Delete user account and all associated data
// @access  Private
router.delete('/account', auth, async (req, res) => {
  try {
    const { confirm_deletion } = req.body;

    if (!confirm_deletion) {
      return res.status(400).json({
        success: false,
        message: 'Please confirm account deletion'
      });
    }

    // Delete associated business
    await Business.findOneAndDelete({ user_id: req.user._id });

    // Delete user account
    await User.findByIdAndDelete(req.user._id);

    res.json({
      success: true,
      message: 'Account deleted successfully'
    });

  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete account'
    });
  }
});

module.exports = router;