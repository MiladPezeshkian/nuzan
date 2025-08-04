const express = require("express");
const {
  signup,
  login,
  isLoggedIn,
  logout,
  updateAuthData,
  getAuthData,
} = require("../controllers/authController");
const { protect } = require("../controllers/authController");

const router = express.Router();

// Public routes
router.post("/signup", signup);
router.post("/login", login);
router.get("/isloggedin", isLoggedIn);
router.post("/logout", logout);

// Protected routes
router.use(protect);
router.patch("/authdata", updateAuthData);

module.exports = router;
