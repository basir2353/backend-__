const Report =
('../models/Report');
const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth')

router
.post("/report", auth, async (req, res) => {
  try {
    const report = new Report({
      ...req.body,
      user: req.user.userId // 👈 Attach user ID from token
    });
    await report.save();
    res.status(201).json({ message: "Report submitted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to save report", error: err.message });
  }
});


router
.get('/reports', async (req, res) => {
  try {
    const reports = await Report.find({ user: req.user.userId }) // assuming auth adds `userId`
      .populate('user', 'name email') // ✅ Correct field name
      .sort({ createdAt: -1 });

    res.status(200).json(reports);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch reports', error: error.message });
  }
});


// New endpoint to fetch all reports (admin/dr only)
router.get('/api/reports/all', auth, async (req, res) => {
  try {
    // Check if user has admin or dr role
    if (!['admin', 'doctor'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied. Admin or Dr role required.' });
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
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch all reports', error: error.message });
  }
});
/**
 * PATCH /api/reports/:id/status
 * Allows admin or doctor to update the status of a report
 * Expects { status: "newStatus" } in request body
 */
router.patch('/api/reports/:id/status', auth, async (req, res) => {
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
// DELETE /api/reports/:id - Delete a report by ID (admin/dr only)
router.delete('/api/reports/:id', auth, async (req, res) => {
  try {
    // Only admin or doctor can delete
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
// GET /api/reports/all - Fetch all reports from DB
router
.get('/rep_all', async (req, res) => {
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

module.exports= router
