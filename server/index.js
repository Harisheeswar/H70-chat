import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { db, connectMongo } from './db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'h70_fallback_secret_keys';

// Setup directories
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Express Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

// Multer storage for media sharing (images & audio messages)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || (file.mimetype === 'audio/webm' ? '.webm' : '.bin');
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage });

// JWT verify helper
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
};

// ----------------------------------------------------
// REST ENDPOINTS
// ----------------------------------------------------

// 1. Auth: Register
app.post('/api/auth/register', async (req, res) => {
  const { email, password, nickname } = req.body;
  if (!email || !password || !nickname) {
    return res.status(400).json({ error: 'All fields (email, password, nickname) are required' });
  }

  const existingUser = db.getUserByEmail(email);
  if (existingUser) {
    return res.status(400).json({ error: 'Email is already registered' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = db.createUser({
      id: Math.random().toString(36).substring(2, 9),
      email,
      password: hashedPassword,
      nickname,
      bio: 'Hey there! I am using H70 Chat.'
    });

    const token = jwt.sign({ id: newUser.id, email: newUser.email }, JWT_SECRET, { expiresIn: '7d' });
    const { password: _, ...userWithoutPassword } = newUser;
    res.status(201).json({ token, user: userWithoutPassword });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed. Try again.' });
  }
});

// 2. Auth: Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = db.getUserByEmail(email);
  if (!user) {
    return res.status(400).json({ error: 'Invalid email or password' });
  }

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    return res.status(400).json({ error: 'Invalid email or password' });
  }

  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  const { password: _, ...userWithoutPassword } = user;
  res.json({ token, user: userWithoutPassword });
});

// 3. Auth: Current Profile
app.get('/api/auth/me', authenticateToken, (req, res) => {
  const user = db.getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { password, ...userWithoutPassword } = user;
  res.json(userWithoutPassword);
});

// 4. Auth: Forgot Password
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const user = db.getUserByEmail(email);
  if (!user) {
    return res.json({ success: true, message: 'check sent mail for password reset' });
  }

  const resetToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  db.createResetToken(email, resetToken);

  const origin = req.get('origin') || 'https://h70-chat.onrender.com';
  const resetUrl = `${origin}/reset-password?token=${resetToken}`;
  console.log('\n=======================================');
  console.log(`PASSWORD RESET REQUEST FOR: ${email}`);
  console.log(`RESET URL: ${resetUrl}`);
  console.log('=======================================\n');

  let emailSent = false;
  
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : null;
  const smtpUser = process.env.SMTP_USER || 'h70support@gmail.com';
  const smtpPass = process.env.SMTP_PASS; // Gmail SMTP App Password

  if (smtpPass) {
    try {
      let transporter;
      if (!smtpHost && smtpUser.endsWith('@gmail.com')) {
        transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: smtpUser,
            pass: smtpPass
          }
        });
      } else {
        transporter = nodemailer.createTransport({
          host: smtpHost || 'smtp.gmail.com',
          port: smtpPort || 465,
          secure: (smtpPort || 465) === 465,
          auth: {
            user: smtpUser,
            pass: smtpPass
          }
        });
      }

      await transporter.sendMail({
        from: `"H70 Chat Support" <${smtpUser}>`,
        to: email,
        subject: 'Reset Password - H70 Chat',
        text: `Hello,\n\nYou requested a password reset for your account on H70. Please click on the link below to set a new password:\n\n${resetUrl}\n\nThis link is valid for 1 hour.\n\nIf you did not request this, please ignore this email.`,
        html: `<p>Hello,</p><p>You requested a password reset for your account on H70. Please click the link below to set a new password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link is valid for 1 hour.</p><p>If you did not request this, please ignore this email.</p>`
      });
      emailSent = true;
    } catch (err) {
      console.error('Failed to send SMTP email via h70support@gmail.com:', err.message);
    }
  } else {
    console.log('Gmail SMTP App Password (SMTP_PASS) not set, logs show reset link.');
  }

  res.json({
    success: true,
    message: 'check sent mail for password reset',
    devLink: process.env.NODE_ENV !== 'production' && !emailSent ? resetUrl : undefined
  });
});

