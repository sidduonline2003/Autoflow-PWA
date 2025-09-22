import React from 'react';

// A lightweight circular progress ring using pure SVG
// Props: { percent: number, size?: number }
export default function ProgressRing({ percent = 0, size = 36, stroke = 4, color = '#1976d2', trackColor = '#e0e0e0', title }) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (p / 100) * circumference;
  const rest = circumference - dash;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Progress ${p}%`} title={title || `Progress ${p}%`}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={trackColor}
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={`${dash} ${rest}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
