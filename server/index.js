import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { db, connectMongo, readData } from './db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

const configuredOrigins = (process.env.CLIENT_ORIGIN || process.env.CORS_ORIGIN || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);
const isProduction = process.env.NODE_ENV === 'production';
const allowAllOrigins = !isProduction && configuredOrigins.length === 0;

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowAllOrigins || configuredOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS origin not allowed'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true
};

const io = new Server(server, { cors: corsOptions });

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  if (isProduction) {
    throw new Error('JWT_SECRET must be configured in production');
  }
  console.warn('WARNING: JWT_SECRET is not set. Configure it before deploying publicly.');
}

const EFFECTIVE_JWT_SECRET = JWT_SECRET || 'dev-only-change-me';

// Setup directories
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.disable('x-powered-by');
app.use(cors(corsOptions));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use('/uploads', express.static(uploadsDir, { maxAge: '1d', index: false }));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname) || (file.mimetype === 'audio/webm' ? '.webm' : '.bin');
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024, files: 1 }
});

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    req.user = jwt.verify(token, EFFECTIVE_JWT_SECRET);
    return next();
  } catch {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'h70-chat', time: new Date().toISOString() });
});

// ----------------------------------------------------
// REST ENDPOINTS
// ----------------------------------------------------

// 1. Auth: Register
app.post('/api/auth/register', async (req, res) => {
  const { email, password, nickname } = req.body;
  if (!email || !password || !nickname) {
    return res.status(400).json({ error: 'All fields (email, password, nickname) are required' });
  }

  const existingUser = await db.getUserByEmail(email);
  if (existingUser) {
    return res.status(400).json({ error: 'Email is already registered' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await db.createUser({
      id: crypto.randomBytes(6).toString('hex'),
      email,
      password: hashedPassword,
      nickname,
      bio: 'Hey there! I am using H70 Chat.'
    });

    const token = jwt.sign({ id: newUser.id, email: newUser.email }, EFFECTIVE_JWT_SECRET, { expiresIn: '7d' });
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

  const user = await db.getUserByEmail(email);
  if (!user) {
    return res.status(400).json({ error: 'Invalid email or password' });
  }

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    return res.status(400).json({ error: 'Invalid email or password' });
  }

  const token = jwt.sign({ id: user.id, email: user.email }, EFFECTIVE_JWT_SECRET, { expiresIn: '7d' });
  const { password: _, ...userWithoutPassword } = user;
  res.json({ token, user: userWithoutPassword });
});

// 3. Auth: Current Profile
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  const user = await db.getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { password, ...userWithoutPassword } = user;
  res.json(userWithoutPassword);
});

// 4. Auth: Forgot Password
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const user = await db.getUserByEmail(email);
  if (!user) {
    return res.json({ success: true, message: 'check sent mail for password reset' });
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  db.createResetToken(email, resetToken);

  const origin = req.get('origin') || process.env.CLIENT_ORIGIN || 'https://h70-chat.onrender.com';
  const resetUrl = `${origin}/reset-password?token=${resetToken}`;

  let emailSent = false;

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : null;
  const smtpUser = process.env.SMTP_USER || 'h70support@gmail.com';
  const smtpPass = process.env.SMTP_PASS;

  if (smtpPass) {
    try {
      const transporter = !smtpHost && smtpUser.endsWith('@gmail.com')
        ? nodemailer.createTransport({
            service: 'gmail',
            auth: { user: smtpUser, pass: smtpPass }
          })
        : nodemailer.createTransport({
            host: smtpHost || 'smtp.gmail.com',
            port: smtpPort || 465,
            secure: (smtpPort || 465) === 465,
            auth: { user: smtpUser, pass: smtpPass }
          });

      await transporter.sendMail({
        from: `"H70 Chat Support" <${smtpUser}>`,
        to: email,
        subject: 'Reset Password - H70 Chat',
        text: `Hello,\n\nYou requested a password reset for your account on H70. Please click on the link below to set a new password:\n\n${resetUrl}\n\nThis link is valid for 1 hour.\n\nIf you did not request this, please ignore this email.`,
        html: `<p>Hello,</p><p>You requested a password reset for your account on H70. Please click the link below to set a new password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link is valid for 1 hour.</p><p>If you did not request this, please ignore this email.</p>`
      });
      emailSent = true;
    } catch (err) {
      console.error('Failed to send SMTP email:', err.message);
    }
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

  const email = await db.verifyResetToken(token);
  if (!email) {
    return res.status(400).json({ error: 'Invalid or expired reset token' });
  }

  try {
    const user = await db.getUserByEmail(email);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const hashedPassword = await bcrypt.hash(password, 10);
    await db.updateUser(user.id, { password: hashedPassword });
    db.removeResetToken(token);

    res.json({ success: true, message: 'Password has been reset successfully. You can now login.' });
  } catch {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// 6. Media Upload: Handles images and voice messages
app.post('/api/upload', authenticateToken, upload.single('media'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No media file provided' });
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ url: fileUrl });
});

// Existing application routes continue below this section.
