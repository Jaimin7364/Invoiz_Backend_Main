const express = require('express');
const Business = require('../models/Business');
const { auth, requireEmailVerified } = require('../middleware/auth');
const { businessValidation } = require('../middleware/validation');

const router = express.Router();

// @route   POST /api/business/register
// @desc    Register business details
// @access  Private (requires authentication and email verification)
router.post('/register', auth, requireEmailVerified, businessValidation, async (req, res) => {
  try {
    // Check if user already has a business registered
    const existingBusiness = await Business.findOne({ user_id: req.user._id });
    
    if (existingBusiness) {
      return res.status(400).json({
        success: false,
        message: 'Business already registered for this user'
      });
    }

    const {
      business_name,
      business_type,
      business_address,
      gst_number,
      upi_id,
      contact_details,
      operating_hours
    } = req.body;

    // Create new business
    const business = new Business({
      user_id: req.user._id,
      business_name,
      business_type,
      business_address,
      gst_number: gst_number || null,
      upi_id,
      contact_details: contact_details || {},
      operating_hours: operating_hours || {}
    });

    await business.save();

    res.status(201).json({
      success: true,
      message: 'Business registered successfully!',
      data: {
        business: business.getSummary()
      }
    });

  } catch (error) {
    console.error('Business registration error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Business with this details already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Business registration failed. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/business/profile
// @desc    Get business profile
// @access  Private
router.get('/profile', auth, async (req, res) => {
  try {
    const business = await Business.findOne({ user_id: req.user._id });

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business profile not found',
        business_registration_required: true
      });
    }

    res.json({
      success: true,
      data: {
        business: {
          business_id: business.business_id,
          business_name: business.business_name,
          business_type: business.business_type,
          business_address: business.business_address,
          full_address: business.full_address,
          gst_number: business.gst_number,
          upi_id: business.upi_id,
          contact_details: business.contact_details,
          operating_hours: business.operating_hours,
          business_status: business.business_status,
          verification_status: business.verification_status,
          created_at: business.created_at,
          updated_at: business.updated_at
        }
      }
    });

  } catch (error) {
    console.error('Get business profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get business profile'
    });
  }
});

// @route   PUT /api/business/profile
// @desc    Update business profile
// @access  Private
router.put('/profile', auth, businessValidation, async (req, res) => {
  try {
    const business = await Business.findOne({ user_id: req.user._id });

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business profile not found'
      });
    }

    const {
      business_name,
      business_type,
      business_address,
      gst_number,
      upi_id,
      contact_details,
      operating_hours
    } = req.body;

    // Update business details
    business.business_name = business_name;
    business.business_type = business_type;
    business.business_address = business_address;
    business.gst_number = gst_number || null;
    business.upi_id = upi_id;
    business.contact_details = contact_details || business.contact_details;
    business.operating_hours = operating_hours || business.operating_hours;

    await business.save();

    res.json({
      success: true,
      message: 'Business profile updated successfully!',
      data: {
        business: business.getSummary()
      }
    });

  } catch (error) {
    console.error('Update business profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update business profile'
    });
  }
});

// @route   GET /api/business/types
// @desc    Get available business types
// @access  Public
router.get('/types', (req, res) => {
  const businessTypes = [
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
  ];

  res.json({
    success: true,
    data: {
      business_types: businessTypes
    }
  });
});

// @route   DELETE /api/business/profile
// @desc    Delete business profile
// @access  Private
router.delete('/profile', auth, async (req, res) => {
  try {
    const business = await Business.findOne({ user_id: req.user._id });

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business profile not found'
      });
    }

    await Business.findByIdAndDelete(business._id);

    res.json({
      success: true,
      message: 'Business profile deleted successfully'
    });

  } catch (error) {
    console.error('Delete business profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete business profile'
    });
  }
});

module.exports = router;