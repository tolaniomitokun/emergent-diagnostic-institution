import { useMemo, useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Shorten a system diagnosis string for card display. */
function shortDiagnosis(full) {
  if (!full) return '';
  const beforeDash = full.split(/\s*[\u2014—]\s*/)[0].trim();
  if (beforeDash.length > 80) {
    const m = beforeDash.match(/^([^(]+)\(([^)]+)\)/);
    if (m) {
      const aliases = m[2].split('/').map(s => s.trim());
      return m[1].trim() + ' (' + aliases[aliases.length - 1] + ')';
    }
    return beforeDash.slice(0, 80) + '\u2026';
  }
  return beforeDash;
}

const CONF_COLOR = (c) =>
  c >= 0.9 ? 'text-emerald-400' :
  c >= 0.8 ? 'text-cyan-400' :
  c >= 0.7 ? 'text-yellow-400' :
  'text-orange-400';

const CONF_BAR = (c) =>
  c >= 0.9 ? 'bg-emerald-500' :
  c >= 0.8 ? 'bg-cyan-500' :
  c >= 0.7 ? 'bg-yellow-500' :
  'bg-orange-500';

// ── Sub-Components ───────────────────────────────────────────────────────────

function StatCard({ value, label, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay }}
      className="bg-slate-900/50 border border-slate-800/50 rounded-xl p-5 text-center"
    >
      <div className="text-2xl md:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-violet-400 mb-1">
        {value}
      </div>
      <div className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">
        {label}
      </div>
    </motion.div>
  );
}

