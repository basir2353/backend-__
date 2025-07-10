const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const connectDB = require('./config/db');
const { verifyEmailConnection } = require('./services/emailService');
const authRoutes = require('./routes/authRoutes');
const Report = require('./models/Report');
const auth = require('./middlewares/auth');
const Challenge = require('./models/challenges');
const User = require('./models/User');
const Call = require('./models/Call');
const http = require('http');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const socketHandler = require('./sockets/callHandlers');
const { Server } = require('socket.io');
const challengeRoutes = require('./routes/challenges');
const dr = require('./routes/doctor');
const Appointment = require('./models/Appointment');
const report = require('./routes/report');

const allowedOrigins = [
  'http://localhost:3000',
  'https://e-health-xi.vercel.app'
];

// Load environment variables
dotenv.config();

// Create express app
const app = express();

// Create HTTP server for Socket.IO
const server = http.createServer(app);

// Connect to database
connectDB();

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Middleware
app.use(helmet());
app.use(express.json());
app.use(morgan('dev'));

// Verify email service
verifyEmailConnection();

// Static files
app.use('/uploads', express.static('uploads'));

// Routes
app.get('/', (req, res) => {
  res.send('CORS Configured!');
});

app.use('/api/auth', authRoutes);
app.use('/api', challengeRoutes);
app.use('/api', dr);
app.use('/api', report);

app.use('/api/protected', auth, (req, res) => {
  res.status(200).json({ message: 'You are logged in and can access this protected route.' });
});

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

app.post("/test", (req, res) => {
  res.json({
    message: "Test endpoint is working",
    data: req.body
  });
});

// Get all doctors
app.get('/api/all-doctors', async (req, res) => {
  try {
    const doctors = await User.find({ role: 'doctor' });
    res.status(200).json({ doctors });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch doctors', error: error.message });
  }
});

// Create appointment
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
      user: userId
    });

    await appointment.save();

    await User.findByIdAndUpdate(userId, {
      $push: { appointments: appointment._id }
    });

    res.status(201).json({ message: 'Appointment created successfully', appointment });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create appointment', error: error.message });
  }
});

// Get appointments
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

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Initialize socket handlers
console.log('🔧 Initializing Socket.IO handlers...');
socketHandler(io);

// Start server
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  console.log(`🌐 CORS origins: ${allowedOrigins.join(', ')}`);
  console.log('📡 Socket.IO server ready for connections');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ UNHANDLED REJECTION:', err);
});












/// testing purpose for VideoCalling Features 

// server.js - WebRTC Signaling Server
// const express = require('express');
// const http = require('http');
// const socketIo = require('socket.io');
// const cors = require('cors');

// const app = express();
// const server = http.createServer(app);
// const io = socketIo(server, {
//   cors: {
//     origin: "http://localhost:3000",
//     methods: ["GET", "POST"]
//   }
// });

// app.use(cors());
// app.use(express.json());

// // Store active users and rooms
// const users = new Map();
// const rooms = new Map();

// io.on('connection', (socket) => {
//   console.log('User connected:', socket.id);

//   // Join room
//   socket.on('join-room', ({ roomId, userId }) => {
//     socket.join(roomId);
//     users.set(socket.id, { userId, roomId });
    
//     if (!rooms.has(roomId)) {
//       rooms.set(roomId, new Set());
//     }
    
//     // Get current users in room (excluding the new user)
//     const currentUsers = Array.from(rooms.get(roomId))
//       .map(socketId => {
//         const user = users.get(socketId);
//         return user ? user.userId : null;
//       })
//       .filter(Boolean)
//       .filter(existingUserId => existingUserId !== userId);
    
//     rooms.get(roomId).add(socket.id);
    
//     // Send current users to the new user
//     socket.emit('room-users', currentUsers);
    
//     // Notify others in the room about the new user
//     socket.to(roomId).emit('user-connected', userId);
    
//     console.log(`User ${userId} joined room ${roomId}. Users in room:`, Array.from(rooms.get(roomId)).length);
//   });

//   // WebRTC signaling events
//   socket.on('offer', ({ offer, to }) => {
//     socket.to(to).emit('offer', {
//       offer,
//       from: socket.id
//     });
//   });

//   socket.on('answer', ({ answer, to }) => {
//     socket.to(to).emit('answer', {
//       answer,
//       from: socket.id
//     });
//   });

//   socket.on('ice-candidate', ({ candidate, to }) => {
//     socket.to(to).emit('ice-candidate', {
//       candidate,
//       from: socket.id
//     });
//   });

//   // Call events
//   socket.on('call-user', ({ userToCall, signalData, from, name }) => {
//     // Find the socket ID for the user
//     let targetSocketId = null;
//     for (let [socketId, userData] of users.entries()) {
//       if (userData.userId === userToCall) {
//         targetSocketId = socketId;
//         break;
//       }
//     }
    
//     if (targetSocketId) {
//       io.to(targetSocketId).emit('call-made', {
//         signal: signalData,
//         from: socket.id,
//         name
//       });
//     }
//   });

//   socket.on('answer-call', ({ signal, to }) => {
//     io.to(to).emit('call-accepted', signal);
//   });

//   socket.on('reject-call', ({ to }) => {
//     io.to(to).emit('call-rejected');
//   });

//   socket.on('end-call', ({ to }) => {
//     io.to(to).emit('call-ended');
//   });

//   // Disconnect handling
//   socket.on('disconnect', () => {
//     const user = users.get(socket.id);
//     if (user) {
//       const { roomId, userId } = user;
//       socket.to(roomId).emit('user-disconnected', userId);
      
//       if (rooms.has(roomId)) {
//         rooms.get(roomId).delete(socket.id);
//         if (rooms.get(roomId).size === 0) {
//           rooms.delete(roomId);
//         }
//       }
      
//       users.delete(socket.id);
//       console.log(`User ${userId} disconnected from room ${roomId}`);
//     }
//   });
// });

// const PORT = process.env.PORT || 5000;
// server.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
// });
