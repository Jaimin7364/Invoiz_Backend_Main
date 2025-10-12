const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const { auth } = require('../middleware/auth');
const User = require('../models/User');
const { SubscriptionTransaction } = require('../models/Subscription');
const { razorpay, SUBSCRIPTION_PLANS } = require('../utils/razorpayService');

// Email service (optional)
const sendSubscriptionEmail = async (email, name, planName, amount, endDate) => {
  try {
    const emailService = require('../utils/emailService');
    await emailService.sendSubscriptionActivationEmail(email, name, planName, amount, endDate);
  } catch (error) {
    console.log('Email service not available or failed:', error.message);
  }
};

// Helper function to calculate subscription end date
const calculateEndDate = (planId, startDate) => {
  const plan = SUBSCRIPTION_PLANS[planId];
  if (!plan) {
    throw new Error(`Invalid plan ID: ${planId}`);
  }

  const endDate = new Date(startDate);
  
  switch (plan.validity_type) {
    case 'monthly':
      endDate.setMonth(endDate.getMonth() + (plan.validity_period || 1));
      break;
    case 'yearly':
      endDate.setFullYear(endDate.getFullYear() + (plan.validity_period || 1));
      break;
    case 'days':
      endDate.setDate(endDate.getDate() + (plan.validity_period || 30));
      break;
    default:
      endDate.setDate(endDate.getDate() + 30); // Default 30 days
  }
  
  return endDate;
};

// Helper function to format plan for client
const formatPlanForClient = (planId, plan) => ({
  id: planId,
  name: plan.name,
  price: plan.price / 100, // Convert paise to rupees
  currency: plan.currency,
  validity_period: plan.validity_period,
  validity_type: plan.validity_type,
  features: plan.features || [],
  is_popular: plan.is_popular || false
});

// Helper function to get plan details
const getPlanDetails = (planId) => {
  const plan = SUBSCRIPTION_PLANS[planId];
  return plan ? formatPlanForClient(planId, plan) : null;
};

