const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USERNAME,
    pass: process.env.EMAIL_PASSWORD
  }
});

const sendVerificationEmail = async (email, verificationToken) => {
  const mailOptions = {
    from: process.env.EMAIL_USERNAME,
    to: email,
    subject: 'Email Verification for StudyPair',
    text: `Please verify your email by clicking on this link: 
           http://localhost:5000/api/users/verify/${verificationToken}`
  };

  await transporter.sendMail(mailOptions);
};

module.exports = { sendVerificationEmail };