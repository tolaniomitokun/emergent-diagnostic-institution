import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

/** Shorten a long diagnosis string for card display. */
function shortDiagnosis(full) {
  if (!full) return null;
  const beforeDash = full.split(/\s*[\u2014—]\s*/)[0].trim();
  if (beforeDash.length <= 80) return beforeDash;
  const m = beforeDash.match(/^([^(]+)\(([^)]+)\)/);
  if (m) {
    const aliases = m[2].split('/').map(s => s.trim());
    return m[1].trim() + ' (' + aliases[aliases.length - 1] + ')';
  }
  return beforeDash.slice(0, 80).replace(/\s\S*$/, '') + '\u2026';
}

// ── Pipeline stages ─────────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  'Loading case and constitution',
  'Round 1: Neurologist analyzing',
  'Round 1: Dev. Pediatrician analyzing',
  'Round 1: Geneticist analyzing',
  'Metacognitive Observer scanning for biases',
  'Round 2: Specialists debating with Observer feedback',
  'Synthesizing institutional diagnosis',
  'Translating for patient communication',
  'Amending clinical constitution',
  'Diagnosis complete',
];

const NAV_HEIGHT = 60;

const ACCEPTED_FILES = '.pdf,.txt,.json,.png,.jpg,.jpeg';
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg'];
const TEXT_TYPES = ['text/plain', 'application/json'];

// ── Agent icons for the live feed ───────────────────────────────────────────

const AGENT_ICONS = {
  brain:       '\u{1F9E0}',  // 🧠
  baby:        '\u{1F476}',  // 👶
  dna:         '\u{1F9EC}',  // 🧬
  eye:         '\u{1F441}',  // 👁
  convergence: '\u{1F52C}',  // 🔬
  letter:      '\u{1F4AC}',  // 💬
  scroll:      '\u{1F4DC}',  // 📜
};

// ── Fallback messages per stage index ───────────────────────────────────────

