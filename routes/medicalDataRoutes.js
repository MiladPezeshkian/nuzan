const express = require("express");
const router = express.Router();
const medicalDataController = require("../controllers/medicalDataController");
const authController = require("../controllers/authController");
router
  .route("/")
  .get(authController.protect, medicalDataController.getMedicalData)
  .patch(authController.protect, medicalDataController.updateMedicalData);

module.exports = router;
