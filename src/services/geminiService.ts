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

const RUS_TO_ENG_KEYWORDS: Record<string, string> = {
  'двигатель': 'engine',
  'мотор': 'engine',
  'коробка': 'gearbox',
  'кпп': 'gearbox',
  'трансмиссия': 'transmission',
  'свет': 'light',
  'фары': 'lamp',
  'тормоз': 'brake',
  'колесо': 'wheel',
  'шина': 'tire',
  'бак': 'tank',
  'топлив': 'fuel',
  'скорость': 'speed',
  'лимит': 'limit',
  'мощность': 'power',
  'крутящий': 'torque',
  'момент': 'torque',
  'давление': 'pressure',
  'температура': 'temperature',
  'датчик': 'sensor',
  'ошибка': 'error',
  'пробег': 'distance',
  'ходовая': 'chassis',
  'подвеска': 'suspension',
  'кабина': 'cabin',
  'дверь': 'door',
  'окно': 'window',
  'зеркало': 'mirror',
  'обогрев': 'heat',
  'климат': 'climate',
  'воздух': 'air',
  'масло': 'oil',
  'фильтр': 'filter',
  'аккумулятор': 'battery',
  'заряд': 'charge',
  'генератор': 'generator',
  'стартер': 'starter',
  'ключ': 'key',
  'защита': 'protection',
  'блокировка': 'lock',
  'дифференциал': 'diff',
  'мост': 'axle',
  'прицеп': 'trailer',
  'седло': 'fifth wheel',
  'пневмо': 'pneumatic',
  'абс': 'abs',
  'ебс': 'ebs',
  'адблю': 'adblue',
  'мочевина': 'adblue',
  'выхлоп': 'exhaust',
  'экология': 'emission',
};

export const LOGGING_KEYWORDS = ['log', 'counter', 'history', 'event', 'timer', 'time since', 'accumulated', 'value', 'count', 'odometer', 'trip', 'average', 'stats', 'peak', 'min/max'];

/**
 * Pre-processes the database to mark logging parameters and assign priorities.
 * This makes AI context selection much more efficient.
 */
export function preprocessParameters(data: VolvoParameter[]): VolvoParameter[] {
  return data.map(param => {
    const caption = (param.DefaultCaption || "").toLowerCase();
    const desc = (param.DefaultDescription || "").toLowerCase();
    const code = (param.ParameterCode || "").toLowerCase();
    const text = `${caption} ${desc}`.toLowerCase();
    
    // 1. Identify Logging
    const isLogging = LOGGING_KEYWORDS.some(keyword => text.includes(keyword));
    
    // 2. Assign Priority
    // High priority: Configuration ID patterns (G0A, ABN, etc usually have 3-4 chars)
    // Low priority: Logs, counters
    let priority = 50; 
    
    if (isLogging) priority -= 30;
    if (code.length <= 4) priority += 20; // Short codes are often major config flags
    if (param.Controllable === 'true') priority += 10;
    
    return {
      ...param,
      isLogging,
      priority
    };
  });
}

/**
 * Resets the preprocessing flags from the parameters.
 */
export function resetParameters(data: VolvoParameter[]): VolvoParameter[] {
  return data.map(param => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { isLogging, priority, ...rest } = param;
    return rest;
  });
}

/**
 * Searches the dataset for parameters relevant to a query.
 * Heavily optimized for large context retrieval.
 */
