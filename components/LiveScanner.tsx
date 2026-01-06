import React, { useEffect, useRef, useState } from 'react';
import { X, Loader2, AlertCircle, ScanLine, Sparkles, User, Leaf, Beef, Check, X as XIcon, ChevronRight, AlertTriangle, Volume2, StopCircle, Share2, Copy, Hourglass } from 'lucide-react';
import { analyzeImage } from '../services/geminiService';
import { AnalysisResult, Villain } from '../types';
import { SimpleRadarChart } from './RadarChart';
import { PERSONAS } from '../constants';

// Reusing TextWithVillains logic slightly modified for Live View
const LiveTextWithVillains: React.FC<{ text: string, villains: Villain[], onVillainClick: (v: Villain) => void }> = ({ text, villains, onVillainClick }) => {
  if (!villains || villains.length === 0) return <span>{text}</span>;
  const sortedVillains = [...villains].sort((a, b) => b.name.length - a.name.length);
  const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(${sortedVillains.map(v => escapeRegExp(v.name)).join('|')})`, 'gi');
  const parts = text.split(pattern);

  return (
    <span>
      {parts.map((part, i) => {
        const matchedVillain = sortedVillains.find(v => v.name.toLowerCase() === part.toLowerCase());
        if (matchedVillain) {
          return (
            <span 
              key={i} 
              onClick={(e) => { e.stopPropagation(); onVillainClick(matchedVillain); }}
              className="inline-block px-1 py-0 mx-0.5 rounded bg-rose-500/30 text-rose-300 font-bold border-b border-rose-400 border-dashed cursor-pointer hover:bg-rose-500/50"
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

interface LiveScannerProps {
  apiKey: string;
  onClose: () => void;
}

export const LiveScanner: React.FC<LiveScannerProps> = ({ apiKey, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCoolingDown, setIsCoolingDown] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastAnalysisTimeRef = useRef<number>(0);

  // Persona State for Live Mode
  const [activePersonaId, setActivePersonaId] = useState<string | null>(null);
  const [activeSubOptionId, setActiveSubOptionId] = useState<string | null>(null);
  const [pendingPersonaId, setPendingPersonaId] = useState<string | null>(null); // For sub-selection overlay

  // Live Villain State
  const [activeVillain, setActiveVillain] = useState<Villain | null>(null);
  
  // Audio Logic
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null); // GC Fix

  // Toast State
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Auto-close villain tooltip
  useEffect(() => {
    if (activeVillain) {
      const timer = setTimeout(() => setActiveVillain(null), 4000);
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

  // Stop audio on unmount
  useEffect(() => {
    return () => {
        window.speechSynthesis.cancel();
    }
  }, []);

  // Start Camera
  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: false, 
            video: { 
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 } 
            } 
        });
        streamRef.current = stream;
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setIsStreaming(true);
        }
      } catch (err: any) {
        console.error("Camera Error:", err);
        setError("Could not access camera. Please ensure permissions are granted.");
      }
    };

    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // Capture and Analyze Loop
  useEffect(() => {
    // Pause scanning if interacting with UI, listening to audio, or cooling down
    if (!isStreaming || !apiKey || pendingPersonaId || activeVillain || isPlayingAudio) return; 

    const intervalId = setInterval(async () => {
      const now = Date.now();
      
      // Check if cooldown is active and if enough time has passed
      if (isCoolingDown) {
          if (now > lastAnalysisTimeRef.current + 3000) { // Standard delay logic
              setIsCoolingDown(false);
              setError(null);
          } else {
              return; // Still cooling down
          }
      }

      // Enforce a minimum delay between analyses (e.g., 3 seconds) and ensure not currently analyzing
      if (isAnalyzing || (now - lastAnalysisTimeRef.current < 3000)) return;

      if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        
        // Ensure video is ready
        if (video.readyState !== video.HAVE_ENOUGH_DATA) return;

        setIsAnalyzing(true);

        try {
          // Capture frame
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const base64Data = canvas.toDataURL('image/jpeg', 0.6).split(',')[1]; // Lower quality for speed

          // Get prompt for persona
          let personaPrompt = undefined;
          if (activePersonaId && activeSubOptionId) {
             const p = PERSONAS.find(x => x.id === activePersonaId);
             const s = p?.subOptions.find(x => x.id === activeSubOptionId);
             if (p && s) {
                 personaPrompt = `${p.basePrompt} SPECIFIC CONTEXT: ${s.prompt}`;
             }
          }

          // Call Gemini
          const data = await analyzeImage(base64Data, 'image/jpeg', apiKey, personaPrompt);
          setResult(data);
          lastAnalysisTimeRef.current = Date.now();
        } catch (err: any) {
          console.error("Analysis failed:", err);
          if (err.message === 'QUOTA_EXCEEDED') {
              setError("High traffic. Slowing down...");
              setIsCoolingDown(true);
              // Set the 'last run' time into the future to force a long pause (e.g., 10 seconds)
              // The logic `now - last < 3000` will remain true until `now` catches up
              lastAnalysisTimeRef.current = Date.now() + 10000;
          }
        } finally {
          setIsAnalyzing(false);
        }
      }
    }, 1000); 

    return () => clearInterval(intervalId);
  }, [isStreaming, isAnalyzing, apiKey, activePersonaId, activeSubOptionId, pendingPersonaId, activeVillain, isPlayingAudio, isCoolingDown]);

  const handlePersonaClick = (personaId: string) => {
    if (activePersonaId === personaId) {
       // Deselect
       setActivePersonaId(null);
       setActiveSubOptionId(null);
       setResult(null);
    } else {
       // Pause scanning and show sub-options
       setPendingPersonaId(personaId);
    }
  };

  const confirmSubOption = (subId: string) => {
      if (pendingPersonaId) {
          setActivePersonaId(pendingPersonaId);
          setActiveSubOptionId(subId);
          setPendingPersonaId(null);
          setResult(null); // Clear previous result to trigger new scan with new context
      }
  };

  const handlePlayAudio = (text: string) => {
    if (!text) return;

    if (isPlayingAudio) {
      window.speechSynthesis.cancel();
      setIsPlayingAudio(false);
      utteranceRef.current = null;
      return;
    }
    
    // Stop any current speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utteranceRef.current = utterance; // Store ref to prevent garbage collection issues
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    
    // Ensure voices are loaded
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => 
        v.name.includes('Google US English') || 
        v.name.includes('Samantha') || 
        v.lang.startsWith('en-US')
    );
    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.onend = () => {
        setIsPlayingAudio(false);
        utteranceRef.current = null;
    };
    utterance.onerror = (e) => {
        console.error("TTS Error:", e);
        setIsPlayingAudio(false);
        utteranceRef.current = null;
    };

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

  const renderDietaryIcon = (type: string) => {
    if (type === 'veg' || type === 'vegan') {
      return (
        <div className="flex items-center justify-center w-6 h-6 border-2 border-emerald-500 rounded-sm bg-white p-0.5" title="Vegetarian">
           <div className="w-full h-full rounded-full bg-emerald-500"></div>
        </div>
      );
    }
    if (type === 'non-veg') {
      return (
        <div className="flex items-center justify-center w-6 h-6 border-2 border-rose-800 rounded-sm bg-white p-0.5" title="Non-Vegetarian">
           <div className="w-full h-full rounded-full bg-rose-800"></div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
       {/* Top Bar */}
       <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-20 bg-gradient-to-b from-black/80 to-transparent">
          <div className="flex flex-col gap-1">
             <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isStreaming ? (isCoolingDown ? 'bg-amber-500' : 'bg-emerald-500 shadow-[0_0_10px_#10b981]') : 'bg-slate-500'}`}></div>
                <span className="text-white font-medium text-sm drop-shadow-md">
                   {isCoolingDown ? 'Cooling Down' : 'Live Analysis'}
                </span>
             </div>
             {isAnalyzing && (
               <div className="flex items-center gap-2 text-emerald-400 text-xs animate-pulse">
                 <Loader2 size={10} className="animate-spin" />
                 <span>Analyzing frame...</span>
               </div>
             )}
             {isCoolingDown && (
               <div className="flex items-center gap-2 text-amber-400 text-xs animate-pulse">
                 <Hourglass size={10} className="animate-spin-slow" />
                 <span>High traffic...</span>
               </div>
             )}
          </div>
          <button 
            onClick={onClose}
            className="p-2 bg-black/40 backdrop-blur-md rounded-full text-white border border-white/10 hover:bg-white/10 transition-colors"
          >
             <X size={20} />
          </button>
       </div>

       {/* Video Feed */}
       <div className="flex-1 relative bg-slate-900 flex items-center justify-center overflow-hidden">
          <video 
             ref={videoRef} 
             autoPlay 
             playsInline 
             muted 
             className="w-full h-full object-cover" 
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Toast (Live) */}
          {toastMessage && (
              <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[80] animate-in fade-in slide-in-from-top-4">
                  <div className="bg-emerald-600 text-white px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2 text-xs font-medium">
                      <Check size={14} /> {toastMessage}
                  </div>
              </div>
          )}

          {/* Active Villain Tooltip (Live) */}
          {activeVillain && (
              <div className="absolute top-1/4 left-1/2 -translate-x-1/2 z-[60] w-[80%] max-w-sm animate-in zoom-in-95 duration-200">
                  <div className="bg-slate-900/90 border border-rose-500/50 rounded-xl p-3 shadow-xl backdrop-blur-sm">
                      <div className="flex items-start gap-2">
                          <AlertTriangle size={16} className="text-rose-400 shrink-0 mt-0.5" />
                          <div>
                              <p className="text-rose-300 font-bold text-sm">{activeVillain.name}</p>
                              <p className="text-white text-xs leading-snug">{activeVillain.explanation}</p>
                          </div>
                      </div>
                  </div>
              </div>
          )}

          {/* Sub-Option Selection Overlay */}
          {pendingPersonaId && (
              <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
                  <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-2xl p-4 shadow-2xl animate-in fade-in slide-in-from-bottom-10">
                      <div className="flex justify-between items-center mb-4">
                          <h3 className="text-lg font-serif text-slate-100">Select Type</h3>
                          <button onClick={() => setPendingPersonaId(null)} className="text-slate-400 hover:text-white">
                              <X size={20} />
                          </button>
                      </div>
                      <div className="space-y-2">
                          {PERSONAS.find(p => p.id === pendingPersonaId)?.subOptions.map(sub => (
                              <button
                                  key={sub.id}
                                  onClick={() => confirmSubOption(sub.id)}
                                  className="w-full text-left px-4 py-3 rounded-xl bg-slate-800 hover:bg-emerald-500/20 hover:text-emerald-300 border border-slate-700 transition-all flex justify-between items-center group"
                              >
                                  <span className="text-sm font-medium text-slate-200 group-hover:text-emerald-300">{sub.label}</span>
                                  <ChevronRight size={16} className="text-slate-500 group-hover:text-emerald-300" />
                              </button>
                          ))}
                      </div>
                  </div>
              </div>
          )}

          {/* Scanner Line */}
          {isStreaming && !result && !pendingPersonaId && !isCoolingDown && (
             <div className="absolute inset-0 pointer-events-none">
                <div className="w-full h-1 bg-emerald-500/50 shadow-[0_0_20px_#10b981] animate-[scan_3s_ease-in-out_infinite]"></div>
             </div>
          )}

          {error && !isCoolingDown && (
             <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-30 p-6 text-center">
                 <AlertCircle className="w-12 h-12 text-rose-500 mb-4" />
                 <p className="text-white text-lg mb-2">Camera Error</p>
                 <p className="text-slate-400 text-sm mb-6 max-w-xs">{error}</p>
                 <button onClick={onClose} className="px-6 py-2 bg-slate-800 rounded-lg text-white">Close</button>
             </div>
          )}
       </div>

       {/* Results & Controls */}
       {!pendingPersonaId && (
       <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-col justify-end">
          {/* Persona Chips */}
          <div className="overflow-x-auto px-4 pb-2 no-scrollbar">
             <div className="flex gap-2">
                {PERSONAS.map(p => {
                    const isActive = activePersonaId === p.id;
                    const activeSub = isActive && activeSubOptionId ? p.subOptions.find(s => s.id === activeSubOptionId) : null;
                    return (
                   <button
                      key={p.id}
                      onClick={() => handlePersonaClick(p.id)}
                      className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-md border transition-all ${
                         isActive
                         ? 'bg-emerald-500 text-white border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.3)]' 
                         : 'bg-black/40 text-slate-300 border-white/10 hover:bg-black/60'
                      }`}
                   >
                      {p.label} {activeSub && <span className="opacity-75">| {activeSub.label}</span>}
                   </button>
                )})}
             </div>
          </div>

          <div className="p-4 bg-gradient-to-t from-black via-black/90 to-transparent">
             {!result ? (
                <div className="text-center py-6">
                   <ScanLine className="w-8 h-8 text-white/20 mx-auto mb-2" />
                   <p className="text-white/60 text-xs">Point your camera at food</p>
                </div>
             ) : (
                <div className="animate-in slide-in-from-bottom-10 duration-500 space-y-3">
                   {/* Summary Header */}
                   <div className="flex items-start gap-4">
                      <div className="relative shrink-0">
                         <div className="w-14 h-14 rounded-full border-4 border-slate-800 bg-slate-900 flex items-center justify-center shadow-xl relative overflow-hidden">
                            <span className={`text-lg font-bold ${
                               result.healthScore > 80 ? 'text-emerald-400' : 
                               result.healthScore > 50 ? 'text-amber-400' : 'text-rose-500'
                            }`}>
                               {result.healthScore}
                            </span>
                         </div>
                         <div className="absolute -bottom-1 -right-1 bg-white border border-slate-200 rounded-sm">
                             {renderDietaryIcon(result.dietaryClassification)}
                         </div>
                         {/* Live View Uncertainty Indicator */}
                         {result.uncertainty && result.uncertainty.detected && (
                             <div className="absolute -top-1 -right-1 bg-amber-500 text-black border border-amber-400 rounded-full w-4 h-4 flex items-center justify-center" title="Ambiguity Detected">
                                 <AlertTriangle size={10} />
                             </div>
                         )}
                         {/* Live View Audio Button */}
                         <button
                           onClick={(e) => { e.stopPropagation(); handlePlayAudio(result.audioScript); }}
                           className={`absolute -bottom-2 -left-2 bg-slate-800 border border-slate-600 p-1.5 rounded-full shadow-lg transition-all z-20 ${isPlayingAudio ? 'text-emerald-400 border-emerald-500/50 animate-pulse' : 'text-slate-300'}`}
                           title="Listen"
                         >
                           {isPlayingAudio ? <StopCircle size={12} /> : <Volume2 size={12} />}
                         </button>
                         {/* Live View Share Button */}
                         <button
                           onClick={(e) => { e.stopPropagation(); handleShare(); }}
                           className="absolute -bottom-2 -right-2 bg-slate-800 border border-slate-600 p-1.5 rounded-full shadow-lg transition-all z-20 text-slate-300 hover:text-emerald-400"
                           title="Share"
                         >
                           <Share2 size={12} />
                         </button>
                      </div>
                      <div className="flex-1 min-w-0">
                         <div className="flex items-center gap-2 mb-1">
                            <Sparkles size={12} className="text-emerald-400" />
                            <span className="text-[10px] text-emerald-400 font-medium uppercase tracking-wider truncate">
                                {result.intentInference}
                            </span>
                         </div>
                         <h3 className="text-white font-serif text-base leading-tight line-clamp-2">
                             <LiveTextWithVillains 
                               text={result.summary} 
                               villains={result.villains} 
                               onVillainClick={setActiveVillain}
                             />
                         </h3>
                      </div>
                   </div>

                   {/* Trade-offs Mini (Live View) */}
                   {(result.tradeoffs.pros.length > 0 || result.tradeoffs.cons.length > 0) && (
                      <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                        {result.tradeoffs.pros.slice(0, 1).map((pro, i) => (
                           <div key={`p-${i}`} className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[10px] font-medium backdrop-blur-sm">
                              <Check size={10} /> {pro}
                           </div>
                        ))}
                        {result.tradeoffs.cons.slice(0, 1).map((con, i) => (
                           <div key={`c-${i}`} className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[10px] font-medium backdrop-blur-sm">
                              <XIcon size={10} /> {con}
                           </div>
                        ))}
                      </div>
                   )}

                   {/* Quick Stats Row */}
                   <div className="flex gap-2 h-24">
                      <div className="w-1/3 bg-white/5 backdrop-blur-md rounded-lg p-1 border border-white/10">
                         <SimpleRadarChart data={result.radarData} className="w-full h-full" />
                      </div>
                      <div className="w-2/3 flex flex-col gap-2">
                         {result.insights.slice(0, 2).map((insight, i) => (
                            <div key={i} className={`flex-1 p-2 rounded-lg border bg-black/40 backdrop-blur-sm flex items-center gap-2 ${
                               insight.type === 'positive' ? 'border-emerald-500/30' : 
                               insight.type === 'warning' ? 'border-amber-500/30' : 
                               insight.type === 'critical' ? 'border-rose-500/30' : 'border-blue-500/30'
                            }`}>
                               <div className={`w-1.5 h-1.5 shrink-0 rounded-full ${
                                     insight.type === 'positive' ? 'bg-emerald-500' : 
                                     insight.type === 'warning' ? 'bg-amber-500' : 
                                     insight.type === 'critical' ? 'bg-rose-500' : 'bg-blue-500'
                                  }`} />
                               <div className="min-w-0">
                                   <p className="text-[10px] font-medium text-slate-200 truncate">{insight.title}</p>
                                   <p className="text-[9px] text-slate-400 truncate">{insight.description}</p>
                               </div>
                            </div>
                         ))}
                      </div>
                   </div>
                </div>
             )}
          </div>
       </div>
       )}

       <style>{`
          @keyframes scan {
            0% { top: 0%; opacity: 0; }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% { top: 100%; opacity: 0; }
          }
          .no-scrollbar::-webkit-scrollbar {
            display: none;
          }
          .no-scrollbar {
            -ms-overflow-style: none;
            scrollbar-width: none;
          }
       `}</style>
    </div>
  );
};