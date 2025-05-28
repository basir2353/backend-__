const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const connectDB = require('./config/db');
const { verifyEmailConnection } = require('./services/emailService');
const { Server } = require('socket.io');
const http = require('http');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Models
const User = require('./models/User');
const Appointment = require('./models/Appointment');
const Call = require('./models/Call');
const Poll = require('./models/PollM'); // ✅ Add Poll model if available

// Middleware
const auth = require('./middlewares/auth');

// Routes
const authRoutes = require('./routes/authRoutes');
const reportRoutes = require('./routes/report');       // <-- unchanged
const challengeRoutes = require('./routes/challenges');
const doctorRoutes = require('./routes/doctor');
const socketHandler = require('./sockets/callHandlers');

dotenv.config();
connectDB();

const app = express();
const server = http.createServer(app);

// CORS setup
const allowedOrigins = ['http://localhost:3000', 'https://e-health-xi.vercel.app'];
app.use(cors({
  origin: '*',
  credentials: true
}));

// Middlewares
app.use(helmet());
app.use(express.json());
app.use(morgan('dev'));
verifyEmailConnection();

// Static files
app.use('/uploads', express.static('uploads'));

// Base Routes
app.get('/', (req, res) => res.send('CORS Configured!'));
app.use('/api/auth', authRoutes);
app.use('/api', challengeRoutes);
app.use('/api', doctorRoutes);
app.use('/api', reportRoutes);     // <-- this mounts reportRoutes at /api

// Protected test route
app.use('/api/protected', auth, (req, res) => {
  res.status(200).json({ message: 'You are logged in and can access this protected route.' });
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// Appointment routes
app.post('/api/appointments', async (req, res) => {
  try {
    const { day, date, time, type, doctorName, avatarSrc, userId } = req.body;
    if (!day || !date || !time || !type || !doctorName || !avatarSrc || !userId) {
      return res.status(400).json({ message: 'All fields are required including userId.' });
    }
    const appointment = new Appointment({ day, date, time, type, doctorName, avatarSrc, user: userId });
    await appointment.save();
    await User.findByIdAndUpdate(userId, { $push: { appointments: appointment._id } });
    res.status(201).json({ message: 'Appointment created successfully', appointment });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create appointment', error: error.message });
  }
});

app.get('/api/appointments', async (req, res) => {
  try {
    const { userId } = req.query;
    const query = userId ? { user: userId } : {};
    const appointments = await Appointment.find(query).populate('user', 'name email role');
    res.status(200).json({ appointments });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch appointments', error: error.message });
  }
});

// Doctor list route
app.get('/api/all-doctors', async (req, res) => {
  try {
    const doctors = await User.find({ role: 'doctor' });
    res.status(200).json({ doctors });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch doctors', error: error.message });
  }
});

// Poll routes
app.post('/api/polls', async (req, res) => {
  try {
    const { question, choices } = req.body;
    if (!question || !Array.isArray(choices) || choices.length < 2) {
      return res.status(400).json({ message: 'Question and at least 2 choices are required.' });
    }
    const formattedChoices = choices.map(choice => ({ text: choice, votes: 0 }));
    const poll = new Poll({ question, choices: formattedChoices });
    await poll.save();
    res.status(201).json({ message: 'Poll created successfully', poll });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create poll', error: error.message });
  }
});

app.get('/api/polls', async (req, res) => {
  try {
    const polls = await Poll.find();
    res.status(200).json({ polls });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch polls', error: error.message });
  }
});

// Call route (basic implementation)
app.post('/api/calls', auth, async (req, res) => {
  try {
    const { recipientId } = req.body;
    const call = new Call({ caller: req.user.userId, recipient: recipientId });
    await call.save();
    res.status(201).json({ message: 'Call initiated', call });
  } catch (error) {
    res.status(500).json({ message: 'Failed to initiate call', error: error.message });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'API endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message
  });
});

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST']
  }
});
socketHandler(io);

// Server start
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

process.on('unhandledRejection', err => {
  console.error('UNHANDLED REJECTION:', err);
});
process.on('uncaughtException', err => {
  console.error('UNCAUGHT EXCEPTION:', err);
  process.exit(1); // Exit the process to avoid running in an unstable state
});