export function findRelevantParameters(
  data: VolvoParameter[], 
  query: string, 
  appliedCodes: Set<string> | null = null,
  limit = 350,
  hideLogging = false
): (VolvoParameter & { isApplied?: boolean })[] {
  const lowerQuery = query.toLowerCase();
  
  // Filtering out logging parameters if requested
  let filteredData = data;
  if (hideLogging) {
    filteredData = data.filter(item => {
      // Use pre-calculated flag if available, otherwise check keywords
      if (item.isLogging !== undefined) return !item.isLogging;
      const text = `${item.DefaultCaption} ${item.DefaultDescription}`.toLowerCase();
      return !LOGGING_KEYWORDS.some(keyword => text.includes(keyword));
    });
  }

  // Extract and translate keywords
  const rawTerms = lowerQuery.split(/[\s,.;]+/).filter(t => t.length > 2);
  const terms = new Set<string>();
  
  rawTerms.forEach(t => {
    terms.add(t);
    // Add translated english version if exists
    for (const [rus, eng] of Object.entries(RUS_TO_ENG_KEYWORDS)) {
      if (t.includes(rus) || rus.includes(t)) {
        terms.add(eng);
      }
    }
  });

  const termsList = Array.from(terms);
  
  const isAskingAboutApplied = 
    lowerQuery.includes('применен') || 
    lowerQuery.includes('активн') || 
    lowerQuery.includes('использ') ||
    lowerQuery.includes('машин') ||
    lowerQuery.includes('авто') ||
    lowerQuery.includes('мой') ||
    lowerQuery.includes('моя') ||
    lowerQuery.includes('applied') ||
    lowerQuery.includes('active');
  
  // Always search everything but give priority to applied codes
  const results = filteredData.map(param => {
    let score = 0;
    const code = (param.ParameterCode || "").toLowerCase();
    const caption = (param.DefaultCaption || "").toLowerCase();
    const desc = (param.DefaultDescription || "").toLowerCase();
    
    const isApplied = appliedCodes ? appliedCodes.has(code) : false;

    // Base priority boost
    if (param.priority) score += param.priority;

    // Weighting logic (matching "magical" logic from report)
    // ID match: +1000 (absolute priority)
    // Caption: +40
    // Description: +20
    // Applied: +50
    termsList.forEach(term => {
      if (code === term) score += 2000; 
      if (code.includes(term)) score += 100;
      if (caption.includes(term)) score += 40;
      if (desc.includes(term)) score += 20;
    });

    // Special boost logic
    if (isApplied) {
      if (score > 0) {
        score += 100; // Found something relevant AND it's applied
        if (isAskingAboutApplied) score *= 2;
      } else if (isAskingAboutApplied) {
        score += 10; // It's applied but maybe doesn't match keywords well, still might be relevant
      }
    }
    
    return { param: { ...param, isApplied }, score };
  });

  const finalFiltered = results.filter(item => item.score > 0);
  
  // If we found nothing with terms, but asking about applied, show some applied
  if (finalFiltered.length === 0 && isAskingAboutApplied && appliedCodes) {
    return filteredData
      .filter(p => appliedCodes.has((p.ParameterCode || "").toLowerCase()))
      .slice(0, 50)
      .map(p => ({ ...p, isApplied: true }));
  }

  return finalFiltered
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.param);
}

