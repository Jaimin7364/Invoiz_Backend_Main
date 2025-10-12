/**
 * Test script to verify subscription flow and database operations
 * Run with: node scripts/testSubscriptionFlow.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const { SubscriptionTransaction } = require('../models/Subscription');
const { calculateSubscriptionEndDate, getPlanDetails } = require('../utils/razorpayService');

async function testSubscriptionFlow() {
  try {
    console.log('🧪 Starting subscription flow test...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Test 1: Create a test user
    console.log('\n📝 Test 1: Creating test user...');
    const testUser = new User({
      full_name: 'Test User',
      email: `test_${Date.now()}@example.com`,
      mobile_number: `987654${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
      password_hash: 'testpassword123',
      email_verified: true,
      account_status: 'Active'
    });
    
    await testUser.save();
    console.log(`✅ Test user created: ${testUser.email}`);

    // Test 2: Test subscription calculation
    console.log('\n📅 Test 2: Testing subscription calculations...');
    const planType = 'pro';
    const startDate = new Date();
    const endDate = calculateSubscriptionEndDate(planType, startDate);
    const planDetails = getPlanDetails(planType);
    
    console.log(`Plan: ${planDetails.name}`);
    console.log(`Start Date: ${startDate}`);
    console.log(`End Date: ${endDate}`);
    console.log(`Duration: ${planDetails.duration_months} months`);

    // Test 3: Create transaction record
    console.log('\n💳 Test 3: Creating transaction record...');
    const transaction = new SubscriptionTransaction({
      user_id: testUser._id,
      plan_id: planType,
      razorpay_order_id: `order_test_${Date.now()}`,
      amount: planDetails.price * 100, // Convert to paise
      status: 'pending'
    });
    
    await transaction.save();
    console.log(`✅ Transaction created: ${transaction.transaction_id}`);

    // Test 4: Update user subscription using session (simulating payment verification)
    console.log('\n🔄 Test 4: Testing subscription update with transaction...');
    
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Update transaction to completed
      transaction.razorpay_payment_id = `pay_test_${Date.now()}`;
      transaction.razorpay_signature = `sig_test_${Date.now()}`;
      transaction.status = 'completed';
      await transaction.save({ session });

      // Update user subscription
      const subscriptionData = {
        plan_type: planType,
        start_date: startDate,
        end_date: endDate,
        status: 'active',
        razorpay_subscription_id: transaction.razorpay_payment_id,
        amount_paid: transaction.amount / 100
      };

      const updatedUser = await User.findByIdAndUpdate(
        testUser._id,
        { 
          $set: { subscription: subscriptionData },
          $currentDate: { updated_at: true }
        },
        { new: true, session }
      );

      await session.commitTransaction();
      session.endSession();

      console.log('✅ Transaction committed successfully');

      // Test 5: Verify subscription is active
      console.log('\n✅ Test 5: Verifying subscription status...');
      
      const freshUser = await User.findById(testUser._id);
      const hasActive = freshUser.hasActiveSubscription();
      const subscriptionInfo = freshUser.getSubscriptionInfo();

      console.log(`Has Active Subscription: ${hasActive}`);
      console.log(`Subscription Info:`, subscriptionInfo);
      console.log(`Raw Subscription Data:`, freshUser.subscription);

      // Test 6: Test concurrent updates (simulate race condition)
      console.log('\n🏃 Test 6: Testing concurrent subscription updates...');
      
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          User.findByIdAndUpdate(
            testUser._id,
            { 
              $set: { 
                [`subscription.test_field_${i}`]: `test_value_${i}`,
                'updated_at': new Date()
              }
            },
            { new: true }
          )
        );
      }

      const results = await Promise.all(promises);
      console.log('✅ Concurrent updates completed successfully');

      // Verify subscription is still intact
      const finalUser = await User.findById(testUser._id);
      const finalHasActive = finalUser.hasActiveSubscription();
      console.log(`Subscription still active after concurrent updates: ${finalHasActive}`);

      // Test 7: Check database indexes and performance
      console.log('\n📊 Test 7: Checking database performance...');
      
      const start = Date.now();
      const userLookup = await User.findById(testUser._id);
      const lookupTime = Date.now() - start;
      
      console.log(`User lookup time: ${lookupTime}ms`);
      
      if (lookupTime > 100) {
        console.log('⚠️ Warning: User lookup is slow, consider adding indexes');
      } else {
        console.log('✅ User lookup performance is good');
      }

      console.log('\n🎉 All tests completed successfully!');
      console.log('\n📋 Summary:');
      console.log(`- User created: ${testUser.email}`);
      console.log(`- Transaction ID: ${transaction.transaction_id}`);
      console.log(`- Subscription active: ${finalHasActive}`);
      console.log(`- Plan: ${subscriptionInfo.plan_type}`);
      console.log(`- End date: ${subscriptionInfo.end_date}`);
      console.log(`- Days remaining: ${subscriptionInfo.days_remaining}`);

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

// Run the test
testSubscriptionFlow();