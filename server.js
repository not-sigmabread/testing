const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// Serve static files
app.use(express.static('public'));

// In-memory storage (replace with database in production)
const users = new Map();
const messages = new Map();
const typingUsers = new Map();
const bannedUsers = new Set();
const shadowBannedUsers = new Set();

// Initialize default channels
['announcements', 'general', 'links'].forEach(channel => {
  messages.set(channel, []);
});

// Role hierarchy (higher index = more permissions)
const roles = ['guest', 'user', 'link-access', 'announcer', 'mod', 'admin', 'owner'];

// Initialize owner account
users.set('sigmabread', {
  username: 'sigmabread',
  displayName: 'Sigma Bread',
  role: 'owner',
  password: '123', // In production, use hashed password
  avatar: '/placeholder.svg?height=80&width=80',
  theme: 'dark',
  badges: ['👑', '⭐'],
  bio: 'Server Owner',
  createdAt: Date.now()
});

// Middleware to check user permissions
const canPerformAction = (user, action) => {
  if (!user) return false;
  const userRoleIndex = roles.indexOf(user.role);
  
  switch(action) {
    case 'post_announcement':
      return ['announcer', 'mod', 'admin', 'owner'].includes(user.role);
    case 'post_link':
      return ['link-access', 'mod', 'admin', 'owner'].includes(user.role);
    case 'access_admin':
      return ['mod', 'admin', 'owner'].includes(user.role);
    case 'modify_roles':
      return ['admin', 'owner'].includes(user.role);
    default:
      return true;
  }
};

io.on('connection', (socket) => {
  let currentUser = null;

  // Authentication
  socket.on('auth', async ({ username, password, isGuest }) => {
    if (isGuest) {
      currentUser = {
        username: `Guest_${Math.floor(Math.random() * 10000)}`,
        displayName: 'Guest User',
        role: 'guest',
        avatar: '/placeholder.svg?height=80&width=80',
        theme: 'dark'
      };
    } else if (username === 'sigmabread' && password === '123') {
      currentUser = users.get('sigmabread');
    } else {
      // Auto-create user for demo (replace with proper auth in production)
      if (!users.has(username)) {
        users.set(username, {
          username,
          displayName: username,
          role: 'user',
          password,
          avatar: '/placeholder.svg?height=80&width=80',
          theme: 'dark',
          createdAt: Date.now()
        });
      }
      currentUser = users.get(username);
    }

    if (currentUser) {
      socket.join('general'); // Auto-join general channel
      socket.emit('auth:success', currentUser);
      socket.emit('messages:history', {
        channel: 'general',
        messages: messages.get('general')
      });
      io.emit('users:update', Array.from(users.values()).map(u => ({
        username: u.username,
        displayName: u.displayName,
        role: u.role,
        avatar: u.avatar
      })));
    }
  });

  // Channel management
  socket.on('channel:join', (channel) => {
    if (!currentUser) return;
    socket.join(channel);
    socket.emit('messages:history', {
      channel,
      messages: messages.get(channel)
    });
  });

  // Messaging
  socket.on('message:send', ({ channel, content }) => {
    if (!currentUser || bannedUsers.has(currentUser.username)) return;
    
    // Check channel permissions
    if (channel === 'announcements' && !canPerformAction(currentUser, 'post_announcement')) {
      socket.emit('error', 'No permission to post in announcements');
      return;
    }
    if (channel === 'links' && !canPerformAction(currentUser, 'post_link')) {
      socket.emit('error', 'No permission to post in links channel');
      return;
    }

    const message = {
      id: Date.now().toString(),
      content,
      author: currentUser.username,
      displayName: currentUser.displayName,
      role: currentUser.role,
      timestamp: Date.now(),
      edited: false
    };

    messages.get(channel).push(message);

    // Don't broadcast messages from shadowbanned users
    if (!shadowBannedUsers.has(currentUser.username)) {
      io.to(channel).emit('message:new', { channel, message });
    } else {
      // Only send to the shadowbanned user
      socket.emit('message:new', { channel, message });
    }
  });

  // Admin actions
  socket.on('admin:action', ({ action, target, data }) => {
    if (!currentUser || !canPerformAction(currentUser, 'access_admin')) return;

    switch(action) {
      case 'ban':
        bannedUsers.add(target);
        io.emit('user:banned', target);
        break;
      case 'shadowban':
        shadowBannedUsers.add(target);
        break;
      case 'purge':
        if (messages.has(target)) {
          messages.set(target, []);
          io.to(target).emit('channel:purged', target);
        }
        break;
      case 'modify_role':
        if (canPerformAction(currentUser, 'modify_roles')) {
          const targetUser = users.get(target);
          if (targetUser) {
            targetUser.role = data.role;
            io.emit('user:updated', targetUser);
          }
        }
        break;
    }
  });

  // Typing indicators
  socket.on('typing:start', ({ channel }) => {
    if (!currentUser) return;
    typingUsers.set(currentUser.username, channel);
    socket.to(channel).emit('user:typing', {
      username: currentUser.username,
      displayName: currentUser.displayName
    });
  });

  socket.on('typing:stop', ({ channel }) => {
    if (!currentUser) return;
    typingUsers.delete(currentUser.username);
    socket.to(channel).emit('user:stopped_typing', currentUser.username);
  });

  // Cleanup on disconnect
  socket.on('disconnect', () => {
    if (currentUser) {
      typingUsers.delete(currentUser.username);
      io.emit('user:offline', currentUser.username);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
