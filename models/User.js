const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  user_id: {
    type: String,
    unique: true,
    required: true,
    default: function() {
      return 'USR_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
  },
  full_name: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    maxlength: [100, 'Full name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  mobile_number: {
    type: String,
    required: [true, 'Mobile number is required'],
    unique: true,
    match: [/^[6-9]\d{9}$/, 'Please enter a valid 10-digit mobile number']
  },
  password_hash: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  role: {
    type: String,
    default: 'Business Owner',
    enum: ['Business Owner', 'Admin']
  },
  account_status: {
    type: String,
    default: 'Inactive',
    enum: ['Active', 'Inactive', 'Suspended']
  },
  email_verified: {
    type: Boolean,
    default: false
  },
  otp: {
    code: String,
    expires_at: Date,
    attempts: { type: Number, default: 0 }
  },
  subscription: {
    plan_type: {
      type: String,
      enum: ['basic', 'pro', 'premium', 'enterprise'],
      required: false
    },
    start_date: Date,
    end_date: Date,
    status: {
      type: String,
      enum: ['active', 'expired', 'cancelled'],
      required: false
    },
    razorpay_subscription_id: String,
    amount_paid: Number
  },
  business_id: {
    type: String,
    default: null
  },
  last_login: Date,
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

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password_hash')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password_hash = await bcrypt.hash(this.password_hash, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password_hash);
};

// Check if user has active subscription
userSchema.methods.hasActiveSubscription = function() {
  if (!this.subscription.end_date) return false;
  return this.subscription.status === 'active' && this.subscription.end_date > new Date();
};

// Get subscription details
userSchema.methods.getSubscriptionInfo = function() {
  let daysRemaining = 0;
  
  if (this.subscription.end_date) {
    const now = new Date();
    const endDate = new Date(this.subscription.end_date);
    
    // Set current date to start of day for accurate comparison
    const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Calculate difference in milliseconds
    const timeDiff = endDate.getTime() - nowStart.getTime();
    
    // Convert to days (if the subscription ends today, it's 0 days remaining)
    daysRemaining = Math.max(0, Math.floor(timeDiff / (1000 * 60 * 60 * 24)));
  }
  
  return {
    plan_type: this.subscription.plan_type,
    status: this.subscription.status,
    start_date: this.subscription.start_date,
    end_date: this.subscription.end_date,
    days_remaining: daysRemaining
  };
};

module.exports = mongoose.model('User', userSchema);