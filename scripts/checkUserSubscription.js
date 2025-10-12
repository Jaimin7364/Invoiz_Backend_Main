/**
 * Quick test script to check specific user subscription
 * Run with: node scripts/checkUserSubscription.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function checkUserSubscription() {
  try {
    console.log('🔍 Checking user subscription...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Find the specific user
    const userEmail = 'rr9408084@gmail.com';
    const user = await User.findOne({ email: userEmail });
    
    if (!user) {
      console.log('❌ User not found');
      return;
    }

    console.log('\n📋 User Information:');
    console.log(`  - ID: ${user._id}`);
    console.log(`  - Email: ${user.email}`);
    console.log(`  - User ID: ${user.user_id}`);
    console.log(`  - Full Name: ${user.full_name}`);

    console.log('\n📊 Raw Subscription Data:');
    console.log(JSON.stringify(user.subscription, null, 2));

    console.log('\n🔍 Subscription Analysis:');
    console.log(`  - Subscription exists: ${user.subscription != null}`);
    
    if (user.subscription) {
      console.log(`  - Plan Type: ${user.subscription.plan_type}`);
      console.log(`  - Status: ${user.subscription.status}`);
      console.log(`  - Start Date: ${user.subscription.start_date}`);
      console.log(`  - End Date: ${user.subscription.end_date}`);
      console.log(`  - Amount Paid: ${user.subscription.amount_paid}`);
      console.log(`  - Razorpay ID: ${user.subscription.razorpay_subscription_id}`);

      console.log('\n⏰ Date Analysis:');
      const now = new Date();
      const endDate = new Date(user.subscription.end_date);
      const isEndDateFuture = endDate > now;
      
      console.log(`  - Current Date: ${now}`);
      console.log(`  - End Date: ${endDate}`);
      console.log(`  - End Date is in future: ${isEndDateFuture}`);
      console.log(`  - Status is active: ${user.subscription.status === 'active'}`);

      console.log('\n🧮 Method Results:');
      const hasActiveFromMethod = user.hasActiveSubscription();
      const subscriptionInfoFromMethod = user.getSubscriptionInfo();
      
      console.log(`  - hasActiveSubscription(): ${hasActiveFromMethod}`);
      console.log(`  - getSubscriptionInfo():`, subscriptionInfoFromMethod);

      console.log('\n📅 Days Calculation:');
      if (user.subscription.end_date) {
        const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const timeDiff = endDate.getTime() - nowStart.getTime();
        const daysRemaining = Math.max(0, Math.floor(timeDiff / (1000 * 60 * 60 * 24)));
        console.log(`  - Calculated days remaining: ${daysRemaining}`);
      }
    }

    console.log('\n✅ Analysis complete');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run the check
checkUserSubscription();