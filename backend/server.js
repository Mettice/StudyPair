const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const cryptoRandomString = require('crypto-random-string');
require('dotenv').config();

const app = express();

app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

const PORT = process.env.PORT || 5000;

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  connectTimeoutMS: 30000,
  socketTimeoutMS: 45000,
});

let db;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function connectToMongo() {
  try {
    await client.connect();
    console.log('Connected successfully to MongoDB');
    db = client.db("studyapp");
    
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Error connecting to MongoDB:', err);
    process.exit(1);
  }
}

connectToMongo();

app.get('/', (req, res) => {
  res.send('Welcome to the StudyPair API');
});

app.post('/api/users/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const existingUser = await db.collection('users').findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(400).json({ message: 'Username or email already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const confirmationToken = cryptoRandomString({length: 32, type: 'url-safe'});
    
    await db.collection('users').insertOne({
      username,
      email,
      password: hashedPassword,
      confirmed: false,
      confirmationToken
    });

    const confirmationLink = `http://localhost:3000/confirm/${confirmationToken}`;
    await transporter.sendMail({
      to: email,
      subject: 'Confirm your StudyPair account',
      html: `Please click this link to confirm your account: <a href="${confirmationLink}">${confirmationLink}</a>`
    });

    res.status(201).json({ message: 'User registered successfully. Please check your email to confirm your account.' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Error registering user', error: error.message });
  }
});

app.post('/api/users/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await db.collection('users').findOne({ username });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    if (!user.confirmed) {
      return res.status(400).json({ message: 'Please confirm your email before logging in' });
    }
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ message: 'Login successful', token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Error logging in', error: error.message });
  }
});

app.get('/api/users/confirm/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const user = await db.collection('users').findOne({ confirmationToken: token });
    if (!user) {
      return res.status(400).json({ message: 'Invalid confirmation token' });
    }
    await db.collection('users').updateOne(
      { _id: user._id },
      { $set: { confirmed: true }, $unset: { confirmationToken: "" } }
    );
    res.json({ message: 'Account confirmed successfully' });
  } catch (error) {
    console.error('Confirmation error:', error);
    res.status(500).json({ message: 'Error confirming account', error: error.message });
  }
});

app.post('/api/users/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await db.collection('users').findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const resetToken = cryptoRandomString({length: 32, type: 'url-safe'});
    const resetTokenExpiry = Date.now() + 3600000; // 1 hour from now

    await db.collection('users').updateOne(
      { _id: user._id },
      { $set: { resetToken, resetTokenExpiry } }
    );

    const resetLink = `http://localhost:3000/reset-password/${resetToken}`;
    await transporter.sendMail({
      to: email,
      subject: 'Reset your StudyPair password',
      html: `Please click this link to reset your password: <a href="${resetLink}">${resetLink}</a>`
    });

    res.json({ message: 'Password reset link sent to your email' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Error processing forgot password request', error: error.message });
  }
});

app.post('/api/users/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    const user = await db.collection('users').findOne({
      resetToken: token,
      resetTokenExpiry: { $gt: Date.now() }
    });
    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.collection('users').updateOne(
      { _id: user._id },
      {
        $set: { password: hashedPassword },
        $unset: { resetToken: "", resetTokenExpiry: "" }
      }
    );
    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Error resetting password', error: error.message });
  }
});

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

app.get('/api/protected', authenticateToken, (req, res) => {
  res.json({ message: 'This is a protected route', userId: req.user.userId });
});

app.get('/api/sessions', authenticateToken, async (req, res) => {
  try {
    const sessions = await db.collection('sessions').find().toArray();
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching sessions', error: error.message });
  }
});

app.get('/api/users/profile', authenticateToken, async (req, res) => {
  try {
    const user = await db.collection('users').findOne({ _id: req.user.userId }, { projection: { password: 0 } });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching profile', error: error.message });
  }
});

process.on('SIGINT', async () => {
  await client.close();
  console.log('MongoDB connection closed');
  process.exit(0);
});