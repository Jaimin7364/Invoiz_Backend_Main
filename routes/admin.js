const express = require('express');
const User = require('../models/User');
const { SubscriptionTransaction } = require('../models/Subscription');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin privileges required.'
    });
  }
  next();
};

// @route   GET /api/admin/users
// @desc    Get all users with their subscription status
// @access  Private (Admin only)
router.get('/users', auth, requireAdmin, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      subscriptionStatus = 'all', // all, active, expired, none
      accountStatus = 'all' // all, Active, Inactive, Suspended
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build query
    const query = {};

    // Search by name, email, or mobile
    if (search) {
      query.$or = [
        { full_name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { mobile_number: { $regex: search, $options: 'i' } }
      ];
    }

    // Filter by account status
    if (accountStatus !== 'all') {
      query.account_status = accountStatus;
    }

    // Filter by subscription status
    if (subscriptionStatus !== 'all') {
      const now = new Date();
      
      if (subscriptionStatus === 'active') {
        query['subscription.status'] = 'active';
        query['subscription.end_date'] = { $gt: now };
      } else if (subscriptionStatus === 'expired') {
        query.$or = [
          { 'subscription.status': 'expired' },
          { 
            'subscription.status': 'active',
            'subscription.end_date': { $lte: now }
          }
        ];
      } else if (subscriptionStatus === 'none') {
        query.$or = [
          { subscription: null },
          { subscription: { $exists: false } },
          { 'subscription.plan_type': null }
        ];
      }
    }

    // Get users with pagination
    const users = await User.find(query)
      .select('-password_hash -otp')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await User.countDocuments(query);

    // Format user data
    const formattedUsers = users.map(user => {
      const subscriptionInfo = user.getSubscriptionInfo();
      const hasActive = user.hasActiveSubscription();
      
      return {
        user_id: user.user_id,
        _id: user._id,
        full_name: user.full_name,
        email: user.email,
        mobile_number: user.mobile_number,
        role: user.role,
        account_status: user.account_status,
        email_verified: user.email_verified,
        business_id: user.business_id,
        subscription: subscriptionInfo,
        has_active_subscription: hasActive,
        created_at: user.created_at,
        updated_at: user.updated_at,
        last_login: user.last_login
      };
    });

    res.json({
      success: true,
      data: {
        users: formattedUsers,
        pagination: {
          current_page: parseInt(page),
          total_pages: Math.ceil(total / parseInt(limit)),
          total_users: total,
          per_page: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get users'
    });
  }
});

// @route   GET /api/admin/users/:userId
// @desc    Get detailed information about a specific user
// @access  Private (Admin only)
router.get('/users/:userId', auth, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('-password_hash -otp');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get subscription transactions
    const transactions = await SubscriptionTransaction.find({ user_id: user._id })
      .sort({ created_at: -1 })
      .limit(10);

    const subscriptionInfo = user.getSubscriptionInfo();
    const hasActive = user.hasActiveSubscription();

    res.json({
      success: true,
      data: {
        user: {
          user_id: user.user_id,
          _id: user._id,
          full_name: user.full_name,
          email: user.email,
          mobile_number: user.mobile_number,
          role: user.role,
          account_status: user.account_status,
          email_verified: user.email_verified,
          business_id: user.business_id,
          subscription: subscriptionInfo,
          has_active_subscription: hasActive,
          created_at: user.created_at,
          updated_at: user.updated_at,
          last_login: user.last_login
        },
        transactions: transactions.map(t => ({
          transaction_id: t.transaction_id,
          plan_id: t.plan_id,
          plan_name: t.plan_name || 'Subscription',
          amount: t.amount / 100,
          status: t.status,
          created_at: t.created_at,
          razorpay_payment_id: t.razorpay_payment_id
        }))
      }
    });

  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user details'
    });
  }
});

// @route   PUT /api/admin/users/:userId/account-status
// @desc    Update user's account status (Active/Inactive/Suspended)
// @access  Private (Admin only)
router.put('/users/:userId/account-status', auth, requireAdmin, async (req, res) => {
  try {
    const { account_status } = req.body;

    if (!['Active', 'Inactive', 'Suspended'].includes(account_status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid account status. Must be Active, Inactive, or Suspended'
      });
    }

    const user = await User.findById(req.params.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.account_status = account_status;
    await user.save();

    console.log(`Admin ${req.user.email} changed account status of user ${user.email} to ${account_status}`);

    res.json({
      success: true,
      message: `Account status updated to ${account_status}`,
      data: {
        user_id: user.user_id,
        account_status: user.account_status
      }
    });

  } catch (error) {
    console.error('Update account status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update account status'
    });
  }
});

