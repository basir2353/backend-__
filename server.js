const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const connectDB = require('./config/db');
const { verifyEmailConnection } = require('./services/emailService');
const authRoutes = require('./routes/authRoutes');
const reportRoutes = require('./routes/reportRoutes');
const Report = require('./models/Report');
const auth = require('./middlewares/auth');
const Challenge = require('./models/challenges');
const User = require('./models/User');
const Call = require('./models/Call');
const Appointment = require('./models/Appointment');
const http = require('http');
const { Server } = require('socket.io');

// Load environment variables
dotenv.config();

// Create express app
const app = express();

// Create HTTP server for Socket.IO
const server = http.createServer(app);

// Connect to database
connectDB();

// CORS configuration
const allowedOrigins = ['http://localhost:3000', 'https://e-health-xi.vercel.app'];
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);

// Middleware
app.use(helmet());
app.use(express.json());
app.use(morgan('dev'));

// Debug middleware to log all requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - Body:`, req.body);
  next();
});

// Verify email service
verifyEmailConnection();

// Static files
app.use('/uploads', express.static('uploads'));

// Routes
app.get('/', (req, res) => {
  res.send('CORS Configured!');
});
app.use('/api/auth', authRoutes);
app.use('/api/reports', auth, reportRoutes); // Uncommented to enable report routes
app.use('/api/protected', auth, (req, res) => {
  res.status(200).json({ message: 'You are logged in and can access this protected route.' });
});

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: allowedOrigins, // Allow both localhost and production frontend
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// In-memory storage
const activeUsers = new Map(); // socketId -> user info
const activeCalls = new Map(); // callId -> call info

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('✅ New client connected:', socket.id);

  // User joins with their info
  socket.on('user-joined', async (userData) => {
    try {
      activeUsers.set(socket.id, userData);

      // Update user online status
      await User.findByIdAndUpdate(userData.id, {
        isOnline: true,
        socketId: socket.id,
      });

      // Fetch updated user info and emit to frontend (for doctor dashboard update)
      if (userData.role === 'doctor') {
        const updatedDoctor = await User.findById(userData.id).select('name email role isOnline');
        io.to(socket.id).emit('doctor-info', updatedDoctor);
      }

      // Notify admins of user status
      broadcastToAdmins('user-status-update', {
        userId: userData.id,
        username: userData.username || userData.name || userData.email,
        role: userData.role,
        isOnline: true,
      });

      // Emit active users to all clients
      io.emit('active-users', Array.from(activeUsers.values()));

      console.log(`${userData.username || userData.name || userData.email} (${userData.role}) joined`);
    } catch (error) {
      console.error('Error in user-joined:', error);
    }
  });

  // Initiate call
  socket.on('initiate-call', async (data) => {
    try {
      const { callerId, calleeId, callerName } = data;

      // Find callee's socket
      const callee = await User.findById(calleeId);
      if (!callee || !callee.socketId) {
        socket.emit('call-error', { message: 'User is offline' });
        return;
      }

      // Find caller's info for name fallback
      let callerUser = null;
      try {
        callerUser = await User.findById(callerId);
      } catch {}

      // Create call record
      const call = new Call({
        caller: callerId,
        callee: calleeId,
        status: 'initiated',
      });
      await call.save();

      const callId = call._id.toString();

      // Store active call
      activeCalls.set(callId, {
        callId,
        caller: {
          id: callerId,
          name: callerName || (callerUser && (callerUser.username || callerUser.name || callerUser.email)) || 'Unknown',
          socketId: socket.id,
        },
        callee: {
          id: calleeId,
          name: callee.username || callee.name || callee.email || 'Unknown',
          socketId: callee.socketId,
        },
        status: 'initiated',
        startTime: new Date(),
      });

      // Notify callee
      io.to(callee.socketId).emit('incoming-call', {
        callId,
        callerId,
        callerName: callerName || (callerUser && (callerUser.username || callerUser.name || callerUser.email)) || 'Unknown',
        callerSocketId: socket.id,
      });

      // Notify admins
      broadcastToAdmins('new-call', activeCalls.get(callId));

      console.log(
        `Call initiated: ${callerName || (callerUser && (callerUser.username || callerUser.name || callerUser.email)) || 'Unknown'} -> ${
          callee.username || callee.name || callee.email || 'Unknown'
        }`
      );
    } catch (error) {
      console.error('Error in initiate-call:', error);
      socket.emit('call-error', { message: 'Failed to initiate call' });
    }
  });

  // Accept call
  socket.on('accept-call', async (data) => {
    try {
      const { callId } = data;
      const callInfo = activeCalls.get(callId);

      if (!callInfo) {
        socket.emit('call-error', { message: 'Call not found' });
        return;
      }

      // Update call status
      callInfo.status = 'accepted';
      activeCalls.set(callId, callInfo);

      // Update database
      await Call.findByIdAndUpdate(callId, { status: 'accepted' });

      // Notify caller that call was accepted
      io.to(callInfo.caller.socketId).emit('call-accepted', { callId });

      // Notify admins
      broadcastToAdmins('call-status-update', callInfo);

      console.log(`Call accepted: ${callInfo.caller.name} <-> ${callInfo.callee.name}`);
    } catch (error) {
      console.error('Error in accept-call:', error);
    }
  });

  // Reject call
  socket.on('reject-call', async (data) => {
    try {
      const { callId } = data;
      const callInfo = activeCalls.get(callId);

      if (!callInfo) return;

      // Update database
      await Call.findByIdAndUpdate(callId, {
        status: 'rejected',
        endTime: new Date(),
      });

      // Notify caller
      io.to(callInfo.caller.socketId).emit('call-rejected', { callId });

      // Remove from active calls
      activeCalls.delete(callId);

      // Notify admins
      broadcastToAdmins('call-ended', { callId, reason: 'rejected' });

      console.log(`Call rejected: ${callInfo.caller.name} -> ${callInfo.callee.name}`);
    } catch (error) {
      console.error('Error in reject-call:', error);
    }
  });

  // End call
  socket.on('end-call', async (data) => {
    try {
      const { callId } = data;
      const callInfo = activeCalls.get(callId);

      if (!callInfo) return;

      const endTime = new Date();
      const duration = Math.floor((endTime - callInfo.startTime) / 1000);

      // Update database
      await Call.findByIdAndUpdate(callId, {
        status: 'ended',
        endTime,
        duration,
      });

      // Notify both parties
      io.to(callInfo.caller.socketId).emit('call-ended', { callId });
      io.to(callInfo.callee.socketId).emit('call-ended', { callId });

      // Remove from active calls
      activeCalls.delete(callId);

      // Notify admins
      broadcastToAdmins('call-ended', { callId, duration });

      console.log(`Call ended: ${callInfo.caller.name} <-> ${callInfo.callee.name} (${duration}s)`);
    } catch (error) {
      console.error('Error in end-call:', error);
    }
  });

  // WebRTC signaling
  socket.on('offer', (data) => {
    socket.to(data.target).emit('offer', {
      offer: data.offer,
      caller: socket.id,
    });
  });

  socket.on('answer', (data) => {
    socket.to(data.target).emit('answer', {
      answer: data.answer,
      callee: socket.id,
    });
  });

  socket.on('ice-candidate', (data) => {
    socket.to(data.target).emit('ice-candidate', {
      candidate: data.candidate,
      sender: socket.id,
    });
  });

  // Admin requests active calls
  socket.on('get-active-calls', () => {
    const userData = activeUsers.get(socket.id);
    if (userData && userData.role === 'admin') {
      socket.emit('active-calls', Array.from(activeCalls.values()));
    }
  });

  // Handle disconnect
  socket.on('disconnect', async () => {
    try {
      const userData = activeUsers.get(socket.id);
      if (userData) {
        // Update user offline status
        await User.findByIdAndUpdate(userData.id, {
          isOnline: false,
          socketId: null,
        });

        // End any active calls involving this user
        for (const [callId, callInfo] of activeCalls.entries()) {
          if (callInfo.caller.socketId === socket.id || callInfo.callee.socketId === socket.id) {
            const endTime = new Date();
            const duration = Math.floor((endTime - callInfo.startTime) / 1000);

            await Call.findByIdAndUpdate(callId, {
              status: 'ended',
              endTime,
              duration,
            });

            // Notify the other party
            const otherSocketId = callInfo.caller.socketId === socket.id ? callInfo.callee.socketId : callInfo.caller.socketId;
            io.to(otherSocketId).emit('call-ended', { callId, reason: 'disconnect' });

            activeCalls.delete(callId);
            broadcastToAdmins('call-ended', { callId, reason: 'disconnect' });
          }
        }

        // Notify admins of user status
        broadcastToAdmins('user-status-update', {
          userId: userData.id,
          username: userData.username || userData.name || userData.email,
          role: userData.role,
          isOnline: false,
        });

        activeUsers.delete(socket.id);
        console.log(`${userData.username || userData.name || userData.email} disconnected`);
      }
    } catch (error) {
      console.error('Error in disconnect:', error);
    }
  });
});

