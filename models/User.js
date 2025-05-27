const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true,
    trim: true
  },
  email: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    lowercase: true
  },
  password: { 
    type: String, 
    required: true 
  },
  role: {
    type: String,
    enum: ['doctor', 'employee', 'admin'],
    default: 'doctor'
  },
  isOnline: { 
    type: Boolean, 
    default: false 
  },
  socketId: { 
    type: String, 
    default: null 
  },
  number: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  
  // Doctor-specific fields (conditionally required)
  education: {
    type: String,
    trim: true,
    required: function() {
      return this.role === 'doctor';
    },
    validate: {
      validator: function(value) {
        // Only validate if role is doctor
        if (this.role === 'doctor') {
          return value && value.trim().length > 0;
        }
        return true;
      },
      message: 'Education is required for doctors'
    }
  },
  
  department: {
    type: String,
    enum: [
      'cardiology',
      'neurology', 
      'orthopedics',
      'pediatrics',
      'dermatology',
      'psychiatry',
      'oncology',
      'radiology',
      'anesthesiology',
      'emergency',
      'general',
      'surgery',
      'other'
    ],
    required: function() {
      return this.role === 'doctor';
    },
    validate: {
      validator: function(value) {
        // Only validate if role is doctor
        if (this.role === 'doctor') {
          return value && value.trim().length > 0;
        }
        return true;
      },
      message: 'Department is required for doctors'
    }
  },
  
  experience: {
    type: String,
    enum: ['0-1', '2-5', '6-10', '11-15', '16-20', '20+'],
    required: function() {
      return this.role === 'doctor';
    },
    validate: {
      validator: function(value) {
        // Only validate if role is doctor
        if (this.role === 'doctor') {
          return value && value.trim().length > 0;
        }
        return true;
      },
      message: 'Experience is required for doctors'
    }
  },
  
  // Optional doctor profile fields
  specialization: {
    type: String,
    trim: true
  },
  
  qualifications: [{
    degree: {
      type: String,
      trim: true
    },
    institution: {
      type: String,
      trim: true
    },
    year: {
      type: Number
    }
  }],
  
  workingHours: {
    start: {
      type: String, // Format: "09:00"
      default: "09:00"
    },
    end: {
      type: String, // Format: "17:00"
      default: "17:00"
    }
  },
  
  consultationFee: {
    type: Number,
    min: 0,
    default: 0
  },
  
  isAvailable: {
    type: Boolean,
    default: true
  },
  
  // End of doctor-specific fields
  
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationOTP: {
    type: String,
    default: null
  },
  otpExpiry: {
    type: Date,
    default: null
  },
  agreementAccepted: {
    type: Boolean,
    default: false
  },
  reports: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Report'
  }],
  
  // Appointments for doctors
  appointments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment'
  }],
  
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Pre-save middleware to update the updatedAt field
UserSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Pre-save middleware to clear doctor-specific fields if role is not doctor
UserSchema.pre('save', function(next) {
  if (this.role !== 'doctor') {
    this.education = undefined;
    this.department = undefined;
    this.experience = undefined;
    this.specialization = undefined;
    this.qualifications = undefined;
    this.workingHours = undefined;
    this.consultationFee = undefined;
    this.isAvailable = undefined;
  }
  next();
});

// Index for faster queries
UserSchema.index({ email: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ department: 1 }); // For filtering doctors by department
UserSchema.index({ isAvailable: 1 }); // For finding available doctors
UserSchema.index({ 'role': 1, 'department': 1 }); // Compound index for doctor queries

// Virtual for full doctor profile (only for doctors)
UserSchema.virtual('doctorProfile').get(function() {
  if (this.role === 'doctor') {
    return {
      education: this.education,
      department: this.department,
      experience: this.experience,
      specialization: this.specialization,
      qualifications: this.qualifications,
      workingHours: this.workingHours,
      consultationFee: this.consultationFee,
      isAvailable: this.isAvailable
    };
  }
  return null;
});

// Instance method to check if user is a doctor
UserSchema.methods.isDoctor = function() {
  return this.role === 'doctor';
};

// Static method to find available doctors by department
UserSchema.statics.findAvailableDoctors = function(department = null) {
  const query = { 
    role: 'doctor', 
    isAvailable: true,
    isEmailVerified: true 
  };
  
  if (department) {
    query.department = department;
  }
  
  return this.find(query)
    .select('name email department experience consultationFee workingHours')
    .sort({ name: 1 });
};

// Static method to find doctors by experience level
UserSchema.statics.findDoctorsByExperience = function(minExperience) {
  const experienceOrder = ['0-1', '2-5', '6-10', '11-15', '16-20', '20+'];
  const minIndex = experienceOrder.indexOf(minExperience);
  
  if (minIndex === -1) return this.find({ role: 'doctor' });
  
  const validExperiences = experienceOrder.slice(minIndex);
  
  return this.find({
    role: 'doctor',
    experience: { $in: validExperiences },
    isEmailVerified: true
  }).sort({ name: 1 });
};

module.exports = mongoose.model('User', UserSchema);