// Helper function to verify payment signature
const verifyPaymentSignature = (orderId, paymentId, signature) => {
  try {
    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');
    
    return expectedSignature === signature;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
};

// @route   GET /api/subscription/plans
// @desc    Get all available subscription plans
// @access  Public
router.get('/plans', (req, res) => {
  try {
    const plans = Object.keys(SUBSCRIPTION_PLANS).map(planId => 
      formatPlanForClient(planId, SUBSCRIPTION_PLANS[planId])
    );
    
    res.json({
      success: true,
      data: { plans }
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
router.post('/create-order', auth, async (req, res) => {
  try {
    console.log('=== CREATE ORDER START ===');
    console.log('User:', req.user.email, req.user._id);
    console.log('Request body:', req.body);
    
    const { plan_id } = req.body;
    
    if (!plan_id) {
      return res.status(400).json({
        success: false,
        message: 'Plan ID is required'
      });
    }
    
    const plan = SUBSCRIPTION_PLANS[plan_id];
    if (!plan) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plan selected'
      });
    }
    
    console.log('Selected plan:', plan.name, 'Amount:', plan.price, 'paise');
    
    // Create Razorpay order
    const orderOptions = {
      amount: plan.price, // Amount in paise
      currency: plan.currency,
      receipt: `sub_${Date.now().toString().slice(-8)}`, // Shorter receipt (max 40 chars)
      notes: {
        plan_id,
        user_id: req.user._id.toString(),
        user_email: req.user.email
      }
    };
    
    console.log('Creating Razorpay order with options:', orderOptions);
    const order = await razorpay.orders.create(orderOptions);
    console.log('Razorpay order created:', order.id);
    
    // Create transaction record
    const transactionData = {
      transaction_id: `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      user_id: req.user._id,
      plan_id,
      amount: plan.price,
      currency: plan.currency,
      razorpay_order_id: order.id,
      status: 'pending',
      created_at: new Date()
    };
    
    console.log('Creating transaction record:', transactionData.transaction_id);
    const transaction = await SubscriptionTransaction.create(transactionData);
    console.log('Transaction created successfully');
    
    const response = {
      success: true,
      data: {
        order_id: order.id,
        amount: plan.price,
        currency: plan.currency,
        transaction_id: transaction.transaction_id,
        plan_details: formatPlanForClient(plan_id, plan),
        razorpay_key: process.env.RAZORPAY_KEY_ID
      }
    };
    
    console.log('Sending response:', response);
    console.log('=== CREATE ORDER END ===');
    
    res.json(response);
    
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order: ' + error.message
    });
  }
});

// @route   POST /api/subscription/verify-payment
// @desc    Verify payment and activate subscription
// @access  Private
router.post('/verify-payment', auth, async (req, res) => {
  let session = null;
  
  try {
    console.log('=== PAYMENT VERIFICATION START ===');
    console.log('User:', req.user.email);
    console.log('Request body:', req.body);
    
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      plan_id
    } = req.body;

    // Validate required fields
    if (!razorpay_order_id || !plan_id) {
      return res.status(400).json({
        success: false,
        message: 'Order ID and Plan ID are required'
      });
    }

    // Start database session for atomic operations
    session = await mongoose.startSession();
    session.startTransaction();
    console.log('Database transaction started');

    // Find the transaction
    const transaction = await SubscriptionTransaction.findOne({
      razorpay_order_id,
      user_id: req.user._id
    }).session(session);

    if (!transaction) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    console.log('Transaction found:', transaction.transaction_id, 'Status:', transaction.status);

    // Check if already completed
    if (transaction.status === 'completed') {
      await session.abortTransaction();
      session.endSession();
      
      const user = await User.findById(req.user._id);
      return res.json({
        success: true,
        message: 'Payment already verified and subscription is active',
        data: {
          transaction_id: transaction.transaction_id,
          subscription_info: user.getSubscriptionInfo(),
          plan_details: getPlanDetails(plan_id)
        }
      });
    }

    // Verify payment using multiple methods
    let paymentVerified = false;
    let verificationMethod = '';
    let finalPaymentId = razorpay_payment_id;

    // Method 1: Signature verification (if available)
    if (razorpay_payment_id && razorpay_signature) {
      console.log('Attempting signature verification...');
      paymentVerified = verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
      if (paymentVerified) {
        verificationMethod = 'signature';
        console.log('✅ Payment verified via signature');
      }
    }

    // Method 2: Fetch payment from Razorpay API (fallback)
    if (!paymentVerified) {
      console.log('Attempting API verification...');
      try {
        const paymentsResponse = await razorpay.orders.fetchPayments(razorpay_order_id);
        const payments = paymentsResponse.items || paymentsResponse || [];
        
        const capturedPayment = payments.find(p => p.status === 'captured');
        if (capturedPayment) {
          paymentVerified = true;
          verificationMethod = 'api_fetch';
          finalPaymentId = capturedPayment.id;
          console.log('✅ Payment verified via API fetch:', finalPaymentId);
        }
      } catch (apiError) {
        console.error('API verification failed:', apiError);
      }
    }

    if (!paymentVerified) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed. Please try again or contact support.'
      });
    }

    // Update transaction
    transaction.razorpay_payment_id = finalPaymentId;
    transaction.razorpay_signature = razorpay_signature || `${verificationMethod}_verified`;
    transaction.status = 'completed';
    transaction.updated_at = new Date();
    await transaction.save({ session });
    console.log('Transaction updated to completed');

    // Activate subscription
    const startDate = new Date();
    const endDate = calculateEndDate(plan_id, startDate);
    const planDetails = getPlanDetails(plan_id);

    const subscriptionData = {
      plan_type: plan_id,
      start_date: startDate,
      end_date: endDate,
      status: 'active',
      razorpay_subscription_id: finalPaymentId,
      amount_paid: transaction.amount / 100
    };

    console.log('Activating subscription:', subscriptionData);

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

    // Verify subscription activation
    const hasActive = updatedUser.hasActiveSubscription();
    if (!hasActive) {
      throw new Error('Subscription activation verification failed');
    }

    // Commit transaction
    await session.commitTransaction();
    session.endSession();
    session = null;
    
    console.log('✅ Payment verification completed successfully');

    // Send email notification (non-blocking)
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
        subscription_info: updatedUser.getSubscriptionInfo(),
        plan_details: planDetails,
        verification_method: verificationMethod
      }
    });

    console.log('=== PAYMENT VERIFICATION END ===');

  } catch (error) {
    console.error('❌ Payment verification error:', error);
    
    if (session) {
      try {
        await session.abortTransaction();
        session.endSession();
      } catch (rollbackError) {
        console.error('Rollback error:', rollbackError);
      }
    }
    
    res.status(500).json({
      success: false,
      message: 'Payment verification failed: ' + error.message
    });
  }
});

// @route   POST /api/subscription/webhook
// @desc    Handle Razorpay webhook notifications
// @access  Public (with signature verification)
router.post('/webhook', async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];
    const body = JSON.stringify(req.body);

    // Verify webhook signature if secret is configured
    if (webhookSecret && signature) {
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(body)
        .digest('hex');

      if (expectedSignature !== signature) {
        console.error('❌ Invalid webhook signature');
        return res.status(400).json({ error: 'Invalid signature' });
      }
      console.log('✅ Webhook signature verified');
    } else {
      console.warn('⚠️ Webhook signature verification skipped (no secret configured)');
    }

    const { event, payload } = req.body;
    console.log(`📬 Webhook received: ${event}`);

    if (event === 'payment.captured') {
      const payment = payload?.payment?.entity;
      if (!payment) {
        console.log('⚠️ No payment entity in webhook');
        return res.status(200).json({ status: 'ignored' });
      }

      const { id: paymentId, order_id: orderId, amount, status } = payment;
      console.log(`💰 Payment captured: ${paymentId} for order: ${orderId}`);

      // Find matching transaction
      const transaction = await SubscriptionTransaction.findOne({
        razorpay_order_id: orderId
      });

      if (!transaction) {
        console.log(`⚠️ No transaction found for order: ${orderId}`);
        return res.status(200).json({ status: 'transaction_not_found' });
      }

      if (transaction.status === 'completed') {
        console.log(`ℹ️ Transaction already completed: ${transaction.transaction_id}`);
        return res.status(200).json({ status: 'already_completed' });
      }

      // Update transaction
      transaction.razorpay_payment_id = paymentId;
      transaction.razorpay_signature = 'webhook_verified';
      transaction.status = 'completed';
      transaction.updated_at = new Date();
      await transaction.save();

      // Activate subscription
      const plan = SUBSCRIPTION_PLANS[transaction.plan_id];
      const startDate = new Date();
      const endDate = calculateEndDate(transaction.plan_id, startDate);

      const subscriptionData = {
        plan_type: transaction.plan_id,
        start_date: startDate,
        end_date: endDate,
        status: 'active',
        razorpay_subscription_id: paymentId,
        amount_paid: transaction.amount / 100
      };

      await User.findByIdAndUpdate(
        transaction.user_id,
        {
          $set: { subscription: subscriptionData },
          $currentDate: { updated_at: true }
        }
      );

      console.log(`✅ Webhook processed: Transaction ${transaction.transaction_id} completed and subscription activated`);
      return res.status(200).json({ status: 'completed' });
    }

    if (event === 'payment.failed') {
      const payment = payload?.payment?.entity;
      const orderId = payment?.order_id;
      
      if (orderId) {
        await SubscriptionTransaction.updateOne(
          { razorpay_order_id: orderId },
          { 
            $set: { 
              status: 'failed',
              updated_at: new Date()
            }
          }
        );
        console.log(`❌ Payment failed: Transaction marked as failed for order ${orderId}`);
      }
      
      return res.status(200).json({ status: 'payment_failed_processed' });
    }

    console.log(`ℹ️ Unhandled webhook event: ${event}`);
    return res.status(200).json({ status: 'ignored' });

  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// @route   GET /api/subscription/status
// @desc    Get current subscription status
// @access  Private
router.get('/status', auth, (req, res) => {
  try {
    const hasActiveSubscription = req.user.hasActiveSubscription();
    const subscriptionInfo = req.user.getSubscriptionInfo();

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
      amount: transaction.amount / 100,
      currency: transaction.currency,
      status: transaction.status,
      razorpay_order_id: transaction.razorpay_order_id,
      razorpay_payment_id: transaction.razorpay_payment_id,
      created_at: transaction.created_at,
      updated_at: transaction.updated_at
    }));

    res.json({
      success: true,
      data: { transactions: formattedTransactions }
    });

  } catch (error) {
    console.error('Get subscription history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get subscription history'
    });
  }
});

module.exports = router;