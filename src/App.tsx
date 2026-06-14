import { useState, useRef, ChangeEvent, useEffect, DragEvent } from 'react';
import { GoogleGenAI } from "@google/genai";
import { motion, AnimatePresence } from "motion/react";
import { Upload, X, Search, Camera, Activity, Wand2, Info, ChevronRight, History, Link2, Users } from 'lucide-react';

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface ActionDetail {
  label: string;
  score: number;
  box: number[]; // [ymin, xmin, ymax, xmax] normalized 0-1000
}

interface HumanDetection {
  action: string;
  confidence: string;
  description: string;
  interaction?: string;
  interactionBox?: number[]; // [ymin, xmin, ymax, xmax] normalized 0-1000
  details: ActionDetail[];
  boundingBox?: number[]; // [ymin, xmin, ymax, xmax] normalized 0-1000
}

interface AnalysisResult {
  humans: HumanDetection[];
}

interface HistoryItem {
  image: string;
  humans: HumanDetection[];
  timestamp: string;
}

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [selectedHumanIdx, setSelectedHumanIdx] = useState(0);
  const [hoveredDetailIdx, setHoveredDetailIdx] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setError("Image size exceeds 10MB limit.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        setResult(null);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      processFile(file);
    }
  };

  const ANALYSIS_STEPS = [
    "Initializing Neural Engine",
    "Scanning Pixel Vectors",
    "Isolating Human Subjects",
    "Mapping Skeletal Kinematics",
    "Synthesizing Interaction Data"
  ];

  const analyzeAction = async () => {
    if (!image) return;

    setIsAnalyzing(true);
    setError(null);
    setResult(null);
    setAnalysisStep(0);

    const stepInterval = setInterval(() => {
      setAnalysisStep(prev => (prev < ANALYSIS_STEPS.length - 1 ? prev + 1 : prev));
    }, 800);

    try {
      const base64Data = image.split(',')[1];
      const mimeType = image.split(';')[0].split(':')[1];

      const prompt = `Analyze this image and identify ALL human actions being performed. 
      For each person detected, provide:
      - action: A concise name of their primary action (e.g., "Running", "Cooking", "Typing").
      - confidence: An estimated percentage (e.g., "95.2%").
      - description: A brief one-sentence description of what this specific person is doing.
      - interaction: Identify WHAT the subject is interacting with. If it's an object, name the object (e.g., "Laptop", "Coffee Mug"). If the subject is interacting with another person detected in the image, state "Interacting with Subject [ID]" or "Human-to-Human Contact". If no clear interaction, state "None".
      - interactionBox: The normalized coordinates [ymin, xmin, ymax, xmax] (0-1000) of the target the subject is interacting with. If no interaction, provide [0,0,0,0].
      - details: An array of 4 key action decomposition markers (body parts/movements) indicating the action. Each object must have:
          - label: String description (e.g., "Extended Arm", "Bent Knee").
          - score: Confidence score (0-100).
          - box: Normalized [ymin, xmin, ymax, xmax] coordinates (0-1000) for the specific body part or area involved.
      - boundingBox: The normalized coordinates [ymin, xmin, ymax, xmax] of the person, as integers from 0 to 1000.
      
      Provide your response in JSON format with a key "humans" containing an array of these objects.
      Respond only with the JSON object.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { data: base64Data, mimeType } }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json"
        }
      });

      const text = response.text;
      if (text) {
        clearInterval(stepInterval);
        setAnalysisStep(ANALYSIS_STEPS.length); // All steps complete
        const parsed = JSON.parse(text) as AnalysisResult;
        setResult(parsed);
        setSelectedHumanIdx(0);
        // Add to history
        setHistory(prev => [{
          image,
          humans: parsed.humans,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }, ...prev].slice(0, 10));
      } else {
        throw new Error("Empty response from AI");
      }
    } catch (err) {
      clearInterval(stepInterval);
      console.error("Analysis failed:", err);
      setError("Failed to analyze image. Please try again with a clearer picture.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const reset = () => {
    setImage(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const restoreSession = (item: HistoryItem) => {
    setImage(item.image);
    setResult({
      humans: item.humans
    });
    setSelectedHumanIdx(0);
    setError(null);
  };

  return (
    <div className="flex flex-col h-screen bg-bg-deep text-text-main font-sans selection:bg-accent-blue/30 selection:text-white overflow-hidden">
      {/* Header */}
      <header className="h-16 border-b border-border-dark flex items-center justify-between px-8 bg-bg-surface shrink-0 z-10 transition-colors">
        <div className="flex items-center gap-2 text-lg font-bold tracking-tighter">
          <div className="w-6 h-6 bg-accent-blue rounded flex items-center justify-center">
            <Activity className="w-4 h-4 text-white" />
          </div>
          <span className="text-text-main uppercase">Action<span className="text-accent-blue">lens</span></span>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono text-text-dim uppercase">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isAnalyzing ? 'bg-accent-blue animate-pulse' : 'bg-emerald-500'}`} />
            {isAnalyzing ? 'Processing' : 'Standby'}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-[280px_1fr_300px]">
        {/* Left Sidebar: Recent Sessions */}
        <aside className="hidden md:flex flex-col border-r border-border-dark p-6 overflow-y-auto gap-8">
          <div>
            <h3 className="text-[11px] uppercase tracking-[0.15em] text-text-dim mb-6 font-semibold">Recent Sessions</h3>
            <div className="flex flex-col gap-4">
              <AnimatePresence mode="popLayout">
                {history.length > 0 ? history.map((item, idx) => (
                  <motion.div 
                    key={idx}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    onClick={() => restoreSession(item)}
                    className={`group bg-bg-surface border ${result?.humans[0]?.action === item.humans[0]?.action && image === item.image ? 'border-accent-blue' : 'border-border-dark'} rounded-lg p-3 flex gap-4 items-center cursor-pointer hover:border-accent-blue/50 transition-colors`}
                  >
                    <div className="w-10 h-10 rounded bg-[#1a1a1e] overflow-hidden shrink-0 border border-border-dark">
                      <img src={item.image} alt="" className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-opacity" referrerPolicy="no-referrer" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-[13px] font-medium truncate capitalize">{item.humans[0]?.action || 'Detection'}</h4>
                      <div className="text-[11px] text-text-dim flex items-center gap-1">
                        <span>{item.humans.length} subject{item.humans.length !== 1 ? 's' : ''}</span>
                        <span className="opacity-30">•</span>
                        <span>{item.timestamp}</span>
                      </div>
                    </div>
                  </motion.div>
                )) : (
                  <div className="text-center py-8 opacity-20 flex flex-col items-center gap-2">
                    <History className="w-8 h-8" />
                    <span className="text-[10px] uppercase tracking-widest font-mono">No sessions found</span>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="mt-auto">
            <h3 className="text-[11px] uppercase tracking-[0.15em] text-text-dim mb-4 font-semibold">Detection Engine</h3>
            <div className="font-mono text-[11px] text-text-dim leading-relaxed opacity-60">
              <p>TensorFlow.js Backend</p>
              <p>ResNet-152 v3.1</p>
              <p>Gemini Mulimodal-L</p>
            </div>
          </div>
        </aside>

        {/* Center View: Analyzer */}
        <section className="relative flex flex-col items-center justify-center p-8 bg-[radial-gradient(circle_at_center,#111115_0%,#0a0a0b_100%)] overflow-y-auto">
          <div className="w-full max-w-xl flex flex-col items-center gap-8">
            <div 
              className={`relative w-full ${!image ? 'aspect-[4/3]' : 'min-h-[200px]'} bg-bg-surface rounded-2xl border transition-all duration-500 overflow-hidden ${
                image 
                  ? 'border-border-dark shadow-[0_0_40px_rgba(0,0,0,0.5)]' 
                  : (isDragging ? 'border-accent-blue bg-accent-blue/5 scale-[1.02]' : 'border-dashed border-border-dark')
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <AnimatePresence mode="wait">
                {!image ? (
                  <motion.div 
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-full flex flex-col items-center justify-center cursor-pointer hover:bg-white/[0.02] group transition-colors"
                  >
                    {/* Placeholder Grid pattern */}
                    <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'linear-gradient(45deg, #fff 25%, transparent 25%, transparent 50%, #fff 50%, #fff 75%, transparent 75%, transparent 100%)', backgroundSize: '40px 40px' }} />
                    
                    <div className="relative w-16 h-16 rounded-xl border border-border-dark flex items-center justify-center mb-4 group-hover:border-accent-blue/50 group-hover:bg-accent-blue/10 transition-all">
                      <Upload className="w-6 h-6 text-text-dim group-hover:text-accent-blue transition-colors" />
                    </div>
                    <div className="text-center px-6">
                      <h3 className="text-lg font-medium mb-1">Inference Initialization</h3>
                      <p className="text-sm text-text-dim font-mono uppercase tracking-widest opacity-60">Drop image or click to browse</p>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="active"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="relative w-full group overflow-hidden"
                  >
                    <img src={image} className="w-full block h-auto" alt="Source" referrerPolicy="no-referrer" />
                    
                    {/* Bounding Boxes */}
                    {!isAnalyzing && result?.humans.map((human, idx) => {
                      if (!human.boundingBox) return null;
                      const [ymin, xmin, ymax, xmax] = human.boundingBox;
                      const isSelected = selectedHumanIdx === idx;
                      
                      return (
                        <div key={idx}>
                          {/* Main Human Box */}
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className={`absolute border-2 transition-all duration-300 ${isSelected ? 'border-accent-blue bg-accent-blue/5 shadow-[0_0_20px_rgba(59,130,246,0.3)] z-10' : 'border-white/20 bg-white/5 opacity-40 hover:opacity-100 z-0'}`}
                            style={{
                              top: `${ymin / 10}%`,
                              left: `${xmin / 10}%`,
                              width: `${(xmax - xmin) / 10}%`,
                              height: `${(ymax - ymin) / 10}%`,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedHumanIdx(idx);
                            }}
                          >
                            <div className={`absolute -top-6 left-0 px-2 py-0.5 text-[9px] font-mono whitespace-nowrap uppercase tracking-widest ${isSelected ? 'bg-accent-blue text-white' : 'bg-black/60 text-white/70'}`}>
                              ID_0{idx + 1} // {human.action}
                            </div>
                          </motion.div>

                          {/* Interaction Box (Contact Target) */}
                          {isSelected && human.interactionBox && !human.interactionBox.every(v => v === 0) && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="absolute border-2 border-orange-500 bg-orange-500/10 shadow-[0_0_20px_rgba(249,115,22,0.4)] z-10 pointer-events-none"
                              style={{
                                top: `${human.interactionBox[0] / 10}%`,
                                left: `${human.interactionBox[1] / 10}%`,
                                width: `${(human.interactionBox[3] - human.interactionBox[1]) / 10}%`,
                                height: `${(human.interactionBox[2] - human.interactionBox[0]) / 10}%`,
                              }}
                            >
                              <div className="absolute -top-6 left-0 px-2 py-0.5 text-[9px] font-mono bg-orange-500 text-white whitespace-nowrap uppercase tracking-widest flex items-center gap-1">
                                <Link2 className="w-3 h-3" /> LINK: {human.interaction}
                              </div>
                            </motion.div>
                          )}

                          {/* Action Decomposition Boxes (only for selected human on hover) */}
                          {isSelected && human.details.map((detail, dIdx) => {
                            if (!detail.box || hoveredDetailIdx !== dIdx) return null;
                            const [dYmin, dXmin, dYmax, dXmax] = detail.box;
                            return (
                              <motion.div
                                key={`detail-${idx}-${dIdx}`}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="absolute border border-dashed border-accent-blue bg-accent-blue/20 shadow-[0_0_15px_rgba(59,130,246,0.5)] pointer-events-none z-20"
                                style={{
                                  top: `${dYmin / 10}%`,
                                  left: `${dXmin / 10}%`,
                                  width: `${(dXmax - dXmin) / 10}%`,
                                  height: `${(dYmax - dYmin) / 10}%`,
                                }}
                              >
                                <div className="absolute -bottom-5 left-0 text-[10px] font-mono text-accent-blue uppercase font-bold bg-bg-deep/80 px-2 py-0.5 border border-accent-blue/30 backdrop-blur-sm whitespace-nowrap shadow-xl">
                                  {detail.label} ({Math.round(detail.score * 100)}%)
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      );
                    })}
                    
                    {/* Scanning Animation */}
                    {isAnalyzing && (
                      <>
                        <div className="scanning-line" />
                        <div className="absolute inset-0 bg-accent-blue/10 pointer-events-none animate-pulse" />
                        
                        {/* Progress Checklist Overlay */}
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="absolute inset-0 flex items-center justify-center z-30"
                        >
                          <div className="w-64 bg-bg-surface/90 border border-accent-blue/30 backdrop-blur-md rounded-xl p-5 shadow-2xl">
                            <h4 className="text-[10px] font-mono font-bold text-accent-blue uppercase tracking-widest mb-4 flex items-center gap-2">
                              <Search className="w-3 h-3 animate-pulse" /> Analysis Sequence
                            </h4>
                            <div className="space-y-3">
                              {ANALYSIS_STEPS.map((step, idx) => {
                                const isCompleted = analysisStep > idx;
                                const isCurrent = analysisStep === idx;
                                return (
                                  <div key={idx} className="flex items-center gap-3">
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${isCompleted ? 'bg-accent-blue border-accent-blue' : isCurrent ? 'border-accent-blue animate-pulse' : 'border-border-dark'}`}>
                                      {isCompleted && <div className="w-2 h-2 bg-white rounded-full scale-75" />}
                                    </div>
                                    <span className={`text-[10px] font-mono transition-colors ${isCompleted ? 'text-white' : isCurrent ? 'text-accent-blue' : 'text-text-dim'}`}>
                                      {isCompleted ? '[DONE] ' : isCurrent ? '[BUSY] ' : '[WAIT] '}
                                      {step}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </motion.div>
                      </>
                    )}

                    {/* HUD metadata */}
                    <div className="absolute bottom-6 left-6 font-mono text-[10px] text-text-dim uppercase tracking-widest flex flex-col gap-1 pointer-events-none drop-shadow-lg">
                      <div className="flex gap-4">
                        <span>Buffer: 0x82A1B</span>
                        <span>Res: 1024x768</span>
                      </div>
                      <div className="flex gap-4">
                        <span>Enc: Multimodal-V</span>
                        <span>S-RATE: 48KHZ</span>
                      </div>
                    </div>

                    {/* Quick reset float */}
                    {!isAnalyzing && (
                      <button 
                        onClick={reset}
                        className="absolute top-6 right-6 p-2 rounded-lg bg-bg-surface/80 border border-border-dark text-white backdrop-blur shadow-xl hover:bg-bg-surface transition-all"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleImageUpload} accept="image/*" />
            </div>

            <div className="flex flex-col items-center gap-6 w-full">
              <div className="flex gap-4 w-full">
                <button 
                  onClick={() => !image ? fileInputRef.current?.click() : analyzeAction()}
                  disabled={isAnalyzing || (image && isAnalyzing)}
                  className={`flex-1 flex items-center justify-center gap-3 h-14 rounded-xl font-bold uppercase tracking-widest text-sm transition-all transform active:scale-[0.98] ${
                    !image 
                      ? 'bg-bg-surface border border-border-dark text-text-main hover:border-accent-blue/50' 
                      : 'bg-accent-blue text-white shadow-[0_0_20px_rgba(59,130,246,0.2)] hover:bg-blue-600'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isAnalyzing ? (
                    <motion.div 
                      animate={{ rotate: 360 }} 
                      transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                    >
                      <Search className="w-5 h-5 text-white" />
                    </motion.div>
                  ) : image ? (
                    <>
                      <Wand2 className="w-5 h-5" />
                      Execute Inference
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5" />
                      Select Target
                    </>
                  )}
                </button>
                <button 
                  className="w-14 h-14 flex items-center justify-center rounded-xl bg-bg-surface border border-border-dark hover:border-text-dim transition-colors group"
                  title="Initialize Camera"
                >
                  <Camera className="w-6 h-6 text-text-dim group-hover:text-text-main transition-colors" />
                </button>
              </div>

              <AnimatePresence>
                {error && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs font-mono uppercase tracking-widest flex items-center gap-3 w-full"
                  >
                    <Info className="w-4 h-4 shrink-0" />
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </section>

        {/* Right Pane: Inference Details */}
        <aside className="relative border-l border-border-dark bg-bg-surface p-6 flex flex-col gap-10 overflow-y-auto">
          <div className="shrink-0">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-[11px] uppercase tracking-[0.15em] text-text-dim font-semibold">Inference Result</h3>
              {result && result.humans.length > 1 && (
                <div className="flex gap-1">
                  {result.humans.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedHumanIdx(i)}
                      className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center transition-all ${selectedHumanIdx === i ? 'bg-accent-blue text-white' : 'bg-bg-deep text-text-dim border border-border-dark'}`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            <AnimatePresence mode="wait">
              {result ? (
                <motion.div 
                  key={selectedHumanIdx}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-bg-deep border border-border-dark rounded-xl p-6 text-center shadow-lg"
                >
                  <div className="text-[10px] text-text-dim uppercase tracking-[0.2em] mb-3">
                    Subject {selectedHumanIdx + 1} // Detector {selectedHumanIdx + 1}
                  </div>
                  <div className="text-3xl font-light text-accent-blue tracking-tight leading-none mb-4 capitalize">
                    {result.humans[selectedHumanIdx].action}
                  </div>
                  
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded-full text-[10px] font-bold border border-emerald-500/20 mb-6">
                    <div className="w-1.5 h-1.5 rounded-full bg-current" />
                    MATCH CONFIRMED
                  </div>

                  <div className="space-y-2">
                    <div className="h-1.5 bg-bg-surface rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: result.humans[selectedHumanIdx].confidence }}
                        className="h-full bg-accent-blue"
                      />
                    </div>
                    <div className="flex justify-between text-[10px] font-mono text-text-dim uppercase">
                      <span>Inference Metric</span>
                      <span>{result.humans[selectedHumanIdx].confidence}</span>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="aspect-video bg-bg-deep/50 border border-border-dark border-dashed rounded-xl flex items-center justify-center opacity-30">
                  <span className="text-[10px] uppercase font-mono tracking-widest">Waiting for input</span>
                </div>
              )}
            </AnimatePresence>
          </div>

          <div className="shrink-0">
            <h3 className="text-[11px] uppercase tracking-[0.15em] text-text-dim mb-6 font-semibold">Subject Connectivity</h3>
            <AnimatePresence mode="wait">
              {result ? (
                <motion.div 
                  key={`interaction-${selectedHumanIdx}`}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-bg-deep border border-border-dark rounded-xl p-4 flex items-center gap-4 hover:border-accent-blue/30 transition-colors"
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${result.humans[selectedHumanIdx].interaction?.toLowerCase().includes('human') || result.humans[selectedHumanIdx].interaction?.toLowerCase().includes('subject') ? 'bg-accent-blue/20 text-accent-blue' : 'bg-white/5 text-text-dim'}`}>
                    {result.humans[selectedHumanIdx].interaction?.toLowerCase().includes('human') || result.humans[selectedHumanIdx].interaction?.toLowerCase().includes('subject') ? (
                      <Users className="w-5 h-5" />
                    ) : (
                      <Link2 className="w-5 h-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[9px] font-mono text-text-dim uppercase tracking-widest mb-0.5">Contact Target</div>
                    <div className="text-[13px] font-medium text-white truncate capitalize">
                      {result.humans[selectedHumanIdx].interaction || 'Environmental Interaction'}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="h-20 bg-bg-deep/50 border border-border-dark border-dashed rounded-xl flex items-center justify-center opacity-30">
                  <span className="text-[10px] uppercase font-mono tracking-widest">Awaiting Link Data</span>
                </div>
              )}
            </AnimatePresence>
          </div>

          <div className="shrink-0">
            <h3 className="text-[11px] uppercase tracking-[0.15em] text-text-dim mb-6 font-semibold">Action Decomposition</h3>
            <div className="space-y-4 font-mono text-[11px] text-text-dim leading-relaxed">
              <AnimatePresence mode="wait">
                {result ? (
                  result.humans[selectedHumanIdx].details.map((detail, idx) => (
                    <motion.div 
                      key={`${selectedHumanIdx}-${idx}`}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      onMouseEnter={() => setHoveredDetailIdx(idx)}
                      onMouseLeave={() => setHoveredDetailIdx(null)}
                      className={`flex items-start gap-3 border-l-2 p-2 rounded-r-lg transition-all cursor-crosshair ${hoveredDetailIdx === idx ? 'border-accent-blue bg-accent-blue/10 translate-x-1' : 'border-border-dark hover:border-accent-blue/30'}`}
                    >
                      <span className="text-accent-blue/60">{idx + 1}.</span>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-white">{detail.label}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1 bg-border-dark rounded-full overflow-hidden">
                            <div className="h-full bg-accent-blue/40" style={{ width: `${detail.score}%` }} />
                          </div>
                          <span className="text-[9px] opacity-40">{detail.score.toFixed(0)}%</span>
                        </div>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="opacity-20 flex flex-col gap-3">
                    <div className="h-2 w-full bg-border-dark rounded animate-pulse" />
                    <div className="h-2 w-3/4 bg-border-dark rounded animate-pulse" />
                    <div className="h-2 w-5/6 bg-border-dark rounded animate-pulse" />
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="mt-auto p-5 border border-border-dark rounded-xl bg-bg-deep/20 flex flex-col gap-4">
            <div className="flex items-center gap-2 text-accent-blue">
              <Info className="w-3.5 h-3.5" />
              <span className="text-[11px] font-bold uppercase tracking-widest">System Note</span>
            </div>
            <p className="text-[11px] text-text-dim leading-relaxed">
              Real-time analysis is performed on the primary subject within the frame focus box. Multiple subjects may degrade confidence metrics.
            </p>
          </div>
        </aside>
      </main>

      {/* Mobile view warning or limited accessibility message */}
      <div className="md:hidden fixed inset-0 bg-bg-deep z-[100] flex flex-col items-center justify-center p-8 text-center">
         <Wand2 className="w-12 h-12 text-accent-blue mb-6" />
         <h2 className="text-xl font-bold mb-4">Desktop Optimized Experience</h2>
         <p className="text-text-dim text-sm max-w-xs leading-relaxed">The ActionLens AI Inference Engine requires a wider display for full-grid detailed analysis viewing.</p>
         <button className="mt-8 px-6 py-2 border border-border-dark rounded-lg text-xs uppercase tracking-widest">Connect external monitor</button>
      </div>
    </div>
  );
}
