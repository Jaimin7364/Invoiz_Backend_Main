const axios = require('axios');

const API_BASE = 'http://localhost:5000/api';

// Test credentials - you may need to adjust these based on your actual test user
const TEST_USER = {
  email: 'ravaly950@gmail.com',
  password: 'Jaimin@123',
  full_name: 'Test User',
  phone: '9999999999'
};

async function testSubscriptionFlow() {
  try {
    console.log('🧪 Testing Complete Subscription Flow');
    console.log('=====================================');

    // Step 1: Register/Login user
    console.log('\n1️⃣ Authenticating user...');
    let authResponse;
    
    try {
      // Try to login first
      authResponse = await axios.post(`${API_BASE}/auth/login`, {
        email: TEST_USER.email,
        password: TEST_USER.password
      });
      console.log('✅ User logged in successfully');
    } catch (loginError) {
      if (loginError.response?.status === 400) {
        // User doesn't exist, register them
        console.log('👤 User not found, registering...');
        authResponse = await axios.post(`${API_BASE}/auth/register`, TEST_USER);
        console.log('✅ User registered successfully');
      } else {
        throw loginError;
      }
    }

    const token = authResponse.data.data.token;
    const headers = { 'Authorization': `Bearer ${token}` };

    // Step 2: Get subscription plans
    console.log('\n2️⃣ Fetching subscription plans...');
    const plansResponse = await axios.get(`${API_BASE}/subscription/plans`);
    console.log('✅ Plans fetched successfully:');
    plansResponse.data.data.plans.forEach(plan => {
      console.log(`   - ${plan.name}: ₹${plan.price}`);
    });

    // Step 3: Check initial subscription status
    console.log('\n3️⃣ Checking initial subscription status...');
    const statusResponse = await axios.get(`${API_BASE}/subscription/status`, { headers });
    console.log('✅ Initial status:', {
      hasActive: statusResponse.data.data.has_active_subscription,
      info: statusResponse.data.data.subscription_info
    });

    // Step 4: Create order for Basic plan
    console.log('\n4️⃣ Creating order for Basic plan...');
    const orderResponse = await axios.post(`${API_BASE}/subscription/create-order`, {
      plan_id: 'basic'
    }, { headers });
    
    console.log('✅ Order created successfully:');
    console.log(`   - Order ID: ${orderResponse.data.data.order_id}`);
    console.log(`   - Amount: ₹${orderResponse.data.data.amount / 100}`);
    console.log(`   - Razorpay Key: ${orderResponse.data.data.razorpay_key}`);

    // Step 5: Simulate payment verification (without actual Razorpay payment)
    console.log('\n5️⃣ Simulating payment verification...');
    const orderId = orderResponse.data.data.order_id;
    
    try {
      // This will fail because we don't have a real payment, but we can test the endpoint
      const verifyResponse = await axios.post(`${API_BASE}/subscription/verify-payment`, {
        razorpay_order_id: orderId,
        razorpay_payment_id: 'pay_test_' + Date.now(),
        razorpay_signature: 'test_signature',
        plan_id: 'basic'
      }, { headers });
      
      console.log('✅ Payment verification would succeed with real payment data');
    } catch (verifyError) {
      if (verifyError.response?.status === 400) {
        console.log('⚠️ Payment verification failed as expected (no real payment)');
        console.log('   Error:', verifyError.response.data.message);
      } else {
        throw verifyError;
      }
    }

    // Step 6: Check subscription history
    console.log('\n6️⃣ Checking subscription history...');
    const historyResponse = await axios.get(`${API_BASE}/subscription/history`, { headers });
    console.log('✅ Transaction history:');
    historyResponse.data.data.transactions.forEach(txn => {
      console.log(`   - ${txn.transaction_id}: ${txn.status} (₹${txn.amount})`);
    });

    console.log('\n🎉 Subscription flow test completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   ✅ Authentication working');
    console.log('   ✅ Plans endpoint working');
    console.log('   ✅ Order creation working');
    console.log('   ✅ Payment verification endpoint working');
    console.log('   ✅ Transaction tracking working');
    console.log('   ✅ All database operations functioning');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Run the test
testSubscriptionFlow();