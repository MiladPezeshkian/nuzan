const mongoose = require("mongoose");

const userProfileSchema = new mongoose.Schema(
  {
    authRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserAuth",
      required: [true, "UserAuth reference required"],
      unique: true,
    },
    firstName: {
      type: String,
      trim: true,
      maxlength: [50, "Max 50 characters"],
    },
    lastName: {
      type: String,
      trim: true,
      maxlength: [50, "Max 50 characters"],
    },
    dateOfBirth: {
      type: Date,
      validate: {
        validator: (dob) => dob < new Date(),
        message: "DOB must be in the past",
      },
    },
    gender: {
      type: String,
      enum: ["male", "female"],
    },
    dataConsent: {
      type: Boolean,
      default: false,
    },
    privacySettings: {
      researchParticipation: { type: Boolean, default: false },
      dataSharing: { type: Boolean, default: false },
    },
    lastActive: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

userProfileSchema.virtual("age").get(function () {
  if (!this.dateOfBirth) return null;
  const diff = Date.now() - this.dateOfBirth.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
});

module.exports = mongoose.model("UserProfile", userProfileSchema);
