import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Pipeline steps ───────────────────────────────────────────────────────────

const PIPELINE = [
  { name: 'Case Input', desc: 'Clinical data loaded', icon: '\u{1F4CB}', color: 'text-slate-400' },
  { name: 'Round 1', desc: '3 specialists in parallel', icon: '\u{1FA7A}', color: 'text-cyan-400' },
  { name: 'Observer', desc: 'Real-time bias detection', icon: '\u{1F441}\uFE0F', color: 'text-red-400' },
  { name: 'Round 2', desc: 'Debate with corrections', icon: '\u{1F4AC}', color: 'text-violet-400' },
  { name: 'Synthesis', desc: 'Institutional diagnosis', icon: '\u{1F4CA}', color: 'text-emerald-400' },
  { name: 'Translator', desc: 'Plain language for family', icon: '\u{1F48C}', color: 'text-blue-400' },
  { name: 'Amender', desc: 'Constitution evolves', icon: '\u{1F4DC}', color: 'text-amber-400' },
];

// ── Why Opus 4.6 ─────────────────────────────────────────────────────────────

const OPUS_FEATURES = [
  {
    icon: '\u{1F9E0}',
    title: '1M Context Window',
    detail: 'Holds 12 years of fragmented medical records: 4 MRI reports, EEG results, lab values, notes from 8 providers across 3 states, the full Clinical Constitution, and all debate rounds simultaneously. Opus 4.6 achieves 76% MRCR (long-context reliability) vs Sonnet\u2019s 18.5%.',
  },
  {
    icon: '\u{1F4AD}',
    title: 'Max Effort Thinking',
    detail: 'The Metacognitive Observer uses 32,000 thinking tokens for deep reasoning analysis. This \u201Cthinking about thinking\u201D mode is exclusive to Opus 4.6. It returns an error on every other Claude model.',
  },
  {
    icon: '\u26A1',
    title: '128K Output Tokens',
    detail: 'The Patient Translator generated a 94-line empathetic letter to Eli\u2019s mother. The Constitution Amender produced 6 detailed amendments with rationale. Both in single generations, enabled by Opus 4.6\u2019s doubled output capacity.',
  },
  {
    icon: '\u{1F504}',
    title: 'Parallel Agent Execution',
    detail: 'Three specialist agents analyze simultaneously via asyncio, writing structured output to a shared file system. The Metacognitive Observer then reads all outputs in a single pass, only possible with a context window large enough to hold three full specialist analyses plus the original case.',
  },
];

// ── Capability cards ─────────────────────────────────────────────────────────

const CAPABILITIES = [
  {
    title: 'Extended Thinking',
    summary: 'Opus 4.6\u2019s adaptive thinking enables deep diagnostic reasoning. Each specialist engages in structured clinical analysis before producing output.',
    icon: '\u{1F9E0}',
    expanded: 'Opus 4.6\u2019s \u201Cmax effort\u201D thinking mode allocates up to 32,000 thinking tokens to the Metacognitive Observer, enabling deep analysis of reasoning patterns across all three specialists simultaneously. The Observer doesn\u2019t just check if the answer is right; it examines HOW the specialists are thinking, looking for systematic errors in reasoning. This \u201Cthinking about thinking\u201D capability is exclusive to Opus 4.6 and returns an error on all other Claude models.',
  },
  {
    title: 'Parallel Execution',
    summary: 'Three specialists analyze simultaneously via asyncio. The Metacognitive Observer monitors all reasoning chains for cognitive errors in real-time.',
    icon: '\u26A1',
    expanded: 'Three specialists run simultaneously via Python asyncio and the Anthropic SDK. Each specialist receives the complete 12-year medical record (patient demographics, developmental timeline across 5 age ranges, 4 MRI reports, EEG results, lab values, and notes from 8 providers) plus the Clinical Constitution, all held in Opus 4.6\u2019s 1-million-token context window. They analyze independently and write structured JSON output to a shared file system. This mirrors real multidisciplinary team (MDT) meetings: independent analysis before group discussion prevents premature consensus.',
  },
  {
    title: 'Self-Governing',
    summary: 'The institution operates under a living constitution. After each case, the system proposes its own amendments \u2014 no human tunes it.',
    icon: '\u{1F3DB}\uFE0F',
    expanded: 'The Clinical Constitution is a living document that governs institutional reasoning, like a hospital\u2019s clinical protocols, but one that rewrites itself. After each case, the Constitution Amender agent reads the Observer\u2019s bias reports and the final diagnosis, then proposes specific rule changes. In Eli\u2019s case, it generated 6 amendments including the Regression Override Protocol: \u201CWhen a child with ASD shows loss of previously acquired skills, neurodegenerative conditions must be investigated.\u201D These amendments are applied automatically. Over multiple cases, the institution\u2019s diagnostic protocols evolve without human intervention.',
  },
  {
    title: 'Bias Detection',
    summary: 'Anchoring, premature closure, confirmation bias, bandwagon effects. The Observer catches what human doctors miss about their own reasoning.',
    icon: '\u{1F6E1}\uFE0F',
    expanded: 'The Observer uses Opus 4.6\u2019s max-effort extended thinking to identify 6 categories of cognitive bias, the same thinking errors documented in medical literature as root causes of diagnostic failure:\n\n\u2022 Anchoring: Fixating on the first diagnosis (ASD at age 3.5) despite contradicting evidence\n\u2022 Premature Closure: Stopping the diagnostic search once a plausible answer is found\n\u2022 Confirmation Bias: Interpreting new evidence to support the existing diagnosis\n\u2022 Diagnostic Momentum: Each new provider accepting the prior label without independent evaluation\n\u2022 Availability Bias: Favoring common conditions (ASD: 1 in 36) over rare ones (NCL: 1 in 100,000)\n\u2022 Bandwagon Effect: Specialists converging on consensus without independent reasoning\n\nIn Eli\u2019s case, the Observer detected 7 biases in Round 1 and reduced them to 4 in Round 2 through targeted intervention.',
  },
];

