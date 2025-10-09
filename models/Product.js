const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: [100, 'Product name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  category: {
    type: String,
    required: [true, 'Product category is required'],
    trim: true,
    maxlength: [50, 'Category cannot exceed 50 characters']
  },
  price: {
    type: Number,
    required: [true, 'Product price is required'],
    min: [0, 'Price cannot be negative'],
    validate: {
      validator: function(value) {
        return Number.isFinite(value) && value >= 0;
      },
      message: 'Price must be a valid positive number'
    }
  },
  cost: {
    type: Number,
    default: 0,
    min: [0, 'Cost cannot be negative'],
    validate: {
      validator: function(value) {
        return Number.isFinite(value) && value >= 0;
      },
      message: 'Cost must be a valid positive number'
    }
  },
  unit: {
    type: String,
    default: 'piece',
    trim: true,
    maxlength: [20, 'Unit cannot exceed 20 characters']
  },
  sku: {
    type: String,
    trim: true,
    unique: true,
    sparse: true, // Allows multiple null values
    maxlength: [50, 'SKU cannot exceed 50 characters']
  },
  brand: {
    type: String,
    trim: true,
    maxlength: [50, 'Brand cannot exceed 50 characters']
  },
  weight: {
    type: String,
    trim: true,
    maxlength: [20, 'Weight cannot exceed 20 characters']
  },
  dimensions: {
    type: String,
    trim: true,
    maxlength: [50, 'Dimensions cannot exceed 50 characters']
  },
  barcode: {
    type: String,
    trim: true,
    maxlength: [20, 'Barcode cannot exceed 20 characters']
  },
  expiryDate: {
    type: Date
  },
  unitCapacity: {
    type: Number,
    min: [0, 'Unit capacity cannot be negative']
  },
  capacityUnit: {
    type: String,
    trim: true,
    maxlength: [20, 'Capacity unit cannot exceed 20 characters']
  },
  taxRate: {
    type: Number,
    default: 0,
    min: [0, 'Tax rate cannot be negative'],
    max: [100, 'Tax rate cannot exceed 100%'],
    validate: {
      validator: function(value) {
        return Number.isFinite(value) && value >= 0 && value <= 100;
      },
      message: 'Tax rate must be between 0 and 100'
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  stockQuantity: {
    type: Number,
    default: 0,
    min: [0, 'Stock quantity cannot be negative'],
    validate: {
      validator: function(value) {
        return Number.isInteger(value) && value >= 0;
      },
      message: 'Stock quantity must be a non-negative integer'
    }
  },
  minimumStock: {
    type: Number,
    default: 0,
    min: [0, 'Minimum stock cannot be negative'],
    validate: {
      validator: function(value) {
        return Number.isInteger(value) && value >= 0;
      },
      message: 'Minimum stock must be a non-negative integer'
    }
  },
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: false,
    default: null
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required']
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for profit margin
productSchema.virtual('profitMargin').get(function() {
  if (this.cost > 0) {
    return ((this.price - this.cost) / this.cost * 100).toFixed(2);
  }
  return 0;
});

// Virtual for tax amount
productSchema.virtual('taxAmount').get(function() {
  return (this.price * this.taxRate / 100).toFixed(2);
});

// Virtual for price including tax
productSchema.virtual('priceIncludingTax').get(function() {
  return (this.price + (this.price * this.taxRate / 100)).toFixed(2);
});

// Virtual for low stock status
productSchema.virtual('isLowStock').get(function() {
  return this.stockQuantity <= this.minimumStock;
});

// Index for better performance
productSchema.index({ businessId: 1, userId: 1 });
productSchema.index({ name: 1, businessId: 1 });
productSchema.index({ category: 1, businessId: 1 });
productSchema.index({ sku: 1 }, { unique: true, sparse: true });

// Pre-save middleware to generate SKU if not provided
productSchema.pre('save', function(next) {
  if (!this.sku) {
    // Generate a simple SKU based on product name and timestamp
    const namePrefix = this.name.substring(0, 3).toUpperCase();
    const timestamp = Date.now().toString().slice(-6);
    this.sku = `${namePrefix}${timestamp}`;
  }
  next();
});

module.exports = mongoose.model('Product', productSchema);