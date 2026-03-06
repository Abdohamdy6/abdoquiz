# Hamdy Quiz — خطوات الرفع على Vercel

## ١. إعداد Upstash Redis (مجاني)

1. روح على **https://upstash.com** وعمل حساب مجاني
2. اضغط **Create Database**
3. اختر اسم للـ database وأقرب region ليك
4. بعد الإنشاء، روح لـ **REST API** وانسخ:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

---

## ٢. إعداد Anthropic API Key

1. روح على **https://console.anthropic.com**
2. اعمل حساب وروح **API Keys**
3. اضغط **Create Key** وانسخ الـ key

---

## ٣. الرفع على Vercel

### الطريقة السهلة (من GitHub):

```bash
# ١. ارفع المشروع على GitHub
git init
git add .
git commit -m "Hamdy Quiz"
git push

# ٢. روح vercel.com → New Project → Import من GitHub
```

### أو من الـ CLI:

```bash
npm i -g vercel
vercel login
vercel
```

---

## ٤. إضافة الـ Environment Variables على Vercel

بعد الرفع، روح **Project Settings → Environment Variables** وأضف:

| Key | Value |
|-----|-------|
| `UPSTASH_REDIS_REST_URL` | الـ URL من Upstash |
| `UPSTASH_REDIS_REST_TOKEN` | الـ Token من Upstash |
| `ANTHROPIC_API_KEY` | مفتاح Anthropic |

ثم اضغط **Redeploy**.

---

## ٥. اللعب

- **اللاعب ١:** يفتح الموقع → يضغط "لعب أونلاين 1v1" → إنشاء روم → يبعت الكود
- **اللاعب ٢:** يفتح نفس الموقع → يدخل الكود → يبدأ اللعب

---

## إضافة أسئلة جديدة

حط ملفات JSON في `public/questions/اسم_الفئة/`:

```json
{
  "category": "اسم الكاتيجوري",
  "questions": [
    { "points": 200, "q": "السؤال", "a": "الإجابة" },
    { "points": 400, "q": "السؤال", "a": "الإجابة" },
    { "points": 600, "q": "السؤال", "a": "الإجابة" }
  ]
}
```

محتاج على الأقل: **2 سؤال لكل فئة نقاط** (200 و400 و600).