export async function performDeepAnalysis(
  apiKey: string,
  query: string,
  fullContext: (VolvoParameter & { isApplied?: boolean })[],
  isLoggingHidden: boolean
) {
  const ai = getGemini(apiKey);
  // Using a stable high-performance model for engineering audit
  const model = "gemini-1.5-pro";
  
  const contextPrompt = fullContext.map(p => {
    const s = p.isApplied ? "!" : ".";
    return `${s} ${p.ParameterCode}|${p.DefaultCaption}|${p.DefaultDescription.slice(0, 200)}`;
  }).join("\n");

  const systemInstruction = `ВЫ — ВЕДУЩИЙ ИНЖЕНЕР ПО СИСТЕМНОЙ АРХИТЕКТУРЕ VOLVO TRUCKS (V4).
ВАША ЗАДАЧА: Провести ТРЁХЭТАПНЫЙ ГЛУБОКИЙ ТЕХНИЧЕСКИЙ АУДИТ конфигурации.

ПРАВИЛА ИЗВЛЕЧЕНИЯ:
1. '!' — ПАРАМЕТР ПРИМЕНЕН (ACTIVE). Это реальная конфигурация машины.
2. '.' — СПРАВОЧНЫЙ ПАРАМЕТР. Это доступно в базе, но не активно в данном профиле.
3. НЕ ВЫДУМЫВАЙТЕ ДАННЫЕ. Если параметра нет в контексте, но он важен — укажите это как "требуется поиск".
4. Отвечайте на РУССКОМ языке. Технично, аргументированно, без лишней "воды".
${isLoggingHidden ? "ВНИМАНИЕ: Параметры логов/статистики намеренно скрыты для чистоты анализа." : ""}`;

  // ЭТАП 1: Первичный технический разбор
  const round1 = await ai.models.generateContent({
    model,
    contents: `ДАННЫЕ ПАРАМЕТРОВ V4:\n${contextPrompt}\n\nЗАПРОС: ${query}\n\nЭТАП 1: Выделите ПРИМЕНЕННЫЕ (!) параметры, прямо влияющие на запрос. Опишите их текущее состояние.`,
    config: { systemInstruction }
  });

  const text1 = round1.text || "";

  // ЭТАП 2: Кросс-проверка зависимостей
  const round2 = await ai.models.generateContent({
    model,
    contents: `БАЗОВЫЙ АНАЛИЗ (ЭТАП 1):\n${text1}\n\nЭТАП 2: Изучите связи. Могут ли эти настройки конфликтовать? (Напр. лимит скорости vs мощность двигателя, или датчики vs конфигурация кабины). Найдите аномалии.`,
    config: { systemInstruction }
  });

  const text2 = round2.text || "";

  // ЭТАП 3: Инженерный вердикт
  const round3 = await ai.models.generateContent({
    model,
    contents: `ПРОВЕРКА СВЯЗЕЙ (ЭТАП 2):\n${text2}\n\nЭТАП 3: Сформируйте финальный отчет. 
СТРУКТУРА:
1. ТЕХНИЧЕСКОЕ РЕЗЮМЕ
2. ВЫЯВЛЕННЫЕ РИСКИ/КОНФЛИКТЫ
3. РЕКОМЕНДАЦИИ ПО НАСТРОЙКЕ
4. КРИТИЧЕСКАЯ ОЦЕНКА (Инженерный вердикт - OK / WARNING / ERROR).`,
    config: { systemInstruction }
  });

  return round3.text || "Не удалось завершить глубокий анализ.";
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

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `ВОПРОС: ${query}

ЛОКАЛЬНЫЕ ДАННЫЕ (ID | Название | Описание):
${contextPrompt}`,
    config: {
      systemInstruction: `ВЫ — ГЛАВНЫЙ ТЕХНИЧЕСКИЙ ЭКСПЕРТ VOLVO TRUCKS (платформа V4).
У вас есть доступ к локальной базе параметров и профилю конкретной машины.

СТРОГИЕ ПРАВИЛА:
1. ВАШ ОТВЕТ ДОЛЖЕН БАЗИРОВАТЬСЯ СТРОГО НА ПРИСЛАННЫХ ДАННЫХ.
2. ПРИМЕНЕННЫЕ ПАРАМЕТРЫ ПОМЕЧЕНЫ ЗНАКОМ [!]. ЭТО ТО, ЧТО РЕАЛЬНО ЕСТЬ В МАШИНЕ.
3. ПАРАМЕТРЫ СО ЗНАКОМ [.] — ЭТО ПРОСТО СПРАВОЧНИК ИЗ БАЗЫ.
4. ЕСЛИ ВАМ НЕ ХВАТАЕТ ДАННЫХ ДЛЯ ОТВЕТА — СКАЖИТЕ ОБ ЭТОМ, НЕ ГАДАЙТЕ.
5. НЕ ИСПОЛЬЗУЙТЕ ВНЕШНИЕ ЗНАНИЯ ОБ АВТОМОБИЛЯХ, КОТОРЫХ НЕТ В ПРИСЛАННОМ ТЕКСТЕ.
6. ОБЯЗАТЕЛЬНО УКАЗЫВАЙТЕ ID ПАРАМЕТРОВ (G0A, ABN и т.д.) В ОТВЕТЕ.
7. ОТВЕЧАЙТЕ ТЕХНИЧЕСКИ ТОЧНО, КРАТКО, НА РУССКОМ ЯЗЫКЕ.
${isLoggingHidden ? "ВНИМАНИЕ: Из выборки СКРЫТЫ параметры логов/счетчиков." : ""}
Всего в машине применимо кодов: ${appliedCount || "неизвестно"}.`
    }
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

export async function verifyWithWeb(
  apiKey: string,
  query: string,
  aiAnswer: string
) {
  const ai = getGemini(apiKey);
  
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `ЗАПРОС ПОЛЬЗОВАТЕЛЯ: ${query}\n\nНАШ ПРЕДЫДУЩИЙ ОТВЕТ (НА ОСНОВЕ ЛОКАЛЬНЫХ БАЗ): ${aiAnswer}\n\nЗАДАЧА: Сверьте этот технический ответ с информацией из официальных источников Volvo Trucks и открытых технических баз в интернете. Подтвердите точность ID параметров или укажите на неточности. Найдите физические значения, если они не указаны в локальной базе.`,
    config: {
      tools: [{ googleSearch: {} }],
      systemInstruction: `ВЫ — ВЕДУЩИЙ ТЕХНИЧЕСКИЙ АУДИТОР VOLVO TRUCKS. 
ИСПОЛЬЗУЙТЕ GOOGLE SEARCH ДЛЯ ПРОВЕРКИ ТЕХНИЧЕСКИХ ДАННЫХ.
ОТВЕЧАЙТЕ НА РУССКОМ ЯЗЫКЕ.
ВАША ЦЕЛЬ: ПОВЫСИТЬ ТОЧНОСТЬ ОТВЕТА ЗА СЧЕТ ГЛОБАЛЬНОЙ СЕТИ.`
    }
  });

  return response.text || "Не удалось выполнить веб-проверку.";
}

