import { GoogleGenAI } from "@google/genai";
import { VolvoParameter } from "../types";

let ai: GoogleGenAI | null = null;

export function getGemini(apiKey: string) {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing. Please check your environment variables.");
  }
  if (!ai) {
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}

/**
 * Searches the dataset for parameters relevant to a query.
 * Heavily optimized for large context retrieval.
 */
export function findRelevantParameters(
  data: VolvoParameter[], 
  query: string, 
  appliedCodes: Set<string> | null = null,
  limit = 250 // Increased limit for deeper context
): (VolvoParameter & { isApplied?: boolean })[] {
  const lowerQuery = query.toLowerCase();
  const terms = lowerQuery.split(/[\s,.;]+/).filter(t => t.length > 1);
  
  const isAskingAboutApplied = 
    lowerQuery.includes('применен') || 
    lowerQuery.includes('активн') || 
    lowerQuery.includes('использ') ||
    lowerQuery.includes('машин') ||
    lowerQuery.includes('авто') ||
    lowerQuery.includes('applied') ||
    lowerQuery.includes('active');

  // If asking about the vehicle state, prioritize applied codes
  if (isAskingAboutApplied && appliedCodes) {
    const appliedParams = data
      .filter(p => appliedCodes.has((p.ParameterCode || "").toLowerCase()))
      .map(p => ({ ...p, isApplied: true }));
    
    if (terms.length > 0) {
      return appliedParams
        .map(p => {
          let score = 0;
          const text = `${p.ParameterCode} ${p.DefaultCaption} ${p.DefaultDescription}`.toLowerCase();
          terms.forEach(t => { if (text.includes(t)) score += 1; });
          return { p, score };
        })
        .sort((a, b) => b.score - a.score)
        .map(i => i.p)
        .slice(0, limit);
    }
    return appliedParams.slice(0, limit);
  }

  const results = data.map(param => {
    let score = 0;
    const code = (param.ParameterCode || "").toLowerCase();
    const caption = (param.DefaultCaption || "").toLowerCase();
    const desc = (param.DefaultDescription || "").toLowerCase();
    
    const isApplied = appliedCodes ? appliedCodes.has(code) : false;

    terms.forEach(term => {
      if (code === term) score += 100;
      if (code.includes(term)) score += 30;
      if (caption.includes(term)) score += 20;
      if (desc.includes(term)) score += 10;
    });

    if (isApplied && score > 0) score += 20;
    
    return { param: { ...param, isApplied }, score };
  });

  return results
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.param);
}

export async function performDeepAnalysis(
  apiKey: string,
  query: string,
  fullAppliedContext: (VolvoParameter & { isApplied?: boolean })[],
  isLoggingHidden: boolean
) {
  const ai = getGemini(apiKey);

  const contextPrompt = fullAppliedContext.map(p => {
    return `! ${p.ParameterCode}|${p.DefaultCaption}|${p.DefaultDescription.slice(0, 150)}`;
  }).join("\n");

  const prompt = `ВЫ — ВЕДУЩИЙ ИНЖЕНЕР ПО СИСТЕМНОЙ АРХИТЕКТУРЕ VOLVO TRUCKS.
ВАША ЗАДАЧА: Провести ГЛУБОКИЙ ТЕХНИЧЕСКИЙ АУДИТ конфигурации автомобиля.

ПЕРЕД ВАМИ ПОЛНЫЙ СПИСОК ПРИМЕНЕННЫХ ПАРАМЕТРОВ [!].
${isLoggingHidden ? "ВНИМАНИЕ: Параметры логов/счетчиков скрыты пользователем." : ""}

СПИСОК ПАРАМЕТРОВ (ID | Название | Описание):
${contextPrompt}

ЗАПРОС ПОЛЬЗОВАТЕЛЯ ДЛЯ ГЛУБОКОГО АНАЛИЗА: ${query}

ИНСТРУКЦИИ ДЛЯ ГЛУБОКОГО АНАЛИЗА:
1. Связывайте параметры между собой. Например, если изменена мощность, проверьте лимиты КПП (G0A/ABN и т.д.).
2. Ищите аномалии или противоречивые настройки в примененном профиле.
3. Оцените влияние на ресурс двигателя, трансмиссии и безопасность.
4. Если вопрос касается конкретной системы (напр. свет, кабина), выделите ВСЕ влияющие на нее параметры из списка.
5. Отвечайте развернуто, структурировано, на РУССКОМ языке.
6. Выделите "Критическую оценку" отдельным блоком.`;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt
  });

  return response.text || "Не удалось завершить глубокий анализ.";
}

