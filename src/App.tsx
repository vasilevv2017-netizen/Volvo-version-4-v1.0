/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef } from 'react';
import Papa from 'papaparse';
import { 
  FileUp, 
  Search, 
  Filter, 
  BarChart3, 
  Copy, 
  Check, 
  Settings2, 
  Info,
  ChevronDown,
  ChevronUp,
  Download,
  Terminal,
  CarFront,
  X,
  GitCompare,
  UploadCloud,
  ArrowRightLeft,
  Sparkles,
  Database,
  Trash2,
  HardDrive
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { cn, extractXmlInfo } from './lib/utils';
import { VolvoParameter, AnalysisSummary } from './types';
import { loadParameters, saveParameters, clearDB } from './lib/db';

const LOGGING_KEYWORDS = ['log', 'counter', 'history', 'event', 'timer', 'time since', 'accumulated', 'value', 'count', 'odometer', 'trip', 'average', 'stats', 'peak', 'min/max'];

export default function App() {
  const [data, setData] = useState<VolvoParameter[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDbLoading, setIsDbLoading] = useState(true);
  const [dbStatus, setDbStatus] = useState<{ count: number; date: string | null }>({ count: 0, date: null });
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'table' | 'analysis' | 'ai' | 'compare' | 'storage'>('table');
  const [currentView, setCurrentView] = useState<'main' | 'applied_upload'>('main');

  // Load from IndexedDB on mount
  React.useEffect(() => {
    async function checkDB() {
      try {
        const storedData = await loadParameters();
        if (storedData && storedData.length > 0) {
          setData(storedData);
          setDbStatus({ 
            count: storedData.length, 
            date: localStorage.getItem('db_last_update') 
          });
        }
      } catch (err) {
        console.error("Failed to load from DB:", err);
      } finally {
        setIsDbLoading(false);
      }
    }
    checkDB();
  }, []);
  
  // Profile 1 (Applied)
  const [appliedCodes, setAppliedCodes] = useState<Set<string> | null>(null);
  const [hideLogging, setHideLogging] = useState(false);

  // Profile 2 (Comparison)
  const [appliedCodes2, setAppliedCodes2] = useState<Set<string> | null>(null);
  const [hideLogging2, setHideLogging2] = useState(false);
  
  const [showAppliedOnly, setShowAppliedOnly] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: keyof VolvoParameter; direction: 'asc' | 'desc' } | null>(null);
  const [selectedParam, setSelectedParam] = useState<VolvoParameter | null>(null);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dbFileInputRef = useRef<HTMLInputElement>(null);
  const appliedFileInputRef = useRef<HTMLInputElement>(null);
  const appliedFileInputRef2 = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    const getStats = (codes: Set<string> | null) => {
      const appliedParams = codes 
        ? data.filter(item => codes.has(item.ParameterCode?.toLowerCase()))
        : [];
      
      const loggingInApplied = appliedParams.filter(item => {
        const text = `${item.DefaultCaption} ${item.DefaultDescription}`.toLowerCase();
        return LOGGING_KEYWORDS.some(keyword => text.includes(keyword));
      }).length;

      return {
        appliedTotal: appliedParams.length,
        loggingInApplied,
        cleanApplied: appliedParams.length - loggingInApplied
      };
    };

    return {
      profile1: getStats(appliedCodes),
      profile2: getStats(appliedCodes2)
    };
  }, [data, appliedCodes, appliedCodes2]);

  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; content: string }[]>([]);
  const [compareMessages, setCompareMessages] = useState<{ role: 'user' | 'ai'; content: string }[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isWaitingForAI, setIsWaitingForAI] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, saveToStorage = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: async (results) => {
        if (!results || !results.data) {
          console.error('No data found in CSV');
          setIsProcessing(false);
          return;
        }
        const rawData = results.data as VolvoParameter[];
        const enrichedData = rawData.map(item => ({
          ...item,
          parsedType: extractXmlInfo(item.DataDefinition || ''),
          parsedAudiences: extractXmlInfo(item.Audiences || '')
        }));
        
        setData(enrichedData);
        
        if (saveToStorage) {
          try {
            await saveParameters(enrichedData);
            const date = new Date().toLocaleString();
            localStorage.setItem('db_last_update', date);
            setDbStatus({ count: enrichedData.length, date });
          } catch (err) {
            console.error("Failed to save to storage:", err);
            alert("Не удалось сохранить в память браузера.");
          }
        }
        
        setIsProcessing(false);
      },
      error: (error) => {
        console.error('Error parsing CSV:', error);
        setIsProcessing(false);
        alert('Error parsing file. Ensure it is a valid Volvo parameter CSV.');
      }
    });
  };

  const handleClearStorage = async () => {
    if (window.confirm("Вы уверены, что хотите удалить справочник из памяти браузера?")) {
      await clearDB();
      localStorage.removeItem('db_last_update');
      setDbStatus({ count: 0, date: null });
      setData([]);
    }
  };

  const handleExportConfig = () => {
    const config = {
      version: '1.0',
      appliedCodes: appliedCodes ? Array.from(appliedCodes) : [],
      hideLogging: hideLogging,
      showAppliedOnly: showAppliedOnly,
      timestamp: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `volvo_diag_config_${new Date().getTime()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleAppliedFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        if (file.name.endsWith('.json')) {
          try {
            const config = JSON.parse(content);
            if (config.appliedCodes && Array.isArray(config.appliedCodes)) {
              setAppliedCodes(new Set(config.appliedCodes));
              if (config.hideLogging !== undefined) setHideLogging(config.hideLogging);
              if (config.showAppliedOnly !== undefined) setShowAppliedOnly(config.showAppliedOnly);
              setCurrentView('main');
              return;
            }
          } catch (e) {
            console.error("JSON parse error", e);
          }
        }
        const codes = content.split(/[\s,]+/).map(c => c.trim().toLowerCase()).filter(c => c.length > 0);
        setAppliedCodes(new Set(codes));
        setShowAppliedOnly(true);
        setCurrentView('main');
      }
    };
    reader.readAsText(file);
  };

  const handleAppliedFileUpload2 = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        if (file.name.endsWith('.json')) {
          try {
            const config = JSON.parse(content);
            if (config.appliedCodes && Array.isArray(config.appliedCodes)) {
              setAppliedCodes2(new Set(config.appliedCodes.map(c => c.toLowerCase())));
              if (config.hideLogging !== undefined) setHideLogging2(config.hideLogging);
              return;
            }
          } catch (e) {
            console.error("JSON parse error", e);
          }
        }
        const codes = content.split(/[\s,]+/).map(c => c.trim().toLowerCase()).filter(c => c.length > 0);
        setAppliedCodes2(new Set(codes));
      }
    };
    reader.readAsText(file);
  };

  const filteredData = useMemo(() => {
    let result = [...data];

    if (showAppliedOnly && appliedCodes) {
      result = result.filter(item => appliedCodes.has(item.ParameterCode?.toLowerCase()));
    }

    if (hideLogging) {
      result = result.filter(item => {
        const text = `${item.DefaultCaption} ${item.DefaultDescription}`.toLowerCase();
        return !LOGGING_KEYWORDS.some(keyword => text.includes(keyword));
      });
    }

    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter(item => 
        item.ParameterCode?.toLowerCase().includes(lowerSearch) ||
        item.DefaultCaption?.toLowerCase().includes(lowerSearch) ||
        item.DefaultDescription?.toLowerCase().includes(lowerSearch)
      );
    }
    
    if (sortConfig) {
      result.sort((a, b) => {
        const aValue = a[sortConfig.key] || '';
        const bValue = b[sortConfig.key] || '';
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    
    return result;
  }, [data, searchTerm, sortConfig]);

  const summary = useMemo((): AnalysisSummary | null => {
    if (data.length === 0) return null;

    const stats: AnalysisSummary = {
      totalParameters: data.length,
      controllableCount: 0,
      types: {},
      audienceStats: {},
      accessModes: {}
    };

    data.forEach(p => {
      if (p.Controllable?.toLowerCase() === 'true') stats.controllableCount++;
      
      const type = p.parsedType || 'Unknown';
      stats.types[type] = (stats.types[type] || 0) + 1;
      
      const audience = p.parsedAudiences || 'None';
      stats.audienceStats[audience] = (stats.audienceStats[audience] || 0) + 1;

      const mode = p.AccessMode || 'N/A';
      stats.accessModes[mode] = (stats.accessModes[mode] || 0) + 1;
    });

    return stats;
  }, [data]);

  const aiReadyAnalysis = useMemo(() => {
    if (!summary) return "";
    const topParameters = data.slice(0, 10).map(p => `${p.ParameterCode}: ${p.DefaultCaption}`).join("\n");
    return `### Volvo V4 Parameter Analysis Output
Total Parameters: ${summary.totalParameters}
Controllable: ${summary.controllableCount}
Types Distribution:
${Object.entries(summary.types).map(([k, v]) => ` - ${k}: ${v}`).join("\n")}
Access Modes:
${Object.entries(summary.accessModes).map(([k, v]) => ` - Mode ${k}: ${v}`).join("\n")}
Audience Access:
${Object.entries(summary.audienceStats).map(([k, v]) => ` - ${k}: ${v}`).join("\n")}

Example Top Parameters:
${topParameters}

[Full Analysis generated for processing]`;
  }, [summary, data]);

  const copyToClipboard = (text?: string) => {
    const contentToCopy = text || aiReadyAnalysis;
    navigator.clipboard.writeText(contentToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSort = (key: keyof VolvoParameter) => {
    setSortConfig(current => ({
      key,
      direction: current?.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleAskAI = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!userInput.trim() || isWaitingForAI || !data.length) return;

    const query = userInput;
    setUserInput('');
    setMessages(prev => [...prev, { role: 'user', content: query }]);
    setIsWaitingForAI(true);

    try {
      // Step 1: Find relevant parameters from the 30k rows
      const { findRelevantParameters, askGeminiAboutParameters } = await import('./services/geminiService');
      
      let searchData = data;
      if (hideLogging) {
        searchData = data.filter(item => {
          const text = `${item.DefaultCaption} ${item.DefaultDescription}`.toLowerCase();
          return !LOGGING_KEYWORDS.some(keyword => text.includes(keyword));
        });
      }

      const relevantContext = findRelevantParameters(searchData, query, appliedCodes);

      // Step 2: Use Gemini to analyze
      const answer = await askGeminiAboutParameters(
        process.env.GEMINI_API_KEY!, 
        query, 
        relevantContext, 
        appliedCodes ? (hideLogging ? stats.profile1.cleanApplied : stats.profile1.appliedTotal) : null,
        hideLogging
      );
      
      setMessages(prev => [...prev, { role: 'ai', content: answer }]);
    } catch (error) {
      console.error("AI Error:", error);
      let errorMessage = "Failed to connect to AI engine.";
      if (error instanceof Error) {
        try {
          // If the message is a JSON string (like from the API), try to parse it
          const parsed = JSON.parse(error.message);
          errorMessage = parsed.error?.message || error.message;
        } catch {
          errorMessage = error.message;
        }
      }
      setMessages(prev => [...prev, { role: 'ai', content: `Ошибка: ${errorMessage}` }]);
    } finally {
      setIsWaitingForAI(false);
      setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  const handleDeepAnalysis = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!userInput.trim() || isWaitingForAI || !data.length || !appliedCodes) {
      if (!appliedCodes) alert("Глубокий анализ возможен только при загруженном профиле (Active codes).");
      return;
    }

    const query = userInput;
    setUserInput('');
    setMessages(prev => [...prev, { role: 'user', content: `[ГЛУБОКИЙ АНАЛИЗ]: ${query}` }]);
    setIsWaitingForAI(true);

    try {
      const { performDeepAnalysis } = await import('./services/geminiService');
      
      let searchData = data.filter(item => appliedCodes.has(item.ParameterCode?.toLowerCase() || ""));
      
      if (hideLogging) {
        searchData = searchData.filter(item => {
          const text = `${item.DefaultCaption} ${item.DefaultDescription}`.toLowerCase();
          return !LOGGING_KEYWORDS.some(keyword => text.includes(keyword));
        });
      }

      // We take up to 2000 parameters for deep analysis to provide complete context for almost any profile
      const fullContext = searchData.slice(0, 2000).map(p => ({ ...p, isApplied: true }));

      const answer = await performDeepAnalysis(
        process.env.GEMINI_API_KEY!, 
        query, 
        fullContext, 
        hideLogging
      );
      
      setMessages(prev => [...prev, { role: 'ai', content: answer }]);
    } catch (error) {
      console.error("Deep AI Error:", error);
      setMessages(prev => [...prev, { role: 'ai', content: `Ошибка глубокого анализа: ${error instanceof Error ? error.message : String(error)}` }]);
    } finally {
      setIsWaitingForAI(false);
      setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  const handleAskCompare = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!userInput.trim() || isWaitingForAI || !data.length || !appliedCodes || !appliedCodes2) return;

    const query = userInput;
    setUserInput('');
    setCompareMessages(prev => [...prev, { role: 'user', content: query }]);
    setIsWaitingForAI(true);

    try {
      const { findRelevantParameters, askGeminiToCompare } = await import('./services/geminiService');
      
      const prepareData = (codes: Set<string>, hLogging: boolean) => {
        let sData = data;
        if (hLogging) {
          sData = data.filter(item => {
            const text = `${item.DefaultCaption} ${item.DefaultDescription}`.toLowerCase();
            return !LOGGING_KEYWORDS.some(keyword => text.includes(keyword));
          });
        }
        return findRelevantParameters(sData, query, codes, 150);
      };

      const context1 = prepareData(appliedCodes, hideLogging);
      const context2 = prepareData(appliedCodes2, hideLogging2);

      const answer = await askGeminiToCompare(
        process.env.GEMINI_API_KEY!, 
        query, 
        context1, 
        context2, 
        stats.profile1,
        stats.profile2,
        hideLogging,
        hideLogging2
      );
      
      setCompareMessages(prev => [...prev, { role: 'ai', content: answer }]);
    } catch (error) {
      console.error("Compare Error:", error);
      setCompareMessages(prev => [...prev, { role: 'ai', content: `Ошибка: ${error instanceof Error ? error.message : String(error)}` }]);
    } finally {
      setIsWaitingForAI(false);
      setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  const handleExport = async (id: string, content: string, format: 'txt' | 'pdf') => {
    if (isExporting) return;
    
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const defaultName = `diag_report_${timestamp}`;
      const lastFilename = localStorage.getItem(`last_${format}_name`) || defaultName;
      
      const response = window.prompt(`Назовите файл ${format.toUpperCase()}:`, lastFilename);
      
      if (response === null) return; 
      
      let userFilename = response.trim() || lastFilename;
      localStorage.setItem(`last_${format}_name`, userFilename);

      const finalFilename = userFilename.replace(new RegExp(`\\.${format}$`, 'i'), '') + (format === 'txt' ? '.txt' : '.pdf');
      
      setIsExporting(id);

      if (format === 'txt') {
        const header = `SYSTEM: VOLVO_V4_DIAGNOSTIC_PROTOCOL\n` +
                       `Diagnostic Analysis Report\n` +
                       `FILENAME: ${finalFilename}\n` +
                       `TIMESTAMP: ${new Date().toLocaleString()}\n` +
                       `==========================================\n\n`;
        
        const footer = `\n\n==========================================\n` +
                       `=== END OF DIAGNOSTIC PROTOCOL ===`;
        
        const fullContent = header + content + footer;
        const blob = new Blob([fullContent], { type: 'text/plain;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = finalFilename;
        link.style.display = 'none';
        document.body.appendChild(link);
        
        // Small delay for mobile browsers
        setTimeout(() => {
          link.click();
          setTimeout(() => {
            if (document.body.contains(link)) document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            setIsExporting(null);
          }, 100);
        }, 50);
      } else {
        // PDF logic...
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF();
        
        doc.setFont('courier', 'bold');
        doc.setFontSize(10);
        doc.text("SYSTEM: VOLVO_V4_DIAGNOSTIC", 20, 15);
        
        doc.setFont('times', 'italic');
        doc.setFontSize(22);
        doc.text("Diagnostic Analysis Report", 20, 28);
        
        doc.setDrawColor(200);
        doc.line(20, 35, 190, 35);
        
        doc.setFont('courier', 'normal');
        doc.setFontSize(9);
        doc.text(`FILENAME: ${finalFilename}`, 20, 42);
        doc.text(`TIMESTAMP: ${new Date().toLocaleString()}`, 20, 47);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        
        const cleanContent = content
          .replace(/#{1,6}\s?/g, '')
          .replace(/\*\*/g, '')
          .replace(/\*/g, '')
          .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
          .replace(/`/g, '')
          .replace(/>\s/g, '');

        const lines = doc.splitTextToSize(cleanContent, 170);
        
        let cursorY = 60;
        const pageHeight = doc.internal.pageSize.getHeight();
        
        for (let i = 0; i < lines.length; i++) {
          if (cursorY > pageHeight - 20) {
            doc.addPage();
            cursorY = 20;
          }
          doc.text(lines[i], 20, cursorY);
          cursorY += 6;
        }
        
        doc.save(finalFilename);
        setIsExporting(null);
      }
    } catch (error) {
      console.error("Export error:", error);
      alert("Ошибка при экспорте");
      setIsExporting(null);
    }
  };

  return (
    <div className="min-h-screen bg-paper text-ink font-sans selection:bg-ink selection:text-paper flex flex-col h-screen overflow-hidden">
      {/* Header Section */}
      <header className="border-b border-ink p-6 grid grid-cols-1 md:grid-cols-3 items-center md:items-end shrink-0 gap-4 md:gap-0">
        <div className="hidden md:flex flex-col justify-end h-full">
          <div className="text-[9px] font-mono opacity-30 uppercase">System: Diagnostic_V4</div>
        </div>
        <div className="flex flex-col items-center transition-all">
          <h1 className="text-xs font-mono uppercase tracking-widest opacity-50 mb-1">Протокол диагностики автомобиля</h1>
          <div className="flex flex-col items-center">
            <span className="text-4xl font-serif italic text-ink/90 leading-none">Volvo Version 4</span>
            <span className="text-[10px] font-mono opacity-40 mt-1 uppercase tracking-tighter">
              {data.length > 0 ? "parameter_lexicon_v4.diag" : "ожидание_инициализации.io"}
            </span>
          </div>
        </div>
        <div className="text-right hidden md:block">
          <div className="text-xs font-mono uppercase tracking-widest opacity-50">Кол-во записей</div>
          <div className="text-3xl font-mono tabular-nums">{data.length.toLocaleString()}</div>
        </div>
      </header>

      {/* Mobile Tab Navigation */}
      {data.length > 0 && (
        <div className="lg:hidden border-b border-ink flex bg-[#D8D7D4]/30 p-1 shrink-0 overflow-x-auto no-scrollbar">
          {[
            { id: 'table', icon: Filter, label: 'Данные' },
            { id: 'analysis', icon: BarChart3, label: 'Статистика' },
            { id: 'storage', icon: Database, label: 'БАЗА' },
            { id: 'ai', icon: Terminal, label: 'Чат ИИ' },
            { id: 'compare', icon: GitCompare, label: 'Сравнение' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex-none flex items-center justify-center gap-2 px-4 py-3 text-[10px] font-mono uppercase transition-all",
                activeTab === tab.id ? "bg-ink text-paper" : "text-ink/60"
              )}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Main Content Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Controls */}
        <aside className="w-72 border-r border-ink p-6 hidden lg:flex flex-col gap-8 shrink-0 bg-paper">
          <section>
            <h3 className="text-[11px] font-serif italic uppercase opacity-50 mb-4">Управление диагностикой</h3>
            {!data.length ? (
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full border border-ink px-3 py-4 text-xs font-mono uppercase hover:bg-ink hover:text-paper transition-all flex items-center justify-center gap-2 group"
              >
                <FileUp className="w-4 h-4 group-hover:scale-110 transition-transform" />
                Загрузить CSV
              </button>
            ) : (
              <div className="space-y-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs font-mono uppercase">
                    <span>Парсер</span>
                    <span className="bg-ink text-paper px-2 py-0.5 text-[10px]">АКТИВЕН</span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-mono uppercase">
                    <span>Статус</span>
                    <span className="font-semibold">LOCAL_THREAD</span>
                  </div>
                </div>

                <div className="pt-2 hidden lg:block">
                  <button 
                    onClick={() => setCurrentView("applied_upload")}
                    className={cn(
                      "w-full border border-ink/40 px-3 py-2 text-[10px] font-mono uppercase transition-all flex items-center justify-between",
                      appliedCodes ? "bg-green-50 text-black border-green-600/30" : "bg-white/50 text-ink/60"
                    )}
                  >
                    <span>{appliedCodes ? `ПРОФИЛЬ: ${appliedCodes.size} КОДОВ` : "ЗАГРУЗИТЬ ACTIVE КОДЫ"}</span>
                    <Settings2 className="w-3 h-3" />
                  </button>
                </div>
                
                <div className="space-y-2 pt-4">
                    {[
                      { id: 'table', icon: Filter, label: 'Реестр данных' },
                      { id: 'analysis', icon: BarChart3, label: 'Аналитика' },
                      { id: 'storage', icon: Database, label: 'БАЗА (Память)' },
                      { id: 'ai', icon: Terminal, label: 'Чат с ИИ' },
                      { id: 'compare', icon: GitCompare, label: 'Сравнение ИИ' }
                    ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={cn(
                        "w-full border border-ink text-left px-3 py-2 text-xs font-mono uppercase transition-colors flex items-center gap-3",
                        activeTab === tab.id ? "bg-ink text-paper" : "hover:bg-ink/5"
                      )}
                    >
                      <tab.icon className="w-3.5 h-3.5" />
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {summary && activeTab === 'table' && (
            <section>
              <h3 className="text-[11px] font-serif italic uppercase opacity-50 mb-4">Краткий обзор</h3>
              <div className="space-y-2">
                <div className="border border-ink/20 p-3 bg-white/30">
                  <span className="text-[10px] font-mono uppercase block opacity-50">Управляемые</span>
                  <span className="text-xl font-mono">{summary.controllableCount}</span>
                </div>
                <div className="border border-ink/20 p-3 bg-white/30">
                  <span className="text-[10px] font-mono uppercase block opacity-50">Уникальных типов</span>
                  <span className="text-xl font-mono">{Object.keys(summary.types).length}</span>
                </div>
              </div>
            </section>
          )}

          <div className="mt-auto">
            <div className="bg-ink text-paper p-4">
              <div className="text-[10px] font-mono uppercase tracking-tighter mb-2 opacity-60">Состояние ИИ-ассистента</div>
              <p className="text-[11px] font-serif italic leading-tight opacity-80">
                {data.length > 0 ? "Данные обработаны. Консультант готов к анализу." : "Ожидание данных для извлечения паттернов."}
              </p>
            </div>
          </div>
        </aside>

        {/* Dynamic Content Area */}
        <main className="flex-1 flex flex-col overflow-hidden bg-white/40 relative">
          <AnimatePresence mode="wait">
            {currentView === 'applied_upload' ? (
              <motion.div 
                key="applied_upload"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-paper/95 backdrop-blur-md z-50 absolute inset-0"
              >
                <button 
                  onClick={() => setCurrentView('main')}
                  className="absolute top-16 left-8 flex items-center gap-2 text-[10px] font-mono uppercase opacity-50 hover:opacity-100 transition-all border border-ink/20 px-3 py-1.5"
                >
                  <ChevronDown className="w-3 h-3 rotate-90" />
                  Назад
                </button>

                <div className="w-20 h-20 border border-ink/20 flex items-center justify-center mb-8 bg-white/50">
                  <Download className="w-10 h-10 opacity-30" />
                </div>
                <h2 className="text-3xl font-serif italic mb-4">Загрузка примененных параметров</h2>
                <p className="text-ink/60 font-mono text-xs max-w-md mb-12 leading-relaxed">
                  Загрузите текстовый файл (.txt) со списком кодов, которые реально используются в машине. 
                  Коды должны быть разделены запятыми (напр. p1aaa, p1aab). 
                  Это позволит отфильтровать общую базу (~33k) до конкретно этого автомобиля (~9k).
                </p>

                <div className="flex flex-col gap-4 w-full max-w-sm">
                  <button 
                    onClick={() => appliedFileInputRef.current?.click()}
                    className="w-full border border-ink px-12 py-4 font-mono uppercase text-xs hover:bg-ink hover:text-paper transition-all tracking-widest"
                  >
                    ВЫБРАТЬ СПИСОК ПАРАМЕТРОВ
                  </button>
                  <button 
                    onClick={handleExportConfig}
                    className="w-full border border-ink/20 px-12 py-4 font-mono uppercase text-[10px] hover:bg-ink/5 transition-all tracking-widest opacity-60 hover:opacity-100"
                  >
                    ЭКСПОРТ КОНФИГУРАЦИИ
                  </button>
                  {appliedCodes && (
                    <button 
                      onClick={() => { setAppliedCodes(null); setShowAppliedOnly(false); setCurrentView('main'); }}
                      className="text-[10px] font-mono uppercase opacity-40 hover:opacity-100 underline decoration-dotted underline-offset-4"
                    >
                      Сбросить текущий список ({appliedCodes.size} шт)
                    </button>
                  )}
                </div>
              </motion.div>
            ) : (isProcessing || isDbLoading) ? (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex-1 flex flex-col items-center justify-center p-12 text-center"
              >
                <div className="w-12 h-12 border-2 border-ink border-t-transparent rounded-full animate-spin mb-6" />
                <h2 className="text-xl font-serif italic mb-2 tracking-tight">
                  {isDbLoading ? "Проверка локального хранилища..." : "Обработка потока данных протокола..."}
                </h2>
                <p className="text-ink/40 font-mono text-[10px] uppercase">Буфер данных</p>
              </motion.div>
            ) : !data.length ? (
              <motion.div 
                key="empty"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex-1 flex flex-col items-center justify-center p-12 text-center"
              >
                <div className="w-20 h-20 border border-ink/20 flex items-center justify-center mb-8 rotate-3">
                  <CarFront className="w-10 h-10 opacity-20" />
                </div>
                <h2 className="text-3xl font-serif italic mb-4">Метаданные диагностики не загружены</h2>
                <p className="text-ink/60 font-mono text-xs max-w-sm mb-8 leading-relaxed">
                  Система ожидает файл .csv в соответствии со спецификациями телеметрии Volvo версии 4.
                </p>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="border border-ink px-12 py-4 font-mono uppercase text-xs hover:bg-ink hover:text-paper transition-all tracking-widest"
                >
                  Выбрать файл
                </button>
              </motion.div>
            ) : (
              <motion.div 
                key="content"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex-1 flex flex-col overflow-hidden"
              >
                {/* Tab Content: Interaction Layouts */}
                {activeTab === 'storage' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex-1 overflow-auto p-6 md:p-12"
                  >
                    <div className="max-w-2xl mx-auto space-y-12">
                      <div className="text-center space-y-4">
                        <div className="w-20 h-20 border border-ink mx-auto flex items-center justify-center bg-white/50 mb-6 group">
                          <Database className={cn("w-10 h-10 transition-all", dbStatus.count > 0 ? "text-green-600" : "opacity-20")} />
                        </div>
                        <h2 className="text-4xl font-serif italic">Локальная База Данных</h2>
                        <p className="font-mono text-xs opacity-50 uppercase tracking-widest">IndexedDB Storage System</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="border border-ink p-6 bg-white/50 space-y-4">
                          <div className="flex items-center gap-3 mb-2">
                            <HardDrive className="w-5 h-5 opacity-40" />
                            <h3 className="font-mono text-xs uppercase font-bold">Статус Хранилища</h3>
                          </div>
                          <div className="space-y-3">
                            <div className="flex justify-between border-b border-ink/10 pb-2">
                              <span className="font-mono text-[10px] opacity-50 uppercase">Записей</span>
                              <span className="font-mono text-xs">{dbStatus.count.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between border-b border-ink/10 pb-2">
                              <span className="font-mono text-[10px] opacity-50 uppercase">Обновлено</span>
                              <span className="font-mono text-xs">{dbStatus.date || "Никогда"}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="font-mono text-[10px] opacity-50 uppercase">Тип памяти</span>
                              <span className="font-mono text-[10px] bg-ink text-paper px-2">PERSISTENT</span>
                            </div>
                          </div>
                        </div>

                        <div className="border border-ink p-6 bg-white/50 flex flex-col justify-between">
                          <div className="space-y-4">
                            <h3 className="font-mono text-xs uppercase font-bold flex items-center gap-2">
                              <Info className="w-4 h-4 opacity-40" />
                              Зачем это нужно?
                            </h3>
                            <p className="text-[11px] font-serif leading-relaxed italic opacity-70">
                              Загрузив CSV один раз в "БАЗУ", вы сохраняете его в памяти телефона или компьютера. 
                              При следующем открытии сайта приложение мгновенно подгрузит эти данные. Вам не придется 
                              снова выбирать файл справочника.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-6 pt-8">
                        <div className="bg-ink text-paper p-8 space-y-6">
                          <h3 className="font-mono text-sm uppercase tracking-wider text-center">Действия с базой</h3>
                          <div className="flex flex-col sm:flex-row gap-4">
                            <button 
                              onClick={() => dbFileInputRef.current?.click()}
                              className="flex-1 bg-paper text-ink px-6 py-4 font-mono text-xs uppercase hover:bg-white transition-all flex items-center justify-center gap-3 font-bold"
                            >
                              <FileUp className="w-4 h-4" />
                              Загрузить и сохранить
                            </button>
                            {dbStatus.count > 0 && (
                              <button 
                                onClick={handleClearStorage}
                                className="flex-1 border border-paper/30 text-paper px-6 py-4 font-mono text-xs uppercase hover:bg-paper/10 transition-all flex items-center justify-center gap-3"
                              >
                                <Trash2 className="w-4 h-4" />
                                Очистить память
                              </button>
                            )}
                          </div>
                          <p className="text-[9px] font-mono opacity-40 text-center uppercase">
                            Доступно на Android, iOS и десктопных браузерах
                          </p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'table' && (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-ink flex flex-col gap-4 bg-paper-dark/30">
                      <div className="flex flex-col md:flex-row gap-4 items-center">
                        <div className="relative flex-1 group w-full">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-30" />
                          <input 
                            type="text"
                            placeholder="ПОИСК ПАРАМЕТРОВ ИЛИ ОПИСАНИЙ..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-paper border border-ink/20 py-2 pl-10 pr-4 text-xs font-mono focus:border-ink outline-none transition-all placeholder:opacity-30"
                          />
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-[10px] font-mono opacity-50 px-3 py-1 border border-ink/10 whitespace-nowrap">
                            {filteredData.length.toLocaleString()} ЗАПИСЕЙ
                          </div>
                          <button 
                            onClick={() => setHideLogging(!hideLogging)}
                            className={cn(
                              "px-3 py-1 border border-ink/40 text-[9px] font-mono uppercase hover:bg-ink hover:text-paper transition-all flex items-center gap-2 whitespace-nowrap",
                              hideLogging ? "bg-amber-100 text-amber-900 border-amber-600/30" : "bg-white/50"
                            )}
                            title="Скрыть параметры логов, счетчиков и истории"
                          >
                            <Terminal className="w-3 h-3" />
                            {hideLogging ? `Логи: Скрыты (${stats.profile1.loggingInApplied})` : `Скрыть Логи (${stats.profile1.loggingInApplied})`}
                          </button>
                          <button 
                            onClick={() => setCurrentView('applied_upload')}
                            className={cn(
                              "px-3 py-1 border border-ink/40 text-[9px] font-mono uppercase hover:bg-ink hover:text-paper transition-all flex items-center gap-2 whitespace-nowrap",
                              appliedCodes ? "bg-green-100 text-green-900 border-green-600/30" : "bg-white/50"
                            )}
                          >
                            <Settings2 className="w-3 h-3" />
                            {appliedCodes ? `ПРОФИЛЬ (${stats.profile1.appliedTotal})` : "Загрузить Профиль"}
                          </button>
                        </div>
                      </div>

                      {appliedCodes && (
                        <div className="flex items-center justify-between border-t border-ink/5 pt-3">
                          <label className="flex items-center gap-3 cursor-pointer select-none">
                            <div className="relative inline-flex items-center">
                              <input 
                                type="checkbox" 
                                checked={showAppliedOnly}
                                onChange={(e) => setShowAppliedOnly(e.target.checked)}
                                className="sr-only peer"
                              />
                              <div className="w-8 h-4 bg-ink/10 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-ink"></div>
                            </div>
                            <span className="text-[9px] font-mono uppercase font-bold text-ink/70">Показывать только примененные на этой машине</span>
                          </label>
                          {showAppliedOnly && (
                            <span className="text-[9px] font-mono font-bold text-green-700 animate-pulse">
                              ФИЛЬТР АКТИВЕН
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="grid lg:grid-cols-[100px_1.5fr_1fr_2fr_80px] grid-cols-[1fr_auto] border-b border-ink bg-white/50 text-[10px] font-serif italic uppercase opacity-50">
                      <div className="p-4 cursor-pointer hover:text-ink transition-colors flex items-center gap-2" onClick={() => handleSort('ParameterCode')}>
                        Код {sortConfig?.key === 'ParameterCode' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </div>
                      <div className="p-4 cursor-pointer hover:text-ink transition-colors hidden lg:block" onClick={() => handleSort('DefaultCaption')}>Название</div>
                      <div className="p-4 hidden lg:block">Тип данных</div>
                      <div className="p-4 hidden lg:block">Описание</div>
                      <div className="p-4 lg:text-center text-right">Доступ</div>
                    </div>

                    <div className="flex-1 overflow-y-auto font-mono text-[11px] bg-white/20">
                      {filteredData.slice(0, 100).map((row, idx) => (
                        <div 
                          key={idx} 
                          onClick={() => setSelectedParam(row)}
                          className="flex flex-col lg:grid lg:grid-cols-[100px_1.5fr_1fr_2fr_80px] border-b border-ink/10 hover:bg-ink hover:text-paper transition-colors group p-4 lg:p-0 cursor-pointer"
                        >
                          <div className="flex justify-between items-start lg:contents">
                            <div className="lg:p-4 font-bold border-r border-ink/5 group-hover:border-paper/10 lg:bg-transparent bg-ink/5 lg:text-ink group-hover:text-paper px-2 py-1 rounded lg:rounded-none">
                              {row.ParameterCode}
                            </div>
                            <div className="lg:p-4 border-r border-ink/5 group-hover:border-paper/10 font-bold lg:font-semibold lg:truncate">
                              {row.DefaultCaption}
                            </div>
                            <div className="lg:p-4 border-r border-ink/5 group-hover:border-paper/10 opacity-60 group-hover:opacity-100 text-[10px] lg:contents hidden lg:block">
                              {row.parsedType}
                            </div>
                            <div className="lg:p-4 border-r border-ink/5 group-hover:border-paper/10 font-serif italic opacity-70 group-hover:opacity-100 lg:contents hidden lg:block">
                              {row.DefaultDescription}
                            </div>
                            <div className="lg:p-4 font-bold text-right lg:text-center shrink-0">
                              {row.AccessMode}
                            </div>
                          </div>

                          <div className="lg:hidden mt-3 flex flex-col gap-2 pt-3 border-t border-ink/5 group-hover:border-paper/10">
                            <div className="flex justify-between text-[10px]">
                              <span className="opacity-50 uppercase">Тип:</span>
                              <span className="font-bold">{row.parsedType}</span>
                            </div>
                            <div className="flex justify-between text-[10px]">
                              <span className="opacity-50 uppercase">Управление:</span>
                              <span className={cn("font-bold", row.Controllable?.toLowerCase() === 'true' ? "text-green-600 group-hover:text-green-400" : "opacity-40")}>
                                {row.Controllable}
                              </span>
                            </div>
                            <p className="text-[10px] font-serif italic mt-1 leading-tight opacity-60 group-hover:opacity-90">
                              {row.DefaultDescription}
                            </p>
                          </div>
                        </div>
                      ))}
                      {filteredData.length > 100 && (
                        <div className="p-8 text-center text-[10px] font-mono opacity-30 uppercase">
                          Показаны первые 100 результатов для быстродействия
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'analysis' && summary && (
                  <div className="p-8 overflow-y-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      <div className="p-6 border border-ink bg-paper shadow-[4px_4px_0px_0px_#141414]">
                        <h4 className="text-[10px] font-mono uppercase opacity-50 mb-2">Общий реестр</h4>
                        <div className="text-4xl font-mono">{summary.totalParameters.toLocaleString()}</div>
                      </div>
                      <div className="p-6 border border-ink bg-paper shadow-[4px_4px_0px_0px_#141414]">
                        <h4 className="text-[10px] font-mono uppercase opacity-50 mb-2">Изменяемые</h4>
                        <div className="text-4xl font-mono">{summary.controllableCount.toLocaleString()}</div>
                      </div>
                      <div className="p-6 border border-ink bg-paper shadow-[4px_4px_0px_0px_#141414]">
                        <h4 className="text-[10px] font-mono uppercase opacity-50 mb-2">Уровень сложности</h4>
                        <div className="text-4xl font-mono italic font-serif">V4_EXTENDED</div>
                      </div>
                      
                      <div className="md:col-span-2 p-6 border border-ink bg-white/20">
                        <h4 className="text-[10px] font-mono uppercase opacity-50 mb-6 font-bold">Архитектура распределения типов</h4>
                        <div className="space-y-4">
                          {Object.entries(summary.types).map(([type, count]) => (
                            <div key={type} className="flex items-center gap-4">
                              <span className="w-24 text-[10px] font-mono uppercase truncate">{type}</span>
                              <div className="flex-1 h-3 bg-paper-dark border border-ink/10 relative">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${((count as number) / summary.totalParameters) * 100}%` }}
                                  className="absolute inset-0 bg-ink"
                                />
                              </div>
                              <span className="w-12 text-right text-[10px] font-mono">{count}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="p-6 border border-ink bg-white/20">
                        <h4 className="text-[10px] font-mono uppercase opacity-50 mb-6 font-bold">Права доступа</h4>
                        <div className="space-y-4 font-mono text-[10px]">
                          {Object.entries(summary.audienceStats).map(([aud, count]) => (
                            <div key={aud} className="flex justify-between border-b border-ink/10 pb-2">
                              <span>{aud || "НЕ ОПРЕДЕЛЕНО"}</span>
                              <span className="font-bold">{count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'ai' && (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Chat Header for Controls */}
                    <div className="px-4 md:px-8 py-3 border-b border-ink/10 flex items-center justify-between bg-white/30 backdrop-blur-sm shrink-0">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Terminal className="w-3 h-3 text-ink/70" />
                          <span className="text-[10px] font-mono uppercase font-bold tracking-widest">Диагностическая сессия</span>
                        </div>
                        {appliedCodes && (
                          <div className="h-4 w-[1px] bg-ink/10 hidden sm:block" />
                        )}
                        {appliedCodes && (
                          <div className="items-center gap-2 hidden sm:flex">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            <span className="text-[9px] font-mono uppercase text-ink/60">Профиль активен: {stats.profile1.cleanApplied} {hideLogging && "(анализ без логов)"}</span>
                          </div>
                        )}
                      </div>
                      
                      <button 
                        onClick={() => setHideLogging(!hideLogging)}
                        className={cn(
                          "px-3 py-1.5 border text-[9px] font-mono uppercase transition-all flex items-center gap-3",
                          hideLogging 
                            ? "bg-amber-100/50 text-amber-900 border-amber-600/30 hover:bg-amber-100" 
                            : "bg-white/50 border-ink/20 text-ink/60 hover:bg-white hover:border-ink/40"
                        )}
                      >
                        <div className={cn("w-2 h-2 rounded-full", hideLogging ? "bg-amber-500" : "bg-ink/10")} />
                        {hideLogging ? `Логи: Скрыты (${stats.profile1.loggingInApplied})` : `Скрывать логи (${stats.profile1.loggingInApplied})`}
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
                      <div className="max-w-2xl mx-auto space-y-6">
                        {messages.length === 0 && (
                          <div className="text-center py-12">
                            <div className="w-16 h-16 border border-ink/20 flex items-center justify-center mx-auto mb-6 rotate-6">
                              <Terminal className="w-8 h-8 opacity-20" />
                            </div>
                            <h2 className="text-2xl font-serif italic mb-2">ИИ-консультант по диагностике</h2>
                            <p className="text-xs font-mono opacity-50 uppercase max-w-sm mx-auto text-balance">
                              Задавайте вопросы о функциях Volvo V4. Я проанализирую {appliedCodes ? `все ${stats.profile1.cleanApplied} примененных параметров` : `всю базу из ${data.length.toLocaleString()} параметров`}.
                            </p>
                            <div className="mt-8 flex flex-wrap justify-center gap-2">
                              {["Фонари заднего хода?", "Смещение крутящего момента?", "Параметры безопасности?", "Таймауты блокировок?"].map(hint => (
                                <button 
                                  key={hint}
                                  onClick={() => setUserInput(hint)}
                                  className="px-3 py-1.5 border border-ink/10 text-[10px] font-mono uppercase hover:bg-ink hover:text-paper transition-all"
                                >
                                  {hint}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {messages.map((msg, i) => (
                          <motion.div 
                            key={i}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={cn(
                              "p-4 border relative group",
                              msg.role === 'user' ? "bg-white border-ink/20 ml-8" : "bg-ink text-paper border-ink mr-8 shadow-[4px_4px_0px_0px_rgba(20,20,20,0.1)]"
                            )}
                            id={msg.role === 'ai' ? `msg-${i}` : undefined}
                          >
                            <div className={cn("text-[10px] font-mono uppercase opacity-50 mb-2 font-bold", msg.role === 'ai' && "text-paper/60")}>
                               {msg.role === 'user' ? "ВВОД_КОМАНДЫ" : "ДИАГНОСТИЧЕСКИЙ_АНАЛИЗ"}
                            </div>
                            <div className={cn("text-xs leading-relaxed", msg.role === 'user' ? "font-serif italic" : "font-sans")}>
                              {msg.role === 'ai' ? (
                                <div className="markdown-body prose prose-invert prose-xs max-w-none">
                                  <Markdown>{msg.content}</Markdown>
                                </div>
                              ) : (
                                msg.content
                              )}
                            </div>
                            {msg.role === 'ai' && (
                              <div className="mt-4 flex flex-wrap gap-2">
                                <button 
                                  onClick={() => handleExport(`msg-txt-${i}`, msg.content, 'txt')}
                                  className={cn(
                                    "flex items-center gap-1.5 text-paper/70 hover:text-paper text-[10px] font-mono uppercase tracking-widest border border-paper/20 hover:border-paper/60 px-3 py-1.5 transition-all bg-paper/5 hover:bg-paper/10",
                                    isExporting === `msg-txt-${i}` && "animate-pulse border-paper/60 text-paper bg-paper/20"
                                  )}
                                >
                                  {isExporting === `msg-txt-${i}` ? "..." : "Сохранить TXT"}
                                </button>
                                <button 
                                  onClick={() => handleExport(`msg-pdf-${i}`, msg.content, 'pdf')}
                                  className={cn(
                                    "flex items-center gap-1.5 text-paper/70 hover:text-paper text-[10px] font-mono uppercase tracking-widest border border-paper/20 hover:border-paper/60 px-3 py-1.5 transition-all bg-paper/5 hover:bg-paper/10",
                                    isExporting === `msg-pdf-${i}` && "animate-pulse border-paper/60 text-paper bg-paper/20"
                                  )}
                                >
                                  {isExporting === `msg-pdf-${i}` ? "..." : "Сохранить PDF"}
                                </button>
                                <button 
                                  onClick={() => {
                                    copyToClipboard(msg.content);
                                    alert("Текст скопирован!");
                                  }}
                                  className="flex items-center gap-1.5 text-paper/70 hover:text-paper text-[10px] font-mono uppercase tracking-widest border border-paper/20 hover:border-paper/60 px-3 py-1.5 transition-all bg-paper/5 hover:bg-paper/10"
                                >
                                  Копировать
                                </button>
                              </div>
                            )}
                          </motion.div>
                        ))}
                        {isWaitingForAI && (
                          <div className="p-4 bg-ink/5 text-ink border border-ink/10 mr-8 animate-pulse italic text-xs font-serif flex items-center gap-3">
                            <div className="w-2 h-2 bg-ink rounded-full animate-bounce" />
                            Анализ соответствующих маркеров диагностики...
                          </div>
                        )}
                        <div ref={scrollRef} />
                      </div>
                    </div>

                    <div className={cn(
                      "p-3 sm:p-4 border-t border-ink bg-paper shrink-0 transition-all duration-300",
                      isInputFocused ? "fixed inset-x-0 bottom-0 z-50 h-[40vh] sm:h-auto sm:relative shadow-[0_-10px_30px_rgba(0,0,0,0.2)]" : "relative h-auto shadow-none"
                    )}>
                      {isInputFocused && (
                        <button 
                          type="button"
                          onClick={() => setIsInputFocused(false)}
                          className="sm:hidden w-full py-1 text-[10px] font-mono text-ink/30 uppercase flex justify-center items-center gap-1 mb-2"
                        >
                          <X className="w-3 h-3" /> Закрыть клавиатуру
                        </button>
                      )}
                      <form 
                        onSubmit={handleAskAI} 
                        className={cn(
                          "max-w-2xl mx-auto flex flex-col sm:flex-row gap-2 transition-all",
                          isInputFocused ? "h-[calc(100%-24px)] sm:h-auto" : "h-auto"
                        )}
                      >
                        <div className="flex-1 relative flex flex-col">
                          <textarea 
                            value={userInput}
                            onChange={(e) => setUserInput(e.target.value)}
                            onFocus={() => setIsInputFocused(true)}
                            onBlur={() => {
                              // Small delay to allow button clicks
                              setTimeout(() => {
                                if (document.activeElement.tagName !== 'TEXTAREA') {
                                  // Don't blur immediately to keep UI stable on button clicks
                                }
                              }, 100);
                            }}
                            placeholder="ОПИШИТЕ ЗАДАЧУ ИЛИ ЗАДАЙТЕ ВОПРОС..."
                            className={cn(
                              "w-full bg-white/50 border border-ink px-4 py-3 text-sm font-sans focus:bg-white focus:outline-none transition-all placeholder:opacity-30 resize-none",
                              isInputFocused ? "flex-1 h-full" : "h-[44px]"
                            )}
                          />
                        </div>
                        <div className={cn(
                          "flex gap-2 transition-all",
                          isInputFocused ? "mt-2 sm:mt-0" : ""
                        )}>
                          <button 
                            type="submit"
                            disabled={isWaitingForAI || !userInput.trim()}
                            className="flex-1 sm:flex-none bg-ink text-paper px-6 py-3 font-mono text-[11px] uppercase hover:opacity-90 active:bg-black active:scale-95 disabled:opacity-30 transition-all font-bold flex items-center justify-center gap-2"
                          >
                            {isWaitingForAI ? "ЖДИТЕ" : "ЗАПРОС"}
                            {!isWaitingForAI && <Terminal className="w-3 h-3" />}
                          </button>
                          <button 
                            type="button"
                            onClick={handleDeepAnalysis}
                            disabled={isWaitingForAI || !userInput.trim() || !appliedCodes}
                            className="flex-1 sm:flex-none bg-amber-100 text-amber-900 border border-amber-300 px-4 py-3 font-mono text-[11px] uppercase hover:bg-amber-200 active:bg-amber-300 active:scale-95 disabled:opacity-30 transition-all font-bold flex items-center justify-center gap-2 group"
                            title="Глубокий анализ всего профиля"
                          >
                            <Sparkles className="w-4 h-4 text-amber-600 group-hover:scale-110 transition-transform" />
                            <span>ГЛУБОКИЙ</span>
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}

                {activeTab === 'compare' && (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Header with status */}
                    <div className="px-4 py-3 border-b border-ink/10 bg-white/30 backdrop-blur-sm shrink-0 flex flex-wrap gap-4 items-center justify-between">
                      <div className="flex gap-4">
                        <div className={cn(
                          "px-3 py-1.5 border text-[10px] font-mono flex items-center gap-2",
                          appliedCodes ? "bg-green-50 border-green-200 text-green-900" : "bg-white border-ink/10 opacity-50"
                        )}>
                          <div className={cn("w-1.5 h-1.5 rounded-full", appliedCodes ? "bg-green-500" : "bg-ink/20")} />
                          ПРОФИЛЬ 1: {appliedCodes ? `${stats.profile1.cleanApplied} пар.` : "НЕТ"}
                        </div>
                        <div className="flex items-center text-ink/20">
                          <ArrowRightLeft className="w-3 h-3" />
                        </div>
                        <div className={cn(
                          "px-3 py-1.5 border text-[10px] font-mono flex items-center gap-2",
                          appliedCodes2 ? "bg-blue-50 border-blue-200 text-blue-900" : "bg-white border-ink/10 animate-pulse border-dashed"
                        )}>
                          <div className={cn("w-1.5 h-1.5 rounded-full", appliedCodes2 ? "bg-blue-500" : "bg-ink/20")} />
                          ПРОФИЛЬ 2: {appliedCodes2 ? `${stats.profile2.cleanApplied} пар.` : "ВЫБЕРИТЕ ФАЙЛ"}
                          <button 
                            onClick={() => appliedFileInputRef2.current?.click()}
                            className="ml-2 hover:bg-blue-100 p-1 rounded transition-colors"
                          >
                            <UploadCloud className="w-3 h-3" />
                          </button>
                          <input 
                            type="file"
                            ref={appliedFileInputRef2}
                            onChange={handleAppliedFileUpload2}
                            className="hidden"
                          />
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button 
                          onClick={() => setHideLogging2(!hideLogging2)}
                          className={cn(
                            "px-2 py-1 border text-[9px] font-mono uppercase transition-all",
                            hideLogging2 ? "bg-amber-100 border-amber-300 text-amber-900" : "bg-white border-ink/10 text-ink/40"
                          )}
                        >
                          Логи П2: {hideLogging2 ? "Скрыты" : "Показ"}
                        </button>
                      </div>
                    </div>

                    {!appliedCodes || !appliedCodes2 ? (
                      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6 bg-paper/50">
                        <div className="w-20 h-20 border border-ink/10 flex items-center justify-center rotate-3 bg-white shadow-sm">
                          <GitCompare className="w-10 h-10 opacity-20" />
                        </div>
                        <div className="space-y-2">
                          <h3 className="text-xl font-serif italic">Для сравнения нужно два профиля</h3>
                          <p className="text-xs font-mono text-ink/50 uppercase max-w-xs mx-auto">
                            {!appliedCodes ? "Загрузите основной профиль в разделе 'Данные'" : "Загрузите второй файл для сравнения"}
                          </p>
                        </div>
                        {!appliedCodes ? (
                           <button 
                             onClick={() => setActiveTab('table')}
                             className="px-6 py-3 bg-ink text-paper font-mono text-xs uppercase hover:opacity-90 transition-all font-bold"
                           >
                             Перейти к П1
                           </button>
                        ) : (
                          <button 
                            onClick={() => appliedFileInputRef2.current?.click()}
                            className="px-8 py-4 bg-blue-950 text-white font-mono text-xs uppercase hover:bg-black transition-all flex items-center gap-3 font-bold shadow-xl shadow-blue-900/10"
                          >
                            <UploadCloud className="w-4 h-4" />
                            Загрузить Profile 2
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8">
                          <div className="max-w-3xl mx-auto space-y-8">
                             {compareMessages.length === 0 && (
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="p-6 bg-white border border-ink/10 space-y-4">
                                    <h4 className="text-[10px] font-mono uppercase font-bold tracking-widest text-ink/40 italic">Баланс параметров</h4>
                                    <div className="flex items-end gap-3 h-20">
                                       <div className="flex-1 bg-ink/5 relative h-full flex items-end">
                                         <div className="w-full bg-ink/40 transition-all duration-700" style={{ height: `${(stats.profile1.cleanApplied / Math.max(stats.profile1.cleanApplied, stats.profile2.cleanApplied, 1)) * 100}%` }} />
                                         <span className="absolute -top-5 left-0 text-[10px] font-mono font-bold">П1: {stats.profile1.cleanApplied}</span>
                                       </div>
                                       <div className="flex-1 bg-blue-900/5 relative h-full flex items-end">
                                         <div className="w-full bg-blue-950 transition-all duration-700" style={{ height: `${(stats.profile2.cleanApplied / Math.max(stats.profile1.cleanApplied, stats.profile2.cleanApplied, 1)) * 100}%` }} />
                                         <span className="absolute -top-5 left-0 text-[10px] font-mono font-bold text-blue-900">П2: {stats.profile2.cleanApplied}</span>
                                       </div>
                                    </div>
                                  </div>
                                  <div className="p-6 bg-white border border-ink/10 flex flex-col justify-center gap-2">
                                    <p className="text-[10px] font-mono uppercase text-ink/40 font-bold italic">Сводка данных</p>
                                    <p className="text-[13px] font-serif italic text-balance leading-relaxed">
                                      {stats.profile1.cleanApplied === stats.profile2.cleanApplied 
                                        ? "Профили идентичны по количеству параметров. Вероятно, версии ПО совпадают. Спросите ИИ о скрытых отличиях."
                                        : `Обнаружена разница в ${Math.abs(stats.profile1.cleanApplied - stats.profile2.cleanApplied)} пар. Это может указывать на разную комплектацию или уровень прошивки.`}
                                    </p>
                                  </div>
                               </div>
                             )}

                             {compareMessages.map((msg, i) => (
                               <motion.div 
                                 key={i}
                                 initial={{ opacity: 0, y: 10 }}
                                 animate={{ opacity: 1, y: 0 }}
                                 className={cn(
                                   "p-6 border relative",
                                   msg.role === 'user' ? "bg-white border-ink/20 ml-12 shadow-sm" : "bg-[#fcfdfe] border-blue-950/20 mr-12 shadow-md"
                                 )}
                               >
                                 <div className="flex items-center gap-2 mb-4 border-b border-ink/5 pb-2">
                                   {msg.role === 'user' ? <Terminal className="w-3 h-3 opacity-30" /> : <GitCompare className="w-3 h-3 text-blue-900" />}
                                   <span className="text-[9px] font-mono uppercase tracking-widest opacity-40 font-bold">
                                     {msg.role === 'user' ? "Comparison Goal" : "AI Structural Analysis"}
                                   </span>
                                 </div>
                                 <div className="markdown-body prose prose-xs max-w-none prose-p:leading-relaxed">
                                   <Markdown>{msg.content}</Markdown>
                                 </div>
                               </motion.div>
                             ))}

                             {isWaitingForAI && (
                               <div className="flex items-center gap-4 p-8 bg-blue-50/50 text-blue-950 mr-12 border border-blue-200 border-dashed">
                                 <div className="flex gap-1 animate-pulse">
                                   <div className="w-1.5 h-1.5 bg-blue-950 rounded-full" />
                                   <div className="w-1.5 h-1.5 bg-blue-950 rounded-full [animation-delay:0.2s]" />
                                   <div className="w-1.5 h-1.5 bg-blue-950 rounded-full [animation-delay:0.4s]" />
                                 </div>
                                 <p className="text-xs font-mono font-bold uppercase tracking-wider">Генерация дифференциального отчета...</p>
                               </div>
                             )}
                             <div ref={scrollRef} />
                          </div>
                        </div>

                        <div className={cn(
                          "p-4 bg-white border-t border-ink shrink-0 transition-all duration-300",
                          isInputFocused ? "fixed inset-x-0 bottom-0 z-50 h-[40vh] sm:h-auto sm:relative shadow-[0_-10px_30px_rgba(0,0,0,0.2)]" : "relative h-auto shadow-none"
                        )}>
                          {isInputFocused && (
                            <button 
                              type="button"
                              onClick={() => setIsInputFocused(false)}
                              className="sm:hidden w-full py-1 text-[10px] font-mono text-ink/30 uppercase flex justify-center items-center gap-1 mb-2"
                            >
                              <X className="w-3 h-3" /> Закрыть клавиатуру
                            </button>
                          )}
                          <form 
                            onSubmit={handleAskCompare} 
                            className={cn(
                              "max-w-3xl mx-auto flex flex-col sm:flex-row gap-3 transition-all",
                              isInputFocused ? "h-[calc(100%-24px)] sm:h-auto" : "h-auto"
                            )}
                          >
                             <div className="flex-1 relative flex flex-col">
                               <textarea 
                                 value={userInput}
                                 onChange={(e) => setUserInput(e.target.value)}
                                 onFocus={() => setIsInputFocused(true)}
                                 placeholder="КРАТКИЙ ЗАПРОС НА СРАВНЕНИЕ (НАПР: ЧЕМ ОТЛИЧАЕТСЯ АКПП?...)"
                                 className={cn(
                                   "w-full bg-white border border-ink/10 px-5 py-4 text-[13px] font-sans italic focus:bg-white focus:border-blue-900/30 focus:outline-none transition-all placeholder:opacity-30 resize-none",
                                   isInputFocused ? "flex-1 h-full" : "h-[44px]"
                                 )}
                               />
                             </div>
                             <div className={cn(
                               "flex gap-2 transition-all",
                               isInputFocused ? "mt-2 sm:mt-0" : ""
                             )}>
                               <button 
                                 type="submit"
                                 disabled={isWaitingForAI || !userInput.trim()}
                                 className="flex-1 sm:flex-none bg-blue-950 text-white px-10 py-4 font-mono text-[11px] uppercase hover:bg-black active:bg-black active:scale-95 disabled:opacity-30 transition-all font-bold flex items-center justify-center gap-3 shrink-0"
                               >
                                 {isWaitingForAI ? "ЖДИТЕ" : "СРАВНИТЬ"}
                                 {!isWaitingForAI && <ArrowRightLeft className="w-4 h-4" />}
                               </button>
                             </div>
                          </form>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Footer Utility Bar */}
          <footer className="h-12 border-t border-ink flex items-center px-6 bg-paper-dark shrink-0 gap-6 text-[10px] font-mono uppercase tracking-tighter">
            <div className="flex items-center gap-2">
              <div className={cn("w-2 h-2 rounded-full", data.length > 0 ? "bg-green-600" : "bg-ink/20 animated-pulse")}></div>
              <span>{data.length > 0 ? (dbStatus.count > 0 && data.length === dbStatus.count ? "БАЗА: АКТИВНА" : "BUFFER_NOMINAL") : "ОЖИДАНИЕ_ВВОДА"}</span>
            </div>
            <div className="opacity-40">|</div>
            <div className="ml-auto flex gap-4">
              <span className="opacity-40">Session ID: AI_S_{new Date().getTime().toString().slice(-6)}</span>
              {data.length > 0 && <span className="underline opacity-60 cursor-pointer hover:opacity-100 italic">VOLVO_V4_CORE</span>}
            </div>
          </footer>
        </main>
      </div>

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={(e) => handleFileUpload(e, false)} 
        accept=".csv" 
        className="hidden" 
      />

      <input 
        type="file" 
        ref={dbFileInputRef} 
        onChange={(e) => handleFileUpload(e, true)} 
        accept=".csv" 
        className="hidden" 
      />

      <input 
        type="file" 
        ref={appliedFileInputRef} 
        onChange={handleAppliedFileUpload} 
        accept=".txt,.csv" 
        className="hidden" 
      />

      <AnimatePresence>
        {selectedParam && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8"
          >
            <div 
              className="absolute inset-0 bg-paper/80 backdrop-blur-md" 
              onClick={() => setSelectedParam(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-paper border border-ink shadow-[12px_12px_0px_0px_rgba(20,20,20,0.1)] flex flex-col max-h-[90vh] overflow-hidden"
            >
              <div className="p-6 border-b border-ink flex items-center justify-between bg-ink text-paper">
                <div className="flex items-center gap-4">
                  <div className="bg-paper text-ink px-3 py-1 text-xs font-mono font-bold">
                    {selectedParam.ParameterCode}
                  </div>
                  <h3 className="text-sm font-mono uppercase tracking-widest font-bold">Спецификация параметра</h3>
                </div>
                <button 
                  onClick={() => setSelectedParam(null)}
                  className="p-2 hover:bg-paper/10 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                <section>
                  <label className="text-[10px] font-mono uppercase opacity-40 mb-2 block">Caption & Label</label>
                  <h2 className="text-2xl font-serif italic text-ink">{selectedParam.DefaultCaption}</h2>
                </section>

                <section>
                  <label className="text-[10px] font-mono uppercase opacity-40 mb-2 block">Description & Context</label>
                  <p className="text-sm font-sans leading-relaxed text-ink/80">{selectedParam.DefaultDescription || "Описание отсутствует в текущей базе метаданных."}</p>
                </section>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6 pt-6 border-t border-ink/10">
                  <div className="space-y-4">
                    <div>
                      <label className="text-[9px] font-mono uppercase opacity-40 mb-1 block">Data Definition</label>
                      <div className="text-[11px] font-mono bg-paper-dark p-2 border border-ink/5 break-all max-h-32 overflow-y-auto">
                        {selectedParam.DataDefinition}
                      </div>
                    </div>
                    <div>
                      <label className="text-[9px] font-mono uppercase opacity-40 mb-1 block">Parsed Type</label>
                      <div className="text-[11px] font-mono font-bold">{selectedParam.parsedType || "N/A"}</div>
                    </div>
                    <div>
                      <label className="text-[9px] font-mono uppercase opacity-40 mb-1 block">Access Mode</label>
                      <div className="text-[11px] font-mono font-bold">{selectedParam.AccessMode}</div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="text-[9px] font-mono uppercase opacity-40 mb-1 block">Controllable</label>
                      <div className={cn(
                        "text-[11px] font-mono font-bold",
                        selectedParam.Controllable?.toLowerCase() === 'true' ? "text-green-600" : "text-ink/40"
                      )}>
                        {selectedParam.Controllable?.toUpperCase()}
                      </div>
                    </div>
                    <div>
                      <label className="text-[9px] font-mono uppercase opacity-40 mb-1 block">Policy Flags</label>
                      <div className="text-[11px] font-mono opacity-60 italic">{selectedParam.PolicyFlags || "---"}</div>
                    </div>
                    <div>
                      <label className="text-[9px] font-mono uppercase opacity-40 mb-1 block">Presentation Flags</label>
                      <div className="text-[11px] font-mono opacity-60 italic">{selectedParam.PresentationFlags || "---"}</div>
                    </div>
                    <div>
                      <label className="text-[9px] font-mono uppercase opacity-40 mb-1 block">Parsed Audiences</label>
                      <div className="text-[11px] font-mono font-bold">{selectedParam.parsedAudiences || "Public"}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-ink bg-paper-dark flex justify-between items-center shrink-0">
                <div className="text-[9px] font-mono opacity-40 uppercase">
                  Ref: {selectedParam.CaptionId} | {selectedParam.DescriptionId}
                </div>
                <button 
                  onClick={() => setSelectedParam(null)}
                  className="bg-ink text-paper px-6 py-2 text-xs font-mono uppercase tracking-widest hover:opacity-90 transition-all font-bold"
                >
                  Закрыть
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
