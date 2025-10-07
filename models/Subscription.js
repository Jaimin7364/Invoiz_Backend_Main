const mongoose = require('mongoose');

const subscriptionPlanSchema = new mongoose.Schema({
  plan_id: {
    type: String,
    unique: true,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  description: String,
  price: {
    type: Number,
    required: true
  },
  duration_months: {
    type: Number,
    required: true
  },
  features: [String],
  razorpay_plan_id: String,
  is_active: {
    type: Boolean,
    default: true
  },
  created_at: {
    type: Date,
    default: Date.now
  }
});

const subscriptionTransactionSchema = new mongoose.Schema({
  transaction_id: {
    type: String,
    unique: true,
    required: true,
    default: function() {
      return 'TXN_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  plan_id: {
    type: String,
    required: true
  },
  razorpay_payment_id: String,
  razorpay_order_id: String,
  razorpay_signature: String,
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'INR'
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  payment_method: String,
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

const SubscriptionPlan = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
const SubscriptionTransaction = mongoose.model('SubscriptionTransaction', subscriptionTransactionSchema);

module.exports = {
  SubscriptionPlan,
  SubscriptionTransaction
};