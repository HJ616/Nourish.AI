import React, { useEffect, useState } from 'react';
import { BrainCircuit, Loader2 } from 'lucide-react';

const steps = [
  "Scanning ingredient labels...",
  "Identifying obscure additives...",
  "Consulting nutritional databases...",
  "Inferring health impact...",
  "Synthesizing insights..."
];

export const ThinkingIndicator: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep((prev) => (prev + 1) % steps.length);
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center space-y-6 p-8 animate-pulse">
      <div className="relative">
        <div className="absolute -inset-4 bg-emerald-500/20 rounded-full blur-xl animate-pulse"></div>
        <BrainCircuit size={64} className="text-emerald-400 relative z-10" />
      </div>
      <div className="text-center space-y-2">
        <h3 className="text-xl font-medium text-white tracking-wide">Reasoning</h3>
        <p className="text-slate-400 font-light text-sm h-6">
          {steps[currentStep]}
        </p>
      </div>
    </div>
  );
};