// 5. Auth: Reset Password
app.post('/api/auth/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and new password are required' });

  const email = db.verifyResetToken(token);
  if (!email) {
    return res.status(400).json({ error: 'Invalid or expired reset token' });
  }

  try {
    const user = db.getUserByEmail(email);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const hashedPassword = await bcrypt.hash(password, 10);
    db.updateUser(user.id, { password: hashedPassword });
    db.removeResetToken(token);

    res.json({ success: true, message: 'Password has been reset successfully. You can now login.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// 6. Media Upload: Handles images and voice messages
app.post('/api/upload', upload.single('media'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No media file provided' });
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ url: fileUrl });
});

// 7. Profile: Update Bio
app.post('/api/profile/bio', authenticateToken, (req, res) => {
  const { bio } = req.body;
  if (bio === undefined) return res.status(400).json({ error: 'Bio content is required' });

  const updated = db.updateUser(req.user.id, { bio });
  const { password, ...user } = updated;
  res.json(user);
});

// 8. Profile: Add Story (Text or Image)
app.post('/api/profile/story', authenticateToken, (req, res) => {
  const { type, content } = req.body;
  if (!type || !content) return res.status(400).json({ error: 'Story type and content are required' });

  const user = db.getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const newStory = {
    id: Math.random().toString(36).substring(2, 9),
    type, // 'text' or 'image'
    content, // text string or image URL
    createdAt: new Date().toISOString()
  };

  const stories = user.stories ? [...user.stories] : [];
  stories.push(newStory);

  const updated = db.updateUser(req.user.id, { stories });
  
  // Notify sockets that user stories updated
  io.emit('user-story-updated', { userId: user.id, stories: updated.stories });

  const { password: _, ...userWithoutPassword } = updated;
  res.json(userWithoutPassword);
});

// 9. Profile: Update Avatar
app.post('/api/profile/avatar', authenticateToken, (req, res) => {
  const { avatarUrl } = req.body;
  if (!avatarUrl) return res.status(400).json({ error: 'Avatar URL is required' });

  const updated = db.updateUser(req.user.id, { avatar: avatarUrl });
  
  // Refresh active user socket caches
  for (const [socketId, activeUser] of activeSockets.entries()) {
    if (activeUser.id === req.user.id) {
      activeUser.avatar = avatarUrl;
    }
  }

  // Notify everyone of updated online user listings
  sendOnlineUsersList();

  const { password, ...user } = updated;
  res.json(user);
});

// 10. Users: Fetch All Registered Users
app.get('/api/users', (req, res) => {
  try {
    const users = db.getUsers();
    const filtered = users.filter(u => {
      const isSuper = u.role === 'supervisor' || u.email?.toLowerCase() === 'harisheeswar722@gmail.com' || u.nickname === 'hari980';
      return !isSuper;
    });
    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// 11. Friends: Add Friend
app.post('/api/friends/add', authenticateToken, (req, res) => {
  const { friendId } = req.body;
  if (!friendId) return res.status(400).json({ error: 'Friend ID is required' });
  
  const target = db.getUserById(friendId);
  if (!target) return res.status(404).json({ error: 'User not found' });
  
  const user = db.getUserById(req.user.id);
  const friends = user.friends ? [...user.friends] : [];
  if (!friends.includes(friendId)) {
    friends.push(friendId);
    const updated = db.updateUser(req.user.id, { friends });
    
    // Refresh active socket caches
    for (const [socketId, activeUser] of activeSockets.entries()) {
      if (activeUser.id === req.user.id) {
        activeUser.friends = friends;
      }
    }
    
    sendOnlineUsersList();
    const { password, ...userWithoutPassword } = updated;
    return res.json(userWithoutPassword);
  }
  const { password, ...userWithoutPassword } = user;
  res.json(userWithoutPassword);
});

// 12. Friends: Remove Friend
app.post('/api/friends/remove', authenticateToken, (req, res) => {
  const { friendId } = req.body;
  if (!friendId) return res.status(400).json({ error: 'Friend ID is required' });
  
  const user = db.getUserById(req.user.id);
  let friends = user.friends ? [...user.friends] : [];
  if (friends.includes(friendId)) {
    friends = friends.filter(id => id !== friendId);
    const updated = db.updateUser(req.user.id, { friends });
    
    // Refresh active socket caches
    for (const [socketId, activeUser] of activeSockets.entries()) {
      if (activeUser.id === req.user.id) {
        activeUser.friends = friends;
      }
    }
    
    sendOnlineUsersList();
    const { password, ...userWithoutPassword } = updated;
    return res.json(userWithoutPassword);
  }
  const { password, ...userWithoutPassword } = user;
  res.json(userWithoutPassword);
});

// 13. Blocks: Toggle Block User
app.post('/api/block/toggle', authenticateToken, (req, res) => {
  const { blockId } = req.body;
  if (!blockId) return res.status(400).json({ error: 'User ID to block/unblock is required' });
  
  const user = db.getUserById(req.user.id);
  let blockedUsers = user.blockedUsers ? [...user.blockedUsers] : [];
  if (blockedUsers.includes(blockId)) {
    blockedUsers = blockedUsers.filter(id => id !== blockId);
  } else {
    blockedUsers.push(blockId);
  }
  const updated = db.updateUser(req.user.id, { blockedUsers });
  
  // Refresh active socket caches
  for (const [socketId, activeUser] of activeSockets.entries()) {
    if (activeUser.id === req.user.id) {
      activeUser.blockedUsers = blockedUsers;
    }
  }
  
  sendOnlineUsersList();
  const { password, ...userWithoutPassword } = updated;
  res.json(userWithoutPassword);
});

// 14. Reports: Report User
app.post('/api/report', authenticateToken, (req, res) => {
  const { reportedId, reason } = req.body;
  if (!reportedId || !reason) return res.status(400).json({ error: 'Reported user ID and reason are required' });
  
  const target = db.getUserById(reportedId);
  if (!target) return res.status(404).json({ error: 'User not found' });
  
  const newReport = db.createReport({
    reporterId: req.user.id,
    reportedId,
    reason
  });
  res.status(201).json({ success: true, report: newReport });
});

// 15. Settings: Update User Settings
app.post('/api/profile/settings', authenticateToken, (req, res) => {
  const { privacyMode, soundLevel, notificationsEnabled } = req.body;
  const updates = {};
  if (privacyMode !== undefined) updates.privacyMode = privacyMode;
  if (soundLevel !== undefined) updates.soundLevel = parseInt(soundLevel);
  if (notificationsEnabled !== undefined) updates.notificationsEnabled = !!notificationsEnabled;
  
  const updated = db.updateUser(req.user.id, updates);
  
  // Refresh active socket caches
  for (const [socketId, activeUser] of activeSockets.entries()) {
    if (activeUser.id === req.user.id) {
      if (privacyMode !== undefined) activeUser.privacyMode = privacyMode;
      if (soundLevel !== undefined) activeUser.soundLevel = parseInt(soundLevel);
      if (notificationsEnabled !== undefined) activeUser.notificationsEnabled = !!notificationsEnabled;
    }
  }
  sendOnlineUsersList();
  
  const { password, ...userWithoutPassword } = updated;
  res.json(userWithoutPassword);
});

// ----------------------------------------------------
// SOCKET.IO REAL-TIME LOGIC
// ----------------------------------------------------

// Store maps of socket IDs to user details
const activeSockets = new Map(); // socket.id -> { userId, nickname, level, xp }
const activeUsers = new Map(); // userId -> socket.id (for easy 1-on-1 routing)

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // User details identification on socket connection
  socket.on('identify', ({ token, guestNickname }) => {
    let userDetails = null;

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = db.getUserById(decoded.id);
        if (user) {
          userDetails = {
            id: user.id,
            nickname: user.nickname,
            level: user.level || 1,
            xp: user.xp || 0,
            bio: user.bio,
            avatar: user.avatar || null,
            role: user.role || 'user',
            friends: user.friends || [],
            blockedUsers: user.blockedUsers || [],
            privacyMode: user.privacyMode || 'public',
            soundLevel: user.soundLevel || 80,
            notificationsEnabled: user.notificationsEnabled !== undefined ? user.notificationsEnabled : true,
            stories: user.stories || []
          };
        }
      } catch (err) {
        console.log('Invalid token on identify, treating as guest if nickname provided');
      }
    }

    // Fallback: anonymous guest login (matching Y99 anonymity)
    if (!userDetails) {
      const guestId = 'guest_' + Math.random().toString(36).substring(2, 9);
      const nickname = guestNickname || `Guest_${Math.random().toString(36).substring(2, 6)}`;
      userDetails = {
        id: guestId,
        nickname,
        level: 1,
        xp: 0,
        bio: 'Just passing through anonymously!',
        avatar: null,
        role: 'user',
        friends: [],
        blockedUsers: [],
        privacyMode: 'public',
        soundLevel: 80,
        notificationsEnabled: true,
        stories: [],
        isGuest: true
      };
    }

    activeSockets.set(socket.id, userDetails);
    activeUsers.set(userDetails.id, socket.id);

    // Join default general room
    socket.join('general');
    
    // Broadcast user list updates
    sendOnlineUsersList();

    // Confirm connection
    socket.emit('ready', { 
      user: userDetails, 
      rooms: db.getRooms(),
      unreadCounts: db.getUnreadDmCounts(userDetails.id),
      dmContacts: userDetails.isGuest ? [] : db.getDmContacts(userDetails.id)
    });
  });

  // Handle room changes
  socket.on('join-room', (roomId) => {
    const user = activeSockets.get(socket.id);
    if (!user) return;

    // Leave former rooms except their own individual rooms
    for (const room of socket.rooms) {
      if (room !== socket.id && room !== roomId) {
        socket.leave(room);
      }
    }

    socket.join(roomId);
    
    // Send previous room messages
    const roomMessages = db.getMessages({ roomId });
    socket.emit('room-history', { roomId, messages: roomMessages });
  });

  // Return list of users the logged-in user has DM history with
  socket.on('get-dm-contacts', () => {
    const user = activeSockets.get(socket.id);
    if (!user || user.isGuest) return socket.emit('dm-contacts', []);
    const contacts = db.getDmContacts(user.id);
    socket.emit('dm-contacts', contacts);
  });

  // Create custom room
  socket.on('create-room', ({ name }) => {
    const user = activeSockets.get(socket.id);
    if (!user || !name) return;

    const roomId = 'room_' + Math.random().toString(36).substring(2, 9);
    const newRoom = db.createRoom({
      id: roomId,
      name,
      creatorId: user.id
    });

    // Notify all active users of the new room
    io.emit('new-room-created', newRoom);
    
    // Join the creator to the room
    socket.emit('room-created-success', roomId);
  });

  // Promote user to Room Admin
  socket.on('promote-to-admin', ({ roomId, userId }) => {
    const user = activeSockets.get(socket.id);
    if (!user) return;

    const rooms = db.getRooms();
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;

    // Verify sender is admin (fall back to creator check)
    const isAdmin = (room.admins && room.admins.includes(user.id)) || room.creatorId === user.id;
    if (!isAdmin) return;

    const updatedAdmins = room.admins ? [...room.admins] : [room.creatorId];
    if (!updatedAdmins.includes(userId)) {
      updatedAdmins.push(userId);
      db.updateRoom(roomId, { admins: updatedAdmins });

      // Notify room members
      io.to(roomId).emit('room-admins-updated', { roomId, admins: updatedAdmins });
      
      // Update global room lists to refresh caches
      io.emit('rooms-updated', db.getRooms());
    }
  });

  // Update Room Avatar Profile Picture
  socket.on('update-room-avatar', ({ roomId, avatarUrl }) => {
    const user = activeSockets.get(socket.id);
    if (!user) return;

    const rooms = db.getRooms();
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;

    // Verify sender is admin (fall back to creator check)
    const isAdmin = (room.admins && room.admins.includes(user.id)) || room.creatorId === user.id;
    if (!isAdmin) return;

    db.updateRoom(roomId, { avatar: avatarUrl });

    // Notify room members
    io.to(roomId).emit('room-avatar-updated', { roomId, avatar: avatarUrl });

    // Update global room lists
    io.emit('rooms-updated', db.getRooms());
  });

  // Delete Room (Supervisor or Room Creator only)
  socket.on('delete-room', ({ roomId }) => {
    const user = activeSockets.get(socket.id);
    if (!user) return;

    const rooms = db.getRooms();
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;

    const isSuper = user.role === 'supervisor' || user.email?.toLowerCase() === 'harisheeswar722@gmail.com' || user.nickname === 'hari980';
    const isCreator = room.creatorId === user.id;

    if (!isSuper && !isCreator) return;

    // Delete the room from database
    db.deleteRoom(roomId);

    // Notify room members to redirect
    io.to(roomId).emit('room-deleted', roomId);

    // Refresh global rooms lists
    io.emit('rooms-updated', db.getRooms());
  });

  // Kick User (Supervisor only)
  socket.on('kick-user', ({ roomId, userId }) => {
    const user = activeSockets.get(socket.id);
    if (!user) return;

    const isSuper = user.role === 'supervisor' || user.email?.toLowerCase() === 'harisheeswar722@gmail.com' || user.nickname === 'hari980';
    if (!isSuper) return;

    // Find the sockets belonging to target user
    for (const [sId, activeUser] of activeSockets.entries()) {
      if (activeUser.id === userId) {
        const targetSocket = io.sockets.sockets.get(sId);
        if (targetSocket) {
          targetSocket.leave(roomId);
          targetSocket.emit('kicked-from-room', { roomId });
        }
      }
    }
  });

  // Send public room message
  socket.on('send-room-message', ({ roomId, type, content }) => {
    const user = activeSockets.get(socket.id);
    if (!user) return;

    const msg = db.createMessage({
      roomId,
      senderId: user.id,
      senderNickname: user.nickname,
      senderLevel: user.level,
      type, // 'text', 'image', 'audio'
      content
    });

    io.to(roomId).emit('room-message', msg);
  });

  // Send Direct Message (DM)
  socket.on('send-direct-message', ({ recipientId, type, content }) => {
    const user = activeSockets.get(socket.id);
    if (!user) return;

    const sender = db.getUserById(user.id);
    const recipient = db.getUserById(recipientId);
    if (!recipient) return;

    // Generate standard sorted chat key for the two users
    const chatKey = [user.id, recipientId].sort().join('-');

    // Block check: If target blocked sender
    const isSenderBlocked = recipient.blockedUsers && recipient.blockedUsers.includes(user.id);
    if (isSenderBlocked) {
      return socket.emit('direct-message-error', { error: 'You are blocked by this user.' });
    }

    // Determine mutual friendship status
    const senderAddedRecipient = sender.friends && sender.friends.includes(recipientId);
    const recipientAddedSender = recipient.friends && recipient.friends.includes(user.id);
    const isMutualFriends = senderAddedRecipient && recipientAddedSender;

    // Private profile check: recipient is private and not mutual friends
    if (recipient.privacyMode === 'private' && !isMutualFriends) {
      return socket.emit('direct-message-error', { error: 'This user\'s profile is Private. You can only message them if you are mutual friends.' });
    }

    const msg = db.createMessage({
      chatKey,
      senderId: user.id,
      senderNickname: user.nickname,
      senderLevel: user.level,
      recipientId,
      type,
      content
    });

    // Save message and emit to both parties
    socket.emit('direct-message', msg); // send back to sender
    
    const recipientSocketId = activeUsers.get(recipientId);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('direct-message', msg);
    }

    // Update dm-contacts for both parties so DM list updates live
    socket.emit('dm-contacts', db.getDmContacts(user.id));
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('dm-contacts', db.getDmContacts(recipientId));
    }
  });

  // Load private DM message history
  socket.on('get-direct-history', ({ recipientId }) => {
    const user = activeSockets.get(socket.id);
    if (!user) return;

    const chatKey = [user.id, recipientId].sort().join('-');
    const messages = db.getMessages({ chatKey });
    socket.emit('direct-history', { recipientId, messages });
  });

  // Mark direct messages as read
  socket.on('mark-message-read', ({ chatKey }) => {
    const user = activeSockets.get(socket.id);
    if (!user || !chatKey) return;

    const updatedMessages = db.markMessagesAsRead(chatKey, user.id);
    socket.emit('direct-history-updated', { chatKey, messages: updatedMessages });

    const ids = chatKey.split('-');
    const recipientId = ids.find(id => id !== user.id);
    if (recipientId) {
      const recipientSocketId = activeUsers.get(recipientId);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('direct-history-updated', { chatKey, messages: updatedMessages });
      }
    }
  });

  // ----------------------------------------------------
  // WEBRTC SIGNALING (1-ON-1 CALLS & ROOM CALLS)
  // ----------------------------------------------------

  // 1-on-1 Calling
  socket.on('call-user', ({ to, offer, type }) => {
    const fromUser = activeSockets.get(socket.id);
    if (!fromUser) return;

    const sender = db.getUserById(fromUser.id);
    const recipient = db.getUserById(to);
    if (!recipient) return;

    const senderAddedRecipient = sender.friends && sender.friends.includes(to);
    const recipientAddedSender = recipient.friends && recipient.friends.includes(fromUser.id);
    const isMutualFriends = senderAddedRecipient && recipientAddedSender;

    if (!isMutualFriends) {
      return socket.emit('call-error', { error: 'You must be mutual friends to initiate voice/video calls.' });
    }

    const targetSocketId = activeUsers.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call-made', {
        offer,
        from: fromUser.id,
        fromNickname: fromUser.nickname,
        type // 'audio' or 'video'
      });
    }
  });

  socket.on('make-answer', ({ to, answer }) => {
    const targetSocketId = activeUsers.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('answer-made', {
        socket: socket.id,
        answer
      });
    }
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    const targetSocketId = activeUsers.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('ice-candidate', {
        candidate,
        from: activeSockets.get(socket.id)?.id
      });
    }
  });

  socket.on('reject-call', ({ to }) => {
    const targetSocketId = activeUsers.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call-rejected');
    }
  });

  socket.on('hangup', ({ to }) => {
    const targetSocketId = activeUsers.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call-hungup');
    }
  });

  // Room Calls (Mesh Signaling Support)
  // Users join a voice/video session in a specific chat room
  socket.on('join-room-call', ({ roomId, type }) => {
    const user = activeSockets.get(socket.id);
    if (!user) return;

    const callRoomName = `call-${roomId}`;
    socket.join(callRoomName);

    // Get all other sockets currently in this call room
    const clients = io.sockets.adapter.rooms.get(callRoomName);
    const existingParticipants = [];
    if (clients) {
      for (const clientId of clients) {
        if (clientId !== socket.id) {
          const u = activeSockets.get(clientId);
          if (u) {
            existingParticipants.push({ socketId: clientId, userId: u.id, nickname: u.nickname });
          }
        }
      }
    }

    // Tell the new user who is already in the call
    socket.emit('room-call-participants', { participants: existingParticipants });

    // Tell existing participants that a new user has joined the call
    socket.to(callRoomName).emit('user-joined-room-call', {
      socketId: socket.id,
      userId: user.id,
      nickname: user.nickname
    });
  });

  socket.on('leave-room-call', ({ roomId }) => {
    const callRoomName = `call-${roomId}`;
    socket.leave(callRoomName);
    socket.to(callRoomName).emit('user-left-room-call', { socketId: socket.id });
  });

  // Disconnection cleanup
  socket.on('disconnect', () => {
    const user = activeSockets.get(socket.id);
    if (user) {
      activeUsers.delete(user.id);
      activeSockets.delete(socket.id);
      console.log(`User offline: ${user.nickname} (${user.id})`);

      // Save lastSeen on disconnection
      if (!user.isGuest) {
        db.updateUser(user.id, { lastSeen: new Date().toISOString() });
      }

      // Notify all call rooms that this socket disconnected
      for (const room of socket.rooms) {
        if (room.startsWith('call-')) {
          socket.to(room).emit('user-left-room-call', { socketId: socket.id });
        }
      }
    }
    sendOnlineUsersList();
  });
});

