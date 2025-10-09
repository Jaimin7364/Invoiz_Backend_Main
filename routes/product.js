const express = require('express');
const Product = require('../models/Product');
const Business = require('../models/Business');
const { auth } = require('../middleware/auth');
const router = express.Router();

// GET /api/products - Get all products for the authenticated user
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10, search, category, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    
    // Get user's business (optional for products)
    const business = await Business.findOne({ user_id: req.user._id });
    const businessId = business ? business._id : null;
    
    // Build query
    const query = { 
      userId: req.user._id,
      businessId: businessId 
    };

    // Add search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } }
      ];
    }

    // Add category filter
    if (category) {
      query.category = { $regex: category, $options: 'i' };
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query
    const products = await Product.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / parseInt(limit));

    res.json({
      success: true,
      data: {
        products,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalProducts,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1
        }
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
      error: error.message
    });
  }
});

// GET /api/products/categories - Get unique categories for the authenticated user
router.get('/categories', auth, async (req, res) => {
  try {
    // Get user's business (optional for products)
    const business = await Business.findOne({ user_id: req.user._id });
    const businessId = business ? business._id : null;

    const categories = await Product.distinct('category', {
      userId: req.user._id,
      businessId: businessId
    });

    res.json({
      success: true,
      data: categories.filter(cat => cat && cat.trim() !== '')
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: error.message
    });
  }
});

// GET /api/products/low-stock - Get products with low stock
router.get('/low-stock', auth, async (req, res) => {
  try {
    // Get user's business (optional for products)
    const business = await Business.findOne({ user_id: req.user._id });
    const businessId = business ? business._id : null;

    const products = await Product.find({
      userId: req.user._id,
      businessId: businessId,
      $expr: { $lte: ['$stockQuantity', '$minimumStock'] }
    }).lean();

    res.json({
      success: true,
      data: products
    });
  } catch (error) {
    console.error('Get low stock products error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch low stock products',
      error: error.message
    });
  }
});

// GET /api/products/:id - Get a specific product
router.get('/:id', auth, async (req, res) => {
  try {
    // Get user's business (optional for products)
    const business = await Business.findOne({ user_id: req.user._id });
    const businessId = business ? business._id : null;

    const product = await Product.findOne({
      _id: req.params.id,
      userId: req.user._id,
      businessId: businessId
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product',
      error: error.message
    });
  }
});

// POST /api/products - Create a new product
router.post('/', auth, async (req, res) => {
  try {
    const {
      name,
      description,
      category,
      price,
      cost,
      unit,
      sku,
      taxRate,
      stockQuantity,
      minimumStock
    } = req.body;

    // Validate required fields
    if (!name || !category || price === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Name, category, and price are required fields'
      });
    }

    // Check if SKU already exists (if provided)
    if (sku) {
      const existingProduct = await Product.findOne({ sku });
      if (existingProduct) {
        return res.status(400).json({
          success: false,
          message: 'SKU already exists'
        });
      }
    }

    // Get user's business (optional for products)
    const business = await Business.findOne({ user_id: req.user._id });
    const businessId = business ? business._id : null;

    const product = new Product({
      name: name.trim(),
      description: description?.trim(),
      category: category.trim(),
      price: parseFloat(price),
      cost: cost ? parseFloat(cost) : 0,
      unit: unit?.trim() || 'piece',
      sku: sku?.trim(),
      taxRate: taxRate ? parseFloat(taxRate) : 0,
      stockQuantity: stockQuantity ? parseInt(stockQuantity) : 0,
      minimumStock: minimumStock ? parseInt(minimumStock) : 0,
      userId: req.user._id,
      businessId: businessId
    });

    await product.save();

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product
    });
  } catch (error) {
    console.error('Create product error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'SKU already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create product',
      error: error.message
    });
  }
});

// PUT /api/products/:id - Update a product
router.put('/:id', auth, async (req, res) => {
  try {
    const {
      name,
      description,
      category,
      price,
      cost,
      unit,
      sku,
      taxRate,
      stockQuantity,
      minimumStock,
      isActive
    } = req.body;

    // Get user's business (optional for products)
    const business = await Business.findOne({ user_id: req.user._id });
    const businessId = business ? business._id : null;

    // Find the product
    const product = await Product.findOne({
      _id: req.params.id,
      userId: req.user._id,
      businessId: businessId
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check if SKU already exists (if being changed)
    if (sku && sku !== product.sku) {
      const existingProduct = await Product.findOne({ sku });
      if (existingProduct) {
        return res.status(400).json({
          success: false,
          message: 'SKU already exists'
        });
      }
    }

    // Update fields
    if (name !== undefined) product.name = name.trim();
    if (description !== undefined) product.description = description?.trim();
    if (category !== undefined) product.category = category.trim();
    if (price !== undefined) product.price = parseFloat(price);
    if (cost !== undefined) product.cost = parseFloat(cost);
    if (unit !== undefined) product.unit = unit.trim();
    if (sku !== undefined) product.sku = sku?.trim();
    if (taxRate !== undefined) product.taxRate = parseFloat(taxRate);
    if (stockQuantity !== undefined) product.stockQuantity = parseInt(stockQuantity);
    if (minimumStock !== undefined) product.minimumStock = parseInt(minimumStock);
    if (isActive !== undefined) product.isActive = Boolean(isActive);

    await product.save();

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: product
    });
  } catch (error) {
    console.error('Update product error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'SKU already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update product',
      error: error.message
    });
  }
});

// DELETE /api/products/:id - Delete a product
router.delete('/:id', auth, async (req, res) => {
  try {
    // Get user's business (optional for products)
    const business = await Business.findOne({ user_id: req.user._id });
    const businessId = business ? business._id : null;

    const product = await Product.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
      businessId: businessId
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete product',
      error: error.message
    });
  }
});

// POST /api/products/:id/update-stock - Update product stock
router.post('/:id/update-stock', auth, async (req, res) => {
  try {
    const { quantity, operation = 'set' } = req.body;

    if (quantity === undefined || !['set', 'add', 'subtract'].includes(operation)) {
      return res.status(400).json({
        success: false,
        message: 'Valid quantity and operation (set, add, subtract) are required'
      });
    }

    // Get user's business (optional for products)
    const business = await Business.findOne({ user_id: req.user._id });
    const businessId = business ? business._id : null;

    const product = await Product.findOne({
      _id: req.params.id,
      userId: req.user._id,
      businessId: businessId
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const qty = parseInt(quantity);
    
    switch (operation) {
      case 'set':
        product.stockQuantity = qty;
        break;
      case 'add':
        product.stockQuantity += qty;
        break;
      case 'subtract':
        product.stockQuantity = Math.max(0, product.stockQuantity - qty);
        break;
    }

    await product.save();

    res.json({
      success: true,
      message: 'Stock updated successfully',
      data: {
        productId: product._id,
        newStockQuantity: product.stockQuantity,
        isLowStock: product.isLowStock
      }
    });
  } catch (error) {
    console.error('Update stock error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update stock',
      error: error.message
    });
  }
});

module.exports = router;