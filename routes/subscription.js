const express = require('express');
const User = require('../models/User');
const { SubscriptionTransaction } = require('../models/Subscription');
const { auth, requireEmailVerified } = require('../middleware/auth');
const {
  createOrder,
  verifyPaymentSignature,
  calculateSubscriptionEndDate,
  getAllPlans,
  getPlanDetails
} = require('../utils/razorpayService');
const { sendSubscriptionEmail } = require('../utils/emailService');

const router = express.Router();

// @route   GET /api/subscription/plans
// @desc    Get all available subscription plans
// @access  Public
router.get('/plans', (req, res) => {
  try {
    const plans = getAllPlans();
    
    res.json({
      success: true,
      data: {
        plans
      }
    });
  } catch (error) {
    console.error('Get plans error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get subscription plans'
    });
  }
});

// @route   POST /api/subscription/create-order
// @desc    Create Razorpay order for subscription
// @access  Private
router.post('/create-order', auth, requireEmailVerified, async (req, res) => {
  try {
    const { plan_type } = req.body;

    if (!plan_type) {
      return res.status(400).json({
        success: false,
        message: 'Plan type is required'
      });
    }

    const planDetails = getPlanDetails(plan_type);
    if (!planDetails) {
      return res.status(400).json({
        success: false,
        message: 'Invalid subscription plan'
      });
    }

    // Check if user already has an active subscription
    if (req.user.hasActiveSubscription()) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active subscription',
        current_subscription: req.user.getSubscriptionInfo()
      });
    }

    // Create Razorpay order
    const orderResult = await createOrder(plan_type, {
      user_id: req.user.user_id,
      email: req.user.email,
      full_name: req.user.full_name
    });

    // Create transaction record
    const transaction = new SubscriptionTransaction({
      user_id: req.user._id,
      plan_id: plan_type,
      razorpay_order_id: orderResult.order_id,
      amount: orderResult.amount,
      status: 'pending'
    });

    await transaction.save();

    res.json({
      success: true,
      message: 'Order created successfully',
      data: {
        order_id: orderResult.order_id,
        amount: orderResult.amount,
        currency: orderResult.currency,
        plan_details: orderResult.plan_details,
        transaction_id: transaction.transaction_id,
        razorpay_key: process.env.RAZORPAY_KEY_ID
      }
    });

  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create subscription order'
    });
  }
});

// @route   POST /api/subscription/verify-payment
// @desc    Verify payment and activate subscription
// @access  Private
router.post('/verify-payment', auth, async (req, res) => {
  try {
    console.log('=== PAYMENT VERIFICATION START ===');
    console.log('Request body:', req.body);
    console.log('User ID:', req.user._id);
    console.log('User email:', req.user.email);
    
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      plan_type
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !plan_type) {
      console.log('❌ Missing required payment details');
      return res.status(400).json({
        success: false,
        message: 'Missing required payment details'
      });
    }

    // Find the transaction
    const transaction = await SubscriptionTransaction.findOne({
      razorpay_order_id,
      user_id: req.user._id
    });

    console.log('🔍 Transaction lookup:', transaction ? 'found' : 'not found');
    if (transaction) {
      console.log('Transaction details:', {
        id: transaction.transaction_id,
        status: transaction.status,
        amount: transaction.amount
      });
    }

    if (!transaction) {
      console.log('❌ Transaction not found for order:', razorpay_order_id);
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Verify payment signature
    const isSignatureValid = verifyPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );

    console.log('🔐 Payment signature valid:', isSignatureValid);

    if (!isSignatureValid) {
      transaction.status = 'failed';
      await transaction.save();

      console.log('❌ Invalid payment signature');
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    // Update transaction
    transaction.razorpay_payment_id = razorpay_payment_id;
    transaction.razorpay_signature = razorpay_signature;
    transaction.status = 'completed';
    await transaction.save();
    console.log('✅ Transaction updated to completed');

    // Calculate subscription dates
    const startDate = new Date();
    const endDate = calculateSubscriptionEndDate(plan_type, startDate);
    const planDetails = getPlanDetails(plan_type);

    console.log('📅 Subscription dates calculated:', {
      start: startDate,
      end: endDate,
      plan: planDetails.name
    });

    // Update user subscription
    console.log('👤 Current user subscription before update:', req.user.subscription);
    
    req.user.subscription = {
      plan_type,
      start_date: startDate,
      end_date: endDate,
      status: 'active',
      razorpay_subscription_id: razorpay_payment_id,
      amount_paid: transaction.amount / 100 // Convert paise to rupees
    };

    await req.user.save();
    console.log('✅ User subscription updated successfully');
    console.log('👤 New user subscription:', req.user.subscription);
    
    // Verify the subscription was saved by checking hasActiveSubscription
    const hasActive = req.user.hasActiveSubscription();
    console.log('🔍 User has active subscription:', hasActive);
    
    const subscriptionInfo = req.user.getSubscriptionInfo();
    console.log('📊 Subscription info:', subscriptionInfo);

    // Send subscription confirmation email (non-blocking)
    sendSubscriptionEmail(
      req.user.email,
      req.user.full_name,
      planDetails.name,
      transaction.amount / 100,
      endDate
    ).catch(console.error);

    res.json({
      success: true,
      message: 'Payment verified and subscription activated successfully!',
      data: {
        transaction_id: transaction.transaction_id,
        subscription_info: subscriptionInfo,
        plan_details: planDetails
      }
    });

    console.log('✅ Payment verification completed successfully');
    console.log('=== PAYMENT VERIFICATION END ===');

  } catch (error) {
    console.error('❌ Payment verification error:', error);
    console.log('=== PAYMENT VERIFICATION END (ERROR) ===');
    res.status(500).json({
      success: false,
      message: 'Payment verification failed'
    });
  }
});

