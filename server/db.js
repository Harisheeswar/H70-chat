import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, 'db.json');

const MONGODB_URI = process.env.MONGODB_URI;
let mongoClient = null;
let mongoCollection = null;
let isConnected = false;

// Connect to MongoDB and pull state
export async function connectMongo() {
  if (!MONGODB_URI) {
    console.log('MONGODB_URI not set. Operating in local-only file database mode.');
    return;
  }
  try {
    console.log('Connecting to MongoDB Atlas...');
    mongoClient = new MongoClient(MONGODB_URI, {
      connectTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000
    });
    await mongoClient.connect();
    const dbName = mongoClient.s.options.dbName || 'h70_chat';
    const database = mongoClient.db(dbName);
    mongoCollection = database.collection('db_state');
    isConnected = true;
    console.log('Connected to MongoDB Atlas successfully.');
    
    await pullFromMongo();
  } catch (err) {
    console.error('Failed to connect to MongoDB, using local file storage:', err.message);
  }
}

// Pull state from MongoDB to local file
async function pullFromMongo() {
  if (!isConnected || !mongoCollection) return;
  try {
    const doc = await mongoCollection.findOne({ _id: 'h70_state' });
    if (doc && doc.data) {
      console.log('Pulled latest database state from MongoDB.');
      fs.writeFileSync(DB_FILE, JSON.stringify(doc.data, null, 2), 'utf8');
    } else {
      console.log('No existing state found in MongoDB. Initializing with local data.');
      const localData = readData();
      await mongoCollection.updateOne(
        { _id: 'h70_state' },
        { $set: { data: localData } },
        { upsert: true }
      );
    }
  } catch (err) {
    console.error('Failed to pull data from MongoDB:', err.message);
  }
}

// Push state to MongoDB (asynchronous, non-blocking)
async function pushToMongo(data) {
  if (!isConnected || !mongoCollection) return;
  try {
    await mongoCollection.updateOne(
      { _id: 'h70_state' },
      { $set: { data } },
      { upsert: true }
    );
  } catch (err) {
    console.error('Failed to push data to MongoDB:', err.message);
  }
}

// Initialize database with default structure if it does not exist
function initDb() {
  if (!fs.existsSync(DB_FILE)) {
    const defaultData = {
      users: [],
      rooms: [],
      messages: [],
      resetTokens: [],
      reports: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), 'utf8');
  }
}

// Read database contents
export function readData() {
  initDb();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.error('Error reading database file, returning default structure', error);
    return { users: [], rooms: [], messages: [], resetTokens: [], reports: [] };
  }
}

// Write database contents
export function writeData(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    if (isConnected) {
      pushToMongo(data);
    }
    return true;
  } catch (error) {
    console.error('Error writing database file', error);
    return false;
  }
}

// Helper methods to modify database collections
const autoCleanUserStories = (user, data) => {
  if (!user || !user.stories) return;
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const fresh = user.stories.filter(s => new Date(s.createdAt) > oneDayAgo);
  if (fresh.length !== user.stories.length) {
    user.stories = fresh;
    const idx = data.users.findIndex(u => u.id === user.id);
    if (idx !== -1) {
      data.users[idx].stories = fresh;
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    }
  }
};

