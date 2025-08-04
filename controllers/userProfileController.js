const catchAsync = require("../utils/catchAsync.js");
const AppError = require("../utils/AppError.js");
const UserProfile = require("../models/userProfile.model.js");
// ⬇️ GET - گرفتن یا ساختن پروفایل
exports.getMyProfile = catchAsync(async (req, res, next) => {
  const authRef = req.user._id;
  const profile = await UserProfile.findOne({ authRef }).select(
    "firstName lastName dateOfBirth gender"
  );
  if (!profile) {
    return next(new AppError("پروفایل یافت نشد", 404));
  }

  res.status(200).json({
    status: "success",
    data: profile,
  });
});

// ⬇️ PATCH - بروزرسانی پروفایل
// controllers/userProfileController.js

exports.updateMyProfile = catchAsync(async (req, res, next) => {
  // ◀️ این بخش را اضافه کن:
  if (req.body.dataConsent !== undefined) {
    const val = req.body.dataConsent;
    // اگر فرم آرایه‌ای فرستاد یا مستقیم "on"
    if (Array.isArray(val)) {
      req.body.dataConsent = val.includes("on");
    } else if (val === "on" || val === "true" || val === true) {
      req.body.dataConsent = true;
    } else {
      req.body.dataConsent = false;
    }
  }

  const allowedFields = [
    "firstName",
    "lastName",
    "dateOfBirth",
    "gender",
    "dataConsent",
    "privacySettings",
  ];
  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  const profile = await UserProfile.findOneAndUpdate(
    { authRef: req.user._id },
    updates,
    { new: true, runValidators: true }
  );

  if (!profile) {
    return next(new AppError("پروفایل یافت نشد", 404));
  }

  res.status(200).json({
    status: "success",
    message: "پروفایل بروزرسانی شد",
    data: profile,
  });
});