// ── Bias cards ───────────────────────────────────────────────────────────────

const BIASES = [
  {
    name: 'Anchoring',
    summary: 'Fixating on the first diagnosis (ASD) despite contradicting evidence',
    expanded: 'In Eli\u2019s case: The ASD diagnosis at age 3.5 anchored every subsequent provider for 10 years. Each new doctor saw \u201CASD\u201D in the chart and interpreted all symptoms through that lens: hand-wringing became \u201Cstimming,\u201D seizures became \u201Cunusual movements,\u201D and regression became \u201Cbehavioral.\u201D The Observer flagged this in Round 1 when specialists referenced the prior ASD diagnosis as given rather than questioning it independently.',
  },
  {
    name: 'Premature Closure',
    summary: 'Stopping the search once a plausible answer is found',
    expanded: 'In Eli\u2019s case: Once autism was diagnosed, the diagnostic search stopped. No provider asked \u201Cwhat else could this be?\u201D even as Eli lost the ability to walk, speak, and care for himself. The Observer detected this when specialists in Round 1 showed high confidence (0.72\u20130.78) despite incomplete evidence evaluation.',
  },
  {
    name: 'Confirmation Bias',
    summary: 'Seeking evidence that supports the initial hypothesis',
    expanded: 'In Eli\u2019s case: Providers consistently interpreted new symptoms as consistent with autism rather than evidence against it. Motor regression was attributed to \u201Canxiety,\u201D seizure-like episodes were called \u201Cunusual movements common in ASD,\u201D and progressive cerebellar atrophy on MRI was initially read as \u201Cnormal variant.\u201D The Observer caught this when the developmental pediatrician cited 10 evidence points that were equally consistent with both mitochondrial disease and NCL.',
  },
  {
    name: 'Diagnostic Momentum',
    summary: 'Accepting a prior label without independent verification',
    expanded: 'In Eli\u2019s case: Every new provider (across 3 states) accepted the ASD label from the prior provider without independent verification. The diagnosis traveled with Eli like a passport stamp that no one questioned. The Observer\u2019s Round 1 analysis flagged that no specialist independently evaluated whether the original ASD criteria were actually met.',
  },
  {
    name: 'Availability Bias',
    summary: 'Favoring common conditions over rare ones (ASD >> NCL)',
    expanded: 'In Eli\u2019s case: ASD affects 1 in 36 children. Every pediatrician sees it regularly. NCL affects 1 in 100,000. Most doctors never see a single case. When faced with a child showing developmental differences, the statistically common diagnosis was the one that came to mind first. The Observer noted this when the geneticist was the only specialist to initially consider NCL, and even then with low confidence (0.40).',
  },
  {
    name: 'Bandwagon Effect',
    summary: 'Converging on consensus without independent reasoning',
    expanded: 'In Eli\u2019s case: In Round 1, when two of three specialists favored mitochondrial disease, the Observer flagged the risk that the third would follow without independent justification. In Round 2, all three converged on NCL. The Observer again flagged this convergence, noting that the independence score dropped and requiring each specialist to document what specific evidence drove their individual shift.',
  },
];

// ── Expandable card component ────────────────────────────────────────────────

