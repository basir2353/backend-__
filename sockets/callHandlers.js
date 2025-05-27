const { Server } = require('socket.io');
const express = require('express');
const Appointment = require('../models/Appointment');
const http = require('http');
const app = express()
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "https://e-health-xi.vercel.app/", // <-- FIXED: match your frontend port
    methods: ["GET", "POST"]
  }
});

// In-memory storage
const activeUsers = new Map(); // socketId -> user info
const activeCalls = new Map(); // callId -> call info

function socketHandler (){
    // --- Socket.IO logic (single block) ---
io.on('connection', (socket) => {
  console.log('✅ New client connected:', socket.id);

  // User joins with their info
  socket.on('user-joined', async (userData) => {
    try {
      activeUsers.set(socket.id, userData);

      // Update user online status
      await User.findByIdAndUpdate(userData.id, { 
        isOnline: true, 
        socketId: socket.id 
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
        isOnline: true
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
        status: 'initiated'
      });
      await call.save();

      const callId = call._id.toString();

      // Store active call
      activeCalls.set(callId, {
        callId,
        caller: { 
          id: callerId, 
          name: callerName || (callerUser && (callerUser.username || callerUser.name || callerUser.email)) || 'Unknown', 
          socketId: socket.id 
        },
        callee: { 
          id: calleeId, 
          name: callee.username || callee.name || callee.email || 'Unknown', 
          socketId: callee.socketId 
        },
        status: 'initiated',
        startTime: new Date()
      });

      // Notify callee
      io.to(callee.socketId).emit('incoming-call', {
        callId,
        callerId,
        callerName: callerName || (callerUser && (callerUser.username || callerUser.name || callerUser.email)) || 'Unknown',
        callerSocketId: socket.id
      });

      // Notify admins
      broadcastToAdmins('new-call', activeCalls.get(callId));

      console.log(`Call initiated: ${callerName || (callerUser && (callerUser.username || callerUser.name || callerUser.email)) || 'Unknown'} -> ${callee.username || callee.name || callee.email || 'Unknown'}`);
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
        endTime: new Date()
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
        duration
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
      caller: socket.id
    });
  });

  socket.on('answer', (data) => {
    socket.to(data.target).emit('answer', {
      answer: data.answer,
      callee: socket.id
    });
  });

  socket.on('ice-candidate', (data) => {
    socket.to(data.target).emit('ice-candidate', {
      candidate: data.candidate,
      sender: socket.id
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
          socketId: null 
        });

        // End any active calls involving this user
        for (const [callId, callInfo] of activeCalls.entries()) {
          if (callInfo.caller.socketId === socket.id || callInfo.callee.socketId === socket.id) {
            const endTime = new Date();
            const duration = Math.floor((endTime - callInfo.startTime) / 1000);

            await Call.findByIdAndUpdate(callId, { 
              status: 'ended',
              endTime,
              duration
            });

            // Notify the other party
            const otherSocketId = callInfo.caller.socketId === socket.id 
              ? callInfo.callee.socketId 
              : callInfo.caller.socketId;

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
          isOnline: false
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
}
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // User joins with their info
  socket.on('user-joined', async (userData) => {
    try {
      activeUsers.set(socket.id, userData);
      
      // Update user online status
      await User.findByIdAndUpdate(userData.id, { 
        isOnline: true, 
        socketId: socket.id 
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
        isOnline: true
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
        status: 'initiated'
      });
      await call.save();

      const callId = call._id.toString();

      // Store active call
      activeCalls.set(callId, {
        callId,
        caller: { 
          id: callerId, 
          name: callerName || (callerUser && (callerUser.username || callerUser.name || callerUser.email)) || 'Unknown', 
          socketId: socket.id 
        },
        callee: { 
          id: calleeId, 
          name: callee.username || callee.name || callee.email || 'Unknown', 
          socketId: callee.socketId 
        },
        status: 'initiated',
        startTime: new Date()
      });

      // Notify callee
      io.to(callee.socketId).emit('incoming-call', {
        callId,
        callerId,
        callerName: callerName || (callerUser && (callerUser.username || callerUser.name || callerUser.email)) || 'Unknown',
        callerSocketId: socket.id
      });

      // Notify admins
      broadcastToAdmins('new-call', activeCalls.get(callId));

      console.log(`Call initiated: ${callerName || (callerUser && (callerUser.username || callerUser.name || callerUser.email)) || 'Unknown'} -> ${callee.username || callee.name || callee.email || 'Unknown'}`);
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
        endTime: new Date()
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
        duration
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
      caller: socket.id
    });
  });

  socket.on('answer', (data) => {
    socket.to(data.target).emit('answer', {
      answer: data.answer,
      callee: socket.id
    });
  });

  socket.on('ice-candidate', (data) => {
    socket.to(data.target).emit('ice-candidate', {
      candidate: data.candidate,
      sender: socket.id
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
          socketId: null 
        });

        // End any active calls involving this user
        for (const [callId, callInfo] of activeCalls.entries()) {
          if (callInfo.caller.socketId === socket.id || callInfo.callee.socketId === socket.id) {
            const endTime = new Date();
            const duration = Math.floor((endTime - callInfo.startTime) / 1000);

            await Call.findByIdAndUpdate(callId, { 
              status: 'ended',
              endTime,
              duration
            });

            // Notify the other party
            const otherSocketId = callInfo.caller.socketId === socket.id 
              ? callInfo.callee.socketId 
              : callInfo.caller.socketId;
            
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
          isOnline: false
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

module.exports = socketHandler;