export async function translateParameter(
  apiKey: string,
  param: VolvoParameter
) {
  const ai = getGemini(apiKey);

  const prompt = `ВЫ — ТЕХНИЧЕСКИЙ ПЕРЕВОДЧИК VOLVO TRUCKS.
ВАША ЗАДАЧА: Перевести техническую спецификацию параметра на РУССКИЙ ЯЗЫК.

ПАРАМЕТР: ${param.ParameterCode}
НАЗВАНИЕ (EN): ${param.DefaultCaption}
ОПИСАНИЕ (EN): ${param.DefaultDescription}
ТЕХНИЧЕСКОЕ ОПРЕДЕЛЕНИЕ (XML/EN): ${param.DataDefinition}
АУДИТОРИЯ (XML/EN): ${param.Audiences}

ИНСТРУКЦИИ:
1. Переведи Название и Описание максимально точно, сохраняя технический смысл.
2. Для Поля "Техническое определение" и "Аудитория" — переведи только текстовые значения внутри XML тегов (если они есть) или опиши их смысл по-русски, ЕСЛИ это полезно. Если это просто голый XML/Код — не переводи его дословно, а дай краткое русское пояснение типа данных.
3. Верни результат в формате JSON:
{
  "caption": "Переведенное название",
  "description": "Переведенное описание",
  "dataDefinition": "Переведенное/Поясненное определение",
  "audiences": "Переведенная аудитория"
}
4. НЕ добавляй никакого лишнего текста, только JSON.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt
  });

  const text = response.text || "";
  try {
    // Basic cleanup in case Gemini wraps JSON in markdown blocks
    const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(jsonStr) as { 
      caption: string; 
      description: string; 
      dataDefinition: string; 
      audiences: string; 
    };
  } catch (e) {
    console.error("Translation parse error:", e, text);
    throw new Error("Не удалось разобрать ответ переводчика.");
  }
}
