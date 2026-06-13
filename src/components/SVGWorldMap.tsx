import React, { useState } from 'react';
import { Globe, Users, HeartPulse, Sliders, ShieldAlert, CheckCircle } from 'lucide-react';
import { SimulationResult } from '../types';

// Simple high-fidelity geometric representations of the world for our vector map
interface SVGWorldMapProps {
  result: SimulationResult;
  selectedRegion: 'Americas' | 'Europe' | 'Asia-Pacific' | 'Africa & ME' | 'All';
  onRegionSelect: (region: 'Americas' | 'Europe' | 'Asia-Pacific' | 'Africa & ME' | 'All') => void;
  mentionedRegion?: string;
}

export const SVGWorldMap: React.FC<SVGWorldMapProps> = ({
  result,
  selectedRegion,
  onRegionSelect,
  mentionedRegion
}) => {
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);

  // Region parameters & multipliers to simulate spatial variation
  const getRegionStats = (rName: string) => {
    let multiplier = 1.0;
    let label = rName;
    let iconColor = 'text-indigo-400';
    let baseBedCapacity = 50000;

    switch (rName) {
      case 'Americas':
        multiplier = 1.25;
        iconColor = 'text-rose-400';
        baseBedCapacity = 45000;
        break;
      case 'Europe':
        multiplier = 0.95;
        iconColor = 'text-blue-400';
        baseBedCapacity = 40000;
        break;
      case 'Asia-Pacific':
        multiplier = 1.5;
        iconColor = 'text-amber-400';
        baseBedCapacity = 60000;
        break;
      case 'Africa & ME':
        multiplier = 0.75;
        iconColor = 'text-emerald-400';
        baseBedCapacity = 15000;
        break;
      default:
        multiplier = 1.0;
    }

    const peakLoad = Math.round(result.peakCases * 0.25 * multiplier);
    const bedDemand = Math.round(result.hospitalPeakBeds * 0.25 * multiplier);
    const rt = (result.rEffective * (0.85 + multiplier * 0.15)).toFixed(2);
    const capacityRatio = Math.min(100, Math.round((bedDemand / baseBedCapacity) * 100));

    return {
      peakLoad,
      bedDemand,
      bedCapacity: baseBedCapacity,
      rt,
      capacityRatio,
      label,
      iconColor
    };
  };

  const activeStats = getRegionStats(selectedRegion === 'All' ? 'Asia-Pacific' : selectedRegion);

  // Highlight color based on the Active Region Rt
  const getRegionHeatColor = (rName: string, isHovered: boolean, isSelected: boolean) => {
    const stats = getRegionStats(rName);
    const rtValue = parseFloat(stats.rt);

    if (isSelected || (selectedRegion === 'All')) {
      if (rtValue > 1.8) return isHovered ? 'fill-rose-500/40 stroke-rose-400' : 'fill-rose-500/25 stroke-rose-400/60';
      if (rtValue > 1.2) return isHovered ? 'fill-amber-500/40 stroke-amber-400' : 'fill-amber-500/25 stroke-amber-400/60';
      return isHovered ? 'fill-emerald-500/40 stroke-emerald-400' : 'fill-emerald-500/25 stroke-emerald-400/60';
    }

    // Unselected regions when one specific region is active
    return isHovered ? 'fill-indigo-500/20 stroke-indigo-400/45' : 'fill-white/5 stroke-white/10';
  };

  return (
    <div className="bg-[#0b0f19]/80 backdrop-blur-3xl border border-white/10 rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
      {/* Map Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-white/10 pb-3 gap-2">
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-indigo-400 animate-spin-slow" />
          <div>
            <h4 className="text-xs font-black tracking-widest text-slate-200 uppercase">
              {selectedRegion === 'All' ? 'GLOBAL EPIDEMIC VECTORS' : `${selectedRegion.toUpperCase()} OUTBREAK SECTOR`}
            </h4>
            <p className="text-[10px] text-white/40 font-mono">
              {mentionedRegion ? `Auto-linked from response: ${mentionedRegion}` : 'Global view: click regions or tabs below'}
            </p>
          </div>
        </div>

        {/* Region Selector Control Pills */}
        <div className="flex flex-wrap gap-1.5 bg-white/5 p-1 rounded-xl border border-white/5">
          {(['All', 'Americas', 'Europe', 'Asia-Pacific', 'Africa & ME'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onRegionSelect(r)}
              className={`px-2 py-1 rounded-lg text-[9px] font-mono font-bold transition-all uppercase cursor-pointer ${
                selectedRegion === r
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-white/40 hover:text-white hover:bg-white/5'
              }`}
            >
              {r === 'All' ? '🌎 Globe' : r}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive SVG World Map Viewport */}
      <div className="relative bg-black/45 border border-white/5 rounded-2xl overflow-hidden p-2 flex items-center justify-center min-h-[190px]">
        <svg
          viewBox="0 0 1000 480"
          className="w-full h-auto max-h-[240px] select-none transition-all"
        >
          {/* DEFINITIONS FOR GLOW/SHADOW EFFECTS */}
          <defs>
            <filter id="glow-rt" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* REGION 1: AMERICAS */}
          <g
            className="cursor-pointer transition-all duration-300"
            onClick={() => onRegionSelect('Americas')}
            onMouseEnter={() => setHoveredRegion('Americas')}
            onMouseLeave={() => setHoveredRegion(null)}
          >
            {/* North America */}
            <path
              d="M 100 40 L 220 40 L 280 180 L 190 230 L 160 210 L 150 250 L 110 220 Z"
              className={`transition-all duration-300 ${getRegionHeatColor('Americas', hoveredRegion === 'Americas', selectedRegion === 'Americas')}`}
              strokeWidth="2"
            />
            {/* South America */}
            <path
              d="M 190 230 L 250 270 L 280 340 L 220 440 L 190 440 L 170 320 Z"
              className={`transition-all duration-300 ${getRegionHeatColor('Americas', hoveredRegion === 'Americas', selectedRegion === 'Americas')}`}
              strokeWidth="2"
            />
            {/* Caribbean / Central Connection Line */}
            <path d="M 160 210 Q 185 220 190 230" stroke="rgba(255,255,255,0.15)" strokeDasharray="2 2" />
          </g>

          {/* REGION 2: EUROPE */}
          <g
            className="cursor-pointer transition-all duration-300"
            onClick={() => onRegionSelect('Europe')}
            onMouseEnter={() => setHoveredRegion('Europe')}
            onMouseLeave={() => setHoveredRegion(null)}
          >
            {/* Western & Eastern Europe + Scandinavia + Russia West */}
            <path
              d="M 390 30 L 460 25 L 530 40 L 550 140 L 480 200 L 410 180 L 370 120 Z"
              className={`transition-all duration-300 ${getRegionHeatColor('Europe', hoveredRegion === 'Europe', selectedRegion === 'Europe')}`}
              strokeWidth="2"
            />
          </g>

          {/* REGION 3: AFRICA & MIDDLE EAST */}
          <g
            className="cursor-pointer transition-all duration-300"
            onClick={() => onRegionSelect('Africa & ME')}
            onMouseEnter={() => setHoveredRegion('Africa & ME')}
            onMouseLeave={() => setHoveredRegion(null)}
          >
            {/* Africa + Saudi Arabia/Gulf */}
            <path
              d="M 400 195 L 480 200 L 530 220 L 580 270 L 550 310 L 520 430 L 450 350 L 380 280 Z"
              className={`transition-all duration-300 ${getRegionHeatColor('Africa & ME', hoveredRegion === 'Africa & ME', selectedRegion === 'Africa & ME')}`}
              strokeWidth="2"
            />
            {/* Madagascar */}
            <path
              d="M 570 360 L 590 370 L 580 400 L 560 380 Z"
              className={`transition-all duration-300 ${getRegionHeatColor('Africa & ME', hoveredRegion === 'Africa & ME', selectedRegion === 'Africa & ME')}`}
              strokeWidth="2"
            />
          </g>

          {/* REGION 4: ASIA-PACIFIC */}
          <g
            className="cursor-pointer transition-all duration-300"
            onClick={() => onRegionSelect('Asia-Pacific')}
            onMouseEnter={() => setHoveredRegion('Asia-Pacific')}
            onMouseLeave={() => setHoveredRegion(null)}
          >
            {/* China + Russia East + India */}
            <path
              d="M 530 40 L 780 50 L 850 150 L 760 280 L 620 280 L 540 185 Z"
              className={`transition-all duration-300 ${getRegionHeatColor('Asia-Pacific', hoveredRegion === 'Asia-Pacific', selectedRegion === 'Asia-Pacific')}`}
              strokeWidth="2"
            />
            {/* Japan */}
            <path
              d="M 830 110 L 855 120 L 845 150 L 820 130 Z"
              className={`transition-all duration-300 ${getRegionHeatColor('Asia-Pacific', hoveredRegion === 'Asia-Pacific', selectedRegion === 'Asia-Pacific')}`}
              strokeWidth="2"
            />
            {/* Southeastern Islands */}
            <path
              d="M 740 290 L 820 310 L 800 340 L 710 320 Z"
              className={`transition-all duration-300 ${getRegionHeatColor('Asia-Pacific', hoveredRegion === 'Asia-Pacific', selectedRegion === 'Asia-Pacific')}`}
              strokeWidth="2"
            />
            {/* Australia */}
            <path
              d="M 720 360 L 870 350 L 920 420 L 830 450 L 740 430 Z"
              className={`transition-all duration-300 ${getRegionHeatColor('Asia-Pacific', hoveredRegion === 'Asia-Pacific', selectedRegion === 'Asia-Pacific')}`}
              strokeWidth="2"
            />
            {/* New Zealand */}
            <path
              d="M 910 440 L 940 450 L 920 480 M 930 430 Q 940 450 930 470"
              className={`transition-all duration-300 ${getRegionHeatColor('Asia-Pacific', hoveredRegion === 'Asia-Pacific', selectedRegion === 'Asia-Pacific')}`}
              strokeWidth="2"
            />
          </g>

          {/* DYNAMIC CASELOAD HOTSPOT RIPPLE PULSES */}
          {/* Americas Pulse */}
          {(selectedRegion === 'All' || selectedRegion === 'Americas') && (
            <g transform="translate(180, 160)">
              <circle r="25" className="fill-rose-500/10 animate-ping" />
              <circle r="8" className="fill-rose-500 stroke-white stroke-2 shadow" />
            </g>
          )}

          {/* Europe Pulse */}
          {(selectedRegion === 'All' || selectedRegion === 'Europe') && (
            <g transform="translate(460, 110)">
              <circle r="20" className="fill-indigo-500/10 animate-ping" />
              <circle r="7" className="fill-indigo-400 stroke-white stroke-2 shadow" />
            </g>
          )}

          {/* Africa & Middle East Pulse */}
          {(selectedRegion === 'All' || selectedRegion === 'Africa & ME') && (
            <g transform="translate(470, 270)">
              <circle r="15" className="fill-emerald-500/15 animate-ping" />
              <circle r="6" className="fill-emerald-400 stroke-white stroke-2 shadow" />
            </g>
          )}

          {/* Asia-Pacific Pulses (Two hotspots: India/Asia mainland and Australia) */}
          {(selectedRegion === 'All' || selectedRegion === 'Asia-Pacific') && (
            <>
              <g transform="translate(680, 180)">
                <circle r="30" className="fill-amber-500/10 animate-ping" />
                <circle r="9" className="fill-amber-500 stroke-white stroke-2 shadow" />
              </g>
              <g transform="translate(810, 390)">
                <circle r="12" className="fill-amber-500/10" />
                <circle r="4" className="fill-amber-400 stroke-white/80 stroke-1" />
              </g>
            </>
          )}
        </svg>

        {/* Floating Quick Region Spec Panel */}
        <div className="absolute right-3.5 bottom-3.5 bg-slate-950/85 backdrop-blur-xl p-2.5 rounded-xl border border-white/10 text-[10px] space-y-1 w-[130px] shadow-lg pointer-events-none">
          <span className="font-extrabold text-[9px] text-indigo-400 tracking-wider block uppercase font-mono">
            🛰️ Regional Spot
          </span>
          <div className="flex justify-between items-center text-white/50">
            <span>Sector Rt:</span>
            <span className="font-bold text-white font-mono">{activeStats.rt}</span>
          </div>
          <div className="flex justify-between items-center text-white/50">
            <span>Peak Cases:</span>
            <span className="font-bold text-indigo-300 font-mono">
              {activeStats.peakLoad >= 1000000 ? `${(activeStats.peakLoad/1000000).toFixed(1)}M` : `${Math.round(activeStats.peakLoad/1000)}k`}
            </span>
          </div>
        </div>

        {/* Hover label overlay */}
        {hoveredRegion && (
          <div className="absolute top-2 left-2.5 bg-indigo-950/90 text-indigo-300 border border-indigo-500/30 text-[10.5px] font-bold font-mono px-2 py-1 rounded-lg shadow uppercase tracking-wide">
            📍 Sector: {hoveredRegion}
          </div>
        )}
      </div>

      {/* Stats Indicators Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white/5 border border-white/5 p-3 rounded-xl flex flex-col justify-between">
          <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest block">Local Sector Rt</span>
          <span className="text-sm font-extrabold text-white mt-1 flex items-center gap-1">
            <Sliders className="w-3.5 h-3.5 text-indigo-400" />
            {activeStats.rt}
          </span>
        </div>

        <div className="bg-white/5 border border-white/5 p-3 rounded-xl flex flex-col justify-between">
          <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest block">Sector Peak Cases</span>
          <span className="text-sm font-extrabold text-rose-400 mt-1 flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            {activeStats.peakLoad.toLocaleString()}
          </span>
        </div>

        <div className="bg-white/5 border border-white/5 p-3 rounded-xl flex flex-col justify-between">
          <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest block">Required Beds Peak</span>
          <span className="text-sm font-extrabold text-indigo-300 mt-1 flex items-center gap-1">
            <HeartPulse className="w-3.5 h-3.5" />
            {activeStats.bedDemand.toLocaleString()}
          </span>
        </div>

        <div className="bg-white/5 border border-white/5 p-3 rounded-xl flex flex-col">
          <div className="flex justify-between items-center text-[9px] font-bold text-white/30 uppercase tracking-widest">
            <span>ICU Bed Burden</span>
            <span className={activeStats.capacityRatio > 80 ? 'text-rose-400 font-mono' : 'text-emerald-400 font-mono'}>
              {activeStats.capacityRatio}%
            </span>
          </div>
          <div className="w-full bg-white/5 rounded-full h-1.5 mt-2.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                activeStats.capacityRatio > 80 ? 'bg-rose-500' : 'bg-indigo-500'
              }`}
              style={{ width: `${activeStats.capacityRatio}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
