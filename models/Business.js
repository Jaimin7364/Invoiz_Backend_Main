const mongoose = require('mongoose');

const businessSchema = new mongoose.Schema({
  business_id: {
    type: String,
    unique: true,
    required: true,
    default: function() {
      return 'BIZ_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true // One business per user
  },
  business_name: {
    type: String,
    required: [true, 'Business name is required'],
    trim: true,
    maxlength: [200, 'Business name cannot exceed 200 characters']
  },
  business_type: {
    type: String,
    required: [true, 'Business type is required'],
    enum: [
      'Grocery',
      'Electronics',
      'Pharmacy',
      'Restaurant',
      'Clothing',
      'Hardware',
      'Stationery',
      'Mobile Shop',
      'Medical Store',
      'General Store',
      'Automobile',
      'Beauty & Cosmetics',
      'Books & Media',
      'Furniture',
      'Jewelry',
      'Sports & Fitness',
      'Toys & Games',
      'Other'
    ]
  },
  business_address: {
    street: {
      type: String,
      required: [true, 'Street address is required'],
      trim: true
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true
    },
    state: {
      type: String,
      required: [true, 'State is required'],
      trim: true
    },
    pincode: {
      type: String,
      required: [true, 'Pincode is required'],
      match: [/^[1-9][0-9]{5}$/, 'Please enter a valid 6-digit pincode']
    },
    country: {
      type: String,
      default: 'India'
    }
  },
  gst_number: {
    type: String,
    trim: true,
    uppercase: true,
    match: [/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Please enter a valid GST number'],
    default: null
  },
  upi_id: {
    type: String,
    required: [true, 'UPI ID is required for payments'],
    trim: true,
    lowercase: true,
    match: [/^[\w.-]+@[\w.-]+$/, 'Please enter a valid UPI ID']
  },
  business_logo: {
    type: String,
    default: null // Will store image URL or base64
  },
  contact_details: {
    phone: {
      type: String,
      match: [/^[6-9]\d{9}$/, 'Please enter a valid phone number']
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    website: {
      type: String,
      trim: true
    }
  },
  operating_hours: {
    monday: { open: String, close: String, is_closed: { type: Boolean, default: false } },
    tuesday: { open: String, close: String, is_closed: { type: Boolean, default: false } },
    wednesday: { open: String, close: String, is_closed: { type: Boolean, default: false } },
    thursday: { open: String, close: String, is_closed: { type: Boolean, default: false } },
    friday: { open: String, close: String, is_closed: { type: Boolean, default: false } },
    saturday: { open: String, close: String, is_closed: { type: Boolean, default: false } },
    sunday: { open: String, close: String, is_closed: { type: Boolean, default: true } }
  },
  business_status: {
    type: String,
    default: 'Active',
    enum: ['Active', 'Inactive', 'Suspended']
  },
  verification_status: {
    type: String,
    default: 'Pending',
    enum: ['Pending', 'Verified', 'Rejected']
  },
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

// Index for faster queries
businessSchema.index({ user_id: 1 });
businessSchema.index({ business_name: 1 });
businessSchema.index({ business_type: 1 });

// Virtual for full address
businessSchema.virtual('full_address').get(function() {
  const addr = this.business_address;
  return `${addr.street}, ${addr.city}, ${addr.state} - ${addr.pincode}, ${addr.country}`;
});

// Method to get business summary
businessSchema.methods.getSummary = function() {
  return {
    business_id: this.business_id,
    business_name: this.business_name,
    business_type: this.business_type,
    full_address: this.full_address,
    business_status: this.business_status,
    verification_status: this.verification_status
  };
};

module.exports = mongoose.model('Business', businessSchema);