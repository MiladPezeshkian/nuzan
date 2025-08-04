const express = require("express");
const profileController = require("../controllers/userProfileController");
const authController = require("../controllers/authController");

const router = express.Router();

// محافظت از تمام روت‌ها

// GET ➜ ساخت یا گرفتن پروفایل
router.get(
  "/personaldata",
  authController.protect,
  profileController.getMyProfile
);

// PATCH ➜ فقط برای بروزرسانی
router.patch(
  "/personaldata",
  authController.protect,
  profileController.updateMyProfile
);

module.exports = router;
