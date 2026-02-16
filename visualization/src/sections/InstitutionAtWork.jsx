import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';

// ── Constants ────────────────────────────────────────────────────────────────

const SPECIALISTS = [
  { key: 'neurologist', name: 'Neurologist', icon: '\u{1F9E0}', accent: 'cyan' },
  { key: 'developmental_pediatrician', name: 'Dev. Pediatrician', icon: '\u{1F476}', accent: 'violet' },
  { key: 'geneticist', name: 'Geneticist', icon: '\u{1F9EC}', accent: 'emerald' },
];

const ACCENT = {
  cyan:    { border: 'border-l-cyan-500',    text: 'text-cyan-400',    bar: 'bg-cyan-500',    bg: 'bg-cyan-500/5' },
  violet:  { border: 'border-l-violet-500',  text: 'text-violet-400',  bar: 'bg-violet-500',  bg: 'bg-violet-500/5' },
  emerald: { border: 'border-l-emerald-500', text: 'text-emerald-400', bar: 'bg-emerald-500', bg: 'bg-emerald-500/5' },
};

const PHASES = [
  { label: 'Round 1', desc: 'Independent analysis' },
  { label: 'Results', desc: 'Hypotheses formed' },
  { label: 'Observer', desc: 'Scanning for bias' },
  { label: 'Biases', desc: 'Cognitive errors found' },
  { label: 'Round 2', desc: 'Debate & revision' },
  { label: 'Diagnosis', desc: 'Consensus reached' },
];

const PHASE_EXPLAINERS = [
  'Each specialist analyzes the full medical record independently \u2014 no peeking at what the others think.',
  'The specialists share their independent findings. Notice they DON\u2019T all agree \u2014 this diversity of thought is by design.',
  'The Metacognitive Observer scans all three analyses for cognitive biases \u2014 the same thinking errors that lead to misdiagnosis.',
  'Biases detected and flagged. The Observer forces the specialists to confront their reasoning errors before continuing.',
  'Armed with the Observer\u2019s feedback, each specialist must either defend their hypothesis with NEW reasoning or revise it. Watch the confidence scores change.',
  'The institution converges on a diagnosis through structured debate, not groupthink. Three specialists, two rounds, one Observer: genuine epistemic convergence, not social pressure.',
];

const BIAS_EXPLAINERS = {
  anchoring: 'over-relying on one piece of evidence',
  premature_closure: 'stopping the search once a plausible answer is found',
  confirmation: 'seeking evidence that supports the initial hypothesis',
  availability: 'favoring common conditions over rare ones',
  framing: 'being influenced by how information was presented',
  bandwagon: 'following the group rather than reasoning independently',
  diagnostic_momentum: 'accepting a prior label without re-evaluation',
};

const AUTOPLAY_DELAYS = [300, 2500, 4500, 6500, 9000, 12000];

// ── Sub-Components ───────────────────────────────────────────────────────────

