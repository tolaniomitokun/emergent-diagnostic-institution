import { useState, useEffect, useRef } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';

const PREVIEW_COUNT = 2;

const TYPE_COLORS = {
  new_principle: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'NEW' },
  modify_principle: { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'MODIFY' },
  team_change: { bg: 'bg-violet-500/10', text: 'text-violet-400', label: 'TEAM' },
};

function AmendmentCard({ amendment }) {
  const tc = TYPE_COLORS[amendment.type] || TYPE_COLORS.new_principle;
  return (
    <div className="border border-slate-800/40 rounded-lg p-4 bg-slate-900/40">
      <div className="flex items-start gap-3">
        {/* Amendment ID badge */}
        <div className="flex-none w-14 h-14 rounded-lg bg-violet-500/[0.07] border border-violet-500/15 flex flex-col items-center justify-center">
          <span className="text-violet-400 font-mono text-xs font-bold">
            {amendment.amendment_id}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          {/* Tags */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${tc.bg} ${tc.text}`}>
              {tc.label}
            </span>
            <span className="text-[10px] text-slate-600">{amendment.affected_section}</span>
          </div>

          {/* Proposal text */}
          <p className="text-sm text-slate-300 leading-relaxed mb-2">
            {amendment.proposal}
          </p>

          {/* Rationale */}
          <p className="text-[11px] text-slate-500 italic leading-relaxed">
            {amendment.rationale}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function InstitutionLearns({ amendments }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });
  const [visibleCount, setVisibleCount] = useState(0);
  const [showAll, setShowAll] = useState(false);

  const total = amendments?.length || 0;
  const doneTyping = visibleCount >= total;

  useEffect(() => {
    if (!isInView || !total) return;
    const timer = setInterval(() => {
      setVisibleCount(prev => {
        if (prev >= total) {
          clearInterval(timer);
          return prev;
        }
        return prev + 1;
      });
    }, 600);
    return () => clearInterval(timer);
  }, [isInView, total]);

  // Amendments that have "typed in" so far
  const typed = amendments?.slice(0, visibleCount) || [];
  // Always-visible first N amendments
  const displayed = typed.slice(0, PREVIEW_COUNT);
  const hiddenCount = typed.length - PREVIEW_COUNT;

  return (
    <section ref={ref} className="py-20 md:py-28 px-6 bg-slate-950/40">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-14"
        >
          <p className="text-violet-400 text-xs tracking-[0.3em] uppercase mb-4 font-medium">
            Institutional Learning
          </p>
          <h2 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
            The Institution Learns
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto font-light">
            Every case rewrites the constitution. The system evolves its own rules
            so the next family gets answers faster.
          </p>
        </motion.div>

        {/* Constitution document frame */}
        <div className="bg-slate-900/30 border border-slate-800/50 rounded-xl overflow-hidden">
          {/* Document header */}
          <div className="px-5 py-3 border-b border-slate-800/50 flex items-center gap-3">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
            </div>
            <span className="text-[11px] text-slate-500 font-mono">constitution.md</span>
            <span className="ml-auto text-[10px] text-slate-600">
              {total} amendment{total !== 1 ? 's' : ''} proposed
            </span>
          </div>

          {/* Amendments list */}
          <div className="p-5 space-y-3">
            {/* Always-visible first 2 (or fewer if still typing) */}
            {displayed.map((amendment, i) => (
              <motion.div
                key={amendment.amendment_id || i}
                initial={{ opacity: 0, x: -15, height: 0 }}
                animate={{ opacity: 1, x: 0, height: 'auto' }}
                transition={{ duration: 0.4 }}
              >
                <AmendmentCard amendment={amendment} />
              </motion.div>
            ))}

            {/* Expandable remaining amendments */}
            <AnimatePresence initial={false}>
              {showAll && typed.slice(PREVIEW_COUNT).map((amendment, i) => (
                <motion.div
                  key={amendment.amendment_id || (PREVIEW_COUNT + i)}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                >
                  <AmendmentCard amendment={amendment} />
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Typing cursor while amendments are still appearing */}
            {!doneTyping && (
              <div className="flex items-center gap-2 py-2 px-4">
                <motion.span
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                  className="w-2 h-4 bg-violet-400/60"
                />
                <span className="text-xs text-slate-600">Writing amendment...</span>
              </div>
            )}

            {/* Expand/collapse toggle — show once typing has revealed more than PREVIEW_COUNT */}
            {doneTyping && hiddenCount > 0 && (
              <div className="flex justify-center pt-2">
                <button
                  onClick={() => setShowAll(prev => !prev)}
                  className="group flex items-center gap-2 px-4 py-2 rounded-lg border border-violet-500/20 bg-violet-500/[0.04] text-violet-400 text-sm font-medium hover:bg-violet-500/[0.08] hover:border-violet-500/30 transition-colors"
                >
                  {showAll ? (
                    <>
                      Show less
                      <svg className="w-4 h-4 transition-transform group-hover:-translate-y-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 15l7-7 7 7" />
                      </svg>
                    </>
                  ) : (
                    <>
                      View all {total} amendments
                      <svg className="w-4 h-4 transition-transform group-hover:translate-y-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Closing line — always visible once typing is done */}
        {doneTyping && total > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.8 }}
            className="mt-14 text-center"
          >
            <p className="text-2xl md:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-violet-400">
              The next family won&rsquo;t wait 14 years.
            </p>
          </motion.div>
        )}
      </div>
    </section>
  );
}
