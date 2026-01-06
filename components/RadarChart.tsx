import React from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import { NutritionalDimension } from '../types';

interface SimpleRadarChartProps {
  data: NutritionalDimension[];
  className?: string;
}

export const SimpleRadarChart: React.FC<SimpleRadarChartProps> = ({ data, className = "w-full h-64" }) => {
  return (
    <div className={`${className} relative`}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
          <PolarGrid stroke="#334155" />
          <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 10 }} />
          <Radar
            name="Nutrient Profile"
            dataKey="A"
            stroke="#10b981"
            strokeWidth={2}
            fill="#10b981"
            fillOpacity={0.3}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};