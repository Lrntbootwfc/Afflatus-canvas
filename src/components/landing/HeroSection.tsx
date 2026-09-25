import React, { useState, useEffect } from 'react';
import {
  ArrowRight,
  Compass,
  Camera,
  ChevronDown,
  Award,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { CreatorProfile } from '../../types';

interface HeroSectionProps {
  onGetStarted: () => void;
  onExploreDemo: () => void;
  currentUser?: CreatorProfile | null;
}

const CINEMATIC_MOMENTS = [
  {
    id: 'moment-1',
    title: 'The North Atlantic Drift',
    creator: 'Marcus Vance',
    role: 'Director of Photography',
    kit: 'ARRI Alexa Mini LF // Cooke Anamorphic /i',
    badge: 'Anamorphic 2.39:1',
    imageUrl:
      'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=1600&auto=format&fit=crop&q=80',
    fps: '24.000 fps',
    focal: '50mm T1.4',
    shutter: '180.0°',
  },
  {
    id: 'moment-2',
    title: 'Echoes in the Pine Forest',
    creator: 'Elena Rostova',
    role: 'Production Sound Recordist',
    kit: 'Sound Devices 833 // Schoeps CMC641 Colette',
    badge: 'Spatial Foley 96kHz/24bit',
    imageUrl:
      'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1600&auto=format&fit=crop&q=80',
    fps: 'Live Record',
    focal: 'Stereo Pair',
    shutter: 'Analog Saturation',
  },
  {
    id: 'moment-3',
    title: 'Nocturne in Kyoto',
    creator: 'Kenji Sato',
    role: 'Lead Colorist & Gaffer',
    kit: 'DaVinci Advanced Panel // Kodak Vision3 5207 LUT',
    badge: '35mm Film Grain Print',
    imageUrl:
      'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1600&auto=format&fit=crop&q=80',
    fps: 'Master Grade',
    focal: 'ACEScc Rec.709',
    shutter: 'Dual ISO 3200',
  },
];

export const HeroSection: React.FC<HeroSectionProps> = ({
  onGetStarted,
  onExploreDemo,
  currentUser,
}) => {
  const [activeMomentIndex, setActiveMomentIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveMomentIndex((prev) => (prev + 1) % CINEMATIC_MOMENTS.length);
    }, 7000);
    return () => clearInterval(timer);
  }, []);

  const currentMoment = CINEMATIC_MOMENTS[activeMomentIndex];

  const handleScrollToExhibition = () => {
    const el = document.getElementById('discovery-exhibition');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="relative w-full min-h-[88vh] lg:min-h-[92vh] flex flex-col justify-between overflow-hidden bg-[#0c0c0c] text-white">
      {/* Background — remote cinematic stills only (no local assets) */}
      <div className="absolute inset-0 z-0 select-none pointer-events-none">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentMoment.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0"
          >
            <img
              src={currentMoment.imageUrl}
              alt={currentMoment.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-center"
            />
            {/* Soft neutral overlays — minimal, not golden luxury */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0c0c0c] via-[#0c0c0c]/55 to-[#0c0c0c]/40" />
            <div className="absolute inset-0 bg-[#0c0c0c]/25" />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Top bar — minimal brand + reel index */}
      <div className="relative z-10 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-5 sm:pt-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
          <span className="text-[11px] font-mono tracking-[0.2em] text-white/70 uppercase">
            Afflatus
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-[10px] font-mono text-white/50">
          <Camera className="w-3 h-3" />
          <span>
            {String(activeMomentIndex + 1).padStart(2, '0')} /{' '}
            {String(CINEMATIC_MOMENTS.length).padStart(2, '0')}
          </span>
        </div>
      </div>

      {/* Center copy */}
      <div className="relative z-10 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 flex-1 flex flex-col justify-center items-center text-center">
        <div className="max-w-3xl mx-auto space-y-3 mb-6 sm:mb-8">
          <p className="text-[11px] font-mono tracking-[0.25em] uppercase text-white/50">
            Creative collaboration
          </p>
          <h1 className="font-editorial text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-medium text-white tracking-tight leading-[1.08]">
            Find your next
            <span className="block mt-1 text-white/90 font-light italic">
              crew &amp; craft
            </span>
          </h1>
        </div>

        <div className="max-w-xl mx-auto mb-8 sm:mb-10 space-y-2">
          <p className="text-xs sm:text-sm text-white/65 leading-relaxed">
            Directors · Cinematographers · Sound · Design · Color
          </p>
          <p className="text-[11px] sm:text-xs text-white/45 leading-relaxed">
            Open briefs, verified talent, and transparent day rates — built for
            film and digital crews.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-md sm:max-w-none">
          <button
            id="hero-book-talent-btn"
            onClick={onGetStarted}
            className="w-full sm:w-auto px-7 py-3 rounded-full bg-white text-[#0c0c0c] font-semibold text-xs sm:text-sm tracking-wide hover:bg-white/90 transition-colors flex items-center justify-center gap-2 group cursor-pointer active:scale-[0.98]"
          >
            <span>
              {currentUser ? 'Open Production Passport' : 'Get started'}
            </span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>

          <button
            id="hero-explore-directory-btn"
            onClick={onExploreDemo}
            className="w-full sm:w-auto px-7 py-3 rounded-full bg-transparent border border-white/25 hover:border-white/50 text-white font-medium text-xs sm:text-sm tracking-wide transition-colors flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
          >
            <Compass className="w-4 h-4 text-white/70" />
            <span>Explore directory</span>
          </button>
        </div>

        {/* Subtle active reel caption */}
        <div className="mt-10 sm:mt-12 max-w-sm mx-auto">
          <p className="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-1">
            Now showing
          </p>
          <p className="text-sm text-white/80 font-medium truncate">
            {currentMoment.title}
          </p>
          <p className="text-[11px] text-white/45 truncate">
            {currentMoment.creator} · {currentMoment.role}
          </p>
        </div>
      </div>

      {/* Bottom: scroll + reel dots */}
      <div className="relative z-10 w-full pb-6 sm:pb-8 flex flex-col items-center justify-center gap-5">
        <div className="flex items-center gap-2">
          {CINEMATIC_MOMENTS.map((m, idx) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setActiveMomentIndex(idx)}
              aria-label={`Reel ${idx + 1}`}
              className={`h-1.5 rounded-full transition-all cursor-pointer ${
                activeMomentIndex === idx
                  ? 'w-6 bg-white'
                  : 'w-1.5 bg-white/35 hover:bg-white/55'
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={handleScrollToExhibition}
          aria-label="Scroll down"
          className="group p-2 text-white/50 hover:text-white transition-colors cursor-pointer flex flex-col items-center gap-0.5"
        >
          <span className="text-[9px] font-mono tracking-widest uppercase opacity-0 group-hover:opacity-100 transition-opacity">
            Explore
          </span>
          <ChevronDown className="w-5 h-5 stroke-[1.5] animate-bounce" />
        </button>

        <div className="flex items-center gap-1.5 text-[10px] font-mono text-white/40">
          <Award className="w-3 h-3" />
          <span>Verified crew roster</span>
        </div>
      </div>
    </section>
  );
};