// Helper function to broadcast to all admins
function broadcastToAdmins(event, data) {
  for (const [socketId, userData] of activeUsers.entries()) {
    if (userData.role === 'admin') {
      io.to(socketId).emit(event, data);
    }
  }
}

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// Report routes
app.post('/api/report', auth, async (req, res) => {
  try {
    const report = new Report({
      ...req.body,
      user: req.user.userId,
    });
    await report.save();
    res.status(201).json({ message: 'Report submitted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to save report', error: err.message });
  }
});

app.get('/api/reports', auth, async (req, res) => {
  try {
    const reports = await Report.find({ user: req.user.userId })
      .populate('user', 'name email')
      .sort({ createdAt: -1 });
    res.status(200).json(reports);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch reports', error: error.message });
  }
});

app.get('/api/reports/all', auth, async (req, res) => {
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
      Report.countDocuments(),
    ]);
    res.status(200).json({
      reports,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch all reports', error: error.message });
  }
});

app.patch('/api/reports/:id/status', auth, async (req, res) => {
  try {
    if (!['admin', 'doctor'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied. Admin or Dr role required.' });
    }
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ message: 'Status is required.' });
    }
    const report = await Report.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }
    res.status(200).json({ message: 'Report status updated', report });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update report status', error: error.message });
  }
});

