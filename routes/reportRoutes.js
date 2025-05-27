const express = require('express');
const mongoose = require('mongoose');
const Report = require('../models/Report');
const router = express.Router();

// POST - Create report
router.post('/reports', async (req, res) => {
  try {
    const {
      type,
      date,
      time,
      reportToHR,
      anonymous,
      location,
      description,
      involvedParties
    } = req.body;

    // Validate required fields are not undefined, null, or empty strings
    if (
      !type || type.trim() === '' ||
      !date || date.trim() === '' ||
      !time || time.trim() === '' ||
      !location || location.trim() === '' ||
      !description || description.trim() === ''
    ) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: type, date, time, location, description'
      });
    }

    const newReport = new Report({
      type: type.trim(),
      date: date.trim(),
      time: time.trim(),
      reportToHR: !!reportToHR,
      anonymous: !!anonymous,
      location: location.trim(),
      description: description.trim(),
      involvedParties: Array.isArray(involvedParties) ? involvedParties : []
    });

    try {
      const savedReport = await newReport.save();
      res.status(201).json({
        success: true,
        message: 'Report created successfully',
        data: savedReport
      });
    } catch (validationError) {
      // Handle Mongoose validation errors
      res.status(400).json({
        success: false,
        message: 'Validation error',
        error: validationError.message
      });
    }

  } catch (error) {
    console.error('Error creating report:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// GET - All reports with filters & pagination
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, type, status } = req.query;

    const filter = {};
    if (type) filter.type = type;
    if (status) filter.status = status;

    const skip = (page - 1) * limit;

    const reports = await Report.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalReports = await Report.countDocuments(filter);
    const totalPages = Math.ceil(totalReports / limit);

    res.status(200).json({
      success: true,
      data: reports,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalReports,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// GET - Single report by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid report ID'
      });
    }

    const report = await Report.findById(id);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    res.status(200).json({
      success: true,
      data: report
    });

  } catch (error) {
    console.error('Error fetching report:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// PUT - Update report
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid report ID'
      });
    }

    const updatedReport = await Report.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedReport) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Report updated successfully',
      data: updatedReport
    });

  } catch (error) {
    console.error('Error updating report:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// DELETE - Delete report
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid report ID'
      });
    }

    const deletedReport = await Report.findByIdAndDelete(id);

    if (!deletedReport) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Report deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting report:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

module.exports = router;