// @route   POST /api/admin/users/:userId/deactivate
// @desc    Deactivate user account (for expired subscriptions)
// @access  Private (Admin only)
router.post('/users/:userId/deactivate', auth, requireAdmin, async (req, res) => {
  try {
    const { reason } = req.body;

    const user = await User.findById(req.params.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.account_status === 'Suspended') {
      return res.status(400).json({
        success: false,
        message: 'Account is already suspended'
      });
    }

    user.account_status = 'Suspended';
    await user.save();

    console.log(`Admin ${req.user.email} deactivated user ${user.email}. Reason: ${reason || 'No reason provided'}`);

    res.json({
      success: true,
      message: 'User account deactivated successfully',
      data: {
        user_id: user.user_id,
        account_status: user.account_status
      }
    });

  } catch (error) {
    console.error('Deactivate account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate account'
    });
  }
});

// @route   POST /api/admin/users/:userId/activate
// @desc    Activate/reactivate user account
// @access  Private (Admin only)
router.post('/users/:userId/activate', auth, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.account_status = 'Active';
    await user.save();

    console.log(`Admin ${req.user.email} activated user ${user.email}`);

    res.json({
      success: true,
      message: 'User account activated successfully',
      data: {
        user_id: user.user_id,
        account_status: user.account_status
      }
    });

  } catch (error) {
    console.error('Activate account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to activate account'
    });
  }
});

// @route   POST /api/admin/users/:userId/modify-subscription
// @desc    Extend or reduce user subscription
// @access  Private (Admin only)
router.post('/users/:userId/modify-subscription', auth, requireAdmin, async (req, res) => {
  try {
    const { days, action } = req.body;

    if (!days || !action) {
      return res.status(400).json({
        success: false,
        message: 'Days and action are required'
      });
    }

    if (!['extend', 'reduce'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Action must be either "extend" or "reduce"'
      });
    }

    const daysNum = parseInt(days);
    if (isNaN(daysNum) || daysNum <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Days must be a positive number'
      });
    }

    const user = await User.findById(req.params.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.subscription || !user.subscription.end_date) {
      return res.status(400).json({
        success: false,
        message: 'User does not have a subscription to modify'
      });
    }

    const currentEndDate = new Date(user.subscription.end_date);
    let newEndDate;

    if (action === 'extend') {
      // Add days to subscription
      newEndDate = new Date(currentEndDate);
      newEndDate.setDate(newEndDate.getDate() + daysNum);
      
      // Update subscription status if it was expired
      if (user.subscription.status === 'expired' || currentEndDate < new Date()) {
        user.subscription.status = 'active';
      }
    } else {
      // Reduce days from subscription
      newEndDate = new Date(currentEndDate);
      newEndDate.setDate(newEndDate.getDate() - daysNum);
      
      // Check if new end date is in the past
      if (newEndDate < new Date()) {
        user.subscription.status = 'expired';
      }
    }

    user.subscription.end_date = newEndDate;
    await user.save();

    console.log(`Admin ${req.user.email} ${action}ed subscription for user ${user.email} by ${daysNum} days`);

    res.json({
      success: true,
      message: `Subscription ${action}ed by ${daysNum} days successfully`,
      data: {
        user_id: user.user_id,
        subscription: user.getSubscriptionInfo(),
        has_active_subscription: user.hasActiveSubscription()
      }
    });

  } catch (error) {
    console.error('Modify subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to modify subscription'
    });
  }
});

// @route   GET /api/admin/stats
// @desc    Get admin dashboard statistics
// @access  Private (Admin only)
router.get('/stats', auth, requireAdmin, async (req, res) => {
  try {
    const now = new Date();

    // Count users by account status
    const totalUsers = await User.countDocuments({});
    const activeAccounts = await User.countDocuments({ account_status: 'Active' });
    const suspendedAccounts = await User.countDocuments({ account_status: 'Suspended' });
    const inactiveAccounts = await User.countDocuments({ account_status: 'Inactive' });

    // Count users by subscription status
    const activeSubscriptions = await User.countDocuments({
      'subscription.status': 'active',
      'subscription.end_date': { $gt: now }
    });

    const expiredSubscriptions = await User.countDocuments({
      $or: [
        { 'subscription.status': 'expired' },
        {
          'subscription.status': 'active',
          'subscription.end_date': { $lte: now }
        }
      ]
    });

    const noSubscription = await User.countDocuments({
      $or: [
        { subscription: null },
        { subscription: { $exists: false } },
        { 'subscription.plan_type': null }
      ]
    });

    // Get subscription revenue stats
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const recentTransactions = await SubscriptionTransaction.find({
      status: 'completed',
      created_at: { $gte: last30Days }
    });

    const revenue30Days = recentTransactions.reduce((sum, t) => sum + (t.amount || 0), 0) / 100;
    
    const transactionsCount30Days = recentTransactions.length;

    res.json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          active: activeAccounts,
          suspended: suspendedAccounts,
          inactive: inactiveAccounts
        },
        subscriptions: {
          active: activeSubscriptions,
          expired: expiredSubscriptions,
          none: noSubscription
        },
        revenue: {
          last_30_days: revenue30Days,
          transactions_count: transactionsCount30Days
        },
        generated_at: now
      }
    });

  } catch (error) {
    console.error('Get admin stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get admin statistics'
    });
  }
});

module.exports = router;
