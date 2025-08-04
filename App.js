const express = require("express");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const compression = require("compression");
const AppError = require("./utils/AppError");

// Routes
const authRoutes = require("./routes/authRoutes");
const profileRoutes = require("./routes/profileRoutes");
const medicalDataRoutes = require("./routes/medicalDataRoutes");
const AiRoutes = require("./routes/AiRoutes");
const globalErrorHandler = require("./controllers/errorController");

const app = express();

// اگر پشت پروکسی هستید
app.set("trust proxy", 1);

// ——— ۱) GLOBAL MIDDLEWARES ———
// CORS
app.use(
  cors({
    origin: ["http://localhost:5173", "https://nuzan.netlify.app/"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
    ],
  })
);
// فایل‌های ایستا
app.use("/uploads", express.static("uploads"));
// هِدِرهای امنیتی
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'", "https://cdn.example.com"],
        scriptSrc: ["'self'", "https://apis.google.com"],
        styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https://res.cloudinary.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
      },
    },
  })
);
// لاگ‌گیری در حالت توسعه
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}
// محدودیت تعداد درخواست‌ها
app.use(
  "/api",
  rateLimit({
    max: process.env.RATE_LIMIT_MAX || 100,
    windowMs: 60 * 60 * 1000, // 1 ساعت
    message: "Too many requests from this IP, please try again in an hour!",
  })
);
// body parser
app.use(express.json({ limit: "10kb" }));
// cookie parser
app.use(cookieParser());
// محافظت در برابر NoSQL injection
app.use(mongoSanitize());
// محافظت در برابر XSS
app.use(xss());
// فشرده‌سازی پاسخ‌ها
app.use(compression());

// ——— ۲) ROUTES ———
// Health Check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "API is running smoothly",
    timestamp: new Date(),
  });
});
// Welcome
app.get("/", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "Welcome to the Academic Timetable API!",
    documentation: "/api-docs",
  });
});
// Auth routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/profile", profileRoutes);
app.use("/api/v1/med/medicaldata", medicalDataRoutes);
app.use("/api/v1/ais", AiRoutes);
// هندل‌کردن روت‌های تعریف‌نشده
app.all("*", (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// ——— ۳) GLOBAL ERROR HANDLER ———
app.use(globalErrorHandler);

module.exports = app;
