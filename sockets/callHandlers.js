const User = require('../models/User');
const Call = require('../models/Call');

const activeUsers = new Map(); // socket.id => userData
const activeCalls = new Map(); // callId => callInfo

function socketHandler(io) {
  io.on('connection', (socket) => {
    console.log('✅ New client connected:', socket.id);

    // -------------------- User Join --------------------
    socket.on('user-joined', async (userData) => {
      try {
        console.log('👤 User joining:', userData);
        activeUsers.set(socket.id, userData);

        await User.findByIdAndUpdate(userData.id, {
          isOnline: true,
          socketId: socket.id
        });

        // Send user their own info
        socket.emit('your-info', {
          id: userData.id,
          name: userData.name || userData.username || userData.email,
          role: userData.role
        });

        // Send available users based on role
        if (userData.role === 'doctor') {
          // Send all online employees to this doctor
          const onlineEmployees = getOnlineUsersByRole('employee');
          socket.emit('available-users', onlineEmployees);
          
          // Notify all online employees about this doctor
          broadcastToRole(io, activeUsers, 'employee', 'available-users', [getUserInfo(userData)]);
        } else if (userData.role === 'employee') {
          // Send all online doctors to this employee
          const onlineDoctors = getOnlineUsersByRole('doctor');
          socket.emit('available-users', onlineDoctors);
          
          // Notify all online doctors about this employee
          broadcastToRole(io, activeUsers, 'doctor', 'available-users', [getUserInfo(userData)]);
        }

        // Broadcast to admins
        broadcastToAdmins(io, activeUsers, 'user-status-update', {
          userId: userData.id,
          username: userData.username || userData.name || userData.email,
          role: userData.role,
          isOnline: true
        });

        console.log(`✅ ${userData.role} ${userData.name || userData.email} joined`);
      } catch (error) {
        console.error('❌ Error in user-joined:', error);
      }
    });

    // -------------------- Get Available Users --------------------
    socket.on('get-available-users', () => {
      const user = activeUsers.get(socket.id);
      if (!user) return;

      if (user.role === 'doctor') {
        const onlineEmployees = getOnlineUsersByRole('employee');
        socket.emit('available-users', onlineEmployees);
      } else if (user.role === 'employee') {
        const onlineDoctors = getOnlineUsersByRole('doctor');
        socket.emit('available-users', onlineDoctors);
      }
    });

    // -------------------- Call Initiation --------------------
    socket.on('initiate-call', async ({ callerId, calleeId, callerName }) => {
      try {
        const callee = await User.findById(calleeId);
        if (!callee?.socketId) {
          return socket.emit('call-error', { message: 'User is offline' });
        }

        const call = new Call({ caller: callerId, callee: calleeId, status: 'initiated' });
        await call.save();

        const callId = call._id.toString();
        const callInfo = {
          callId,
          caller: { id: callerId, name: callerName, socketId: socket.id },
          callee: { id: calleeId, name: callee.name || callee.email, socketId: callee.socketId },
          status: 'initiated',
          startTime: new Date()
        };

        activeCalls.set(callId, callInfo);

        io.to(callee.socketId).emit('incoming-call', {
          callId,
          callerId,
          callerName,
          callerSocketId: socket.id
        });

        broadcastToAdmins(io, activeUsers, 'new-call', callInfo);
      } catch (err) {
        console.error('❌ initiate-call error:', err);
        socket.emit('call-error', { message: 'Failed to initiate call' });
      }
    });

    // -------------------- Accept Call --------------------
    socket.on('accept-call', async ({ callId }) => {
      try {
        const call = activeCalls.get(callId);
        if (!call) return socket.emit('call-error', { message: 'Call not found' });

        call.status = 'accepted';
        await Call.findByIdAndUpdate(callId, { status: 'accepted' });

        io.to(call.caller.socketId).emit('call-accepted', { callId });
        io.to(call.callee.socketId).emit('call-accepted', { callId });

        broadcastToAdmins(io, activeUsers, 'call-status-update', call);
      } catch (err) {
        console.error('❌ accept-call error:', err);
      }
    });

    // -------------------- Reject Call --------------------
    socket.on('reject-call', async ({ callId }) => {
      try {
        const call = activeCalls.get(callId);
        if (!call) return;

        await Call.findByIdAndUpdate(callId, {
          status: 'rejected',
          endTime: new Date()
        });

        io.to(call.caller.socketId).emit('call-rejected', { callId });
        activeCalls.delete(callId);

        broadcastToAdmins(io, activeUsers, 'call-ended', { callId, reason: 'rejected' });
      } catch (err) {
        console.error('❌ reject-call error:', err);
      }
    });

    // -------------------- End Call --------------------
    socket.on('end-call', async ({ callId }) => {
      try {
        const call = activeCalls.get(callId);
        if (!call) return;

        const endTime = new Date();
        const duration = Math.floor((endTime - call.startTime) / 1000);

        await Call.findByIdAndUpdate(callId, { status: 'ended', endTime, duration });

        io.to(call.caller.socketId).emit('call-ended', { callId });
        io.to(call.callee.socketId).emit('call-ended', { callId });

        activeCalls.delete(callId);
        broadcastToAdmins(io, activeUsers, 'call-ended', { callId, duration });
      } catch (err) {
        console.error('❌ end-call error:', err);
      }
    });

    // -------------------- WebRTC Signaling --------------------
    socket.on('offer', ({ offer, target }) => {
      io.to(target).emit('offer', { offer, from: socket.id });
    });

    socket.on('answer', ({ answer, target }) => {
      io.to(target).emit('answer', { answer, from: socket.id });
    });

    socket.on('ice-candidate', ({ candidate, target }) => {
      io.to(target).emit('ice-candidate', { candidate, from: socket.id });
    });

    // -------------------- Admin: Get Active Calls --------------------
    socket.on('get-active-calls', () => {
      const user = activeUsers.get(socket.id);
      if (user?.role === 'admin') {
        socket.emit('active-calls', Array.from(activeCalls.values()));
      }
    });

    // -------------------- Disconnect --------------------
    socket.on('disconnect', async () => {
      const user = activeUsers.get(socket.id);
      if (!user) return;

      await User.findByIdAndUpdate(user.id, {
        isOnline: false,
        socketId: null
      });

      // Handle active calls
      for (const [callId, call] of activeCalls.entries()) {
        if (call.caller.socketId === socket.id || call.callee.socketId === socket.id) {
          const otherSocketId = call.caller.socketId === socket.id
            ? call.callee.socketId
            : call.caller.socketId;

          io.to(otherSocketId).emit('call-ended', { callId, reason: 'disconnect' });
          await Call.findByIdAndUpdate(callId, {
            status: 'ended',
            endTime: new Date()
          });
          activeCalls.delete(callId);
        }
      }

      // Notify other users about disconnection
      if (user.role === 'doctor') {
        // Notify all employees that this doctor went offline
        broadcastToRole(io, activeUsers, 'employee', 'user-disconnected', {
          id: user.id,
          name: user.name || user.username || user.email,
          role: user.role
        });
      } else if (user.role === 'employee') {
        // Notify all doctors that this employee went offline
        broadcastToRole(io, activeUsers, 'doctor', 'user-disconnected', {
          id: user.id,
          name: user.name || user.username || user.email,
          role: user.role
        });
      }

      broadcastToAdmins(io, activeUsers, 'user-status-update', {
        userId: user.id,
        username: user.username || user.name || user.email,
        role: user.role,
        isOnline: false
      });

      activeUsers.delete(socket.id);
      console.log(`👋 ${user.username || user.name || user.email} disconnected`);
    });
  });

  // Status log every 30s
  setInterval(() => {
    console.log(`📊 Active Users: ${activeUsers.size}, Active Calls: ${activeCalls.size}`);
    console.log('Users by role:', {
      doctors: getOnlineUsersByRole('doctor').length,
      employees: getOnlineUsersByRole('employee').length,
      admins: getOnlineUsersByRole('admin').length
    });
  }, 30000);
}

// Helper functions
function getOnlineUsersByRole(role) {
  const users = [];
  for (const [socketId, userData] of activeUsers.entries()) {
    if (userData.role === role) {
      users.push(getUserInfo(userData));
    }
  }
  return users;
}

function getUserInfo(userData) {
  return {
    id: userData.id,
    name: userData.name || userData.username || userData.email,
    role: userData.role,
    socketId: userData.socketId
  };
}

function broadcastToRole(io, activeUsers, targetRole, event, data) {
  for (const [socketId, user] of activeUsers.entries()) {
    if (user.role === targetRole) {
      io.to(socketId).emit(event, data);
    }
  }
}

function broadcastToAdmins(io, activeUsers, event, data) {
  for (const [socketId, user] of activeUsers.entries()) {
    if (user.role === 'admin') {
      io.to(socketId).emit(event, data);
    }
  }
}

module.exports = socketHandler;