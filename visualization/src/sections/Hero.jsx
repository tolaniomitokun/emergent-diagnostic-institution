import { motion } from 'framer-motion';

const stats = [
  { value: '30M', label: 'Americans with rare diseases', source: 'NIH' },
  { value: '795K', label: 'Harmed by misdiagnosis yearly', source: 'Johns Hopkins' },
  { value: '8', label: 'Average doctors before diagnosis', source: 'NORD' },
];

export default function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-grid">
      {/* Radial gradient overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(6,182,212,0.08)_0%,transparent_70%)]" />

      <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
        {/* Institution badge */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/5 mb-10"
        >
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-cyan-400 text-xs tracking-[0.25em] uppercase font-medium">
            The Emergent Diagnostic Institution
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6 leading-[0.95]"
        >
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-violet-400">
            Every Missed Diagnosis Is a Life Measured in Years Lost
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="text-lg md:text-xl text-slate-400 mb-16 max-w-3xl mx-auto leading-relaxed font-light"
        >
          Behind every statistic is a family that was told &ldquo;there is nothing we can do,&rdquo;
          a record no one ever read, and an answer that didn&rsquo;t have to come too late.
          With AI, no family has to fight alone, no record goes unread, and no patient waits
          years for an answer that could save their life.
        </motion.p>

        {/* Stats bar */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="grid grid-cols-3 gap-4 md:gap-6 max-w-3xl mx-auto"
        >
          {stats.map((stat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.9 + i * 0.15 }}
              className="relative p-5 md:p-6 rounded-xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm"
            >
              <div className="text-3xl md:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-b from-cyan-300 to-cyan-500 mb-1">
                {stat.value}
              </div>
              <div className="text-xs md:text-sm text-slate-400 leading-tight">{stat.label}</div>
              <div className="text-[10px] text-slate-600 mt-1">{stat.source}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.8 }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="flex flex-col items-center gap-2 text-slate-600"
        >
          <span className="text-xs tracking-widest uppercase">Scroll</span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
          </svg>
        </motion.div>
      </motion.div>
    </section>
  );
}