export const db = {
  // Users
  getUserByEmail: (email) => {
    const data = readData();
    const user = data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (user) autoCleanUserStories(user, data);
    return user;
  },
  getUserById: (id) => {
    const data = readData();
    const user = data.users.find(u => u.id === id);
    if (user) autoCleanUserStories(user, data);
    return user;
  },
  createUser: (user) => {
    const data = readData();
    const newUser = {
      id: user.id,
      email: user.email.toLowerCase(),
      password: user.password,
      nickname: user.nickname,
      bio: user.bio || '',
      avatar: null,
      role: 'user',
      level: 1,
      xp: 0,
      friends: [],
      blockedUsers: [],
      privacyMode: 'public',
      lastSeen: new Date().toISOString(),
      soundLevel: 80,
      notificationsEnabled: true,
      stories: [],
      createdAt: new Date().toISOString(),
      ...user
    };
    data.users.push(newUser);
    writeData(data);
    return newUser;
  },
  updateUser: (id, updates) => {
    const data = readData();
    const index = data.users.findIndex(u => u.id === id);
    if (index !== -1) {
      data.users[index] = { ...data.users[index], ...updates };
      writeData(data);
      return data.users[index];
    }
    return null;
  },
  getUsers: () => {
    const data = readData();
    data.users.forEach(u => autoCleanUserStories(u, data));
    return data.users.map(({ password, ...u }) => u); // Return without password for safety
  },

  // Rooms
  getRooms: () => {
    const data = readData();
    return data.rooms;
  },
  createRoom: (room) => {
    const data = readData();
    const newRoom = {
      id: room.id,
      name: room.name,
      creatorId: room.creatorId,
      admins: [room.creatorId],
      avatar: null,
      createdAt: new Date().toISOString()
    };
    data.rooms.push(newRoom);
    writeData(data);
    return newRoom;
  },
  updateRoom: (id, updates) => {
    const data = readData();
    const index = data.rooms.findIndex(r => r.id === id);
    if (index !== -1) {
      data.rooms[index] = { ...data.rooms[index], ...updates };
      writeData(data);
      return data.rooms[index];
    }
    return null;
  },
  deleteRoom: (id) => {
    const data = readData();
    data.rooms = data.rooms.filter(r => r.id !== id);
    data.messages = data.messages.filter(m => m.roomId !== id);
    writeData(data);
    return true;
  },
  clearMessages: (chatKey) => {
    const data = readData();
    data.messages = data.messages.filter(m => m.chatKey !== chatKey);
    writeData(data);
    return true;
  },

  // Messages
  getMessages: (filter) => {
    const data = readData();
    // Clean up expired stories while we read
    cleanExpiredStories(data);
    
    let list = data.messages;
    if (filter.roomId) {
      list = list.filter(m => m.roomId === filter.roomId);
    } else if (filter.chatKey) {
      // DMs chat key is e.g. "userId1-userId2" sorted alphabetically
      list = list.filter(m => m.chatKey === filter.chatKey);
    }
    // Limit to latest 100 messages to prevent clutter
    return list.slice(-100);
  },
  createMessage: (msg) => {
    const data = readData();
    const newMessage = {
      id: msg.id || Math.random().toString(36).substring(2, 9),
      roomId: msg.roomId || null,
      chatKey: msg.chatKey || null,
      senderId: msg.senderId,
      senderNickname: msg.senderNickname,
      senderLevel: msg.senderLevel || 1,
      senderAnimal: msg.senderAnimal || null,
      recipientId: msg.recipientId || null,
      type: msg.type || 'text', // 'text', 'image', 'audio'
      content: msg.content,
      read: false,
      createdAt: new Date().toISOString()
    };
    data.messages.push(newMessage);
    writeData(data);
    return newMessage;
  },

  // Reset Tokens
  createResetToken: (email, token) => {
    const data = readData();
    // Clear old tokens for this email
    data.resetTokens = data.resetTokens.filter(t => t.email.toLowerCase() !== email.toLowerCase());
    
    const expiresAt = new Date(Date.now() + 3600000).toISOString(); // 1 hour expiry
    const entry = { email: email.toLowerCase(), token, expiresAt };
    data.resetTokens.push(entry);
    writeData(data);
    return entry;
  },
  verifyResetToken: (token) => {
    const data = readData();
    const entry = data.resetTokens.find(t => t.token === token);
    if (!entry) return null;
    
    const isExpired = new Date(entry.expiresAt).getTime() < Date.now();
    if (isExpired) {
      // Remove expired token
      data.resetTokens = data.resetTokens.filter(t => t.token !== token);
      writeData(data);
      return null;
    }
    return entry.email;
  },
  removeResetToken: (token) => {
    const data = readData();
    data.resetTokens = data.resetTokens.filter(t => t.token !== token);
    writeData(data);
  },
  createReport: (report) => {
    const data = readData();
    if (!data.reports) data.reports = [];
    const newReport = {
      id: Math.random().toString(36).substring(2, 9),
      reporterId: report.reporterId,
      reportedId: report.reportedId,
      reason: report.reason,
      createdAt: new Date().toISOString()
    };
    data.reports.push(newReport);
    writeData(data);
    return newReport;
  },
  getReports: () => {
    const data = readData();
    return data.reports || [];
  },
  markMessagesAsRead: (chatKey, userId) => {
    const data = readData();
    let updated = false;
    data.messages = data.messages.map(m => {
      if (m.chatKey === chatKey && m.senderId !== userId && !m.read) {
        m.read = true;
        updated = true;
      }
      return m;
    });
    if (updated) {
      writeData(data);
    }
    return data.messages.filter(m => m.chatKey === chatKey);
  },
  getUnreadDmCounts: (userId) => {
    const data = readData();
    const unread = data.messages.filter(m => m.chatKey && m.recipientId === userId && m.read === false);
    const counts = {};
    unread.forEach(m => {
      counts[m.senderId] = (counts[m.senderId] || 0) + 1;
    });
    return counts;
  },
  // Returns array of userIds that the given user has any DM history with
  getDmContacts: (userId) => {
    const data = readData();
    const contacts = new Set();
    data.messages.forEach(m => {
      if (m.chatKey && m.chatKey.includes(userId)) {
        // chatKey is "idA-idB" sorted — pick the other user
        const parts = m.chatKey.split('-');
        // parts can be 2 UUIDs separated by '-', but UUIDs contain '-' too
        // chatKey was built as [userId1, userId2].sort().join('-')
        // We identify contacts by senderId / recipientId fields
        if (m.senderId === userId && m.recipientId) contacts.add(m.recipientId);
        if (m.recipientId === userId && m.senderId) contacts.add(m.senderId);
      }
    });
    return Array.from(contacts);
  }
};

// Auto-clean stories older than 24 hours
function cleanExpiredStories(data) {
  let changed = false;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  
  data.users.forEach(user => {
    if (user.stories && user.stories.length > 0) {
      const initialLength = user.stories.length;
      user.stories = user.stories.filter(s => new Date(s.createdAt).getTime() > cutoff);
      if (user.stories.length !== initialLength) {
        changed = true;
      }
    }
  });

  if (changed) {
    writeData(data);
  }
}