// @route   GET /api/subscription/status
// @desc    Get current subscription status
// @access  Private
router.get('/status', auth, (req, res) => {
  try {
    const subscriptionInfo = req.user.getSubscriptionInfo();
    const hasActiveSubscription = req.user.hasActiveSubscription();

    res.json({
      success: true,
      data: {
        has_active_subscription: hasActiveSubscription,
        subscription_info: subscriptionInfo,
        subscription_required: !hasActiveSubscription
      }
    });
  } catch (error) {
    console.error('Get subscription status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get subscription status'
    });
  }
});

// @route   GET /api/subscription/history
// @desc    Get subscription transaction history
// @access  Private
router.get('/history', auth, async (req, res) => {
  try {
    const transactions = await SubscriptionTransaction
      .find({ user_id: req.user._id })
      .sort({ created_at: -1 })
      .limit(10);

    const formattedTransactions = transactions.map(transaction => ({
      transaction_id: transaction.transaction_id,
      plan_id: transaction.plan_id,
      amount: transaction.amount / 100, // Convert paise to rupees
      currency: transaction.currency,
      status: transaction.status,
      razorpay_payment_id: transaction.razorpay_payment_id,
      created_at: transaction.created_at
    }));

    res.json({
      success: true,
      data: {
        transactions: formattedTransactions
      }
    });

  } catch (error) {
    console.error('Get subscription history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get subscription history'
    });
  }
});

// @route   POST /api/subscription/cancel
// @desc    Cancel current subscription
// @access  Private
router.post('/cancel', auth, async (req, res) => {
  try {
    if (!req.user.hasActiveSubscription()) {
      return res.status(400).json({
        success: false,
        message: 'No active subscription to cancel'
      });
    }

    // Update subscription status
    req.user.subscription.status = 'cancelled';
    await req.user.save();

    res.json({
      success: true,
      message: 'Subscription cancelled successfully',
      data: {
        subscription_info: req.user.getSubscriptionInfo()
      }
    });

  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel subscription'
    });
  }
});

// @route   POST /api/subscription/webhook
// @desc    Handle Razorpay webhooks
// @access  Public (but verified)
router.post('/webhook', async (req, res) => {
  try {
    const { event, payload } = req.body;

    // Verify webhook signature (implement based on Razorpay docs)
    // const webhookSignature = req.headers['x-razorpay-signature'];
    
    console.log('Received webhook:', event);

    switch (event) {
      case 'payment.captured':
        // Handle successful payment
        console.log('Payment captured:', payload.payment.entity);
        break;
      
      case 'payment.failed':
        // Handle failed payment
        console.log('Payment failed:', payload.payment.entity);
        break;
      
      case 'subscription.cancelled':
        // Handle subscription cancellation
        console.log('Subscription cancelled:', payload.subscription.entity);
        break;
      
      default:
        console.log('Unhandled webhook event:', event);
    }

    res.status(200).json({ status: 'ok' });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;