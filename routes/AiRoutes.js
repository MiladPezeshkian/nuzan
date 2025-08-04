// routes/ai.js

const express = require("express");
const router = express.Router();

const { step1, step2 } = require("../controllers/aiDiagnosisController");
const { protect } = require("../controllers/authController");

// 1. اعمال middleware محافظت‌کننده روی تمام روت‌های زیر
router.use(protect);

/**
 * @route   POST /api/v1/ais/chatgpt4o/step1
 * @desc    Generate medical questionnaire based on symptoms
 * @access  Private
 */
router.post("/chatgpt4o/step1", step1);

/**
 * @route   POST /api/v1/ais/chatgpt4o/step2
 * @desc    Analyze medical questionnaire responses
 * @access  Private
 */
router.post("/chatgpt4o/step2", step2);

module.exports = router;
