const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "../config.env"),
});
const MedicalData = require("../models/medicalData.model");
const UserProfile = require("../models/userProfile.model");
const { OpenAI } = require("openai");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/AppError");

// Configure OpenAI client
const openaiClient = new OpenAI({
  apiKey: process.env.AVALAI_API_KEY,
  baseURL: process.env.BASE_URL || "https://api.avalai.ir/v1",
});

/**
 * @route   POST /api/v1/ais/chatgpt4o/step1
 * @desc    Generate medical questionnaire based on symptoms
 * @access  Private
 */
exports.step1 = catchAsync(async (req, res, next) => {
  // 1. Validate input
  const { symptoms } = req.body;
  if (!symptoms || symptoms.trim().length < 10) {
    return next(
      new AppError(
        "لطفاً علائم خود را به طور دقیق و کامل شرح دهید (حداقل 10 کلمه)",
        400
      )
    );
  }

  const userId = req.user._id;

  // 2. Fetch user data in parallel
  const [medicalData, userProfile] = await Promise.all([
    MedicalData.findOne({ userRef: userId }),
    UserProfile.findOne({ authRef: userId }),
  ]);

  // 3. Construct medical context
  let medicalContext = `### اطلاعات پزشکی کاربر:
- سن: ${userProfile?.age || "نامشخص"}
- جنسیت: ${userProfile?.gender || "نامشخص"}
- قد: ${medicalData?.height || "نامشخص"} سانتی‌متر
- وزن: ${medicalData?.weight || "نامشخص"} کیلوگرم
- BMI: ${medicalData?.bmi || "نامشخص"}
- گروه خونی: ${medicalData?.bloodType || "نامشخص"}
- سابقه پزشکی: ${
    medicalData?.conditions?.map((c) => c.name).join(", ") || "ندارد"
  }
- آلرژی‌ها: ${medicalData?.allergies?.map((a) => a.name).join(", ") || "ندارد"}
- داروهای مصرفی: ${
    medicalData?.medications?.map((m) => m.name).join(", ") || "ندارد"
  }

### علائم گزارش شده توسط کاربر:
${symptoms}`;

  // 4. Create AI prompt with strict instructions
  const prompt = `شما یک دستیار پزشکی هوشمند هستید. بر اساس اطلاعات پزشکی کاربر و علائم گزارش شده، یک پرسشنامه دقیق 10 سوالی چهار گزینه‌ای ایجاد کنید.

### دستورالعمل‌های مهم:
1. سوالات باید کاملاً مرتبط با علائم و شرایط پزشکی کاربر باشند
2. هر سوال باید 4 گزینه دقیق و تخصصی داشته باشد
3. از اصطلاحات تخصصی پزشکی به صورت دقیق استفاده کنید
4. سوالات باید به تشخیص دقیق‌تر کمک کنند
5. سوالات باید به صورت تخصصی و با جزئیات کافی طراحی شوند
6. گزینه‌ها باید طیف کاملی از احتمالات را پوشش دهند
7. خروجی فقط باید یک آبجکت JSON باشد

### ساختار خروجی مورد نیاز:
{
  "questions": [
    {
      "id": "q1",
      "text": "متن سوال اول با جزئیات کامل",
      "options": [
        {"id": "a", "text": "گزینه الف (کاملاً دقیق و تخصصی)"},
        {"id": "b", "text": "گزینه ب (کاملاً دقیق و تخصصی)"},
        {"id": "c", "text": "گزینه ج (کاملاً دقیق و تخصصی)"},
        {"id": "d", "text": "گزینه د (کاملاً دقیق و تخصصی)"}
      ]
    },
    // ... 9 سوال دیگر
  ]
}

### اطلاعات پزشکی کاربر:
${medicalContext}

### علائم کاربر:
${symptoms}`;

  // 5. Call AI with strict JSON response format
  try {
    const completion = await openaiClient.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "شما فقط JSON خروجی می‌دهید. هرگونه توضیح متنی ممنوع است.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 2500,
    });

    const aiResponse = completion.choices[0].message.content;
    const parsedResponse = JSON.parse(aiResponse);

    // 6. Validate AI response structure
    if (
      !parsedResponse.questions ||
      !Array.isArray(parsedResponse.questions) ||
      parsedResponse.questions.length !== 10
    ) {
      return next(new AppError("پاسخ هوش مصنوعی معتبر نیست", 500));
    }

    // 7. Validate each question structure
    const isValid = parsedResponse.questions.every(
      (q) =>
        q.id &&
        q.text &&
        q.options &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        q.options.every((opt) => opt.id && opt.text)
    );

    if (!isValid) {
      return next(new AppError("ساختار سوالات نامعتبر است", 500));
    }

    // 8. Return validated questions
    res.status(200).json({
      status: "success",
      data: parsedResponse,
    });
  } catch (error) {
    // Handle AI-specific errors
    if (error.response) {
      return next(
        new AppError(
          `خطای هوش مصنوعی: ${error.response.status} - ${JSON.stringify(
            error.response.data
          )}`,
          500
        )
      );
    }
    return next(
      new AppError(`خطا در ارتباط با سرویس هوش مصنوعی: ${error.message}`, 503)
    );
  }
});