// Broadcast online users (with levels & bios) to everyone, hiding Supervisors from other users
  function sendOnlineUsersList() {
    for (const [socketId, socket] of io.of("/").sockets.entries()) {
      const viewer = activeSockets.get(socketId);
      const users = [];
      const processed = new Set();
  
      // 1. Add online users
      for (const [sId, activeUser] of activeSockets.entries()) {
        if (!processed.has(activeUser.id)) {
          processed.add(activeUser.id);
  
          const isTargetSupervisor = activeUser.role === 'supervisor' || activeUser.email?.toLowerCase() === 'harisheeswar722@gmail.com' || activeUser.nickname === 'hari980';
          const isViewerSelf = viewer && viewer.id === activeUser.id;
  
          // Exclude supervisor from list sent to other users
          if (isTargetSupervisor && !isViewerSelf) {
            continue;
          }
  
          users.push({
            id: activeUser.id,
            nickname: activeUser.nickname,
            level: activeUser.level,
            xp: activeUser.xp,
            bio: activeUser.bio,
            avatar: activeUser.avatar || null,
            role: activeUser.role || 'user',
            friends: activeUser.friends || [],
            blockedUsers: activeUser.blockedUsers || [],
            privacyMode: activeUser.privacyMode || 'public',
            isOnline: true,
            lastSeen: new Date().toISOString(),
            stories: activeUser.stories || []
          });
        }
      }

      // 2. Add offline registered users
      const registered = db.getUsers();
      registered.forEach(regUser => {
        if (!processed.has(regUser.id)) {
          processed.add(regUser.id);

          const isTargetSupervisor = regUser.role === 'supervisor' || regUser.email?.toLowerCase() === 'harisheeswar722@gmail.com' || regUser.nickname === 'hari980';
          if (isTargetSupervisor) return;

          users.push({
            id: regUser.id,
            nickname: regUser.nickname,
            level: regUser.level,
            xp: regUser.xp,
            bio: regUser.bio,
            avatar: regUser.avatar || null,
            role: regUser.role || 'user',
            friends: regUser.friends || [],
            blockedUsers: regUser.blockedUsers || [],
            privacyMode: regUser.privacyMode || 'public',
            isOnline: false,
            lastSeen: regUser.lastSeen || regUser.createdAt,
            stories: regUser.stories || []
          });
        }
      });

      socket.emit('online-users', users);
    }
  }

