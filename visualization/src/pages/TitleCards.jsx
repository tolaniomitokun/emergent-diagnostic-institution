import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const CARDS = [
  {
    id: 'quote',
    content: (
      <div className="space-y-8">
        <p className="text-2xl md:text-4xl lg:text-5xl font-light text-slate-200 leading-relaxed italic max-w-3xl">
          &ldquo;Nobody has ever looked at all of this together.&rdquo;
        </p>
        <p className="text-base md:text-lg text-slate-500 font-light">
          &mdash; A mother, after 14 years and 8 doctors
        </p>
      </div>
    ),
  },
  {
    id: 'title',
    content: (
      <div className="space-y-6">
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-violet-400">
          The Emergent Diagnostic Institution
        </h1>
        <p className="text-lg md:text-xl text-slate-400 font-light">
          Built with Claude Opus 4.6
        </p>
        <p className="text-base md:text-lg text-slate-500 font-light">
          by Tolani Omitokun
        </p>
      </div>
    ),
  },
  {
    id: 'disclaimer',
    content: (
      <div className="space-y-4 max-w-2xl">
        <p className="text-sm md:text-base text-slate-500 leading-relaxed font-light">
          Inspired by real diagnostic patterns documented by NORD and the NIH Undiagnosed Diseases Network.
        </p>
        <p className="text-sm md:text-base text-slate-500 leading-relaxed font-light">
          Composite case. No real patients or medical records were used.
        </p>
      </div>
    ),
  },
];

export default function TitleCards() {
  const [current, setCurrent] = useState(0);

  const goNext = useCallback(() => {
    setCurrent(prev => Math.min(prev + 1, CARDS.length - 1));
  }, []);

  const goPrev = useCallback(() => {
    setCurrent(prev => Math.max(prev - 1, 0));
  }, []);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); goNext(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goNext, goPrev]);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8 select-none cursor-default"
         onClick={goNext}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={CARDS[current].id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center"
        >
          {CARDS[current].content}
        </motion.div>
      </AnimatePresence>

      {/* Navigation hint */}
      <div className="fixed bottom-8 left-0 right-0 flex justify-center gap-3">
        {CARDS.map((card, i) => (
          <button
            key={card.id}
            onClick={(e) => { e.stopPropagation(); setCurrent(i); }}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              i === current ? 'bg-white/60 scale-125' : 'bg-white/15 hover:bg-white/30'
            }`}
          />
        ))}
      </div>

      <p className="fixed bottom-3 text-[10px] text-white/10 tracking-wider">
        Arrow keys or click to navigate
      </p>
    </div>
  );
}
