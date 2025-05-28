const express = require('express');
const router = express.Router();
const Report = require('../models/Report');
const auth = require('../middlewares/auth');

// User: Submit a report
router.post("/report", auth, async (req, res) => {
  try {
    const report = new Report({
      ...req.body,
      user: req.user.userId
    });
    await report.save();
    res.status(201).json({ message: "Report submitted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to save report", error: err.message });
  }
});

// User: Get own reports
router.get('/reports', auth, async (req, res) => {
  try {
    const reports = await Report.find({ user: req.user.userId })
      .populate('user', 'name email')
      .sort({ createdAt: -1 });

    res.status(200).json(reports);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch reports', error: error.message });
  }
});

// Admin/Doctor: Get all reports (paginated)
router.get('/reports/all', auth, async (req, res) => {
  try {
    if (!['admin', 'doctor'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied. Admin or Dr role required.' });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

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
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch all reports', error: error.message });
  }
});

// Admin/Doctor: Update report status
router.patch('/reports/:id/status', auth, async (req, res) => {
  try {
    if (!['admin', 'doctor'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied. Admin or Dr role required.' });
    }

    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ message: 'Status is required.' });
    }

    const report = await Report.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    res.status(200).json({ message: 'Report status updated', report });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update report status', error: error.message });
  }
});

// Admin/Doctor: Delete a report
router.delete('/reports/:id', auth, async (req, res) => {
  try {
    if (!['admin', 'doctor'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied. Admin or Dr role required.' });
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

// Debug/Admin: Fetch all or one report (used optionally)
router.get('/rep_all', async (req, res) => {
  try {
    const { _id } = req.query;
    if (_id) {
      const report = await Report.findById(_id);
      if (!report) {
        return res.status(404).json({ message: 'Report not found' });
      }
      return res.status(200).json({ report });
    }

    const reports = await Report.find();
    res.status(200).json({ reports });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch reports', error: error.message });
  }
});

module.exports = router;
