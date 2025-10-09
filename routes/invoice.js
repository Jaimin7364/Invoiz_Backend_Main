const express = require('express');
const Product = require('../models/Product');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/invoices/create
// @desc    Create invoice and update product stock quantities
// @access  Private
router.post('/create', auth, async (req, res) => {
  try {
    const { items, customerInfo, totalAmount, paymentMethod, discountAmount, discountType } = req.body;

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Items are required'
      });
    }

    if (!customerInfo || !customerInfo.name || !customerInfo.mobileNumber) {
      return res.status(400).json({
        success: false,
        message: 'Customer information (name and mobile number) is required'
      });
    }

    // Start a session for transaction to ensure data consistency
    const session = await Product.startSession();
    
    try {
      await session.withTransaction(async () => {
        // Check stock availability for all items first
        for (const item of items) {
          const product = await Product.findOne({
            _id: item.productId,
            userId: req.user._id
          }).session(session);

          if (!product) {
            throw new Error(`Product with ID ${item.productId} not found`);
          }

          if (product.stockQuantity < item.quantity) {
            throw new Error(`Insufficient stock for ${product.name}. Available: ${product.stockQuantity}, Required: ${item.quantity}`);
          }
        }

        // If all stock checks pass, update the quantities
        const stockUpdates = [];
        for (const item of items) {
          const updateResult = await Product.updateOne(
            { 
              _id: item.productId,
              userId: req.user._id 
            },
            { 
              $inc: { stockQuantity: -item.quantity },
              $set: { updatedAt: new Date() }
            },
            { session }
          );

          if (updateResult.modifiedCount === 0) {
            throw new Error(`Failed to update stock for product ${item.productId}`);
          }

          // Get updated product for response
          const updatedProduct = await Product.findById(item.productId).session(session);
          stockUpdates.push({
            productId: item.productId,
            productName: updatedProduct.name,
            oldStock: updatedProduct.stockQuantity + item.quantity,
            newStock: updatedProduct.stockQuantity,
            quantitySold: item.quantity
          });
        }

        // Generate invoice number
        const invoiceNumber = `INV-${Date.now()}`;

        // Create invoice data (for now we'll just return it, later we can save to database)
        const invoice = {
          invoiceNumber,
          invoiceDate: new Date(),
          customerInfo,
          items: items.map(item => {
            const updatedProduct = stockUpdates.find(u => u.productId === item.productId);
            return {
              ...item,
              productName: updatedProduct.productName
            };
          }),
          subtotal: items.reduce((sum, item) => sum + (item.price * item.quantity), 0),
          discountAmount: discountAmount || 0,
          discountType: discountType || 'flat',
          totalAmount,
          paymentMethod,
          stockUpdates,
          createdAt: new Date(),
          userId: req.user._id
        };

        res.json({
          success: true,
          message: 'Invoice created successfully and stock updated',
          data: {
            invoice,
            stockUpdates
          }
        });
      });
    } catch (error) {
      // Transaction will be automatically aborted on error
      throw error;
    } finally {
      await session.endSession();
    }

  } catch (error) {
    console.error('Create invoice error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create invoice',
      error: error.message
    });
  }
});

// @route   POST /api/invoices/update-stock
// @desc    Update product stock quantities (bulk update)
// @access  Private
router.post('/update-stock', auth, async (req, res) => {
  try {
    const { stockUpdates } = req.body;

    if (!stockUpdates || !Array.isArray(stockUpdates)) {
      return res.status(400).json({
        success: false,
        message: 'Stock updates array is required'
      });
    }

    const session = await Product.startSession();
    
    try {
      await session.withTransaction(async () => {
        const results = [];

        for (const update of stockUpdates) {
          const { productId, quantityChange } = update;

          // Validate the product belongs to the user
          const product = await Product.findOne({
            _id: productId,
            userId: req.user._id
          }).session(session);

          if (!product) {
            throw new Error(`Product with ID ${productId} not found`);
          }

          // Check if there's enough stock (for negative changes)
          if (quantityChange < 0 && product.stockQuantity < Math.abs(quantityChange)) {
            throw new Error(`Insufficient stock for ${product.name}. Available: ${product.stockQuantity}, Required: ${Math.abs(quantityChange)}`);
          }

          // Update the stock
          const updateResult = await Product.updateOne(
            { 
              _id: productId,
              userId: req.user._id 
            },
            { 
              $inc: { stockQuantity: quantityChange },
              $set: { updatedAt: new Date() }
            },
            { session }
          );

          if (updateResult.modifiedCount === 0) {
            throw new Error(`Failed to update stock for product ${productId}`);
          }

          // Get updated product
          const updatedProduct = await Product.findById(productId).session(session);
          results.push({
            productId,
            productName: updatedProduct.name,
            oldStock: updatedProduct.stockQuantity - quantityChange,
            newStock: updatedProduct.stockQuantity,
            quantityChange
          });
        }

        res.json({
          success: true,
          message: 'Stock updated successfully',
          data: {
            updates: results
          }
        });
      });
    } catch (error) {
      throw error;
    } finally {
      await session.endSession();
    }

  } catch (error) {
    console.error('Update stock error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update stock',
      error: error.message
    });
  }
});

module.exports = router;