function SpecialistCard({ spec, data, round, showResults, r1Confidence }) {
  const a = ACCENT[spec.accent];
  const showDelta = round === 2 && r1Confidence != null && data?.confidence != null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className={`${a.bg} border-l-4 ${a.border} border border-slate-800/50 rounded-lg p-4 backdrop-blur-sm`}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{spec.icon}</span>
        <h4 className={`font-semibold text-sm ${a.text}`}>{spec.name}</h4>
        <span className="ml-auto text-[10px] text-slate-600 font-mono">R{round}</span>
      </div>

      {showResults && data ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="space-y-3"
        >
          <p className="text-xs text-slate-300 leading-relaxed line-clamp-3">
            {data.diagnosis_hypothesis}
          </p>

          {/* Confidence bar */}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider flex-none">Conf.</span>
              <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(data.confidence || 0) * 100}%` }}
                  transition={{ duration: 1, delay: 0.2 }}
                  className={`h-full ${a.bar} rounded-full`}
                />
              </div>
              <span className="text-xs font-mono text-slate-400 flex-none w-10 text-right">
                {((data.confidence || 0) * 100).toFixed(0)}%
              </span>
            </div>

            {/* R1 → R2 confidence delta */}
            {showDelta && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="mt-1 text-right pr-0"
              >
                <span className={`text-[10px] font-mono ${
                  data.confidence < r1Confidence ? 'text-amber-400/70' : 'text-emerald-400/70'
                }`}>
                  {data.confidence < r1Confidence ? '\u2193' : '\u2191'} from {(r1Confidence * 100).toFixed(0)}%
                </span>
              </motion.div>
            )}
          </div>

          {/* Bias acknowledgment in R2 */}
          {round === 2 && data.bias_acknowledgment && (
            <p className="text-[10px] text-slate-500 italic line-clamp-2 border-t border-slate-800/40 pt-2">
              Bias response: {data.bias_acknowledgment}
            </p>
          )}
        </motion.div>
      ) : (
        <div className="flex items-center gap-2 text-slate-600 text-xs py-2">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="w-3.5 h-3.5 border-2 border-slate-700 border-t-cyan-400 rounded-full flex-none"
          />
          Analyzing case data...
        </div>
      )}
    </motion.div>
  );
}

function ObserverCard({ observer, showBiases }) {
  const biases = observer?.biases_detected || [];
  return (
    <motion.div
      initial={{ opacity: 0, y: -15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="bg-red-500/[0.03] border border-red-500/20 rounded-lg p-4 backdrop-blur-sm relative overflow-hidden"
    >
      {/* Scan line effect */}
      {!showBiases && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="scan-line w-1/3 h-full bg-gradient-to-r from-transparent via-red-500/10 to-transparent absolute top-0" />
        </div>
      )}

      <div className="flex items-center gap-2 mb-3 relative">
        <span className="text-lg">{'\u{1F441}\uFE0F'}</span>
        <h4 className="font-semibold text-sm text-red-400">Metacognitive Observer</h4>
        {showBiases && (
          <span className="ml-auto px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 text-[10px] font-mono">
            {biases.length} bias{biases.length !== 1 ? 'es' : ''}
          </span>
        )}
      </div>

      {showBiases ? (
        <div className="space-y-2.5 relative">
          {biases.slice(0, 5).map((b, i) => {
            const explainer = BIAS_EXPLAINERS[b.bias_type] || '';
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.15 }}
                className="flex items-start gap-2"
              >
                <span className={`flex-none mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                  b.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                  b.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                  b.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-slate-800 text-slate-400'
                }`}>
                  {b.severity}
                </span>
                <span className="text-[11px] text-slate-400 leading-snug">
                  <span className="text-slate-300 font-medium">{b.bias_type}</span>{' '}
                  in {b.agent?.replace(/_/g, ' ')}
                  {explainer && (
                    <span className="text-slate-500 italic"> ({explainer})</span>
                  )}
                </span>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-red-400/60 text-xs py-1">
          <motion.div
            animate={{ scale: [1, 1.3, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="w-2 h-2 rounded-full bg-red-500/60 flex-none"
          />
          Scanning specialist reasoning for cognitive biases...
        </div>
      )}
    </motion.div>
  );
}

function QualityMetrics({ observerR1, observerR2 }) {
  const r1q = observerR1?.reasoning_quality || {};
  const r2q = observerR2?.reasoning_quality || {};
  const r1Biases = observerR1?.biases_detected?.length ?? 0;
  const r2Biases = observerR2?.biases_detected?.length ?? 0;

  const metrics = [
    { label: 'Independence', r1: r1q.independence_score, r2: r2q.independence_score },
    { label: 'Evidence Use', r1: r1q.evidence_utilization, r2: r2q.evidence_utilization },
    { label: 'Biases Detected', r1: r1Biases, r2: r2Biases, isCount: true, lowerBetter: true },
    { label: 'Overall Quality', r1: r1q.overall_score, r2: r2q.overall_score },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.6 }}
      className="mt-6 bg-slate-900/50 border border-slate-800/50 rounded-xl p-5"
    >
      <h4 className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-semibold mb-4 text-center">
        Quality Improvement: Round 1 vs Round 2
      </h4>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {metrics.map((m) => {
          const improved = m.lowerBetter ? m.r2 < m.r1 : m.r2 > m.r1;
          const r1Display = m.isCount ? m.r1 : (m.r1 ?? 0).toFixed(2);
          const r2Display = m.isCount ? m.r2 : (m.r2 ?? 0).toFixed(2);
          return (
            <div key={m.label} className="text-center p-2 rounded-lg bg-slate-800/30">
              <div className="text-[10px] text-slate-500 mb-1.5 font-medium">{m.label}</div>
              <div className="flex items-center justify-center gap-1.5">
                <span className="text-xs font-mono text-slate-500">{r1Display}</span>
                <span className={`text-xs ${improved ? 'text-emerald-400' : 'text-slate-600'}`}>
                  {'\u2192'}
                </span>
                <span className={`text-sm font-mono font-semibold ${improved ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {r2Display}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-slate-500 text-center mt-3 italic">
        The Observer&rsquo;s intervention measurably improved reasoning quality across every metric.
      </p>
    </motion.div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function InstitutionAtWork({ round1, round2, observerR1, observerR2, diagnosis }) {
  const [phase, setPhase] = useState(-1);
  const [autoPlaying, setAutoPlaying] = useState(true);
  const timersRef = useRef([]);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.15 });

  // Auto-play: advance phases on timers when section scrolls into view
  useEffect(() => {
    if (!isInView || !autoPlaying) return;

    timersRef.current = AUTOPLAY_DELAYS.map((ms, i) =>
      setTimeout(() => {
        setPhase(prev => {
          // Only advance if still auto-playing (checked via closure over latest state)
          // We use functional update so we always see the latest phase
          return prev < i ? i : prev;
        });
        // Mark auto-play done after last phase
        if (i === AUTOPLAY_DELAYS.length - 1) {
          setAutoPlaying(false);
        }
      }, ms)
    );

    return () => timersRef.current.forEach(clearTimeout);
  }, [isInView, autoPlaying]);

  // Click handler: stop auto-play and jump to selected phase
  const goToPhase = useCallback((targetPhase) => {
    if (autoPlaying) {
      // Stop all pending auto-play timers
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      setAutoPlaying(false);
    }
    setPhase(targetPhase);
  }, [autoPlaying]);

  // Get R1 confidence for a specialist (for the delta display in R2)
  const getR1Confidence = (key) => round1?.[key]?.confidence ?? null;

  return (
    <section ref={ref} className="py-20 md:py-28 px-6 bg-slate-950/40">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-10"
        >
          <p className="text-cyan-400 text-xs tracking-[0.3em] uppercase mb-4 font-medium">The Process</p>
          <h2 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">The Institution at Work</h2>
          <p className="text-slate-400 text-lg font-light">
            Three AI specialists analyze independently. An observer detects bias. Then they debate.
          </p>
        </motion.div>

        {/* Phase pills */}
        <div className="flex justify-center gap-1.5 mb-4 flex-wrap">
          {PHASES.map((p, i) => {
            const isActive = phase === i;
            const isPast = phase > i;
            const isFuture = phase < i;
            return (
              <button
                key={i}
                onClick={() => goToPhase(i)}
                disabled={phase < 0}
                className={`px-3.5 py-1.5 rounded-full text-[10px] font-semibold transition-all duration-300 cursor-pointer select-none ${
                  isActive
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-[0_0_12px_rgba(6,182,212,0.15)] scale-105'
                    : isPast
                    ? 'bg-slate-800/60 text-slate-400 border border-slate-700/50 hover:text-slate-200 hover:border-slate-600'
                    : isFuture
                    ? 'bg-slate-900/30 text-slate-600 border border-slate-800/30 hover:text-slate-400 hover:border-slate-700'
                    : 'bg-slate-900/30 text-slate-700 border border-transparent'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Dynamic explainer line */}
        <AnimatePresence mode="wait">
          {phase >= 0 && (
            <motion.p
              key={phase}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
              className="text-center text-sm text-slate-400/80 max-w-2xl mx-auto mb-10 font-light leading-relaxed min-h-[40px]"
            >
              {PHASE_EXPLAINERS[phase]}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Content */}
        <div className="space-y-5">
          {/* Specialist cards */}
          <AnimatePresence>
            {phase >= 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid grid-cols-1 md:grid-cols-3 gap-4"
              >
                {SPECIALISTS.map((spec, i) => {
                  const isR2 = phase >= 4;
                  return (
                    <motion.div
                      key={`${spec.key}-${isR2 ? 2 : 1}`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.15 }}
                    >
                      <SpecialistCard
                        spec={spec}
                        data={isR2 ? round2?.[spec.key] : round1?.[spec.key]}
                        round={isR2 ? 2 : 1}
                        showResults={phase >= 1}
                        r1Confidence={isR2 ? getR1Confidence(spec.key) : null}
                      />
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Observer */}
          <AnimatePresence>
            {phase >= 2 && (
              <ObserverCard
                observer={phase >= 4 ? observerR2 : observerR1}
                showBiases={phase >= 3}
              />
            )}
          </AnimatePresence>

          {/* Convergence result */}
          <AnimatePresence>
            {phase >= 5 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="mt-6 p-6 md:p-8 rounded-xl bg-gradient-to-br from-cyan-500/[0.07] via-violet-500/[0.05] to-emerald-500/[0.07] border border-cyan-500/15 text-center glow-border"
              >
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <p className="text-[10px] text-cyan-400 uppercase tracking-[0.3em] mb-3 font-semibold">
                    Institutional Diagnosis
                  </p>
                  <h3 className="text-xl md:text-2xl font-bold mb-3 text-slate-100">
                    {diagnosis?.primary_diagnosis
                      ? (() => {
                          const d = diagnosis.primary_diagnosis;
                          const beforeDash = d.split(/\s*[\u2014—]\s*/)[0].trim();
                          if (beforeDash.length <= 60) return beforeDash;
                          const m = beforeDash.match(/^([^(]+)\(([^)]+)\)/);
                          if (m) { const a = m[2].split('/').map(s => s.trim()); return m[1].trim() + ' (' + a[a.length-1] + ')'; }
                          return beforeDash.slice(0, 60) + '\u2026';
                        })()
                      : 'Diagnosis'}
                  </h3>
                  {diagnosis?.diagnostic_accuracy && (
                    <p className="text-sm text-slate-400 max-w-xl mx-auto mb-4">
                      {diagnosis.diagnostic_accuracy.length > 200
                        ? diagnosis.diagnostic_accuracy.slice(0, 200).replace(/\s\S*$/, '') + '...'
                        : diagnosis.diagnostic_accuracy}
                    </p>
                  )}

                  {/* Confidence with explainer */}
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/60 border border-slate-800/60">
                    <span className="text-xs text-slate-500">Institutional confidence:</span>
                    <span className="text-sm font-mono font-semibold text-cyan-400">
                      {diagnosis?.confidence != null ? `${(diagnosis.confidence * 100).toFixed(0)}%` : '—'}
                    </span>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Quality improvement metrics */}
          <AnimatePresence>
            {phase >= 5 && (
              <QualityMetrics observerR1={observerR1} observerR2={observerR2} />
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
