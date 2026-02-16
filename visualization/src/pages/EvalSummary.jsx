import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Navbar from '../components/Navbar';

const RESULT_COLORS = { PASS: 'emerald', FAIL: 'red', PARTIAL: 'amber', PENDING: 'cyan' };

function StatCard({ label, value, sub, color = 'cyan' }) {
  const colors = {
    cyan: 'border-cyan-500/20 bg-cyan-500/[0.04]',
    emerald: 'border-emerald-500/20 bg-emerald-500/[0.04]',
    amber: 'border-amber-500/20 bg-amber-500/[0.04]',
    violet: 'border-violet-500/20 bg-violet-500/[0.04]',
  };
  const textColors = {
    cyan: 'text-cyan-400',
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    violet: 'text-violet-400',
  };

  return (
    <div className={`rounded-xl border ${colors[color]} p-5`}>
      <p className="text-slate-500 text-[11px] uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold ${textColors[color]}`}>{value}</p>
      {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

function CaseCard({ c, index }) {
  const resultColor = RESULT_COLORS[c.result] || 'cyan';
  const resultBg = {
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    cyan: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  };
  const isPending = c.result === 'PENDING';

  const isHighContext = !!c.full_records_words;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 + index * 0.1 }}
      className={`rounded-xl border overflow-hidden ${
        isHighContext
          ? 'border-cyan-500/20 bg-cyan-500/[0.02]'
          : 'border-slate-800/50 bg-slate-900/40'
      }`}
    >
      {/* Header */}
      <div className="p-6 pb-4 border-b border-slate-800/30">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h3 className="text-lg font-bold text-slate-100">{c.case_title}</h3>
            <p className="text-slate-500 text-xs mt-1">{c.domain} &middot; {c.complexity} complexity</p>
          </div>
          <div className="flex items-center gap-1.5 flex-none">
            {isHighContext && (
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/20">
                High-Context Run
              </span>
            )}
            <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${resultBg[resultColor]}`}>
              {c.result}
            </span>
          </div>
        </div>
        <p className="text-slate-400 text-sm leading-relaxed">{c.patient_summary}</p>
      </div>

      {/* Diagnosis comparison */}
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-1.5">Original Misdiagnosis</p>
            <p className="text-red-400/80 text-sm">{c.original_misdiagnosis}</p>
            <p className="text-slate-600 text-xs mt-1">{c.providers_before_diagnosis} providers over years</p>
          </div>
          <div>
            <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-1.5">Ground Truth</p>
            <p className="text-slate-300 text-sm">{c.correct_diagnosis}</p>
          </div>
        </div>

        {isPending ? (
          <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/[0.03] p-4 text-center">
            <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-cyan-400 text-sm font-medium">Awaiting pipeline run</p>
            <p className="text-slate-500 text-xs mt-1">This case has not been evaluated yet</p>
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] p-4">
              <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-1.5">EDI Diagnosis</p>
              <p className="text-emerald-400 text-sm font-medium">{c.system_diagnosis}</p>
              <p className="text-slate-400 text-xs mt-2 leading-relaxed">{c.diagnostic_accuracy}</p>
            </div>

            {/* Metrics row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border border-slate-800/50 bg-slate-800/20 p-3">
                <p className="text-slate-600 text-[10px] uppercase tracking-wider">Confidence</p>
                <p className="text-cyan-400 text-lg font-bold">{(c.confidence * 100).toFixed(0)}%</p>
              </div>
              <div className="rounded-lg border border-slate-800/50 bg-slate-800/20 p-3">
                <p className="text-slate-600 text-[10px] uppercase tracking-wider">Biases (R1/R2)</p>
                <p className="text-amber-400 text-lg font-bold">{c.biases_detected_r1} <span className="text-slate-600 text-sm">&rarr;</span> {c.biases_detected_r2}</p>
              </div>
              <div className="rounded-lg border border-slate-800/50 bg-slate-800/20 p-3">
                <p className="text-slate-600 text-[10px] uppercase tracking-wider">Amendments</p>
                <p className="text-violet-400 text-lg font-bold">{c.amendments_proposed}</p>
              </div>
              <div className="rounded-lg border border-slate-800/50 bg-slate-800/20 p-3">
                <p className="text-slate-600 text-[10px] uppercase tracking-wider">Run Time</p>
                <p className="text-slate-300 text-lg font-bold">{c.run_time_minutes}m</p>
              </div>
            </div>

            {/* Key biases & amendments */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-2">Key Biases Caught</p>
                <div className="flex flex-wrap gap-1.5">
                  {c.key_biases_caught.map((bias, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full text-[11px] bg-amber-500/10 text-amber-400 border border-amber-500/15">
                      {bias}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-2">Key Amendments</p>
                <div className="flex flex-wrap gap-1.5">
                  {c.key_amendments.map((amend, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full text-[11px] bg-violet-500/10 text-violet-400 border border-violet-500/15">
                      {amend}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

export default function EvalSummary() {
  const [evalData, setEvalData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/data/eval-results.json')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load eval results');
        return res.json();
      })
      .then(data => { setEvalData(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-cyan-400 text-sm tracking-widest uppercase">Loading evaluation data</p>
        </div>
      </div>
    );
  }

  if (error || !evalData) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
        <div className="text-center max-w-lg">
          <p className="text-red-400 text-lg font-semibold mb-2">Failed to load evaluation data</p>
          <p className="text-slate-500 text-sm mb-6">{error}</p>
          <Link to="/" className="text-cyan-400 hover:text-cyan-300 text-sm">
            &larr; Back to Showcase
          </Link>
        </div>
      </div>
    );
  }

  const { eval_summary: summary, cases } = evalData;
  const passRate = ((summary.correct_diagnostic_direction / summary.total_cases) * 100).toFixed(0);

  return (
    <div className="bg-gray-950 text-white min-h-screen">
      <Navbar mode="case" />

      {/* Header */}
      <div className="pt-24 pb-6 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <p className="text-cyan-400 text-xs tracking-[0.3em] uppercase mb-3 font-medium">
              System Evaluation
            </p>
            <h1 className="text-3xl md:text-4xl font-bold mb-3 tracking-tight">
              Evaluation Results
            </h1>
            <p className="text-slate-500 text-sm max-w-2xl mx-auto">
              Diagnostic accuracy and cognitive safety metrics across {summary.total_cases} clinical cases
            </p>
          </motion.div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="px-6 pb-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          <StatCard
            label="Pass Rate"
            value={`${passRate}%`}
            sub={`${summary.correct_diagnostic_direction}/${summary.total_cases} correct direction`}
            color="emerald"
          />
          <StatCard
            label="Avg Confidence"
            value={`${(summary.average_confidence * 100).toFixed(0)}%`}
            sub="Calibrated across cases"
            color="cyan"
          />
          <StatCard
            label="Avg Biases Caught"
            value={summary.average_biases_detected_r1}
            sub={`Reduced to ${summary.average_biases_reduced_r2} in R2`}
            color="amber"
          />
          <StatCard
            label="Avg Amendments"
            value={summary.average_amendments_proposed}
            sub={`~${summary.average_run_time_minutes}min per case`}
            color="violet"
          />
        </motion.div>
      </div>

      <div className="section-divider" />

      {/* Case cards */}
      <div className="px-6 py-12">
        <div className="max-w-5xl mx-auto">
          <p className="text-slate-500 text-xs tracking-[0.2em] uppercase mb-6 font-medium">
            Individual Case Results
          </p>
          <div className="space-y-6">
            {cases.map((c, i) => (
              <CaseCard key={c.case_id} c={c} index={i} />
            ))}
          </div>
        </div>
      </div>

      <div className="section-divider" />

      {/* Methodology */}
      <div className="px-6 py-12">
        <div className="max-w-3xl mx-auto">
          <p className="text-slate-500 text-xs tracking-[0.2em] uppercase mb-4 font-medium">
            Evaluation Methodology
          </p>
          <div className="rounded-xl border border-slate-800/50 bg-slate-900/30 p-6 space-y-3 text-sm text-slate-400 leading-relaxed">
            <p>
              Each case was run through the full EDI pipeline: three independent specialists (Round 1),
              metacognitive bias detection (Observer), peer-reviewed revision (Round 2), institutional
              synthesis, patient translation, and constitutional amendment.
            </p>
            <p>
              <strong className="text-slate-300">Diagnostic accuracy</strong> is evaluated against known ground-truth
              diagnoses. A case passes if the system identifies the correct diagnostic direction, even if the
              specific subtype requires molecular confirmation.
            </p>
            <p>
              <strong className="text-slate-300">Cognitive safety</strong> is measured by the number and severity of
              biases detected in Round 1, and the reduction in biases between rounds. The Observer uses a
              taxonomy of 7 cognitive bias types including anchoring, premature closure, confirmation bias,
              availability bias, framing, bandwagon effect, and diagnostic momentum.
            </p>
            <p>
              <strong className="text-slate-300">Institutional learning</strong> is measured by the constitutional
              amendments proposed per case. Each amendment represents a concrete principle or protocol change
              that the institution derives from the case to improve future diagnostic reasoning.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="section-divider" />
      <footer className="py-16 px-6 text-center">
        <p className="text-slate-600 text-xs tracking-wide">
          The Emergent Diagnostic Institution. Built with Claude Opus 4.6.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 mt-4 text-cyan-400 hover:text-cyan-300 transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back to Showcase
        </Link>
      </footer>
    </div>
  );
}