app.delete('/api/reports/:id', auth, async (req, res) => {
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

app.get('/api/rep_all', async (req, res) => {
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

// Doctor and call routes
app.get('/api/doctors', async (req, res) => {
  try {
    const doctors = await User.find({ role: 'doctor', isOnline: true }).select('name email');
    res.json(doctors);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/all-doctors', async (req, res) => {
  try {
    const doctors = await User.find({ role: 'doctor' });
    res.status(200).json({ doctors });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch doctors', error: error.message });
  }
});

app.get('/api/calls', async (req, res) => {
  try {
    const calls = await Call.find()
      .populate('caller', 'username email role')
      .populate('callee', 'username email role')
      .sort({ startTime: -1 });
    res.json(calls);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Challenge routes
app.post('/api/createChallenge', async (req, res) => {
  try {
    const { title, description, rewardPoints } = req.body;
    if (!title || !description || typeof rewardPoints !== 'number') {
      return res.status(400).json({ message: 'Title, description, and rewardPoints are required.' });
    }
    const challenge = new Challenge({
      title,
      description,
      rewardPoints,
      participantsCount: 0,
      participants: [],
    });
    await challenge.save();
    res.status(201).json({ message: 'Challenge created successfully', challenge });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create challenge', error: error.message });
  }
});

app.get('/api/challenges', async (req, res) => {
  try {
    const challenges = await Challenge.find();
    res.status(200).json({ challenges });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch challenges', error: error.message });
  }
});

app.post('/api/participate/:challengeId', async (req, res) => {
  try {
    const { challengeId } = req.params;
    const { participantId } = req.body;
    if (!participantId) {
      return res.status(400).json({ message: 'Participant ID is required' });
    }
    const challenge = await Challenge.findById(challengeId);
    if (!challenge) {
      return res.status(404).json({ message: 'Challenge not found' });
    }
    if (challenge.participants.includes(participantId)) {
      return res.status(400).json({ message: 'You have already participated in this challenge' });
    }
    challenge.participants.push(participantId);
    challenge.participantsCount += 1;
    await challenge.save();
    res.status(200).json({
      message: 'Successfully participated in challenge',
      challenge,
      participantsCount: challenge.participantsCount,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to participate in challenge', error: error.message });
  }
});

// Appointment routes
app.post('/api/appointments', async (req, res) => {
  try {
    const { day, date, time, type, doctorName, avatarSrc, userId } = req.body;
    if (!day || !date || !time || !type || !doctorName || !avatarSrc || !userId) {
      return res.status(400).json({ message: 'All fields are required including userId.' });
    }
    const appointment = new Appointment({
      day,
      date,
      time,
      type,
      doctorName,
      avatarSrc,
      user: userId,
    });
    await appointment.save();
    await User.findByIdAndUpdate(userId, {
      $push: { appointments: appointment._id },
    });
    res.status(201).json({ message: 'Appointment created successfully', appointment });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create appointment', error: error.message });
  }
});

app.get('/api/appointments', async (req, res) => {
  try {
    const { userId } = req.query;
    let query = {};
    if (userId) {
      query.user = userId;
    }
    const appointments = await Appointment.find(query).populate('user', 'name email role');
    res.status(200).json({ appointments });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch appointments', error: error.message });
  }
});

// Test route
app.post('/test', (req, res) => {
  res.json({
    message: 'Test endpoint is working',
    data: req.body,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: `API endpoint not found: ${req.method} ${req.originalUrl}` });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message,
  });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
  // Optionally close server and exit
  // server.close(() => process.exit(1));
});