/**
 * Test the auth endpoint to see what's being returned
 * Run with: node scripts/testAuthEndpoint.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function testAuthEndpoint() {
  try {
    console.log('🧪 Testing auth endpoint response...');
    
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

    console.log('\n📡 Simulating Auth Response:');
    
    // This is what gets returned by the auth endpoint
    const subscriptionInfo = user.getSubscriptionInfo();
    console.log('getSubscriptionInfo() result:', subscriptionInfo);
    
    const authResponse = {
      success: true,
      data: {
        user_id: user.user_id,
        full_name: user.full_name,
        email: user.email,
        mobile_number: user.mobile_number,
        role: user.role,
        account_status: user.account_status,
        email_verified: user.email_verified,
        business_id: user.business_id,
        last_login: user.last_login,
        created_at: user.created_at,
        subscription_info: subscriptionInfo  // This is the key field
      }
    };

    console.log('\n📤 Full Auth Response:');
    console.log(JSON.stringify(authResponse, null, 2));

    console.log('\n🔍 Key Analysis:');
    console.log(`  - subscription_info exists: ${authResponse.data.subscription_info != null}`);
    console.log(`  - subscription_info type: ${typeof authResponse.data.subscription_info}`);
    if (authResponse.data.subscription_info) {
      console.log(`  - plan_type: ${authResponse.data.subscription_info.plan_type}`);
      console.log(`  - status: ${authResponse.data.subscription_info.status}`);
      console.log(`  - days_remaining: ${authResponse.data.subscription_info.days_remaining}`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run the test
testAuthEndpoint();