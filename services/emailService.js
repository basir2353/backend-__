const { createTransporter } = require('../config/email');
const fs = require('fs');

/**
 * Send OTP email to user
 * @param {string} email - User's email address
 * @param {string} otp - One-time password
 * @returns {Promise<boolean>} Success status
 */
const sendOTPEmail = async (email, otp) => {
  const transporter = createTransporter();
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Email Verification OTP',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Verify Your Email Address</h2>
        <p>Thank you for registering. Please use the following OTP to verify your email address:</p>
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; text-align: center; margin: 20px 0;">
          <h1 style="color: #1e40af; letter-spacing: 5px; margin: 0;">${otp}</h1>
        </div>
        <p>This OTP will expire in 10 minutes.</p>
        <p>If you didn't request this verification, please ignore this email.</p>
      </div>
    `
  };
  
  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};

/**
 * Send assessment report email to user
 * @param {string} email - User's email address
 * @param {string} pdfPath - Path to the PDF report
 * @param {object} reportData - Report data for customizing the email
 * @returns {Promise<boolean>} Success status
 */
const sendReportEmail = async (email, pdfPath, reportData) => {
  const transporter = createTransporter();
  
  // Generate appropriate subject based on report type
  let subject = 'Your Assessment Report';
  if (reportData.type === 'normal') {
    subject = 'Your Basic Assessment Report';
  } else if (reportData.type === 'mid') {
    subject = 'Your Mid-Level Assessment Report';
  } else if (reportData.type === 'full') {
    subject = 'Your Comprehensive Assessment Report';
  }
  
  // Generate appropriate message based on score
  let message = '';
  if (reportData.percentage >= 80) {
    message = 'Congratulations on your excellent performance!';
  } else if (reportData.percentage >= 60) {
    message = 'Good job on completing your assessment.';
  } else {
    message = 'Thank you for completing your assessment.';
  }

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Your Assessment Report</h2>
        <p>Hello,</p>
        <p>${message} Please find your assessment report attached to this email.</p>
        
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #1e40af; margin-top: 0;">Report Summary</h3>
          <p><strong>Type:</strong> ${reportData.type.charAt(0).toUpperCase() + reportData.type.slice(1)} Report</p>
          <p><strong>Score:</strong> ${reportData.score} out of ${reportData.totalQuestions}</p>
          <p><strong>Percentage:</strong> ${reportData.percentage}%</p>
        </div>
        
        <p>If you have any questions about your report, please contact our support team.</p>
        <p>Thank you for using our assessment platform!</p>
      </div>
    `,
    attachments: [
      {
        filename: `Assessment_Report_${reportData.type.toUpperCase()}.pdf`,
        path: pdfPath
      }
    ]
  };

  try {
    await transporter.sendMail(mailOptions);
    
    // Clean up the temporary file after sending
    fs.unlink(pdfPath, (err) => {
      if (err) console.error('Error deleting temporary PDF:', err);
    });
    
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};

// Verify email transport connection
const verifyEmailConnection = async () => {
  try {
    const transporter = createTransporter();
    const success = await new Promise((resolve, reject) => {
      transporter.verify((error, success) => {
        if (error) {
          console.error("Email connection error:", error);
          reject(error);
        } else {
          console.log("Email server is ready to take messages");
          resolve(success);
        }
      });
    });
    return success;
  } catch (error) {
    console.error("Email verification failed:", error);
    return false;
  }
};

module.exports = {
  sendOTPEmail,
  sendReportEmail,
  verifyEmailConnection
};