const AppError = require("../utils/AppError");

// خطای CastError (مثلاً ObjectId نامعتبر)
const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}.`;
  return new AppError(message, 400);
};

// خطای ValidationError از Mongoose
const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map((el) => el.message);
  const message = `Invalid input data: ${errors.join(". ")}`;
  return new AppError(message, 400);
};

// توکن JWT نامعتبر
const handleJWTError = () =>
  new AppError("Invalid token. Please log in again.", 401);

// توکن JWT منقضی شده
const handleJWTExpiredError = () =>
  new AppError("Your token has expired. Please log in again.", 401);

// ارسال جزئیات کامل در حالت توسعه
const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    status: err.status,
    error: err,
    message: err.message,
    stack: err.stack,
  });
};

// ارسال پیام حداقلی در حالت تولید
const sendErrorProd = (err, res) => {
  if (err.isOperational) {
    // خطاهای عملیاتی (اعمال شده با AppError)
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
    });
  } else {
    // خطاهای ناشناخته
    console.error("ERROR 💥", err);
    res.status(500).json({
      status: "error",
      message: "Something went wrong! Please try again later.",
    });
  }
};

const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  if (process.env.NODE_ENV === "development") {
    sendErrorDev(err, res);
  } else {
    let error = { ...err };
    error.message = err.message;

    if (error.name === "CastError") error = handleCastErrorDB(error);
    if (error.name === "ValidationError")
      error = handleValidationErrorDB(error);
    if (error.name === "JsonWebTokenError") error = handleJWTError();
    if (error.name === "TokenExpiredError") error = handleJWTExpiredError();

    sendErrorProd(error, res);
  }
};

module.exports = globalErrorHandler;
