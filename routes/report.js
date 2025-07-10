const Report = require('../models/Report')
const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth')

// Health check route
router.get('/ping', (req, res) => {
  res.send('yes working')
})

// POST /report - Create a new report (authenticated users)
router.post("/report", auth, async (req, res) => {
  try {
    const report = new Report({
      ...req.body,
      user: req.user.userId // Attach user ID from token
    });
    await report.save();
    res.status(201).json({ message: "Report submitted successfully", report });
  } catch (err) {
    res.status(500).json({ message: "Failed to save report", error: err.message });
  }
});

// GET /reports - Get current user's reports
router.get('/reports', auth, async (req, res) => {
  try {
    const reports = await Report.find({ user: req.user.userId })
      .populate('user', 'name email')
      .sort({ createdAt: -1 });

    res.status(200).json({ reports });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch reports', error: error.message });
  }
});

// GET /reports/all - Fetch all reports with pagination (admin/doctor only)
router.get('/reports/all', auth, async (req, res) => {
  try {
    // Check if user has admin or doctor role
    if (!['admin', 'doctor'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied. Admin or Doctor role required.' });
    }

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Fetch paginated reports from the database
    const [reports, total] = await Promise.all([
      Report.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('user', 'name email'),
      Report.countDocuments()
    ]);

    res.status(200).json({
      reports,
      total,
      page,
      pages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch all reports', error: error.message });
  }
});

// GET /rep_all - Fetch all reports or specific report by ID (no auth - consider adding auth if needed)
router.get('/rep_all', async (req, res) => {
  try {
    const { _id } = req.query;
    
    if (_id) {
      // Fetch specific report by ID
      const report = await Report.findById(_id).populate('user', 'name email');
      if (!report) {
        return res.status(404).json({ message: 'Report not found' });
      }
      return res.status(200).json({ report });
    }
    
    // Fetch all reports
    const reports = await Report.find()
      .populate('user', 'name email')
      .sort({ createdAt: -1 });
    res.status(200).json({ reports });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch reports', error: error.message });
  }
});

// PATCH /reports/:id/status - Update report status (admin/doctor only)
router.patch('/reports/:id/status', auth, async (req, res) => {
  try {
    // Check if user has admin or doctor role
    if (!['admin', 'doctor'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied. Admin or Doctor role required.' });
    }
    
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ message: 'Status is required.' });
    }
    
    const report = await Report.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate('user', 'name email');
    
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }
    
    res.status(200).json({ message: 'Report status updated successfully', report });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update report status', error: error.message });
  }
});

// DELETE /reports/:id - Delete a report by ID (admin/doctor only)
router.delete('/reports/:id', auth, async (req, res) => {
  try {
    // Check if user has admin or doctor role
    if (!['admin', 'doctor'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied. Admin or Doctor role required.' });
    }
    
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }
    
    await Report.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'Report deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete report', error: error.message });
  }
});

module.exports = router