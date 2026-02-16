import { useState, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Extract a short display name from the full primary_diagnosis string. */
function shortDiagnosis(full) {
  if (!full) return 'Diagnosis';
  // Take everything before the em-dash (enzymatic details)
  const beforeDash = full.split(/\s*[\u2014—]\s*/)[0].trim();
  // If it's still very long, extract a readable short form
  if (beforeDash.length > 60) {
    // e.g. "CLN2 Disease (Late-Infantile Neuronal Ceroid Lipofuscinosis / ... / Batten Disease)"
    // Extract: base name + last slash-separated alias if parenthetical
    const parenMatch = beforeDash.match(/^([^(]+)\(([^)]+)\)/);
    if (parenMatch) {
      const base = parenMatch[1].trim();
      const aliases = parenMatch[2].split('/').map(s => s.trim());
      const lastAlias = aliases[aliases.length - 1];
      return `${base} (${lastAlias})`;
    }
    return beforeDash.slice(0, 60) + '\u2026';
  }
  return beforeDash;
}

const PROSE_CLASSES = `prose prose-invert prose-sm md:prose-base max-w-none
  prose-headings:text-slate-200 prose-headings:font-semibold prose-headings:tracking-tight
  prose-h1:text-2xl prose-h1:mb-6 prose-h1:text-transparent prose-h1:bg-clip-text prose-h1:bg-gradient-to-r prose-h1:from-cyan-300 prose-h1:to-violet-300
  prose-h2:text-lg prose-h2:text-cyan-400 prose-h2:mt-8 prose-h2:mb-3
  prose-p:text-slate-300 prose-p:leading-relaxed prose-p:font-light
  prose-strong:text-cyan-300 prose-strong:font-semibold
  prose-li:text-slate-300 prose-li:leading-relaxed
  prose-ul:space-y-1
  prose-blockquote:border-cyan-500/30 prose-blockquote:text-slate-400
  prose-hr:border-slate-800`;

function splitLetter(md) {
  if (!md) return { preview: '', rest: '' };
  // Split after the "This is NOT autism." paragraph — find the line, then cut after the next blank line
  const marker = '**This is NOT autism.**';
  const idx = md.indexOf(marker);
  if (idx === -1) {
    // Fallback: show first 4 paragraphs
    const paras = md.split(/\n\n/);
    const preview = paras.slice(0, 5).join('\n\n');
    const rest = paras.slice(5).join('\n\n');
    return { preview, rest };
  }
  // Find the end of the paragraph containing the marker
  const afterMarker = md.indexOf('\n\n', idx);
  if (afterMarker === -1) return { preview: md, rest: '' };
  const cutPoint = afterMarker;
  return {
    preview: md.slice(0, cutPoint).trim(),
    rest: md.slice(cutPoint).trim(),
  };
}

export default function Diagnosis({ explanation, diagnosis, patientName }) {
  const [expanded, setExpanded] = useState(false);
  const letterRef = useRef(null);

  const { preview, rest } = useMemo(() => splitLetter(explanation), [explanation]);

  const handleCollapse = useCallback(() => {
    setExpanded(false);
    // Scroll back to the top of the letter
    setTimeout(() => {
      letterRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }, []);

  return (
    <section className="py-20 md:py-28 px-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-14"
        >
          <p className="text-cyan-400 text-xs tracking-[0.3em] uppercase mb-4 font-medium">The Diagnosis</p>
          <h2 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
            {patientName
              ? `A Letter to ${patientName}`
              : 'Patient Explanation'}
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto font-light">
            The institution speaks in clear, accessible language so patients and families
            can understand what was found and what comes next.
          </p>
        </motion.div>

        {/* Confidence bar */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="flex items-center justify-center gap-4 mb-10 p-4 rounded-lg bg-slate-900/40 border border-slate-800/50"
        >
          <span className="text-xs text-slate-500 uppercase tracking-wider flex-none">Primary Diagnosis</span>
          <span className="text-sm text-slate-200 font-medium truncate max-w-[400px]">
            {shortDiagnosis(diagnosis?.primary_diagnosis)}
          </span>
          <span className="text-slate-700 flex-none">|</span>
          <span className="text-xs text-slate-500 uppercase tracking-wider flex-none">Confidence</span>
          <span className="font-mono text-cyan-400 font-semibold flex-none">
            {diagnosis?.confidence != null ? `${(diagnosis.confidence * 100).toFixed(0)}%` : '—'}
          </span>
        </motion.div>

        {/* Letter */}
        <motion.div
          ref={letterRef}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="relative scroll-mt-[80px]"
        >
          {/* Decorative top border */}
          <div className="h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent mb-0" />

          <div className="bg-slate-900/40 border-x border-b border-slate-800/50 rounded-b-xl p-6 md:p-10 lg:p-12">
            {/* Always-visible preview */}
            <div className={PROSE_CLASSES}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{preview}</ReactMarkdown>
            </div>

            {/* Expandable rest */}
            {rest && (
              <>
                <AnimatePresence initial={false}>
                  {expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.5, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className={PROSE_CLASSES}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{rest}</ReactMarkdown>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Toggle button */}
                <div className={`flex justify-center ${expanded ? 'mt-8' : 'mt-6'}`}>
                  {!expanded ? (
                    <button
                      onClick={() => setExpanded(true)}
                      className="group flex items-center gap-2 px-5 py-2.5 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.04] text-cyan-400 text-sm font-medium hover:bg-cyan-500/[0.08] hover:border-cyan-500/30 transition-colors"
                    >
                      Read full letter
                      <svg className="w-4 h-4 transition-transform group-hover:translate-y-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      onClick={handleCollapse}
                      className="group flex items-center gap-2 px-5 py-2.5 rounded-lg border border-slate-700/50 text-slate-400 text-sm font-medium hover:text-slate-300 hover:border-slate-600/50 transition-colors"
                    >
                      Collapse
                      <svg className="w-4 h-4 transition-transform group-hover:-translate-y-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
