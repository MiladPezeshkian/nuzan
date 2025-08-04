// utils/AppError.js
class AppError extends Error {
  /**
   * ایجاد خطای عملیاتی سفارشی
   * @param {string} message - پیام خطای قابل فهم برای کاربر
   * @param {number} statusCode - کد وضعیت HTTP (مثال: 400، 404، 500)
   * @param {Object} [options] - تنظیمات پیشرفته خطا
   * @param {string} [options.errorCode] - کد خطای داخلی سیستم
   * @param {Object} [options.details] - جزئیات فنی برای دیباگ
   * @param {boolean} [options.isOperational=true] - نشان‌دهنده خطای عملیاتی
   * @param {string} [options.layer] - لایه ایجاد خطا (controller, service, etc.)
   * @param {string} [options.redirectUrl] - آدرس برای ریدایرکت کاربر
   * @param {boolean} [options.logToSentry] - آیا خطا به سیستم مانیتورینگ گزارش شود؟
   */
  constructor(
    message,
    statusCode,
    {
      errorCode = "E_UNEXPECTED_ERROR",
      details = {},
      isOperational = true,
      layer = "unknown",
      redirectUrl = null,
      logToSentry = true,
    } = {}
  ) {
    super(message);

    // اطلاعات اصلی خطا
    this.statusCode = statusCode || 500;
    this.status = `${this.statusCode}`.startsWith("4") ? "fail" : "error";

    // اطلاعات فنی برای دیباگ و مانیتورینگ
    this.errorCode = errorCode;
    this.details = details;
    this.isOperational = isOperational;
    this.layer = layer;
    this.timestamp = new Date().toISOString();
    this.redirectUrl = redirectUrl;
    this.logToSentry = logToSentry;

    // اطلاعات پشته خطا
    if (typeof Error.captureStackTrace === "function") {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = new Error().stack;
    }

    // نام کلاس برای تشخیص در لاگ‌ها
    this.name = this.constructor.name;

    // ثبت خودکار در سیستم‌های مانیتورینگ
    if (logToSentry && process.env.NODE_ENV === "production") {
      this.logToMonitoringSystem();
    }
  }

  /**
   * تبدیل خطا به فرمت استاندارد برای پاسخ API
   * @returns {Object} شیء فرمت‌بندی شده خطا
   */
  toResponseFormat() {
    const response = {
      status: this.status,
      code: this.statusCode,
      message: this.message,
      errorCode: this.errorCode,
      timestamp: this.timestamp,
    };

    // افزودن جزئیات در حالت توسعه
    if (process.env.NODE_ENV === "development") {
      response.details = this.details;
      response.stack = this.stack;
      response.layer = this.layer;
    }

    // افزودن اطلاعات ریدایرکت
    if (this.redirectUrl) {
      response.redirect = this.redirectUrl;
    }

    return response;
  }

  /**
   * ثبت خطا در سیستم‌های مانیتورینگ (مثل Sentry)
   */
  logToMonitoringSystem() {
    // Actual implementation depends on your monitoring setup
    // e.g., Sentry.captureException(this);
    console.error(`[MONITORING] ${this.errorCode}: ${this.message}`, {
      error: this.toResponseFormat(),
    });
  }

  /**
   * ایجاد خطای اعتبارسنجی از خطاهای Joi
   * @param {ValidationError} joiError - خطای تولید شده توسط Joi
   * @returns {AppError} خطای فرمت‌بندی شده
   */
  static fromJoiValidation(joiError) {
    const errors = joiError.details.map((detail) => ({
      field: detail.context.key,
      message: detail.message,
      type: detail.type,
      value: detail.context.value,
    }));

    return new AppError("Data validation failed", 422, {
      errorCode: "E_VALIDATION_FAILED",
      details: { errors },
      layer: "validation",
    });
  }

  /**
   * ایجاد خطای پایگاه داده از خطاهای Mongoose
   * @param {MongoError} mongoError - خطای تولید شده توسط MongoDB
   * @returns {AppError} خطای فرمت‌بندی شده
   */
  static fromMongoError(mongoError) {
    let message = "Database error";
    let statusCode = 500;
    let errorCode = "E_DATABASE_ERROR";
    const details = {};

    // تشخیص نوع خطای MongoDB
    switch (mongoError.code) {
      case 11000:
        message = "Duplicate record";
        statusCode = 409;
        errorCode = "E_DUPLICATE_KEY";
        const key = Object.keys(mongoError.keyPattern)[0];
        details.duplicateField = key;
        details.value = mongoError.keyValue[key];
        break;
      case 121:
        message = "Document validation failed";
        statusCode = 400;
        errorCode = "E_DOCUMENT_VALIDATION";
        break;
      default:
        details.originalError = mongoError;
    }

    return new AppError(message, statusCode, {
      errorCode,
      details,
      layer: "database",
    });
  }
}

module.exports = AppError;
