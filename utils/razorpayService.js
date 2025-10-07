const Razorpay = require('razorpay');
const crypto = require('crypto');

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Subscription Plans Configuration
const SUBSCRIPTION_PLANS = {
  basic: {
    name: 'Basic Plan',
    price: 100, // Amount in paise (₹1)
    duration_months: 1,
    features: [
      'Up to 50 invoices per month',
      'Basic invoice templates',
      'Customer management',
      'Payment tracking',
      'Email support'
    ]
  },
  pro: {
    name: 'Pro Plan',
    price: 54900, // Amount in paise (₹549)
    duration_months: 6,
    features: [
      'Up to 500 invoices per month',
      'Premium invoice templates',
      'Advanced customer management',
      'Payment tracking & reminders',
      'Inventory management',
      'Reports & analytics',
      'Priority email support'
    ]
  },
  premium: {
    name: 'Premium Plan',
    price: 99900, // Amount in paise (₹999)
    duration_months: 12,
    features: [
      'Unlimited invoices',
      'All premium templates',
      'Advanced customer & vendor management',
      'Automated payment reminders',
      'Advanced inventory management',
      'Detailed reports & analytics',
      'GST compliance features',
      'Phone & email support'
    ]
  },
  enterprise: {
    name: 'Enterprise Plan',
    price: 249900, // Amount in paise (₹2499)
    duration_months: 36,
    features: [
      'Everything in Premium',
      'Multi-location support',
      'Custom invoice templates',
      'API access',
      'Advanced integrations',
      'Dedicated account manager',
      '24/7 priority support',
      'Custom reporting'
    ]
  }
};

// Create Razorpay order
const createOrder = async (planType, userDetails) => {
  try {
    const plan = SUBSCRIPTION_PLANS[planType];
    if (!plan) {
      throw new Error('Invalid subscription plan');
    }

    const options = {
      amount: plan.price,
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
      notes: {
        plan_type: planType,
        user_id: userDetails.user_id,
        duration_months: plan.duration_months
      }
    };

    const order = await razorpay.orders.create(options);
    
    return {
      success: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      plan_details: plan
    };
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    throw new Error('Failed to create payment order');
  }
};

// Verify payment signature
const verifyPaymentSignature = (orderId, paymentId, signature) => {
  try {
    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    return expectedSignature === signature;
  } catch (error) {
    console.error('Error verifying payment signature:', error);
    return false;
  }
};

// Calculate subscription end date
const calculateSubscriptionEndDate = (planType, startDate = new Date()) => {
  const plan = SUBSCRIPTION_PLANS[planType];
  if (!plan) {
    throw new Error('Invalid subscription plan');
  }

  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + plan.duration_months);
  
  return endDate;
};

// Get plan details
const getPlanDetails = (planType) => {
  return SUBSCRIPTION_PLANS[planType] || null;
};

// Get all available plans
const getAllPlans = () => {
  return Object.keys(SUBSCRIPTION_PLANS).map(key => ({
    plan_id: key,
    ...SUBSCRIPTION_PLANS[key],
    price_inr: SUBSCRIPTION_PLANS[key].price / 100 // Convert paise to rupees
  }));
};

// Format price for display
const formatPrice = (priceInPaise) => {
  return `₹${(priceInPaise / 100).toLocaleString('en-IN')}`;
};

module.exports = {
  razorpay,
  SUBSCRIPTION_PLANS,
  createOrder,
  verifyPaymentSignature,
  calculateSubscriptionEndDate,
  getPlanDetails,
  getAllPlans,
  formatPrice
};