// ----------------------------------------------------
// USER PROGRESSION (LEVELS AND XP ENGINE)
// ----------------------------------------------------
// Gives online registered users 5 XP every 30 seconds of active socket connection.
setInterval(() => {
  const processedUserIds = new Set();

  for (const [socketId, user] of activeSockets.entries()) {
    // Guest accounts do not level up or persist, matching standard gamification rules
    if (user.isGuest || processedUserIds.has(user.id)) continue;
    processedUserIds.add(user.id);

    const dbUser = db.getUserById(user.id);
    if (!dbUser) continue;

    let newXp = (dbUser.xp || 0) + 5;
    let newLevel = dbUser.level || 1;

    // Check level up (100 XP per level)
    if (newXp >= 100) {
      newXp = newXp - 100;
      newLevel += 1;
      
      // Trigger instant level-up socket event to specific client
      io.to(socketId).emit('level-up-alert', { level: newLevel });
      console.log(`User ${dbUser.nickname} leveled up to Level ${newLevel}!`);
    }

    // Save update to database
    db.updateUser(user.id, { xp: newXp, level: newLevel });

    // Update active memory cache
    user.xp = newXp;
    user.level = newLevel;

    // Notify the user client of their updated stats
    io.to(socketId).emit('stats-updated', { xp: newXp, level: newLevel });
  }

  // Periodic broadcast of updated user levels to keep user list badges synced
  if (processedUserIds.size > 0) {
    sendOnlineUsersList();
  }
}, 30000); // 30 seconds interval

// Serve Vite frontend client in production
const clientDistPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientDistPath, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

app.get('*', (req, res) => {
  const indexHtml = path.join(clientDistPath, 'index.html');
  if (fs.existsSync(indexHtml)) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(indexHtml);
  } else {
    res.status(404).send('Frontend static files not found. Run npm run build first.');
  }
});

server.listen(PORT, async () => {
  await connectMongo();
  console.log(`H70 Chat Server listening on port ${PORT}`);
});
