const mongoose = require('mongoose');
const { SubscriptionPlan } = require('../models/Subscription');
require('dotenv').config();

const subscriptionPlans = [
  {
    plan_id: 'basic',
    name: 'Basic Plan',
    description: 'Perfect for small businesses just getting started',
    price: 10000, // ₹100 in paise
    duration_months: 1,
    features: [
      'Up to 50 invoices per month',
      'Basic invoice templates',
      'Customer management',
      'Payment tracking',
      'Email support'
    ],
    is_active: true
  },
  {
    plan_id: 'pro',
    name: 'Pro Plan',
    description: 'Great for growing businesses with more features',
    price: 54900, // ₹549 in paise
    duration_months: 6,
    features: [
      'Up to 500 invoices per month',
      'Premium invoice templates',
      'Advanced customer management',
      'Payment tracking & reminders',
      'Inventory management',
      'Reports & analytics',
      'Priority email support'
    ],
    is_active: true
  },
  {
    plan_id: 'premium',
    name: 'Premium Plan',
    description: 'Comprehensive solution for established businesses',
    price: 99900, // ₹999 in paise
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
    ],
    is_active: true
  },
  {
    plan_id: 'enterprise',
    name: 'Enterprise Plan',
    description: 'Complete solution for large businesses and franchises',
    price: 249900, // ₹2499 in paise
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
    ],
    is_active: true
  }
];

const initializeSubscriptionPlans = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Clear existing plans
    await SubscriptionPlan.deleteMany({});
    console.log('🗑️ Cleared existing subscription plans');

    // Insert new plans
    await SubscriptionPlan.insertMany(subscriptionPlans);
    console.log('✅ Subscription plans initialized successfully');

    // Display plans
    const plans = await SubscriptionPlan.find({});
    console.log('\n📋 Available Subscription Plans:');
    plans.forEach(plan => {
      console.log(`\n${plan.name} (${plan.plan_id})`);
      console.log(`Price: ₹${plan.price / 100}`);
      console.log(`Duration: ${plan.duration_months} months`);
      console.log(`Features: ${plan.features.length} features`);
    });

    console.log('\n✅ Initialization completed successfully!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error initializing subscription plans:', error);
    process.exit(1);
  }
};

// Run the initialization
if (require.main === module) {
  initializeSubscriptionPlans();
}

module.exports = { initializeSubscriptionPlans };