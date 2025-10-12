const express = require('express');
const mongoose = require('mongoose');
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
  const session = await mongoose.startSession();
  session.startTransaction();

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
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Missing required payment details'
      });
    }

    // Find the transaction
    const transaction = await SubscriptionTransaction.findOne({
      razorpay_order_id,
      user_id: req.user._id
    }).session(session);

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
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Check if transaction is already processed
    if (transaction.status === 'completed') {
      console.log('⚠️ Transaction already processed, returning existing data');
      await session.abortTransaction();
      session.endSession();
      
      const existingUser = await User.findById(req.user._id);
      const subscriptionInfo = existingUser.getSubscriptionInfo();
      const planDetails = getPlanDetails(plan_type);
      
      return res.json({
        success: true,
        message: 'Payment already verified and subscription is active!',
        data: {
          transaction_id: transaction.transaction_id,
          subscription_info: subscriptionInfo,
          plan_details: planDetails
        }
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
      await transaction.save({ session });

      console.log('❌ Invalid payment signature');
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    // Update transaction within the session
    transaction.razorpay_payment_id = razorpay_payment_id;
    transaction.razorpay_signature = razorpay_signature;
    transaction.status = 'completed';
    await transaction.save({ session });
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

    // Update user subscription using the session for atomicity
    console.log('👤 Current user subscription before update:', req.user.subscription);
    
    const subscriptionData = {
      plan_type,
      start_date: startDate,
      end_date: endDate,
      status: 'active',
      razorpay_subscription_id: razorpay_payment_id,
      amount_paid: transaction.amount / 100 // Convert paise to rupees
    };

    // Update the user document within the transaction
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { 
        $set: { subscription: subscriptionData },
        $currentDate: { updated_at: true }
      },
      { new: true, session }
    );

    if (!updatedUser) {
      throw new Error('Failed to update user subscription');
    }

    console.log('✅ User subscription updated successfully within transaction');
    console.log('👤 New user subscription:', updatedUser.subscription);
    
    // Verify the subscription was saved by checking hasActiveSubscription
    const hasActive = updatedUser.hasActiveSubscription();
    console.log('🔍 User has active subscription after update:', hasActive);
    
    if (!hasActive) {
      console.error('❌ WARNING: Subscription was not properly saved to database!');
      throw new Error('Subscription activation failed - database update unsuccessful');
    }
    
    // Commit the transaction
    await session.commitTransaction();
    session.endSession();
    
    console.log('✅ Database transaction committed successfully');
    
    // Wait a moment to ensure database consistency
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Final verification with a fresh database query
    const finalVerifyUser = await User.findById(req.user._id);
    const finalHasActive = finalVerifyUser.hasActiveSubscription();
    const subscriptionInfo = finalVerifyUser.getSubscriptionInfo();
    
    console.log('� Final verification - User has active subscription:', finalHasActive);
    console.log('�📊 Final subscription info:', subscriptionInfo);

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
    
    // Rollback the transaction in case of error
    try {
      await session.abortTransaction();
      session.endSession();
    } catch (rollbackError) {
      console.error('❌ Error rolling back transaction:', rollbackError);
    }
    
    console.log('=== PAYMENT VERIFICATION END (ERROR) ===');
    res.status(500).json({
      success: false,
      message: 'Payment verification failed: ' + error.message
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

// @route   POST /api/subscription/check-payment-status
// @desc    Check payment and subscription status for a specific transaction
// @access  Private
router.post('/check-payment-status', auth, async (req, res) => {
  try {
    const { transaction_id, razorpay_order_id } = req.body;

    let transaction;
    
    if (transaction_id) {
      transaction = await SubscriptionTransaction.findOne({
        transaction_id,
        user_id: req.user._id
      });
    } else if (razorpay_order_id) {
      transaction = await SubscriptionTransaction.findOne({
        razorpay_order_id,
        user_id: req.user._id
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Transaction ID or Razorpay Order ID is required'
      });
    }

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Get fresh user data
    const freshUser = await User.findById(req.user._id);
    const hasActiveSubscription = freshUser.hasActiveSubscription();
    const subscriptionInfo = freshUser.getSubscriptionInfo();

    res.json({
      success: true,
      data: {
        transaction_status: transaction.status,
        payment_id: transaction.razorpay_payment_id,
        has_active_subscription: hasActiveSubscription,
        subscription_info: subscriptionInfo,
        transaction_details: {
          id: transaction.transaction_id,
          amount: transaction.amount / 100,
          created_at: transaction.created_at,
          updated_at: transaction.updated_at
        }
      }
    });

  } catch (error) {
    console.error('Check payment status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check payment status'
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

// @route   GET /api/subscription/debug-user/:email
// @desc    Debug subscription issues for specific user by email
// @access  Private
router.get('/debug-user/:email', auth, async (req, res) => {
  try {
    const userEmail = req.params.email;
    
    const user = await User.findOne({ email: userEmail });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const transactions = await SubscriptionTransaction.find({
      user_id: user._id
    }).sort({ created_at: -1 }).limit(5);

    const hasActiveSubscription = user.hasActiveSubscription();
    const subscriptionInfo = user.getSubscriptionInfo();

    res.json({
      success: true,
      data: {
        user_info: {
          id: user._id,
          email: user.email,
          user_id: user.user_id,
          created_at: user.created_at
        },
        raw_subscription_data: user.subscription,
        subscription_status: {
          has_active: hasActiveSubscription,
          calculated_info: subscriptionInfo
        },
        recent_transactions: transactions.map(t => ({
          id: t.transaction_id,
          order_id: t.razorpay_order_id,
          payment_id: t.razorpay_payment_id,
          amount: t.amount / 100,
          status: t.status,
          plan_id: t.plan_id,
          created_at: t.created_at,
          updated_at: t.updated_at
        })),
        debug_info: {
          current_time: new Date(),
          subscription_exists: user.subscription != null,
          subscription_has_end_date: user.subscription?.end_date != null,
          subscription_has_status: user.subscription?.status != null,
          subscription_status_value: user.subscription?.status,
          subscription_end_date: user.subscription?.end_date,
          is_end_date_future: user.subscription?.end_date ? user.subscription.end_date > new Date() : false,
          calculated_days_remaining: subscriptionInfo?.days_remaining
        }
      }
    });

  } catch (error) {
    console.error('Debug user subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get debug information: ' + error.message
    });
  }
});

// @route   GET /api/subscription/debug/:userId
// @desc    Debug subscription issues (Admin only)
// @access  Private
router.get('/debug/:userId', auth, async (req, res) => {
  try {
    // For now, allow any authenticated user to debug their own account
    // In production, you might want to restrict this to admins only
    const userId = req.params.userId;
    
    if (req.user._id.toString() !== userId && req.user.role !== 'Admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const transactions = await SubscriptionTransaction.find({
      user_id: userId
    }).sort({ created_at: -1 }).limit(10);

    const hasActiveSubscription = user.hasActiveSubscription();
    const subscriptionInfo = user.getSubscriptionInfo();

    res.json({
      success: true,
      data: {
        user_info: {
          id: user._id,
          email: user.email,
          created_at: user.created_at
        },
        subscription_status: {
          has_active: hasActiveSubscription,
          subscription_data: user.subscription,
          calculated_info: subscriptionInfo
        },
        recent_transactions: transactions.map(t => ({
          id: t.transaction_id,
          order_id: t.razorpay_order_id,
          payment_id: t.razorpay_payment_id,
          amount: t.amount / 100,
          status: t.status,
          plan_id: t.plan_id,
          created_at: t.created_at,
          updated_at: t.updated_at
        })),
        debug_info: {
          current_time: new Date(),
          user_subscription_raw: user.subscription,
          subscription_end_date: user.subscription?.end_date,
          is_end_date_future: user.subscription?.end_date ? user.subscription.end_date > new Date() : false,
          subscription_status_field: user.subscription?.status
        }
      }
    });

  } catch (error) {
    console.error('Debug subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get debug information'
    });
  }
});

// @route   POST /api/subscription/manual-verify
// @desc    Manually verify and fix a pending transaction
// @access  Private
router.post('/manual-verify', auth, async (req, res) => {
  try {
    const { transaction_id, razorpay_payment_id } = req.body;

    if (!transaction_id && !razorpay_payment_id) {
      return res.status(400).json({
        success: false,
        message: 'Either transaction_id or razorpay_payment_id is required'
      });
    }

    let transaction;
    if (transaction_id) {
      transaction = await SubscriptionTransaction.findOne({
        transaction_id,
        user_id: req.user._id
      });
    } else {
      transaction = await SubscriptionTransaction.findOne({
        razorpay_payment_id,
        user_id: req.user._id
      });
    }

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    console.log('🔧 Manual verification for transaction:', transaction.transaction_id);
    console.log('Current status:', transaction.status);

    if (transaction.status === 'completed') {
      return res.json({
        success: true,
        message: 'Transaction is already completed',
        data: { transaction_status: transaction.status }
      });
    }

    // Update transaction to completed
    transaction.status = 'completed';
    transaction.updated_at = new Date();
    
    // If payment ID is provided but not in transaction, update it
    if (razorpay_payment_id && !transaction.razorpay_payment_id) {
      transaction.razorpay_payment_id = razorpay_payment_id;
    }
    
    await transaction.save();

    // Create subscription for user
    const startDate = new Date();
    const endDate = calculateSubscriptionEndDate(transaction.plan_id, startDate);
    
    const subscriptionData = {
      plan_type: transaction.plan_id,
      start_date: startDate,
      end_date: endDate,
      status: 'active',
      razorpay_subscription_id: transaction.razorpay_payment_id || `manual_${Date.now()}`,
      amount_paid: transaction.amount / 100
    };

    await User.findByIdAndUpdate(
      req.user._id,
      { 
        $set: { subscription: subscriptionData },
        $currentDate: { updated_at: true }
      },
      { new: true }
    );

    console.log('✅ Manual verification completed for transaction:', transaction.transaction_id);

    res.json({
      success: true,
      message: 'Transaction manually verified and subscription activated',
      data: {
        transaction_id: transaction.transaction_id,
        new_status: transaction.status,
        subscription_data: subscriptionData
      }
    });

  } catch (error) {
    console.error('Manual verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Manual verification failed: ' + error.message
    });
  }
});

// @route   POST /api/subscription/verify-payment-v2
// @desc    Verify payment and activate subscription (Enhanced version)
// @access  Private
router.post('/verify-payment-v2', auth, async (req, res) => {
  let session = null;

  try {
    console.log('=== PAYMENT VERIFICATION V2 START ===');
    console.log('Request timestamp:', new Date().toISOString());
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('User ID:', req.user._id);
    console.log('User email:', req.user.email);
    
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      plan_type
    } = req.body;

    // Validate required fields
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !plan_type) {
      console.log('❌ Missing required payment details');
      return res.status(400).json({
        success: false,
        message: 'Missing required payment details',
        received_fields: {
          razorpay_order_id: !!razorpay_order_id,
          razorpay_payment_id: !!razorpay_payment_id,
          razorpay_signature: !!razorpay_signature,
          plan_type: !!plan_type
        }
      });
    }

    // Start database session
    session = await mongoose.startSession();
    session.startTransaction();
    console.log('🔄 Database transaction started');

    // Find the transaction
    const transaction = await SubscriptionTransaction.findOne({
      razorpay_order_id,
      user_id: req.user._id
    }).session(session);

    console.log('🔍 Transaction lookup result:', {
      found: !!transaction,
      transaction_id: transaction?.transaction_id,
      current_status: transaction?.status,
      amount: transaction?.amount
    });

    if (!transaction) {
      console.log('❌ Transaction not found');
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Transaction not found for this user'
      });
    }

    // Check if transaction is already processed
    if (transaction.status === 'completed') {
      console.log('⚠️ Transaction already processed');
      await session.abortTransaction();
      session.endSession();
      
      const existingUser = await User.findById(req.user._id);
      const subscriptionInfo = existingUser.getSubscriptionInfo();
      const planDetails = getPlanDetails(plan_type);
      
      return res.json({
        success: true,
        message: 'Payment already verified and subscription is active!',
        data: {
          transaction_id: transaction.transaction_id,
          subscription_info: subscriptionInfo,
          plan_details: planDetails
        }
      });
    }

    // Verify payment signature
    console.log('🔐 Verifying payment signature...');
    const isSignatureValid = verifyPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );

    console.log('🔐 Payment signature verification result:', isSignatureValid);

    if (!isSignatureValid) {
      transaction.status = 'failed';
      await transaction.save({ session });
      await session.commitTransaction();
      session.endSession();

      console.log('❌ Invalid payment signature');
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    // Update transaction within the session
    console.log('💾 Updating transaction status...');
    transaction.razorpay_payment_id = razorpay_payment_id;
    transaction.razorpay_signature = razorpay_signature;
    transaction.status = 'completed';
    transaction.updated_at = new Date();
    
    await transaction.save({ session });
    console.log('✅ Transaction updated to completed');

    // Calculate subscription dates
    const startDate = new Date();
    const endDate = calculateSubscriptionEndDate(plan_type, startDate);
    const planDetails = getPlanDetails(plan_type);

    console.log('📅 Subscription dates calculated:', {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      plan: planDetails.name
    });

    // Update user subscription
    console.log('👤 Updating user subscription...');
    
    const subscriptionData = {
      plan_type,
      start_date: startDate,
      end_date: endDate,
      status: 'active',
      razorpay_subscription_id: razorpay_payment_id,
      amount_paid: transaction.amount / 100 // Convert paise to rupees
    };

    console.log('📝 New subscription data:', subscriptionData);

    // Update the user document within the transaction
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { 
        $set: { subscription: subscriptionData },
        $currentDate: { updated_at: true }
      },
      { new: true, session, runValidators: true }
    );

    if (!updatedUser) {
      throw new Error('Failed to update user subscription');
    }

    console.log('✅ User subscription updated successfully');
    console.log('👤 Updated subscription:', updatedUser.subscription);
    
    // Verify the subscription was saved
    const hasActive = updatedUser.hasActiveSubscription();
    console.log('🔍 User has active subscription after update:', hasActive);
    
    if (!hasActive) {
      console.error('❌ WARNING: Subscription activation check failed!');
      throw new Error('Subscription activation verification failed');
    }
    
    // Commit the transaction
    await session.commitTransaction();
    session.endSession();
    session = null;
    
    console.log('✅ Database transaction committed successfully');
    
    // Final verification
    const finalUser = await User.findById(req.user._id);
    const subscriptionInfo = finalUser.getSubscriptionInfo();
    
    console.log('🔍 Final subscription info:', subscriptionInfo);

    // Send email (non-blocking)
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

    console.log('✅ Payment verification V2 completed successfully');
    console.log('=== PAYMENT VERIFICATION V2 END ===');

  } catch (error) {
    console.error('❌ Payment verification V2 error:', error);
    
    if (session) {
      try {
        await session.abortTransaction();
        session.endSession();
      } catch (rollbackError) {
        console.error('❌ Rollback error:', rollbackError);
      }
    }
    
    res.status(500).json({
      success: false,
      message: 'Payment verification failed: ' + error.message
    });
  }
});

module.exports = router;