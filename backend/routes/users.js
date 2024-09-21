const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendVerificationEmail } = require('../services/emailService');

router.get('/test', (req, res) => {
  res.send('User routes are working');
});

// User registration
router.post('/register', async (req, res) => {
  console.log('Registration route hit');
  console.log('Request body:', req.body);
  try {
    const { username, email, password, studyFields, learningGoal } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(400).json({ message: 'Username or email already exists' });
    }

    // Create verification token
    const verificationToken = crypto.randomBytes(20).toString('hex');

    // Create new user
    const user = new User({ 
      username, 
      email, 
      password, 
      studyFields, 
      learningGoal,
      verificationToken 
    });
    await user.save();

    // Send verification email
    await sendVerificationEmail(email, verificationToken);

    res.status(201).json({ message: 'User registered successfully. Please check your email to verify your account.', userId: user._id });
  } catch (error) {
    res.status(500).json({ message: 'Error registering user', error: error.message });
  }
});

// Email verification
router.get('/verify/:token', async (req, res) => {
  try {
    const user = await User.findOne({ verificationToken: req.params.token });
    if (!user) {
      return res.status(400).json({ message: 'Invalid verification token' });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save();

    res.status(200).json({ message: 'Email verified successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error verifying email', error: error.message });
  }
});

// User login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    if (!user.isVerified) {
      return res.status(401).json({ message: 'Please verify your email before logging in' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.json({ message: 'Login successful', token });
  } catch (error) {
    res.status(500).json({ message: 'Error logging in', error: error.message });
  }
});

module.exports = router;