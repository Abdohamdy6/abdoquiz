import { GoogleGenerativeAI } from '@google/generative-ai';

// ربط المفتاح من المتغيرات البيئية
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function judgeAnswer(question, correctAnswer, playerAnswer) {
  try {
    // استخدام موديل فلاش (الأسرع والأوفر للتقييم)
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const prompt = `
أنت حكم صارم وعادل في لعبة مسابقات معلومات عامة.
السؤال: "${question}"
الإجابة النموذجية: "${correctAnswer}"
إجابة اللاعب: "${playerAnswer}"

هل إجابة اللاعب تعتبر صحيحة وتحمل نفس معنى أو جوهر الإجابة النموذجية (حتى لو كان بها أخطاء إملائية بسيطة)؟
أجب بكلمة واحدة فقط: True إذا كانت صحيحة، أو False إذا كانت خاطئة.
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim().toLowerCase();
    
    // إرجاع true لو الذكاء الاصطناعي قال صح، و false لو قال غلط
    return responseText.includes('true');
    
  } catch (error) {
    console.error("Gemini API Error:", error);
    // في حالة حدوث أي خطأ في الاتصال، نعتبر الإجابة خاطئة عشان اللعبة ما تعلقش
    return false; 
  }
}