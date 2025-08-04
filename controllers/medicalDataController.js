const MedicalData = require("../models/medicalData.model");
const UserProfile = require("../models/userProfile.model");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/AppError");

// تبدیل داده‌ها از فرانت به دیتابیس
const toDbFormat = (data) => {
  return {
    ...data,
    conditions: data.conditions?.map((name) => ({ name })) || [],
    medications:
      data.medications?.map((med) => ({
        name: med.name,
        dosage: med.dosage,
        frequency: med.time,
      })) || [],
  };
};

// تبدیل داده‌ها از دیتابیس به فرانت
const toFrontendFormat = (data) => {
  return {
    ...data._doc,
    conditions: data.conditions?.map((c) => c.name) || [],
    medications:
      data.medications?.map((m) => ({
        name: m.name,
        dosage: m.dosage,
        time: m.frequency,
      })) || [],
  };
};

// دریافت اطلاعات پزشکی کاربر
exports.getMedicalData = catchAsync(async (req, res, next) => {
  const profileId = req.user._id;
  console.log("iam hereeeeee \n", profileId);
  const medicalData = await MedicalData.findOne({ authRef: profileId }).select(
    "-genderForPregnancyCheck -__v -createdAt -updatedAt"
  );
  console.log("iam hereeeeee \n", medicalData);

  if (!medicalData) {
    return res.status(200).json({
      height: "",
      weight: "",
      bloodType: "",
      smokingStatus: "",
      alcoholConsumption: "",
      activityLevel: "",
      dietType: "",
      sleepHoursPerDay: "",
      isPregnant: false,
      conditions: [],
      allergies: [],
      medications: [],
      familyHistory: [],
    });
  }
  console.log(toFrontendFormat(medicalData));
  res.status(200).json(toFrontendFormat(medicalData));
});

// بروزرسانی اطلاعات پزشکی کاربر
exports.updateMedicalData = catchAsync(async (req, res, next) => {
  const profileId = req.user._id;
  const data = req.body;

  // اعتبارسنجی وضعیت بارداری
  if (data.isPregnant) {
    const profile = await UserProfile.findById(profileId).select("gender");
    if (profile.gender !== "female") {
      return next(
        new AppError("وضعیت بارداری فقط برای کاربران خانم قابل ثبت است", 400)
      );
    }
  }

  const updateData = toDbFormat(data);

  const options = {
    new: true,
    upsert: true,
    runValidators: true,
    setDefaultsOnInsert: true,
  };

  const updatedData = await MedicalData.findOneAndUpdate(
    { authRef: profileId },
    updateData,
    options
  ).select("-genderForPregnancyCheck -__v -createdAt -updatedAt");

  res.status(200).json(toFrontendFormat(updatedData));
});
