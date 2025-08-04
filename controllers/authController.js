const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { promisify } = require("util");
const User = require("../models/userAuth.model");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/AppError");
const UserProfile = require("../models/userProfile.model");
const mongoose = require("mongoose");
const MedicalData = require("../models/medicalData.model");

// Generate JWT Token
const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

// Create and send token + set cookie
const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);

  const cookieOptions = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
  };

  res.cookie("jwt", token, cookieOptions);
  user.password = undefined;

  res.status(statusCode).json({
    status: "success",
    token,
    data: { user },
  });
};

// User Registration
exports.signup = catchAsync(async (req, res, next) => {
  const { username, email, phoneNumber, password } = req.body;

  // 1) اعتبارسنجی پسورد
  if (!password || password.length < 8) {
    return next(new AppError("رمز عبور باید حداقل 8 کاراکتر باشد", 400));
  }

  // 2) بررسی تکراری بودن
  const conflict = [];
  if (email) conflict.push({ email });
  if (username) conflict.push({ username });
  if (phoneNumber) conflict.push({ phoneNumber });

  if (conflict.length) {
    const existing = await User.findOne({ $or: conflict }).lean();
    if (existing) {
      if (existing.email === email)
        return next(new AppError("ایمیل قبلاً ثبت شده است", 400));
      if (existing.username === username)
        return next(new AppError("نام کاربری قبلاً انتخاب شده", 400));
      if (existing.phoneNumber === phoneNumber)
        return next(new AppError("شماره تلفن قبلاً ثبت شده است", 400));
    }
  }

  // 3) تراکنش ایجاد کاربر
  await mongoose
    .startSession()
    .then(async (session) => {
      await session
        .withTransaction(async () => {
          // 3.1) UserAuth
          const newUser = await User.create(
            [{ username, email, phoneNumber, password }],
            { session }
          );

          // 3.2) UserProfile
          const userProfile = new UserProfile({ authRef: newUser[0]._id });
          await userProfile.save({ session });

          // 3.3) MedicalData
          const medicalData = new MedicalData({ authRef: newUser[0]._id });
          await medicalData.save({ session });

          // 3.4) ارسال توکن
          createSendToken(newUser[0], 201, res);
        })
        .finally(() => {
          session.endSession();
        });
    })
    .catch((err) => {
      if (err.code === 11000) {
        const field = Object.keys(err.keyPattern)[0];
        const msgs = {
          username: "نام کاربری قبلاً انتخاب شده",
          email: "ایمیل قبلاً ثبت شده است",
          phoneNumber: "شماره تلفن قبلاً ثبت شده است",
        };
        return next(new AppError(msgs[field] || `فیلد تکراری: ${field}`, 400));
      }
      if (err.name === "ValidationError") {
        const msgs = Object.values(err.errors)
          .map((e) => e.message)
          .join(". ");
        return next(new AppError(msgs, 400));
      }
      return next(err);
    });
});

// User Login
exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new AppError("لطفاً ایمیل و رمز عبور را وارد کنید", 400));
  }

  const user = await User.findOne({ email }).select("+password");

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return next(new AppError("ایمیل یا رمز عبور اشتباه است", 401));
  }

  createSendToken(user, 200, res);
});

// Check if user is logged in
exports.isLoggedIn = catchAsync(async (req, res, next) => {
  const token = req.cookies.jwt;
  if (!token) {
    return res.status(200).json({
      status: "fail",
      message: "کاربر وارد سیستم نشده است",
      data: null,
    });
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return next(new AppError("کاربر مرتبط با این توکن وجود ندارد", 401));
  }

  res.status(200).json({
    status: "success",
    data: { user: currentUser },
  });
});

// User Logout
exports.logout = (req, res) => {
  res.cookie("jwt", "loggedout", {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });
  res.status(200).json({ status: "success" });
};

// Protect routes middleware
exports.protect = catchAsync(async (req, res, next) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.cookies && req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return next(
      new AppError("شما وارد سیستم نشده‌اید! لطفاً برای دسترسی وارد شوید", 401)
    );
  }

  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return next(new AppError("کاربر مرتبط با این توکن وجود ندارد", 401));
  }

  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(
      new AppError("رمز عبور اخیراً تغییر کرده! لطفاً دوباره وارد شوید", 401)
    );
  }

  req.user = currentUser;
  next();
});

// Update authentication data
// --------- 2) تابع updateAuthData ---------
exports.updateAuthData = catchAsync(async (req, res, next) => {
  // الف) یافتن کاربر به همراه فیلد password
  const user = await User.findById(req.user.id).select("+password");
  if (!user) return next(new AppError("کاربری با این مشخصات یافت نشد", 404));

  let passwordChanged = false;

  // ب) 1. تغییر رمز عبور (در صورت ارسال newPassword)
  if (req.body.newPassword) {
    const { currentPassword, newPassword } = req.body;

    // اطمینان از پر بودن currentPassword
    if (!currentPassword) {
      return next(new AppError("رمز عبور فعلی را وارد کنید", 400));
    }

    // اعتبارسنجی «رمز فعلی» با مقدار هش شده
    const isValid = await user.correctPassword(currentPassword, user.password);
    if (!isValid) {
      return next(new AppError("رمز عبور فعلی اشتباه است", 401));
    }

    // ست کردن رمز جدید و تاریخ تغییر برای invalidation توکن‌های قبلی
    user.password = newPassword;
    user.passwordChangedAt = Date.now() - 1000;
    passwordChanged = true;
  }

  // پ) 2. به‌روزرسانی وضعیت twoFactorEnabled در صورت ارسال
  if (typeof req.body.twoFactorEnabled === "boolean") {
    user.twoFactorEnabled = req.body.twoFactorEnabled;
  }

  // ت) ذخیره نهایی؛ اجرای pre-save برای هش کردن پسورد
  await user.save();

  // ث) 3. اگر پسورد تغییر کرد → لاگ‌اوت کاربر با پاک‌کردن JWT کوکی
  if (passwordChanged) {
    res.cookie("jwt", "loggedout", {
      expires: new Date(Date.now() + 10 * 1000),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
    });
  }

  // ج) 4. پاسخ به کلاینت
  res.status(200).json({
    status: "success",
    message: passwordChanged
      ? "رمز عبور با موفقیت تغییر کرد و شما از حساب خارج شدید."
      : "تنظیمات امنیتی (two-factor) با موفقیت به‌روزرسانی شد.",
    logout: passwordChanged,
  });
});
