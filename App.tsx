import React, { useState, useRef, useEffect } from 'react';
import { Camera, Upload, Send, ArrowRight, Sparkles, X, ChevronUp, MessageSquare, Key, Save, Video, Leaf, Check, X as XIcon, UserCircle, ChevronRight, AlertTriangle, Info, Volume2, StopCircle, Share2, Copy } from 'lucide-react';
import { AppState, AnalysisResult, ChatMessage, Villain } from './types';
import { analyzeImage, analyzeText, chatWithCoPilot } from './services/geminiService';
import { ThinkingIndicator } from './components/ThinkingIndicator';
import { InsightCard } from './components/InsightCard';
import { SimpleRadarChart } from './components/RadarChart';
import { LiveScanner } from './components/LiveScanner';
import { PERSONAS, SubOption } from './constants';

// --- Text Parser Component ---
interface TextWithVillainsProps {
  text: string;
  villains: Villain[];
  onVillainClick: (v: Villain) => void;
  className?: string;
}

const TextWithVillains: React.FC<TextWithVillainsProps> = ({ text, villains, onVillainClick, className = "" }) => {
  if (!villains || villains.length === 0) return <span className={className}>{text}</span>;

  // Create a regex pattern to match villain names (case-insensitive)
  // Sort by length desc to match longest terms first (e.g. "High Fructose Corn Syrup" before "Corn Syrup")
  const sortedVillains = [...villains].sort((a, b) => b.name.length - a.name.length);
  
  // Escape regex special characters in names
  const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(${sortedVillains.map(v => escapeRegExp(v.name)).join('|')})`, 'gi');

  const parts = text.split(pattern);

  return (
    <span className={className}>
      {parts.map((part, i) => {
        const matchedVillain = sortedVillains.find(v => v.name.toLowerCase() === part.toLowerCase());
        if (matchedVillain) {
          return (
            <span 
              key={i} 
              onClick={(e) => {
                e.stopPropagation();
                onVillainClick(matchedVillain);
              }}
              className="inline-block px-1.5 py-0.5 mx-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30 cursor-pointer hover:bg-rose-500/30 hover:scale-105 transition-all font-medium border-dashed border-b-2 border-b-rose-400"
            >
              {part}
            </span>
          );
        }
        return part;
      })}
    </span>
  );
};


const App: React.FC = () => {
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [inputText, setInputText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  
  // API Key & Persona State
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('nourish_api_key') || '');
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [tempKey, setTempKey] = useState('');
  
  // New Persona Logic
  const [activePersonaId, setActivePersonaId] = useState<string | null>(null);
  const [activeSubOptionId, setActiveSubOptionId] = useState<string | null>(null);
  const [personaModalOpen, setPersonaModalOpen] = useState(false);
  const [pendingPersonaId, setPendingPersonaId] = useState<string | null>(null);

  // Villain Logic
  const [activeVillain, setActiveVillain] = useState<Villain | null>(null);

  // Audio Logic
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // Toast State
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isChatOpen]);

  // Auto-close villain tooltip after 5s
  useEffect(() => {
    if (activeVillain) {
      const timer = setTimeout(() => setActiveVillain(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [activeVillain]);

  // Auto-close toast
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Stop audio on unmount or state change
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
      setIsPlayingAudio(false);
    };
  }, [state]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);
    }
  };

  const clearFile = () => {
    setFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openKeyModal = () => {
    setTempKey(apiKey);
    setIsKeyModalOpen(true);
  };

  const saveApiKey = () => {
    setApiKey(tempKey.trim());
    localStorage.setItem('nourish_api_key', tempKey.trim());
    setIsKeyModalOpen(false);
  };

  const handleError = (error: any) => {
    console.error(error);
    let msg = "We couldn't analyze that. Please try again.";
    
    // Check for 403 Permission Denied or Quota
    if (error?.message === 'QUOTA_EXCEEDED') {
      msg = "You've exceeded your API Usage Quota. Please try again in a moment or check your billing details.";
    } else if (error?.message?.includes('403') || error?.toString().includes('PERMISSION_DENIED') || error?.message?.includes('The caller does not have permission')) {
      msg = "Permission Denied. Please check your API Key. Ensure it is correct and has access to Gemini models.";
      setTimeout(() => setIsKeyModalOpen(true), 1500);
    } else if (error?.message?.includes('API Key is missing')) {
      msg = "API Key is missing.";
      setTimeout(() => setIsKeyModalOpen(true), 500);
    }

    setErrorMessage(msg);
    setState(AppState.ERROR);
  };

  const handleStartLive = () => {
    if ((!apiKey && !process.env.API_KEY)) {
        alert("Please enter a Google Gemini API Key first.");
        openKeyModal();
        return;
    }
    setState(AppState.LIVE_SCAN);
  };

  // ----- Persona Selection Logic -----
  const handlePersonaClick = (personaId: string) => {
      if (activePersonaId === personaId) {
          // Deselect if already active
          setActivePersonaId(null);
          setActiveSubOptionId(null);
      } else {
          // Open modal to select sub-option
          setPendingPersonaId(personaId);
          setPersonaModalOpen(true);
      }
  };

  const confirmPersonaSelection = (subOptionId: string) => {
      if (pendingPersonaId) {
          setActivePersonaId(pendingPersonaId);
          setActiveSubOptionId(subOptionId);
          setPersonaModalOpen(false);
          setPendingPersonaId(null);
          
          // If in Results mode, trigger re-analysis via chat
          if (state === AppState.RESULTS) {
             handlePersonaChangeInResults(pendingPersonaId, subOptionId);
          }
      }
  };

  const handleAnalyze = async () => {
    if (!file && !inputText.trim()) return;

    if (!apiKey && !process.env.API_KEY) {
      alert("Please enter a Google Gemini API Key first.");
      openKeyModal();
      return;
    }

    setState(AppState.ANALYZING);
    setResult(null);

    // Construct full persona prompt
    let personaPrompt = undefined;
    if (activePersonaId && activeSubOptionId) {
        const p = PERSONAS.find(x => x.id === activePersonaId);
        const s = p?.subOptions.find(x => x.id === activeSubOptionId);
        if (p && s) {
            personaPrompt = `${p.basePrompt} SPECIFIC CONTEXT: ${s.prompt}`;
        }
    }

    try {
      let data: AnalysisResult;
      if (file) {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        await new Promise((resolve) => (reader.onload = resolve));
        const base64Data = (reader.result as string).split(',')[1];
        data = await analyzeImage(base64Data, file.type, apiKey, personaPrompt);
      } else {
        data = await analyzeText(inputText, apiKey, personaPrompt);
      }
      setResult(data);
      setState(AppState.RESULTS);
      setChatHistory([
        { role: 'model', text: `I've analyzed ${data.productName || 'the product'}. It looks ${data.summary.toLowerCase()}. What specific questions do you have?` }
      ]);
    } catch (error) {
      handleError(error);
    }
  };

  const handlePlayAudio = (text: string) => {
    if (isPlayingAudio) {
      window.speechSynthesis.cancel();
      setIsPlayingAudio(false);
      return;
    }
    
    // Stop any current speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    
    // Try to find a good voice
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.name.includes('Google US English') || v.name.includes('Samantha'));
    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.onend = () => setIsPlayingAudio(false);
    utterance.onerror = () => setIsPlayingAudio(false);

    setIsPlayingAudio(true);
    window.speechSynthesis.speak(utterance);
  };

  const handleShare = async () => {
    if (!result) return;
    const shareData = {
      title: 'Nourish.ai Analysis',
      text: result.shareContent,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.log('Share canceled');
      }
    } else {
      navigator.clipboard.writeText(result.shareContent);
      setToastMessage("Copied to clipboard!");
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    const newMsg: ChatMessage = { role: 'user', text: chatInput };
    setChatHistory(prev => [...prev, newMsg]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const reply = await chatWithCoPilot([...chatHistory, newMsg], chatInput, result || undefined, apiKey);
      setChatHistory(prev => [...prev, { role: 'model', text: reply }]);
    } catch (err) {
      console.error(err);
      setChatHistory(prev => [...prev, { role: 'model', text: "Sorry, I encountered an error. Please check your API key." }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handlePersonaChangeInResults = async (pId: string, sId: string) => {
      const p = PERSONAS.find(x => x.id === pId);
      const s = p?.subOptions.find(x => x.id === sId);
      if (!p || !s) return;

      setIsChatOpen(true);
      const msg = `Re-evaluate this product strictly for a ${p.label} user (${s.label}). ${s.prompt}`;
      setChatHistory(prev => [...prev, { role: 'user', text: msg }]);
      setIsChatLoading(true);

      try {
        const reply = await chatWithCoPilot([...chatHistory, {role:'user', text:msg}], msg, result || undefined, apiKey);
        setChatHistory(prev => [...prev, { role: 'model', text: reply }]);
      } catch (err) {
          console.error(err);
      } finally {
          setIsChatLoading(false);
      }
  };

  const renderPersonaModal = () => {
      if (!personaModalOpen || !pendingPersonaId) return null;
      const persona = PERSONAS.find(p => p.id === pendingPersonaId);
      if (!persona) return null;

      return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setPersonaModalOpen(false)}></div>
           <div className="relative bg-slate-900 border border-slate-700 w-full max-w-sm p-6 rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <button onClick={() => setPersonaModalOpen(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white">
                 <X size={20} />
              </button>
              <h3 className="text-xl font-serif text-slate-100 mb-1">{persona.label}</h3>
              <p className="text-sm text-slate-400 mb-4">Select specific context:</p>
              
              <div className="space-y-2">
                 {persona.subOptions.map((sub) => (
                    <button
                       key={sub.id}
                       onClick={() => confirmPersonaSelection(sub.id)}
                       className="w-full text-left px-4 py-3 rounded-xl bg-slate-800 hover:bg-emerald-500/10 hover:border-emerald-500/30 border border-transparent transition-all group"
                    >
                       <div className="flex justify-between items-center">
                          <span className="text-slate-200 font-medium group-hover:text-emerald-400">{sub.label}</span>
                          <ChevronRight size={16} className="text-slate-600 group-hover:text-emerald-400" />
                       </div>
                    </button>
                 ))}
              </div>
           </div>
        </div>
      );
  };

  const renderKeyModal = () => {
    if (!isKeyModalOpen) return null;
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsKeyModalOpen(false)}></div>
        <div className="relative bg-slate-900 border border-slate-700 w-full max-w-md p-6 rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-serif text-slate-100 flex items-center gap-2">
              <Key size={20} className="text-emerald-400" />
              API Settings
            </h2>
            <button onClick={() => setIsKeyModalOpen(false)} className="text-slate-500 hover:text-white">
              <X size={20} />
            </button>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2">Google Gemini API Key</label>
              <input 
                type="password" 
                value={tempKey}
                onChange={(e) => setTempKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:ring-1 focus:ring-emerald-500 outline-none placeholder-slate-700 font-mono text-sm"
              />
              <p className="text-xs text-slate-500 mt-2">
                Your key is stored locally in your browser. Get one at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-emerald-500 hover:underline">aistudio.google.com</a>.
              </p>
            </div>
            
            <button 
              onClick={saveApiKey}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Save size={18} />
              Save Key
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderDietaryBadge = (type: string) => {
      if (type === 'veg' || type === 'vegan') {
        return (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
             <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
             <span>Veg</span>
          </div>
        );
      }
      if (type === 'non-veg') {
        return (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium">
             <div className="w-2 h-2 rounded-full bg-rose-500"></div>
             <span>Non-Veg</span>
          </div>
        );
      }
      return null;
  };

  const renderIdle = () => (
    <div className="flex flex-col items-center justify-center min-h-[80vh] w-full max-w-2xl mx-auto px-6 text-center">
      
      {/* API Key Button */}
      <div className="absolute top-6 right-6">
         <button
            onClick={openKeyModal}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-sm transition-all text-xs font-medium border ${
              apiKey ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:text-white hover:border-slate-500'
            }`}
          >
            <Key size={14} />
            <span>{apiKey ? 'API Key Set' : 'Set API Key'}</span>
          </button>
      </div>

      <div className="mb-8 animate-float">
        <Sparkles className="w-16 h-16 text-emerald-400 opacity-80" />
      </div>
      <h1 className="text-4xl md:text-6xl font-serif font-light mb-6 bg-gradient-to-r from-emerald-200 to-teal-400 bg-clip-text text-transparent">
        What are you eating?
      </h1>
      
      <div className="flex flex-wrap gap-2 justify-center mb-10">
          {PERSONAS.map(p => {
              const isActive = activePersonaId === p.id;
              const activeSub = isActive && activeSubOptionId ? p.subOptions.find(s => s.id === activeSubOptionId) : null;
              
              return (
              <button
                 key={p.id}
                 onClick={() => handlePersonaClick(p.id)}
                 className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                     isActive 
                     ? 'bg-emerald-500 text-white border-emerald-400 shadow-lg shadow-emerald-500/20' 
                     : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:border-slate-500'
                 }`}
              >
                  {p.label} {activeSub && <span className="opacity-75 font-light">| {activeSub.label}</span>}
              </button>
          )})}
      </div>

      <div className="w-full relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
        <div className="relative bg-slate-900 border border-slate-700 rounded-2xl p-4 flex flex-col gap-4 shadow-2xl">
          
          {/* File Preview Area */}
          {previewUrl && (
            <div className="relative w-full h-48 bg-slate-800 rounded-lg overflow-hidden flex items-center justify-center">
              <img src={previewUrl} alt="Preview" className="h-full w-full object-cover opacity-60" />
              <button 
                onClick={clearFile}
                className="absolute top-2 right-2 bg-black/50 p-1 rounded-full hover:bg-black/70 text-white"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* Input Area */}
          <div className="flex items-end gap-3">
             {/* Live Scan Button */}
             <button 
              onClick={handleStartLive}
              className="p-3 rounded-xl bg-slate-800 text-rose-400 hover:bg-slate-700 hover:text-rose-300 transition-colors border border-rose-900/30"
              title="Live Scan Mode"
            >
              <Video size={24} />
            </button>

            <button 
              onClick={() => fileInputRef.current?.click()}
              className="p-3 rounded-xl bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-emerald-400 transition-colors"
            >
              <Camera size={24} />
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
            />
            
            <textarea
              className="flex-1 bg-transparent border-none outline-none text-lg text-slate-100 placeholder-slate-600 resize-none h-14 py-3"
              placeholder="Paste ingredients or type product name..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                  if(e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleAnalyze();
                  }
              }}
            />
            
            <button 
              onClick={handleAnalyze}
              disabled={(!file && !inputText.trim())}
              className={`p-3 rounded-xl transition-all duration-300 ${
                (!file && !inputText.trim()) 
                ? 'bg-slate-800 text-slate-600 cursor-not-allowed' 
                : 'bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.5)] hover:bg-emerald-400'
              }`}
            >
              <ArrowRight size={24} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAnalyzing = () => (
    <div className="min-h-screen flex items-center justify-center">
      <ThinkingIndicator />
    </div>
  );

  const renderResults = () => {
    if (!result) return null;

    // Get active persona label for display
    const personaObj = activePersonaId ? PERSONAS.find(p => p.id === activePersonaId) : null;
    const subOptionObj = (personaObj && activeSubOptionId) ? personaObj.subOptions.find(s => s.id === activeSubOptionId) : null;

    return (
      <div className="w-full max-w-4xl mx-auto px-4 py-8 pb-32">
        {/* Toast Notification */}
        {toastMessage && (
            <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[80] animate-in fade-in slide-in-from-top-4">
                <div className="bg-emerald-600 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm font-medium">
                    <Check size={16} /> {toastMessage}
                </div>
            </div>
        )}

        {/* Villain Toast/Tooltip */}
        {activeVillain && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] w-[90%] max-w-md animate-in slide-in-from-bottom-4 duration-300">
             <div className="bg-slate-900/95 border border-rose-500/50 rounded-2xl p-4 shadow-2xl backdrop-blur-md relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-rose-500"></div>
                <button onClick={() => setActiveVillain(null)} className="absolute top-2 right-2 text-slate-500 hover:text-white p-1">
                   <X size={16} />
                </button>
                <div className="flex gap-3">
                   <div className="mt-1 p-2 bg-rose-500/20 rounded-full h-fit text-rose-400">
                      <AlertTriangle size={20} />
                   </div>
                   <div>
                      <h4 className="text-rose-400 font-bold text-lg leading-tight mb-1">{activeVillain.name}</h4>
                      <p className="text-slate-200 text-sm leading-relaxed">{activeVillain.explanation}</p>
                   </div>
                </div>
             </div>
          </div>
        )}

        {/* Header / Summary */}
        <header className="mb-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="flex justify-between items-start">
            <button 
              onClick={() => setState(AppState.IDLE)} 
              className="text-slate-500 hover:text-emerald-400 mb-6 flex items-center gap-2 text-sm transition-colors"
            >
              <ArrowRight className="rotate-180" size={14} /> Start Over
            </button>
            <button
              onClick={openKeyModal}
              className="text-slate-500 hover:text-emerald-400 mb-6 flex items-center gap-2 text-xs transition-colors"
            >
              <Key size={14} /> API Key
            </button>
          </div>

          {/* Persona Banner */}
          {personaObj && (
             <div className="mb-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium animate-in fade-in slide-in-from-left-4">
                 <UserCircle size={14} />
                 Analyzing for: <span className="text-white">{personaObj.label}</span> 
                 {subOptionObj && <span className="text-indigo-200 border-l border-indigo-500/30 pl-2 ml-1">{subOptionObj.label}</span>}
             </div>
          )}
          
          <div className="flex flex-col md:flex-row gap-8 items-start">
             <div className="flex-1">
                <div className="flex flex-wrap items-center gap-3 mb-4">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs text-emerald-400 font-mono">
                      <Sparkles size={12} />
                      {result.intentInference}
                    </div>
                    {renderDietaryBadge(result.dietaryClassification)}
                </div>

                <h1 className="text-3xl md:text-5xl font-serif text-slate-100 leading-tight mb-4">
                  <TextWithVillains 
                    text={result.summary} 
                    villains={result.villains} 
                    onVillainClick={setActiveVillain} 
                  />
                </h1>

                {/* Trade-offs Section (Refined) */}
                <div className="mb-6">
                   <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">The Trade-off</h3>
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {result.tradeoffs.pros.length > 0 && (
                        <div className="flex flex-col gap-2 p-3 rounded-xl bg-emerald-950/20 border border-emerald-900/30">
                           <h4 className="text-xs text-emerald-500 font-medium mb-1">Pros</h4>
                           {result.tradeoffs.pros.map((pro, i) => (
                              <div key={i} className="flex items-start gap-2 text-sm text-slate-300">
                                 <div className="mt-1 shrink-0 p-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                                    <Check size={10} strokeWidth={3} />
                                 </div>
                                 <span className="leading-tight">{pro}</span>
                              </div>
                           ))}
                        </div>
                      )}
                      {result.tradeoffs.cons.length > 0 && (
                        <div className="flex flex-col gap-2 p-3 rounded-xl bg-rose-950/20 border border-rose-900/30">
                           <h4 className="text-xs text-rose-500 font-medium mb-1">Cons</h4>
                           {result.tradeoffs.cons.map((con, i) => (
                              <div key={i} className="flex items-start gap-2 text-sm text-slate-300">
                                 <div className="mt-1 shrink-0 p-0.5 rounded-full bg-rose-500/20 text-rose-400">
                                    <XIcon size={10} strokeWidth={3} />
                                 </div>
                                 <span className="leading-tight">
                                    <TextWithVillains 
                                      text={con} 
                                      villains={result.villains} 
                                      onVillainClick={setActiveVillain} 
                                    />
                                 </span>
                              </div>
                           ))}
                        </div>
                      )}
                   </div>
                </div>

                {/* Persona Chips in Results */}
                <div className="flex flex-wrap gap-2 mb-6">
                    {PERSONAS.map(p => {
                       const isActive = activePersonaId === p.id;
                       return (
                      <button
                        key={p.id}
                        onClick={() => handlePersonaClick(p.id)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                            isActive
                            ? 'bg-emerald-500 text-white border-emerald-400' 
                            : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:border-slate-500 hover:text-slate-200'
                        }`}
                      >
                          {p.label}
                      </button>
                    )})}
                </div>

                <div className="flex flex-wrap gap-2">
                   {result.reasoningTrace.slice(0, 3).map((trace, i) => (
                      <span key={i} className="text-xs text-slate-500 border-l border-slate-700 pl-2">
                        {trace}
                      </span>
                   ))}
                </div>
             </div>

             {/* Score Ring */}
             <div className="shrink-0 flex flex-col items-center">
                <div className="relative group">
                   <div className="absolute inset-0 bg-emerald-500/20 blur-2xl rounded-full"></div>
                   <div className="relative w-32 h-32 rounded-full border-4 border-slate-800 flex items-center justify-center bg-slate-900/50 backdrop-blur">
                     <span className={`text-4xl font-bold ${
                       result.healthScore > 80 ? 'text-emerald-400' : 
                       result.healthScore > 50 ? 'text-amber-400' : 'text-rose-500'
                     }`}>
                       {result.healthScore}
                     </span>
                     
                     {/* Audio Button */}
                     <button
                       onClick={() => handlePlayAudio(result.audioScript)}
                       className={`absolute -bottom-4 -left-2 bg-slate-800 border border-slate-600 p-2.5 rounded-full shadow-lg transition-all hover:scale-110 active:scale-95 z-20 ${isPlayingAudio ? 'text-emerald-400 border-emerald-500/50 animate-pulse' : 'text-slate-300'}`}
                       title="Listen to summary"
                     >
                       {isPlayingAudio ? <StopCircle size={20} /> : <Volume2 size={20} />}
                     </button>
                     
                     {/* Share Button */}
                     <button
                       onClick={handleShare}
                       className="absolute -bottom-4 -right-2 bg-slate-800 border border-slate-600 p-2.5 rounded-full shadow-lg transition-all hover:scale-110 active:scale-95 z-20 text-slate-300 hover:text-emerald-400 hover:border-emerald-500/50"
                       title="Share result"
                     >
                       <Share2 size={20} />
                     </button>
                   </div>
                </div>
                <p className="text-center mt-6 text-xs text-slate-500 font-mono uppercase tracking-widest">Health Score</p>

                {/* Ambiguity / Uncertainty Card */}
                {result.uncertainty && result.uncertainty.detected && (
                  <div className="mt-6 w-full max-w-xs animate-in slide-in-from-top-4 duration-700">
                     <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-amber-500">
                           <AlertTriangle size={16} className="shrink-0" />
                           <span className="text-xs font-bold uppercase tracking-wider">Ambiguity Detected</span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                           {result.uncertainty.reason}
                        </p>
                     </div>
                  </div>
                )}
             </div>
          </div>
        </header>

        {/* Content Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {/* Radar Chart */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur">
             <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Nutritional Dimensions</h3>
             <SimpleRadarChart data={result.radarData} className="w-full h-64" />
          </div>

          {/* Insight Cards */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Key Insights</h3>
            {result.insights.map((insight, idx) => (
              <InsightCard key={idx} insight={insight} delay={idx * 150} />
            ))}
          </div>
        </div>

        {/* Chat Toggle Floating Action Button (if closed) */}
        {!isChatOpen && (
           <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
             <button 
                onClick={() => setIsChatOpen(true)}
                className="flex items-center gap-3 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full shadow-lg shadow-emerald-900/50 transition-all hover:scale-105"
             >
               <MessageSquare size={18} />
               <span>Ask Co-pilot</span>
             </button>
           </div>
        )}
      </div>
    );
  };

  const renderChatDrawer = () => {
    return (
      <div className={`fixed inset-x-0 bottom-0 z-50 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
        isChatOpen ? 'translate-y-0' : 'translate-y-[110%]'
      }`}>
        <div className="max-w-3xl mx-auto bg-slate-900 border-t border-x border-slate-700 rounded-t-2xl shadow-2xl flex flex-col max-h-[80vh]">
          
          {/* Chat Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/90 backdrop-blur rounded-t-2xl sticky top-0 z-10 cursor-pointer" onClick={() => setIsChatOpen(false)}>
            <div className="flex items-center gap-2">
               <Sparkles size={16} className="text-emerald-400" />
               <span className="font-semibold text-slate-200">Co-pilot Chat</span>
            </div>
            <button className="p-2 hover:bg-slate-800 rounded-full text-slate-400" onClick={(e) => { e.stopPropagation(); setIsChatOpen(false); }}>
               <ChevronUp className="rotate-180" />
            </button>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-950/50 min-h-[300px]">
            {chatHistory.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user' 
                  ? 'bg-emerald-600 text-white rounded-tr-sm' 
                  : 'bg-slate-800 text-slate-200 rounded-tl-sm'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isChatLoading && (
               <div className="flex justify-start">
                 <div className="bg-slate-800 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                    <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce delay-75"></div>
                    <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce delay-150"></div>
                 </div>
               </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input */}
          <div className="p-4 bg-slate-900 border-t border-slate-800">
             <div className="relative flex items-center">
               <input
                 type="text"
                 value={chatInput}
                 onChange={(e) => setChatInput(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                 placeholder="Ask about allergies, specific diets, or additives..."
                 className="w-full bg-slate-800 border-none rounded-xl py-3 pl-4 pr-12 text-slate-200 placeholder-slate-500 focus:ring-1 focus:ring-emerald-500 outline-none"
               />
               <button 
                 onClick={handleSendMessage}
                 disabled={!chatInput.trim() || isChatLoading}
                 className="absolute right-2 p-2 bg-emerald-600/20 text-emerald-400 rounded-lg hover:bg-emerald-600 hover:text-white transition-all disabled:opacity-50"
               >
                 <Send size={18} />
               </button>
             </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 selection:bg-emerald-500/30 overflow-x-hidden">
      {renderKeyModal()}
      {renderPersonaModal()}
      
      {/* Live Scanner Mode */}
      {state === AppState.LIVE_SCAN && (
         <LiveScanner apiKey={apiKey || process.env.API_KEY || ''} onClose={() => setState(AppState.IDLE)} />
      )}

      {/* Background Gradient Mesh */}
      <div className="fixed inset-0 pointer-events-none z-0">
         <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-900/20 rounded-full blur-[128px]"></div>
         <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-900/10 rounded-full blur-[128px]"></div>
      </div>

      <div className="relative z-10">
        {state === AppState.IDLE && renderIdle()}
        {state === AppState.ANALYZING && renderAnalyzing()}
        {state === AppState.RESULTS && renderResults()}
        {state === AppState.ERROR && (
           <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
             <div className="text-rose-500 text-6xl mb-4">:(</div>
             <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
             <p className="text-slate-400 mb-6 max-w-md mx-auto">{errorMessage || "We couldn't analyze that. Please try again with a clearer image or text."}</p>
             <div className="flex gap-4 justify-center">
               <button onClick={() => setState(AppState.IDLE)} className="px-6 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white">Try Again</button>
               <button onClick={openKeyModal} className="px-6 py-2 border border-slate-700 hover:bg-slate-800 rounded-lg text-slate-300">Check API Key</button>
             </div>
           </div>
        )}
      </div>
      
      {state === AppState.RESULTS && renderChatDrawer()}
    </div>
  );
};

export default App;