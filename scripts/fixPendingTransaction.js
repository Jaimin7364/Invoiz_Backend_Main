/**
 * Test script to manually fix a pending transaction
 * Run with: node scripts/fixPendingTransaction.js <transaction_id>
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const { SubscriptionTransaction } = require('../models/Subscription');
const { calculateSubscriptionEndDate } = require('../utils/razorpayService');

async function fixPendingTransaction(transactionId) {
  try {
    console.log('🔧 Fixing pending transaction:', transactionId);
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Find the transaction
    const transaction = await SubscriptionTransaction.findOne({
      transaction_id: transactionId
    });

    if (!transaction) {
      console.log('❌ Transaction not found');
      return;
    }

    console.log('📋 Transaction Details:');
    console.log(`  - ID: ${transaction.transaction_id}`);
    console.log(`  - Order ID: ${transaction.razorpay_order_id}`);
    console.log(`  - Status: ${transaction.status}`);
    console.log(`  - Amount: ${transaction.amount / 100} INR`);
    console.log(`  - Plan: ${transaction.plan_id}`);
    console.log(`  - User ID: ${transaction.user_id}`);

    if (transaction.status === 'completed') {
      console.log('✅ Transaction is already completed');
      return;
    }

    // Find the user
    const user = await User.findById(transaction.user_id);
    if (!user) {
      console.log('❌ User not found');
      return;
    }

    console.log('👤 User:', user.email);

    // Update transaction
    transaction.status = 'completed';
    transaction.updated_at = new Date();
    
    // Add a dummy payment ID if not present
    if (!transaction.razorpay_payment_id) {
      transaction.razorpay_payment_id = `pay_manual_${Date.now()}`;
    }
    
    await transaction.save();
    console.log('✅ Transaction updated to completed');

    // Create subscription
    const startDate = new Date();
    const endDate = calculateSubscriptionEndDate(transaction.plan_id, startDate);
    
    const subscriptionData = {
      plan_type: transaction.plan_id,
      start_date: startDate,
      end_date: endDate,
      status: 'active',
      razorpay_subscription_id: transaction.razorpay_payment_id,
      amount_paid: transaction.amount / 100
    };

    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { 
        $set: { subscription: subscriptionData },
        $currentDate: { updated_at: true }
      },
      { new: true }
    );

    console.log('✅ User subscription created');
    console.log('📊 Subscription Details:');
    console.log(`  - Plan: ${subscriptionData.plan_type}`);
    console.log(`  - Start: ${subscriptionData.start_date}`);
    console.log(`  - End: ${subscriptionData.end_date}`);
    console.log(`  - Status: ${subscriptionData.status}`);

    // Verify
    const hasActive = updatedUser.hasActiveSubscription();
    console.log('✅ User has active subscription:', hasActive);

    console.log('🎉 Transaction fix completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Get transaction ID from command line arguments
const transactionId = process.argv[2];

if (!transactionId) {
  console.log('Usage: node scripts/fixPendingTransaction.js <transaction_id>');
  console.log('Example: node scripts/fixPendingTransaction.js TXN_1760245367982_rb7v29ttf');
  process.exit(1);
}

fixPendingTransaction(transactionId);