export async function askGeminiAboutParameters(
  apiKey: string,
  query: string,
  context: (VolvoParameter & { isApplied?: boolean })[],
  appliedCount: number | null,
  isLoggingHidden: boolean
) {
  const ai = getGemini(apiKey);

  // Condensed format: ! = Active, . = In Database but not active
  const contextPrompt = context.map(p => {
    const s = p.isApplied ? "!" : ".";
    return `${s} ${p.ParameterCode}|${p.DefaultCaption}|${p.DefaultDescription.slice(0, 120)}`;
  }).join("\n");

  const prompt = `ВЫ — ГЛАВНЫЙ ИНЖЕНЕР VOLVO TRUCKS (V4).
У вас есть доступ к технической базе и профилю конкретной машины.

КОНТЕКСТ АВТОМОБИЛЯ:
- На этой машине АКТИВИРОВАНО ${appliedCount || "неизвестно"} параметров.
${isLoggingHidden ? "- ВНИМАНИЕ: Из вашей выборки СКРЫТЫ параметры логов, счетчиков и журналов (Filter: Hide Logging active)." : ""}
- В списке ниже примененные параметры помечены знаком [!], остальные [.] (просто справочно)

ДАННЫЕ (ID | Название | Описание):
${contextPrompt}

ВОПРОС: ${query}

ИНСТРУКЦИИ:
1. Проанализируй примененные параметры [!]. Если вопрос касается конфигурации этой машины, приоритет отдавай им.
2. Если пользователь спрашивает о чем-то, что может быть в логах (счетчики, пробеги), а данных нет — напомни, что включен фильтр "Скрыть логи".
3. Используй ID параметров (G0A, ABN) в ответе.
4. Отвечай кратко, технически точно, на РУССКОМ языке.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt
  });

  return response.text || "Извините, не удалось сформировать ответ.";
}

export async function askGeminiToCompare(
  apiKey: string,
  query: string,
  context1: (VolvoParameter & { isApplied?: boolean })[],
  context2: (VolvoParameter & { isApplied?: boolean })[],
  stats1: { cleanApplied: number; appliedTotal: number },
  stats2: { cleanApplied: number; appliedTotal: number },
  hideLogging1: boolean,
  hideLogging2: boolean
) {
  const ai = getGemini(apiKey);

  const formatContext = (context: (VolvoParameter & { isApplied?: boolean })[]) => {
    return context.map(p => {
      const s = p.isApplied ? "!" : ".";
      return `${s} ${p.ParameterCode}|${p.DefaultCaption}|${p.DefaultDescription.slice(0, 100)}`;
    }).join("\n");
  };

  const prompt = `ВЫ — ГЛАВНЫЙ АНАЛИТИК VOLVO TRUCKS.
ЗАДАЧА: Сравнить две конфигурации (профиля) одного или разных автомобилей.

ПРОФИЛЬ 1:
- Активировано (чистые): ${stats1.cleanApplied} (Всего: ${stats1.appliedTotal})
- Скрытие логов: ${hideLogging1 ? "Вкл" : "Выкл"}
ДАННЫЕ ПЕРВОГО ПРОФИЛЯ:
${formatContext(context1)}

ПРОФИЛЬ 2:
- Активировано (чистые): ${stats2.cleanApplied} (Всего: ${stats2.appliedTotal})
- Скрытие логов: ${hideLogging2 ? "Вкл" : "Выкл"}
ДАННЫЕ ВТОРОГО ПРОФИЛЯ:
${formatContext(context2)}

ВОПРОС ПОЛЬЗОВАТЕЛЯ: ${query}

ИНСТРУКЦИИ:
1. Сосредоточься на различиях между [!] параметрами профиля 1 и профиля 2.
2. Объясни, как эти различия влияют на поведение машины (мощность, лимиты, функционал).
3. Если параметры в обоих профилях одинаковы, укажи на это.
4. Используй ID параметров (G0A, ABN) для точности.
5. Отвечай кратко, технически аргументированно, на РУССКОМ языке.
6. Выдели КЛЮЧЕВЫЕ РАЗЛИЧИЯ списком.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt
  });

  return response.text || "Извините, не удалось проанализировать сравнение.";
}
