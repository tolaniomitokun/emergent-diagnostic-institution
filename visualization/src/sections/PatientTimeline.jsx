import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

const periodColors = [
  { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', dot: 'bg-emerald-400' },
  { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20', dot: 'bg-yellow-400' },
  { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20', dot: 'bg-orange-400' },
  { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20', dot: 'bg-red-400' },
  { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20', dot: 'bg-rose-400' },
];

export default function PatientTimeline({ timeline, patient, caseTitle }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <section ref={ref} className="py-20 md:py-28 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="text-cyan-400 text-xs tracking-[0.3em] uppercase mb-4 font-medium">The Patient</p>
          {caseTitle && (
            <p className="text-2xl md:text-3xl font-bold mb-3 tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-violet-400">
              {caseTitle}
            </p>
          )}
          <h2 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
            Patient&rsquo;s Story
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto font-light">
            {caseTitle
              ? 'Each card is an age range: what doctors saw, what they diagnosed, and what they missed.'
              : 'The clinical history as presented to the institution.'}
          </p>
        </motion.div>

        {/* Timeline track */}
        <div className="relative">
          {/* Horizontal line */}
          <div className="hidden md:block absolute top-[52px] left-0 right-0 h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent z-0" />

          {/* Cards container */}
          <div className="flex overflow-x-auto gap-5 pb-6 snap-x snap-mandatory scrollbar-hide px-2">
            {timeline?.map((period, i) => {
              const color = periodColors[i] || periodColors[0];
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 30 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.15 * i }}
                  className="flex-none w-[300px] md:w-[320px] snap-center"
                >
                  {/* Timeline dot */}
                  <div className="hidden md:flex justify-center mb-4">
                    <div className="relative">
                      <div className={`w-3 h-3 rounded-full ${color.dot} z-10 relative`} />
                      <div className={`absolute inset-0 w-3 h-3 rounded-full ${color.dot} opacity-40 animate-ping`} />
                    </div>
                  </div>

                  {/* Card */}
                  <div className={`bg-slate-900/70 border ${color.border} rounded-xl p-5 backdrop-blur-sm h-full flex flex-col`}>
                    {/* Age badge */}
                    <div className={`inline-flex self-start px-3 py-1 rounded-full ${color.bg} ${color.text} text-sm font-semibold mb-4`}>
                      Age {period.age_range}
                    </div>

                    {/* Observations */}
                    <div className="mb-4 flex-1">
                      <h4 className="text-[10px] uppercase tracking-widest text-slate-500 mb-2 font-semibold">
                        Observations
                      </h4>
                      <ul className="space-y-1.5">
                        {period.observations?.slice(0, 4).map((obs, j) => (
                          <li key={j} className="text-sm text-slate-300 leading-snug flex gap-2">
                            <span className="text-slate-600 flex-none mt-0.5">&bull;</span>
                            <span>{obs}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Diagnoses given */}
                    {period.diagnoses_given?.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-[10px] uppercase tracking-widest text-slate-500 mb-2 font-semibold">
                          Diagnosed As
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {period.diagnoses_given.map((dx, j) => (
                            <span
                              key={j}
                              className="inline-block px-2.5 py-1 bg-yellow-400/10 text-yellow-400 text-xs rounded-md font-medium"
                            >
                              {dx}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Critical miss */}
                    <div className="pt-3 mt-auto border-t border-slate-800/60">
                      <h4 className="text-[10px] uppercase tracking-widest text-red-400/80 mb-1.5 font-semibold flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                        What Was Missed
                      </h4>
                      <p className="text-sm text-red-300/70 leading-relaxed">{period.critical_miss}</p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Scroll hint for mobile */}
          <div className="md:hidden text-center mt-2">
            <span className="text-slate-600 text-xs">Swipe to see more &rarr;</span>
          </div>
        </div>
      </div>
    </section>
  );
}