function ExpandableCard({ children, expandedContent, isOpen, onToggle, className = '' }) {
  return (
    <div
      className={`rounded-xl transition-colors duration-200 cursor-pointer ${className}`}
      onClick={onToggle}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">{children}</div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex-none mt-1 text-slate-600"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
          </svg>
        </motion.div>
      </div>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="pt-3 mt-3 border-t border-slate-800/50">
              {expandedContent}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function HowItWorks() {
  const [openCap, setOpenCap] = useState(null);
  const [openBias, setOpenBias] = useState(null);

  return (
    <section className="py-20 md:py-28 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="text-cyan-400 text-xs tracking-[0.3em] uppercase mb-4 font-medium">Architecture</p>
          <h2 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">How It Works</h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto font-light">
            A self-governing diagnostic institution built on Claude Opus 4.6
          </p>
        </motion.div>

        {/* ── Pipeline diagram ──────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mb-20"
        >
          <div className="flex flex-wrap justify-center items-center gap-2 md:gap-3">
            {PIPELINE.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="flex items-center gap-2 md:gap-3"
              >
                <div className="bg-slate-900/70 border border-slate-800/60 rounded-lg px-3 py-3 md:px-4 md:py-4 text-center min-w-[90px] md:min-w-[110px]">
                  <div className="text-xl md:text-2xl mb-1">{step.icon}</div>
                  <div className={`text-xs font-semibold ${step.color}`}>{step.name}</div>
                  <div className="text-[9px] text-slate-600 mt-0.5 leading-tight">{step.desc}</div>
                </div>
                {i < PIPELINE.length - 1 && (
                  <svg className="w-4 h-4 text-slate-700 flex-none hidden md:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* ── Why Opus 4.6 ──────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-20"
        >
          <div className="relative rounded-2xl p-[1px] bg-gradient-to-br from-cyan-500/40 via-violet-500/20 to-emerald-500/40">
            <div className="rounded-2xl bg-slate-950 p-6 md:p-8">
              <h3 className="text-center text-lg md:text-xl font-bold text-slate-100 mb-2">
                Why This Only Works with Opus 4.6
              </h3>
              <p className="text-center text-xs text-slate-500 mb-8 max-w-lg mx-auto">
                Every component of the institution depends on capabilities unique to Opus 4.6
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {OPUS_FEATURES.map((feat, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08 }}
                    className="bg-slate-900/60 border border-slate-800/40 rounded-xl p-4"
                  >
                    <div className="flex items-center gap-2.5 mb-2.5">
                      <span className="text-xl">{feat.icon}</span>
                      <h4 className="text-sm font-semibold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-violet-300">
                        {feat.title}
                      </h4>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{feat.detail}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── Expandable Capability cards ────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-20"
        >
          <h3 className="text-center text-sm text-slate-500 uppercase tracking-[0.2em] mb-8 font-medium">
            Core Capabilities
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {CAPABILITIES.map((cap, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
              >
                <ExpandableCard
                  isOpen={openCap === i}
                  onToggle={() => setOpenCap(openCap === i ? null : i)}
                  className={`p-5 border transition-all duration-200 ${
                    openCap === i
                      ? 'bg-slate-900/70 border-cyan-500/20'
                      : 'bg-slate-900/40 border-slate-800/50 hover:border-slate-700/60'
                  }`}
                  expandedContent={
                    <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                      {cap.expanded}
                    </p>
                  }
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xl">{cap.icon}</span>
                    <h4 className="text-sm font-semibold text-slate-200">{cap.title}</h4>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{cap.summary}</p>
                </ExpandableCard>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* ── Expandable Bias cards ──────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-16"
        >
          <h3 className="text-center text-sm text-slate-500 uppercase tracking-[0.2em] mb-3 font-medium">
            Cognitive Biases Detected
          </h3>
          <p className="text-center text-xs text-slate-600 mb-8 max-w-lg mx-auto">
            Click any bias to see how it appeared in Eli&rsquo;s case and how the Observer caught it
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {BIASES.map((bias, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
              >
                <ExpandableCard
                  isOpen={openBias === i}
                  onToggle={() => setOpenBias(openBias === i ? null : i)}
                  className={`p-3.5 border transition-all duration-200 ${
                    openBias === i
                      ? 'bg-red-500/[0.06] border-red-500/25'
                      : 'bg-red-500/[0.03] border-red-500/10 hover:border-red-500/20'
                  }`}
                  expandedContent={
                    <p className="text-[11px] text-slate-400 leading-relaxed">{bias.expanded}</p>
                  }
                >
                  <div className="text-xs font-semibold text-red-400 mb-1">{bias.name}</div>
                  <div className="text-[10px] text-slate-500 leading-relaxed">{bias.summary}</div>
                </ExpandableCard>
              </motion.div>
            ))}
          </div>
        </motion.div>

      </div>
    </section>
  );
}
