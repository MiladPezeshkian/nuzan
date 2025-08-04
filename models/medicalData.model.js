const mongoose = require("mongoose");

const medicalDataSchema = new mongoose.Schema(
  {
    authRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserAuth",
      required: [true, "UserAuth reference required"],
      unique: true,
    },
    height: {
      type: Number,
      min: [50, "Min 50cm"],
      max: [250, "Max 250cm"],
      set: (v) => Math.round(v * 10) / 10,
    },
    weight: {
      type: Number,
      min: [2, "Min 2kg"],
      max: [300, "Max 300kg"],
      set: (v) => Math.round(v * 10) / 10,
    },
    bloodType: {
      type: String,
      enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", null],
    },
    genderForPregnancyCheck: { type: String, select: false },
    isPregnant: {
      type: Boolean,
      default: false,
    },

    smokingStatus: {
      type: String,
      enum: ["never", "former", "current", null],
    },
    alcoholConsumption: {
      type: String,
      enum: ["none", "occasional", "moderate", "heavy", null],
    },
    activityLevel: {
      type: String,
      enum: ["sedentary", "light", "moderate", "active", "very-active", null],
    },
    dietType: {
      type: String,
      enum: [
        "omnivore",
        "vegetarian",
        "vegan",
        "keto",
        "paleo",
        "mediterranean",
        "other",
        null,
      ],
    },
    sleepHoursPerDay: {
      type: Number,
      min: [0, "Min 0 hours"],
      max: [24, "Max 24 hours"],
    },

    conditions: [
      {
        name: String,
        diagnosedDate: Date,
        severity: { type: String, enum: ["mild", "moderate", "severe"] },
      },
    ],
    allergies: [
      {
        name: String,
        reaction: String,
        severity: { type: String, enum: ["mild", "moderate", "severe"] },
      },
    ],
    medications: [
      {
        name: String,
        dosage: String,
        frequency: String,
        startDate: Date,
        endDate: Date,
      },
    ],
    familyHistory: [
      {
        relation: String,
        condition: String,
        ageAtDiagnosis: Number,
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

medicalDataSchema.pre("validate", async function (next) {
  if (!this.userRef) return next();
  const UserProfile = mongoose.model("UserProfile");
  const profile = await UserProfile.findById(this.userRef).select("gender");
  if (profile) this.genderForPregnancyCheck = profile.gender;
  next();
});

medicalDataSchema.virtual("bmi").get(function () {
  if (this.height && this.weight) {
    const h = this.height / 100;
    return (this.weight / (h * h)).toFixed(1);
  }
  return null;
});

module.exports = mongoose.model("MedicalData", medicalDataSchema);