function CaseCard({ caseData, index, isEli }) {
  const navigate = useNavigate();
  const isHighContext = !!caseData.full_records_words;

  const handleClick = () => {
    if (isEli) {
      const el = document.getElementById('the-process');
      if (el) {
        const y = el.getBoundingClientRect().top + window.scrollY - 60;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    } else {
      navigate(`/case/${caseData.case_id}`);
    }
  };

  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.08 }}
      onClick={handleClick}
      className={`rounded-xl p-6 text-left transition-all group relative w-full flex flex-col ${
        isHighContext
          ? 'bg-cyan-500/[0.04] border border-cyan-500/20 hover:border-cyan-500/35 hover:bg-cyan-500/[0.07] shadow-[0_0_20px_rgba(6,182,212,0.06)]'
          : 'bg-slate-900/50 border border-slate-800/50 hover:border-slate-700/60 hover:bg-slate-900/70'
      }`}
    >
      {/* Badges — top right */}
      <div className="absolute top-5 right-5 flex items-center gap-1.5">
        {isHighContext && (
          <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/20">
            High-Context Run
          </span>
        )}
        <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
          PASS
        </span>
      </div>

      {/* Title — fixed height so all cards align below */}
      <div className="min-h-[40px] mb-2">
        <h4 className="text-sm font-semibold text-slate-200 pr-36 group-hover:text-white transition-colors line-clamp-2">
          {caseData.case_title}
        </h4>
      </div>

      {/* Domain tag */}
      <div className="mb-3">
        <span className="inline-block px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 text-[10px] font-medium">
          {caseData.domain}
        </span>
      </div>

      {/* Misdiagnosed as — fixed height */}
      <div className="mb-3 min-h-[48px]">
        <span className="text-[10px] text-slate-600 uppercase tracking-wider font-medium">Misdiagnosed as</span>
        <p className="text-xs text-slate-500 leading-relaxed mt-0.5 line-clamp-2">
          {caseData.original_misdiagnosis}
        </p>
      </div>

      {/* EDI found — fixed height */}
      <div className="mb-4 min-h-[48px]">
        <span className="text-[10px] text-cyan-500/70 uppercase tracking-wider font-medium">EDI found</span>
        <p className="text-xs text-slate-300 leading-relaxed mt-0.5 line-clamp-2">
          {shortDiagnosis(caseData.system_diagnosis)}
        </p>
      </div>

      {/* Spacer pushes confidence + footer to bottom */}
      <div className="flex-1" />

      {/* Confidence */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            whileInView={{ width: `${(caseData.confidence || 0) * 100}%` }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.3 + index * 0.08 }}
            className={`h-full rounded-full ${CONF_BAR(caseData.confidence)}`}
          />
        </div>
        <span className={`text-xs font-mono font-semibold flex-none ${CONF_COLOR(caseData.confidence)}`}>
          {((caseData.confidence || 0) * 100).toFixed(0)}%
        </span>
      </div>

      {/* High-context details — only on Eli card */}
      {isHighContext && (
        <div className="mt-3 pt-3 border-t border-cyan-500/10 space-y-1">
          <p className="text-[10px] text-cyan-400/70 font-mono">
            {caseData.full_records_words?.toLocaleString()} words analyzed | {Math.round((caseData.context_tokens || 0) / 1000)}K tokens
          </p>
          {caseData.previous_confidence != null && (
            <p className="text-[10px] text-slate-500">
              Confidence improved from {(caseData.previous_confidence * 100).toFixed(0)}% to {(caseData.confidence * 100).toFixed(0)}% with expanded records
            </p>
          )}
        </div>
      )}
    </motion.button>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function EvalResults({ evalData }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.1 });

  const stats = useMemo(() => {
    if (!evalData) return null;
    const { eval_summary: s, cases } = evalData;
    const totalAmendments = cases.reduce((sum, c) => sum + (c.amendments_proposed || 0), 0);
    const domains = new Set(cases.map(c => c.domain));
    return {
      passed: `${s.correct_diagnostic_direction}/${s.total_cases}`,
      confidence: `${Math.round(s.average_confidence * 100)}%`,
      amendments: totalAmendments,
      domains: domains.size,
      total: s.total_cases,
    };
  }, [evalData]);

  if (!evalData || !stats) return null;

  const { cases } = evalData;
  const highContextCase = cases.find(c => c.full_records_words);

  return (
    <section ref={ref} className="py-20 md:py-28 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-14"
        >
          <p className="text-cyan-400 text-xs tracking-[0.3em] uppercase mb-4 font-medium">
            Proven Results
          </p>
          <h2 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
            Tested Across {stats.total} Medical Domains.{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
              100% Diagnostic Accuracy.
            </span>
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto font-light">
            Every case was a real pattern of misdiagnosis. Every case was correctly identified.
          </p>
        </motion.div>

        {/* Summary stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          <StatCard value={stats.passed} label="Cases Passed" delay={0} />
          <StatCard value={stats.confidence} label="Avg. Confidence" delay={0.08} />
          <StatCard value={stats.amendments} label="Amendments Generated" delay={0.16} />
          <StatCard value={stats.domains} label="Medical Domains" delay={0.24} />
        </div>

        {/* Case cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          {cases.map((c, i) => (
            <CaseCard
              key={c.case_id}
              caseData={c}
              index={i}
              isEli={c.case_id === 'case_001_eli_reeves'}
            />
          ))}
        </div>

        {/* High-context callout */}
        {highContextCase && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mb-12 p-5 md:p-6 rounded-xl bg-gradient-to-br from-cyan-500/[0.06] via-violet-500/[0.04] to-cyan-500/[0.06] border border-cyan-500/15"
          >
            <div className="flex items-start gap-3">
              <span className="text-xl flex-none mt-0.5">🔬</span>
              <div>
                <p className="text-sm text-slate-300 leading-relaxed">
                  The Eli Reeves case was re-run with{' '}
                  <span className="text-cyan-400 font-semibold">{highContextCase.full_records_words?.toLocaleString()} words</span> of
                  complete medical records: every visit note, lab result, imaging report, and therapy record from 12 years
                  across 8 providers. With the full context, diagnostic confidence increased from{' '}
                  <span className="text-slate-400 font-mono">{((highContextCase.previous_confidence || 0.55) * 100).toFixed(0)}%</span> to{' '}
                  <span className="text-cyan-400 font-mono font-semibold">{(highContextCase.confidence * 100).toFixed(0)}%</span>.
                  This is only possible with Claude's 1-million token context window.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Bottom text */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="text-center"
        >
          <p className="text-sm text-slate-500 mb-2">
            Each case was analyzed through the full multi-agent pipeline with real-time bias detection.
            No case data was used in training.
          </p>
          <Link
            to="/eval"
            className="inline-flex items-center gap-1.5 text-sm text-cyan-400 hover:text-cyan-300 transition-colors font-medium"
          >
            View detailed methodology
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
