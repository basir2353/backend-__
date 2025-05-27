/**
 * Generate a random 6-digit OTP
 * @returns {string} 6-digit OTP
 */
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Create OTP data with expiry
 * @returns {Object} OTP data with code and expiry
 */
const createOTPData = () => {
  const otp = generateOTP();
  const otpExpiry = new Date();
  otpExpiry.setMinutes(otpExpiry.getMinutes() + 10); // OTP valid for 10 minutes
  
  return {
    otp,
    otpExpiry
  };
};

module.exports = {
  generateOTP,
  createOTPData
};