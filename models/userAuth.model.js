const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const userAuthSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      lowercase: true,
      trim: true,
      minlength: [3, "Username must be at least 3 characters long"],
      maxlength: [30, "Username must be at most 30 characters long"],
      validate: {
        validator: function (u) {
          return /^[a-z0-9_]+$/.test(u);
        },
        message:
          "Username may only contain lowercase letters, numbers, and underscores",
      },
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: function (u) {
          return /^\S+@\S+\.\S+$/.test(u);
        },
        message: "Please enter a valid email address",
      },
    },
    phoneNumber: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      validate: {
        validator: function (v) {
          return !v || /^\+?[0-9]{7,15}$/.test(v);
        },
        message: "Please enter a valid phone number",
      },
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters long"],
      select: false,
    },
    passwordChangedAt: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    accountStatus: {
      type: String,
      enum: ["active", "deactivated", "suspended"],
      default: "active",
    },
    loginHistory: [
      {
        timestamp: { type: Date, default: Date.now },
        device: String,
        location: String,
        ipAddress: String,
      },
    ],
  },
  { timestamps: true }
);

// Hash password before saving and update passwordChangedAt
userAuthSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  if (!this.isNew) this.passwordChangedAt = Date.now() - 1000;
  next();
});

// Compare candidate password with stored hash
userAuthSchema.methods.correctPassword = async function (candidate, actual) {
  return await bcrypt.compare(candidate, actual);
};

// Check if password was changed after token issuance
userAuthSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (!this.passwordChangedAt) return false;
  const changedTimestamp = parseInt(
    this.passwordChangedAt.getTime() / 1000,
    10
  );
  return JWTTimestamp < changedTimestamp;
};

// Generate password reset token
userAuthSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString("hex");
  this.passwordResetToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000;
  return resetToken;
};

// Add login record, keep only last 10 entries
userAuthSchema.methods.addLoginRecord = function (device, location, ipAddress) {
  this.loginHistory.push({ device, location, ipAddress });
  if (this.loginHistory.length > 10) {
    this.loginHistory.shift();
  }
};

// Change password method: validate current, set new, save
userAuthSchema.methods.changePassword = async function (
  currentPassword,
  newPassword
) {
  const isValid = await this.correctPassword(currentPassword, this.password);
  if (!isValid) {
    throw new Error("رمز عبور فعلی اشتباه است");
  }
  this.password = newPassword;
  this.passwordChangedAt = Date.now() - 1000;
  await this.save();
};

module.exports = mongoose.model("UserAuth", userAuthSchema);
