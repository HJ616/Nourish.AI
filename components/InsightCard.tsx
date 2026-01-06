import React from 'react';
import { Insight } from '../types';
import { AlertTriangle, CheckCircle, Info, ShieldAlert } from 'lucide-react';

interface InsightCardProps {
  insight: Insight;
  delay?: number;
}

export const InsightCard: React.FC<InsightCardProps> = ({ insight, delay = 0 }) => {
  const getIcon = () => {
    switch (insight.type) {
      case 'positive': return <CheckCircle className="text-emerald-400" size={20} />;
      case 'warning': return <AlertTriangle className="text-amber-400" size={20} />;
      case 'critical': return <ShieldAlert className="text-rose-500" size={20} />;
      default: return <Info className="text-blue-400" size={20} />;
    }
  };

  const getBorderColor = () => {
    switch (insight.type) {
      case 'positive': return 'border-emerald-500/20 bg-emerald-900/10';
      case 'warning': return 'border-amber-500/20 bg-amber-900/10';
      case 'critical': return 'border-rose-500/20 bg-rose-900/10';
      default: return 'border-blue-500/20 bg-blue-900/10';
    }
  };

  return (
    <div 
      className={`p-4 rounded-xl border ${getBorderColor()} backdrop-blur-sm transition-all duration-500 hover:scale-[1.02]`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">{getIcon()}</div>
        <div>
          <h4 className="font-semibold text-slate-100 text-sm mb-1">{insight.title}</h4>
          <p className="text-slate-400 text-xs leading-relaxed">{insight.description}</p>
        </div>
      </div>
    </div>
  );
};