const FALLBACK_MESSAGES = {
  0: [
    { agent: 'System', icon: '\u{1F4C2}', text: 'Loading patient records and clinical constitution...' },
    { agent: 'System', icon: '\u{1F4CB}', text: 'Assembling specialist team based on case profile...' },
    { agent: 'System', icon: '\u{2699}\u{FE0F}', text: 'Initializing cognitive safety protocols...' },
  ],
  1: [
    { agent: 'Neurologist', icon: '\u{1F9E0}', text: 'Reviewing complete medical history and clinical timeline...' },
    { agent: 'Neurologist', icon: '\u{1F9E0}', text: 'Analyzing symptom progression and neurological markers...' },
    { agent: 'Neurologist', icon: '\u{1F9E0}', text: 'Cross-referencing symptoms against differential diagnoses...' },
  ],
  2: [
    { agent: 'Dev. Pediatrician', icon: '\u{1F476}', text: 'Evaluating developmental trajectory against clinical markers...' },
    { agent: 'Dev. Pediatrician', icon: '\u{1F476}', text: 'Assessing growth patterns and metabolic indicators...' },
    { agent: 'Dev. Pediatrician', icon: '\u{1F476}', text: 'Reviewing age-specific reference ranges and milestones...' },
  ],
  3: [
    { agent: 'Geneticist', icon: '\u{1F9EC}', text: 'Cross-referencing family history with current presentation...' },
    { agent: 'Geneticist', icon: '\u{1F9EC}', text: 'Screening for hereditary syndromes and genetic markers...' },
    { agent: 'Geneticist', icon: '\u{1F9EC}', text: 'Analyzing phenotype-genotype correlations in case data...' },
  ],
  4: [
    { agent: 'Observer', icon: '\u{1F441}', text: 'Scanning all three analyses for cognitive biases...' },
    { agent: 'Observer', icon: '\u{1F441}', text: 'Comparing specialist reasoning patterns for premature closure...' },
    { agent: 'Observer', icon: '\u{1F441}', text: 'Checking for anchoring, confirmation bias, and diagnostic momentum...' },
  ],
  5: [
    { agent: 'Specialists', icon: '\u{1F4AC}', text: 'Specialists reviewing peer analyses and Observer feedback...' },
    { agent: 'Specialists', icon: '\u{1F4AC}', text: 'Revising hypotheses based on bias corrections...' },
    { agent: 'Specialists', icon: '\u{1F4AC}', text: 'Debating differential diagnoses with new evidence weights...' },
  ],
  6: [
    { agent: 'Synthesis', icon: '\u{1F52C}', text: 'Converging on institutional diagnosis from two rounds of debate...' },
    { agent: 'Synthesis', icon: '\u{1F52C}', text: 'Calculating calibrated confidence score across specialists...' },
    { agent: 'Synthesis', icon: '\u{1F52C}', text: 'Documenting dissenting opinions and reasoning chain...' },
  ],
  7: [
    { agent: 'Translator', icon: '\u{1F4AC}', text: 'Writing explanation in plain language for the family...' },
    { agent: 'Translator', icon: '\u{1F4AC}', text: 'Translating clinical terminology into accessible language...' },
    { agent: 'Translator', icon: '\u{1F4AC}', text: 'Structuring next steps by urgency and timeline...' },
  ],
  8: [
    { agent: 'Amender', icon: '\u{1F4DC}', text: 'Analyzing case patterns for constitutional improvements...' },
    { agent: 'Amender', icon: '\u{1F4DC}', text: 'Drafting new institutional principles from case learnings...' },
    { agent: 'Amender', icon: '\u{1F4DC}', text: 'Proposing team topology changes based on diagnostic gaps...' },
  ],
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function extractPdfText(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map(item => item.str).join(' '));
  }
  return pages.join('\n\n');
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatElapsed(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec} second${sec !== 1 ? 's' : ''}`;
  return `${min} minute${min !== 1 ? 's' : ''} ${sec} second${sec !== 1 ? 's' : ''}`;
}

// ── Spinner / Checkmark / Pending icons ─────────────────────────────────────

function StageIcon({ status, isFinal }) {
  if (status === 'done') {
    return (
      <motion.div
        initial={{ scale: 0 }}
        animate={isFinal
          ? { scale: [0, 1.3, 1], boxShadow: ['0 0 0 0 rgba(16,185,129,0)', '0 0 20px 8px rgba(16,185,129,0.4)', '0 0 0 0 rgba(16,185,129,0)'] }
          : { scale: 1 }
        }
        transition={isFinal ? { duration: 0.6, ease: 'easeOut' } : { duration: 0.2 }}
        className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center flex-none"
      >
        <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      </motion.div>
    );
  }
  if (status === 'active') {
    return (
      <div className="w-6 h-6 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin flex-none" />
    );
  }
  return (
    <div className="w-6 h-6 rounded-full border border-slate-700 flex-none" />
  );
}

// ── Access Code Modal ───────────────────────────────────────────────────────

function AccessModal({ onClose, onSuccess }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [shaking, setShaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!code.trim() || loading) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/validate-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode: code.trim() }),
      });
      const data = await res.json();

      if (data.valid) {
        onSuccess(code.trim());
      } else {
        setError('Invalid code. Try again.');
        setShaking(true);
        setTimeout(() => setShaking(false), 500);
        inputRef.current?.select();
      }
    } catch {
      setError('Connection failed. Is the server running?');
    } finally {
      setLoading(false);
    }
  }, [code, loading, onSuccess]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.2 }}
        className="relative bg-slate-900 border border-slate-700/50 rounded-2xl p-8 w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h3 className="text-xl font-bold mb-6 text-center">Enter your access code</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <motion.div
            animate={shaking ? { x: [0, -10, 10, -10, 10, 0] } : {}}
            transition={{ duration: 0.4 }}
          >
            <input
              ref={inputRef}
              type="text"
              value={code}
              onChange={(e) => { setCode(e.target.value); setError(''); }}
              placeholder="ACCESS CODE"
              autoFocus
              className={`w-full px-4 py-3 rounded-lg bg-slate-800/80 border text-center text-lg font-mono tracking-widest uppercase placeholder:text-slate-600 placeholder:tracking-widest focus:outline-none focus:ring-2 transition-colors ${
                error
                  ? 'border-red-500/60 focus:ring-red-500/30 text-red-400'
                  : 'border-slate-700/50 focus:ring-cyan-500/30 text-slate-200'
              }`}
            />
          </motion.div>

          {error && (
            <motion.p
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-red-400 text-sm text-center"
            >
              {error}
            </motion.p>
          )}

          <button
            type="submit"
            disabled={!code.trim() || loading}
            className="w-full py-3 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 text-white font-semibold text-sm hover:from-cyan-400 hover:to-violet-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {loading ? 'Validating...' : 'Start'}
          </button>
        </form>

        <p className="text-slate-500 text-xs text-center mt-5 leading-relaxed">
          Request access at{' '}
          <a href="https://x.com/tolatokuns" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">
            x.com/tolatokuns
          </a>
          {' '}or join{' '}
          <a href="https://discord.gg/XCmjaECT" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">
            discord.gg/XCmjaECT
          </a>
        </p>
      </motion.div>
    </motion.div>
  );
}

// ── Progress Tracker ────────────────────────────────────────────────────────

function ProgressTracker({ stages, runState, onCancel }) {
  const allDone = runState === 'complete';
  return (
    <div className="bg-slate-900/40 border border-slate-800/50 rounded-xl p-6 md:p-8">
      <div className="space-y-4">
        {stages.map((stage, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center gap-3"
          >
            <StageIcon status={stage.status} isFinal={allDone && i === stages.length - 1} />
            <span className={`text-sm ${
              stage.status === 'done'
                ? 'text-slate-300'
                : stage.status === 'active'
                  ? 'text-cyan-400 font-medium'
                  : 'text-slate-600'
            }`}>
              {stage.message}
            </span>
          </motion.div>
        ))}
      </div>

      {runState === 'running' && (
        <div className="mt-6 flex flex-col items-center gap-3">
          <p className="text-slate-600 text-xs">
            Full analysis takes approximately 6–10 minutes
          </p>
          <button
            onClick={onCancel}
            className="px-5 py-2.5 rounded-lg border border-slate-700/50 text-slate-400 text-sm font-medium hover:text-slate-300 hover:border-slate-600/50 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ── Completion Card ────────────────────────────────────────────────────────

function CompletionCard({ completionData, elapsedMs, onViewResults, onRunAnother }) {
  const { diagnosis, confidence, biasesCount, amendmentsCount } = completionData;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' }}
      className="relative mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04] p-6 md:p-8 overflow-hidden"
    >
      {/* Green glow effect */}
      <div className="absolute inset-0 rounded-xl pointer-events-none"
        style={{ boxShadow: 'inset 0 0 30px rgba(16,185,129,0.06)' }}
      />

      <div className="relative space-y-5">
        {/* Success header */}
        <div className="flex items-center gap-3">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: [0, 1.2, 1] }}
            transition={{ duration: 0.4, delay: 0.5 }}
            className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center flex-none"
          >
            <svg className="w-4.5 h-4.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </motion.div>
          <p className="text-emerald-400 text-sm font-semibold tracking-wide">Diagnosis Complete</p>
        </div>

        {/* Primary diagnosis */}
        {diagnosis && (
          <div>
            <p className="text-slate-500 text-[11px] uppercase tracking-wider mb-1.5">Primary Diagnosis</p>
            <p className="text-xl md:text-2xl font-bold text-slate-100 leading-snug">{diagnosis}</p>
          </div>
        )}

        {/* Stats row */}
        <div className="flex flex-wrap gap-3">
          {confidence && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {confidence} confidence
            </span>
          )}
          {biasesCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {biasesCount} bias{biasesCount !== 1 ? 'es' : ''} caught
            </span>
          )}
          {amendmentsCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-medium">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
              {amendmentsCount} amendment{amendmentsCount !== 1 ? 's' : ''}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-500/10 border border-slate-600/20 text-slate-400 text-xs font-medium">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {formatElapsed(elapsedMs)}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4 pt-1">
          <button
            onClick={onViewResults}
            className="group flex items-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 text-white font-semibold text-sm hover:from-cyan-400 hover:to-violet-400 transition-all"
          >
            View Full Results
            <svg className="w-4 h-4 transition-transform group-hover:translate-y-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <button
            onClick={onRunAnother}
            className="text-slate-500 text-sm hover:text-slate-300 transition-colors"
          >
            Run another case
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Live Feed ──────────────────────────────────────────────────────────────

function LiveFeed({ messages, currentStageIndex, isRunning }) {
  const feedRef = useRef(null);
  const fallbackTimerRef = useRef(null);
  const fallbackIndexRef = useRef(0);
  const lastRealMessageTimeRef = useRef(Date.now());
  const [displayMessages, setDisplayMessages] = useState([]);
  const [showThinking, setShowThinking] = useState(false);
  const messageQueueRef = useRef([]);
  const drainTimerRef = useRef(null);

  // Auto-scroll to latest message
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [displayMessages, showThinking]);

  // Rate-limited queue drain: 1 message every 2 seconds
  useEffect(() => {
    if (!isRunning) return;

    drainTimerRef.current = setInterval(() => {
      if (messageQueueRef.current.length > 0) {
        const next = messageQueueRef.current.shift();
        setDisplayMessages(prev => [...prev, next]);
        lastRealMessageTimeRef.current = Date.now();
        setShowThinking(false);
      }
    }, 2000);

    return () => { if (drainTimerRef.current) clearInterval(drainTimerRef.current); };
  }, [isRunning]);

  // Enqueue new real messages
  useEffect(() => {
    if (messages.length === 0) return;
    const latest = messages[messages.length - 1];
    // Check if this message is already queued or displayed
    const allKnown = [...displayMessages, ...messageQueueRef.current];
    if (allKnown.some(m => m.id === latest.id)) return;

    // Add new messages that aren't yet known
    for (const msg of messages) {
      if (!allKnown.some(m => m.id === msg.id) && !messageQueueRef.current.some(m => m.id === msg.id)) {
        messageQueueRef.current.push(msg);
      }
    }
  }, [messages, displayMessages]);

  // Fallback messages when no real content for a while
  useEffect(() => {
    if (!isRunning) return;

    fallbackTimerRef.current = setInterval(() => {
      const silenceMs = Date.now() - lastRealMessageTimeRef.current;
      const hasQueuedMessages = messageQueueRef.current.length > 0;

      if (silenceMs > 10000 && !hasQueuedMessages) {
        // Show "thinking" indicator
        setShowThinking(true);
      }

      if (silenceMs > 5000 && !hasQueuedMessages) {
        // Generate a fallback message for the current stage
        const fallbacks = FALLBACK_MESSAGES[currentStageIndex] || FALLBACK_MESSAGES[0];
        const idx = fallbackIndexRef.current % fallbacks.length;
        fallbackIndexRef.current++;
        const fb = fallbacks[idx];

        const fallbackMsg = {
          id: `fallback-${Date.now()}`,
          agent: fb.agent,
          icon: fb.icon,
          text: fb.text,
          isFallback: true,
        };
        messageQueueRef.current.push(fallbackMsg);
        lastRealMessageTimeRef.current = Date.now();
        setShowThinking(false);
      }
    }, 5000);

    return () => { if (fallbackTimerRef.current) clearInterval(fallbackTimerRef.current); };
  }, [isRunning, currentStageIndex]);

  // Reset on unmount or when not running
  useEffect(() => {
    if (!isRunning) {
      setDisplayMessages([]);
      setShowThinking(false);
      messageQueueRef.current = [];
      fallbackIndexRef.current = 0;
    }
  }, [isRunning]);

  if (!isRunning && displayMessages.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl bg-slate-950/60 border border-slate-800/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800/40">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
        </span>
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Live</span>
      </div>

      {/* Feed */}
      <div
        ref={feedRef}
        className="px-4 py-3 max-h-[240px] overflow-y-auto space-y-2.5 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent"
      >
        <AnimatePresence initial={false}>
          {displayMessages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={`flex items-start gap-2.5 ${msg.isFallback ? 'opacity-60' : ''}`}
            >
              <span className="text-sm flex-none mt-0.5 leading-none">{msg.icon}</span>
              <div className="min-w-0">
                <span className={`text-[11px] font-semibold ${
                  msg.round === 2 ? 'text-amber-400' : 'text-cyan-400'
                }`}>
                  {msg.agent}{msg.round === 2 ? ' (R2)' : ''}
                </span>
                <p className="text-xs text-slate-400 leading-relaxed mt-0.5 break-words">
                  &ldquo;{msg.text}&rdquo;
                </p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Thinking indicator */}
        {showThinking && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 py-1"
          >
            <span className="text-sm">💭</span>
            <span className="text-xs text-slate-600 italic">
              Agents are thinking
              <motion.span
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >...</motion.span>
            </span>
          </motion.div>
        )}

        {/* Empty state */}
        {displayMessages.length === 0 && !showThinking && (
          <div className="flex items-center gap-2 py-1">
            <span className="text-sm">⏳</span>
            <span className="text-xs text-slate-600 italic">Waiting for agent output...</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── File Chip ───────────────────────────────────────────────────────────────

function FileChip({ file, onRemove }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50 text-xs"
    >
      {/* Thumbnail for images */}
      {file.thumbnail && (
        <img
          src={file.thumbnail}
          alt=""
          className="w-6 h-6 rounded object-cover flex-none"
        />
      )}
      <span className="text-slate-300 truncate max-w-[120px]">{file.name}</span>
      <span className="text-slate-600">{formatFileSize(file.size)}</span>
      {file.error && <span className="text-red-400">{file.error}</span>}
      <button
        onClick={onRemove}
        className="flex-none text-slate-600 hover:text-slate-300 transition-colors ml-1"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </motion.div>
  );
}

// ── Input Card ──────────────────────────────────────────────────────────────

function InputCard({ caseText, setCaseText, images, setImages, onStart, onDemoClick }) {
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [recording, setRecording] = useState(false);
  const [speechSupported] = useState(
    () => typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
  );

  // Auto-expand textarea height as user types (up to 300px)
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '120px';
    el.style.height = Math.min(el.scrollHeight, 300) + 'px';
  }, []);

  useEffect(() => { autoResize(); }, [caseText, autoResize]);

  const handleChange = useCallback((e) => {
    setCaseText(e.target.value);
  }, [setCaseText]);

  // ── Voice input ───────────────────────────────────────────────────────

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    setRecording(false);
  }, []);

  const startRecording = useCallback(() => {
    if (!speechSupported) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let finalTranscript = '';

    const resetSilenceTimer = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => { stopRecording(); }, 60000);
    };

    recognition.onresult = (event) => {
      resetSilenceTimer();
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interim = transcript;
        }
      }
      setCaseText(prev => {
        const base = prev.replace(/\u200B.*$/, '').trimEnd();
        const spoken = finalTranscript + (interim ? '\u200B' + interim : '');
        return base ? base + ' ' + spoken : spoken;
      });
    };

    recognition.onerror = () => { stopRecording(); };
    recognition.onend = () => { setRecording(false); };

    recognitionRef.current = recognition;
    recognition.start();
    setRecording(true);
    resetSilenceTimer();
  }, [speechSupported, setCaseText, stopRecording]);

  const toggleRecording = useCallback(() => {
    if (recording) {
      stopRecording();
      // Clean up interim marker
      setCaseText(prev => prev.replace(/\u200B/g, ''));
    } else {
      startRecording();
    }
  }, [recording, startRecording, stopRecording, setCaseText]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  // ── File upload ───────────────────────────────────────────────────────

  const processFiles = useCallback(async (fileList) => {
    for (const file of fileList) {
      const entry = { id: crypto.randomUUID(), name: file.name, size: file.size, error: null, thumbnail: null };

      if (IMAGE_TYPES.includes(file.type)) {
        try {
          const dataUrl = await readFileAsDataURL(file);
          const base64 = dataUrl.split(',')[1];
          entry.thumbnail = dataUrl;
          setImages(prev => [...prev, { filename: file.name, base64, mimeType: file.type }]);
        } catch {
          entry.error = 'Failed to read';
        }
        setFiles(prev => [...prev, entry]);

      } else if (file.type === 'application/pdf') {
        setFiles(prev => [...prev, entry]);
        try {
          const text = await extractPdfText(file);
          setCaseText(prev => prev + `\n\n--- Attached: ${file.name} ---\n${text}`);
        } catch {
          setFiles(prev => prev.map(f => f.id === entry.id ? { ...f, error: 'Could not extract text' } : f));
        }

      } else if (TEXT_TYPES.includes(file.type) || file.name.endsWith('.json') || file.name.endsWith('.txt')) {
        setFiles(prev => [...prev, entry]);
        try {
          const text = await readFileAsText(file);
          setCaseText(prev => prev + `\n\n--- Attached: ${file.name} ---\n${text}`);
        } catch {
          setFiles(prev => prev.map(f => f.id === entry.id ? { ...f, error: 'Failed to read' } : f));
        }
      }
    }
  }, [setCaseText, setImages]);

  const handleFileChange = useCallback((e) => {
    if (e.target.files?.length) {
      processFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  }, [processFiles]);

  const removeFile = useCallback((id) => {
    const file = files.find(f => f.id === id);
    if (file?.thumbnail) {
      setImages(prev => prev.filter(img => img.filename !== file.name));
    }
    setFiles(prev => prev.filter(f => f.id !== id));
  }, [files, setImages]);

  return (
    <div className="space-y-3">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_FILES}
        multiple
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Card container */}
      <div className="rounded-xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm overflow-hidden focus-within:border-slate-700/80 focus-within:ring-1 focus-within:ring-cyan-500/20 transition-colors">
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={caseText}
          onChange={handleChange}
          placeholder="Describe a patient case or upload medical records..."
          className="w-full px-5 pt-5 pb-3 bg-transparent text-sm text-slate-200 leading-relaxed placeholder:text-slate-500 focus:outline-none resize-none"
          style={{ height: '120px', maxHeight: '300px' }}
        />

        {/* File chips */}
        <AnimatePresence>
          {files.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="px-4 pb-2"
            >
              <div className="flex flex-wrap gap-2">
                {files.map(f => (
                  <FileChip key={f.id} file={f} onRemove={() => removeFile(f.id)} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 pb-4">
          <div className="flex items-center gap-1">
            {/* Upload */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 rounded-md text-slate-600 hover:text-cyan-400 transition-colors"
              title="Upload files (PDF, images, text)"
            >
              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
              </svg>
            </button>

            {/* Mic */}
            <div className="relative group">
              <button
                onClick={speechSupported ? toggleRecording : undefined}
                className={`p-1.5 rounded-md transition-colors ${
                  recording
                    ? 'text-red-400 animate-pulse'
                    : speechSupported
                      ? 'text-slate-600 hover:text-cyan-400'
                      : 'text-slate-700 cursor-not-allowed'
                }`}
                title={speechSupported ? 'Voice input' : 'Voice input requires Chrome'}
              >
                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                </svg>
              </button>
              {/* Recording indicator */}
              {recording && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
              )}
              {/* Tooltip for unsupported browsers */}
              {!speechSupported && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700/50 text-[10px] text-slate-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  Voice input requires Chrome
                </div>
              )}
            </div>

            {/* Recording label */}
            {recording && (
              <span className="text-red-400 text-[11px] font-medium ml-1 animate-pulse">
                Recording...
              </span>
            )}
          </div>

          <button
            onClick={onStart}
            className="px-5 py-1.5 text-xs font-semibold rounded-full bg-gradient-to-r from-cyan-500 to-violet-500 text-white hover:from-cyan-400 hover:to-violet-400 transition-all"
          >
            Start Diagnosis
          </button>
        </div>
      </div>

      {/* Demo link */}
      <div className="text-center">
        <button
          onClick={onDemoClick}
          className="text-slate-400 text-sm hover:text-cyan-400 transition-colors"
        >
          See it in action: view the Eli Reeves demo case &rarr;
        </button>
      </div>

      {/* Disclaimer */}
      <p className="text-slate-600 text-[11px] text-center tracking-wide">
        This is a research prototype. It is not intended for real clinical decisions.
      </p>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function RunDiagnosis() {
  const navigate = useNavigate();
  const [caseText, setCaseText] = useState('');
  const [images, setImages] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [runState, setRunState] = useState('idle'); // idle | running | complete | error
  const [errorMessage, setErrorMessage] = useState(null);
  const [caseId, setCaseId] = useState(null);
  const [stages, setStages] = useState(() =>
    PIPELINE_STAGES.map(msg => ({ message: msg, status: 'pending' }))
  );
  const [completionData, setCompletionData] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [reasoningMessages, setReasoningMessages] = useState([]);
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const eventSourceRef = useRef(null);
  const startTimeRef = useRef(null);

  const scrollTo = useCallback((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - NAV_HEIGHT;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }, []);

  const startRun = useCallback(async (accessCode) => {
    setShowModal(false);

    try {
      const res = await fetch('/api/run-diagnosis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode, caseText, images }),
      });

      if (res.status === 429) {
        alert('A diagnosis is currently in progress. Please wait.');
        return;
      }

      if (!res.ok) return;

      const { runId } = await res.json();
      setCaseId(runId);

      setStages(PIPELINE_STAGES.map(msg => ({ message: msg, status: 'pending' })));
      setRunState('running');
      setErrorMessage(null);
      setCompletionData(null);
      setReasoningMessages([]);
      setCurrentStageIndex(0);
      startTimeRef.current = Date.now();

      const es = new EventSource('/api/run-status');
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.stage === 'error') {
          setRunState('error');
          setErrorMessage(data.message || 'An unexpected error occurred.');
          es.close();
          eventSourceRef.current = null;
          return;
        }

        if (data.stage === 'complete') {
          setStages(prev => prev.map(s => ({ ...s, status: 'done' })));
          setElapsedTime(Date.now() - (startTimeRef.current || Date.now()));
          setRunState('complete');
          es.close();
          eventSourceRef.current = null;

          // Store caseId from server if provided
          if (data.caseId) setCaseId(prev => prev || data.caseId);

          // Fetch results to populate completion card
          (async () => {
            try {
              const basePath = data.resultsPath || '/data/user-results';
              const [outputRes, observerRes, amendRes] = await Promise.allSettled([
                fetch(`${basePath}/diagnosis.json`).then(r => r.ok ? r.json() : null),
                fetch(`${basePath}/observer/round1.json`).then(r => r.ok ? r.json() : null),
                fetch(`${basePath}/amendments.json`).then(r => r.ok ? r.json() : null),
              ]);

              const output = outputRes.status === 'fulfilled' ? outputRes.value : null;
              const observer = observerRes.status === 'fulfilled' ? observerRes.value : null;
              const amendments = amendRes.status === 'fulfilled' ? amendRes.value : null;

              // Extract primary diagnosis from output
              let diagnosis = null;
              let confidence = null;
              if (output?.primary_diagnosis) {
                diagnosis = output.primary_diagnosis;
                confidence = output.confidence;
              } else if (output?.final_diagnosis) {
                diagnosis = output.final_diagnosis.primary_diagnosis || output.final_diagnosis.diagnosis;
                confidence = output.final_diagnosis.confidence;
              }

              // Count biases from observer
              let biasesCount = 0;
              if (observer) {
                if (Array.isArray(observer.biases_detected)) biasesCount = observer.biases_detected.length;
              }

              // Count amendments
              let amendmentsCount = 0;
              if (Array.isArray(amendments)) amendmentsCount = amendments.length;
              else if (amendments?.amendments && Array.isArray(amendments.amendments)) amendmentsCount = amendments.amendments.length;

              setCompletionData({
                diagnosis: shortDiagnosis(diagnosis),
                confidence: confidence != null ? `${(confidence * 100).toFixed(0)}%` : null,
                biasesCount,
                amendmentsCount,
              });
            } catch {
              setCompletionData({ diagnosis: null, confidence: null, biasesCount: 0, amendmentsCount: 0 });
            }
          })();
          return;
        }

        // Reasoning events from file watching
        if (data.type === 'reasoning') {
          const icon = AGENT_ICONS[data.icon] || '\u{1F4AC}';
          setReasoningMessages(prev => [...prev, {
            id: `${data.agent}-r${data.round}-${Date.now()}`,
            agent: data.agentName || data.agent,
            icon,
            text: data.text,
            round: data.round,
            isFallback: false,
          }]);
          return;
        }

        // Running state — update stages based on index
        if (data.index != null) {
          setCurrentStageIndex(data.index);
          setStages(prev => prev.map((s, i) => {
            if (i < data.index) return { ...s, status: 'done' };
            if (i === data.index) return { ...s, status: 'active', message: data.message || s.message };
            return { ...s, status: 'pending' };
          }));
        }
      };

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
      };
    } catch {
      // Connection error
    }
  }, [caseText, images]);

  const cancelRun = useCallback(async () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    try { await fetch('/api/cancel-diagnosis', { method: 'POST' }); } catch {}
    setRunState('idle');
    setErrorMessage(null);
    setReasoningMessages([]);
    setCurrentStageIndex(0);
    setStages(PIPELINE_STAGES.map(msg => ({ message: msg, status: 'pending' })));
  }, []);

  const resetToIdle = useCallback(() => {
    setRunState('idle');
    setErrorMessage(null);
    setReasoningMessages([]);
    setCurrentStageIndex(0);
    setStages(PIPELINE_STAGES.map(msg => ({ message: msg, status: 'pending' })));
  }, []);

  return (
    <section className="py-20 md:py-28 px-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <p className="text-cyan-400 text-xs tracking-[0.3em] uppercase mb-4 font-medium">
            Live Diagnosis
          </p>
          <h2 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
            Run a Diagnosis
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto font-light">
            Paste a patient case, speak it, or upload medical records. The institution does the rest.
          </p>
        </motion.div>

        {/* Content area */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.15 }}
        >
          {runState === 'idle' ? (
            <InputCard
              caseText={caseText}
              setCaseText={setCaseText}
              images={images}
              setImages={setImages}
              onStart={() => setShowModal(true)}
              onDemoClick={() => scrollTo('the-process')}
            />
          ) : runState === 'error' ? (
            <div className="space-y-4">
              <div className="bg-red-500/[0.05] border border-red-500/20 rounded-xl p-6 md:p-8 text-center">
                <p className="text-red-400 font-semibold mb-2">
                  {errorMessage?.includes('timed out') ? 'Analysis Timed Out' : 'Analysis Error'}
                </p>
                <p className="text-slate-400 text-sm mb-6 max-w-md mx-auto">
                  {errorMessage?.includes('timed out')
                    ? 'Complex cases may require more processing time.'
                    : errorMessage?.includes('cancelled')
                      ? 'The diagnosis was cancelled.'
                      : 'Please try adding more clinical detail and try again.'}
                </p>
                <button
                  onClick={resetToIdle}
                  className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 text-white text-sm font-semibold hover:from-cyan-400 hover:to-violet-400 transition-all"
                >
                  Try Again
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-0">
              <ProgressTracker
                stages={stages}
                runState={runState}
                onCancel={cancelRun}
              />
              {runState === 'running' && (
                <LiveFeed
                  messages={reasoningMessages}
                  currentStageIndex={currentStageIndex}
                  isRunning={runState === 'running'}
                />
              )}
              <AnimatePresence>
                {runState === 'complete' && completionData && (
                  <CompletionCard
                    completionData={completionData}
                    elapsedMs={elapsedTime}
                    onViewResults={() => {
                      navigate(`/case/user_case_${caseId}`);
                    }}
                    onRunAnother={resetToIdle}
                  />
                )}
              </AnimatePresence>
            </div>
          )}
        </motion.div>
      </div>

      {/* Access code modal */}
      <AnimatePresence>
        {showModal && (
          <AccessModal
            onClose={() => setShowModal(false)}
            onSuccess={startRun}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