/**
 * @route   POST /api/v1/ais/chatgpt4o/step2
 * @desc    Analyze medical questionnaire responses
 * @access  Private
 */
exports.step2 = catchAsync(async (req, res, next) => {
  // 1. Validate inputs
  const { answers, symptoms } = req.body;

  if (!symptoms || symptoms.trim().length < 10) {
    return next(
      new AppError(
        "اطلاعات علائم کاربر معتبر نیست. لطفاً فرآیند را دوباره شروع کنید",
        400
      )
    );
  }

  if (!answers || Object.keys(answers).length !== 10) {
    return next(new AppError("پاسخ‌های ارسالی نامعتبر هستند", 400));
  }

  const userId = req.user._id;

  // 2. Fetch user data
  const [medicalData, userProfile] = await Promise.all([
    MedicalData.findOne({ userRef: userId }),
    UserProfile.findOne({ authRef: userId }),
  ]);

  // 3. Format answers for AI
  const formattedAnswers = answers
    .map(({ questionId, answerId }) => `- سوال ${questionId}: ${answerId}`)
    .join("\n");

  // 4. Create detailed AI prompt with strict instructions
  const prompt = `شما یک پزشک متخصص با 20 سال سابقه کار هستید. بر اساس اطلاعات پزشکی بیمار، علائم گزارش شده و پاسخ‌های او به پرسشنامه، یک تحلیل پزشکی جامع و دقیق ارائه دهید.

### دستورالعمل‌های تحلیل (الزامی):
1. دو بیماری محتمل را با درصد احتمال ذکر کنید (مجموع احتمالات باید دقیقاً 100 شود)
2. هر بیماری باید با دلایل علمی و مرتبط با اطلاعات بیمار توجیه شود
3. تخصص‌های پزشکی مورد نیاز برای پیگیری را مشخص کنید
4. یک خلاصه حرفه‌ای برای ارائه به پزشک تهیه کنید
5. پیشنهادات تشخیصی و درمانی دقیق ارائه دهید
6. سطح اورژانسی بودن وضعیت را مشخص کنید (high/moderate/low)
7. خروجی فقط باید یک آبجکت JSON باشد
8. از اطلاعات پزشکی کاربر و پاسخ‌های او استفاده دقیق کنید
9. از اصطلاحات پزشکی دقیق و تخصصی استفاده کنید

### ساختار خروجی مورد نیاز (الزامی):
{
  "summary": "خلاصه وضعیت بیمار برای ارائه به پزشک",
  "probableDiseases": [
    {
      "name": "نام بیماری اول",
      "probability": 75, // عدد بین 1 تا 100 (مجموع دو بیماری 100)
      "rationale": "دلایل علمی احتمالی بودن این بیماری بر اساس اطلاعات بیمار"
    },
    {
      "name": "نام بیماری دوم",
      "probability": 25, // عدد بین 1 تا 100 (مجموع دو بیماری 100)
      "rationale": "دلایل علمی احتمالی بودن این بیماری بر اساس اطلاعات بیمار"
    }
  ],
  "recommendedSpecialists": ["متخصص قلب", "متخصص گوارش"],
  "medicalRecommendations": [
    "انجام آزمایش CBC",
    "سونوگرافی شکم",
    "مصرف داروی ..."
  ],
  "urgencyLevel": "high/moderate/low",
  "details": "توضیحات تخصصی تشخیص با جزئیات کامل"
}

### اطلاعات بیمار:
- سن: ${userProfile?.age || "نامشخص"}
- جنسیت: ${userProfile?.gender || "نامشخص"}
- قد: ${medicalData?.height || "نامشخص"} سانتی‌متر
- وزن: ${medicalData?.weight || "نامشخص"} کیلوگرم
- BMI: ${medicalData?.bmi || "نامشخص"}
- گروه خونی: ${medicalData?.bloodType || "نامشخص"}
- سابقه پزشکی: ${
    medicalData?.conditions?.map((c) => c.name).join(", ") || "ندارد"
  }
- آلرژی‌ها: ${medicalData?.allergies?.map((a) => a.name).join(", ") || "ندارد"}
- داروهای مصرفی: ${
    medicalData?.medications?.map((m) => m.name).join(", ") || "ندارد"
  }

### علائم اصلی گزارش شده توسط بیمار:
${symptoms}

### پاسخ‌های بیمار به پرسشنامه تخصصی:
${formattedAnswers}`;

  // 5. Call AI with strict parameters
  try {
    const completion = await openaiClient.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "شما فقط JSON خروجی می‌دهید. هرگونه توضیح متنی ممنوع است. ساختار خروجی باید دقیقاً مطابق نمونه باشد. مجموع احتمالات دو بیماری باید دقیقاً 100 شود.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.1, // دقت بالا
      max_tokens: 3500,
      top_p: 0.3,
      frequency_penalty: 0.5,
      presence_penalty: 0.5,
    });

    const aiResponse = completion.choices[0].message.content;
    let parsedResponse;

    try {
      parsedResponse = JSON.parse(aiResponse);
    } catch (jsonError) {
      return next(
        new AppError(
          "پاسخ هوش مصنوعی قابل پردازش نیست. ساختار JSON نامعتبر است.",
          500
        )
      );
    }

    // 6. Validate AI response structure
    const requiredFields = [
      "summary",
      "probableDiseases",
      "recommendedSpecialists",
      "medicalRecommendations",
      "urgencyLevel",
      "details",
    ];

    const hasAllFields = requiredFields.every(
      (field) => parsedResponse[field] !== undefined
    );

    if (!hasAllFields) {
      return next(
        new AppError(
          "ساختار پاسخ هوش مصنوعی نامعتبر است. فیلدهای ضروری وجود ندارد.",
          500
        )
      );
    }

    // 7. Validate diseases array
    if (
      !Array.isArray(parsedResponse.probableDiseases) ||
      parsedResponse.probableDiseases.length !== 2
    ) {
      return next(
        new AppError(
          "ساختار بیماری‌های محتمل نامعتبر است. باید دقیقاً دو بیماری وجود داشته باشد.",
          500
        )
      );
    }

    // 8. Validate probabilities
    const prob1 = parsedResponse.probableDiseases[0].probability;
    const prob2 = parsedResponse.probableDiseases[1].probability;
    const totalProbability = prob1 + prob2;

    if (typeof prob1 !== "number" || typeof prob2 !== "number") {
      return next(new AppError("مقادیر احتمال باید عدد باشند", 500));
    }

    if (prob1 < 1 || prob1 > 100 || prob2 < 1 || prob2 > 100) {
      return next(new AppError("مقادیر احتمال باید بین 1 تا 100 باشند", 500));
    }

    if (Math.abs(totalProbability - 100) > 5) {
      // تنظیم احتمالات اگر مجموع نزدیک به 100 نباشد
      parsedResponse.probableDiseases[0].probability = Math.round(
        (prob1 / totalProbability) * 100
      );
      parsedResponse.probableDiseases[1].probability =
        100 - parsedResponse.probableDiseases[0].probability;
    }

    // 9. Validate urgency level
    const validUrgencyLevels = ["high", "moderate", "low"];
    if (!validUrgencyLevels.includes(parsedResponse.urgencyLevel)) {
      parsedResponse.urgencyLevel = "moderate"; // مقدار پیش‌فرض
    }

    // 10. Return final analysis
    res.status(200).json({
      status: "success",
      data: parsedResponse,
    });
  } catch (error) {
    // Handle specific errors
    if (error.response) {
      return next(
        new AppError(
          `خطای هوش مصنوعی: ${error.response.status} - ${JSON.stringify(
            error.response.data
          )}`,
          500
        )
      );
    }

    return next(new AppError(`خطا در پردازش درخواست: ${error.message}`, 500));
  }
});
