import { motion } from 'framer-motion';

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: 0.7, ease: 'easeOut' },
});

function StatCard({ value, label, color = 'cyan', delay = 0 }) {
  const colors = {
    cyan: 'from-cyan-400 to-blue-500',
    violet: 'from-violet-400 to-purple-500',
    emerald: 'from-emerald-400 to-teal-500',
    amber: 'from-amber-400 to-orange-500',
    rose: 'from-rose-400 to-pink-500',
    blue: 'from-blue-400 to-indigo-500',
  };

  return (
    <motion.div
      {...fade(delay)}
      className="bg-slate-900/50 border border-slate-800/50 rounded-xl p-6 text-center"
    >
      <p className={`text-3xl md:text-4xl font-bold bg-gradient-to-r ${colors[color]} bg-clip-text text-transparent`}>
        {value}
      </p>
      <p className="text-xs md:text-sm text-slate-500 mt-2 tracking-wide uppercase">
        {label}
      </p>
    </motion.div>
  );
}

function MilestoneItem({ icon, text, delay = 0 }) {
  return (
    <motion.div {...fade(delay)} className="flex items-start gap-4">
      <span className="text-2xl flex-none mt-0.5">{icon}</span>
      <p className="text-sm md:text-base text-slate-300 leading-relaxed">{text}</p>
    </motion.div>
  );
}

function StackBadge({ name, delay = 0 }) {
  return (
    <motion.span
      {...fade(delay)}
      className="px-3 py-1.5 rounded-full text-xs font-medium bg-slate-800/80 text-slate-400 border border-slate-700/50"
    >
      {name}
    </motion.span>
  );
}

export default function BuildRecap() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/[0.03] via-violet-500/[0.02] to-transparent" />
        <div className="relative max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
          <motion.p
            {...fade(0.2)}
            className="text-cyan-400 text-xs tracking-[0.4em] uppercase mb-6 font-medium"
          >
            Build Recap
          </motion.p>
          <motion.h1
            {...fade(0.4)}
            className="text-4xl md:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-cyan-400 via-blue-400 to-violet-400 bg-clip-text text-transparent mb-6"
          >
            The Emergent Diagnostic Institution
          </motion.h1>
          <motion.p
            {...fade(0.6)}
            className="text-slate-500 text-lg font-light"
          >
            Built with Claude Opus 4.6 &times; Claude Code &mdash; February 2026
          </motion.p>
          <motion.p
            {...fade(0.8)}
            className="text-slate-600 text-sm mt-2"
          >
            by Tolani Omitokun
          </motion.p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="max-w-4xl mx-auto px-6 pb-16">
        <motion.p
          {...fade(0.3)}
          className="text-center text-slate-600 text-xs tracking-[0.3em] uppercase mb-8"
        >
          By the Numbers
        </motion.p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard value="40,684" label="Total Lines" color="cyan" delay={0.4} />
          <StatCard value="6,319" label="Lines of Code" color="violet" delay={0.5} />
          <StatCard value="136" label="Project Files" color="emerald" delay={0.6} />
          <StatCard value="6" label="AI Agents" color="amber" delay={0.7} />
          <StatCard value="77,084" label="Words of Medical Records" color="rose" delay={0.8} />
          <StatCard value="6" label="Patient Cases" color="blue" delay={0.9} />
        </div>
      </div>

      {/* The System */}
      <div className="max-w-4xl mx-auto px-6 pb-16">
        <motion.p
          {...fade(0.3)}
          className="text-center text-slate-600 text-xs tracking-[0.3em] uppercase mb-8"
        >
          What We Built
        </motion.p>
        <div className="grid md:grid-cols-2 gap-6">
          <motion.div
            {...fade(0.4)}
            className="bg-slate-900/30 border border-slate-800/40 rounded-xl p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                <span className="text-cyan-400 text-lg">&#x2699;</span>
              </div>
              <div>
                <h3 className="text-white font-semibold">The Orchestrator</h3>
                <p className="text-slate-500 text-xs">1,335 lines of Python</p>
              </div>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">
              Multi-agent pipeline coordinating six AI specialists through structured debate, bias detection, and constitutional evolution.
            </p>
          </motion.div>

          <motion.div
            {...fade(0.5)}
            className="bg-slate-900/30 border border-slate-800/40 rounded-xl p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <span className="text-violet-400 text-lg">&#x25B3;</span>
              </div>
              <div>
                <h3 className="text-white font-semibold">The Visualization</h3>
                <p className="text-slate-500 text-xs">4,096 lines of React</p>
              </div>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">
              12 interactive components: patient timeline, live debate viewer, diagnosis reveal, constitutional amendments, and evaluation dashboard.
            </p>
          </motion.div>

          <motion.div
            {...fade(0.6)}
            className="bg-slate-900/30 border border-slate-800/40 rounded-xl p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <span className="text-emerald-400 text-lg">&#x21C4;</span>
              </div>
              <div>
                <h3 className="text-white font-semibold">The Server</h3>
                <p className="text-slate-500 text-xs">596 lines of Express</p>
              </div>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">
              SSE streaming, file upload processing, access-code authentication, and a complete API bridging frontend to Python pipeline.
            </p>
          </motion.div>

          <motion.div
            {...fade(0.7)}
            className="bg-slate-900/30 border border-slate-800/40 rounded-xl p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <span className="text-amber-400 text-lg">&#x1F4DC;</span>
              </div>
              <div>
                <h3 className="text-white font-semibold">The Constitution</h3>
                <p className="text-slate-500 text-xs">Self-evolving governance</p>
              </div>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">
              106 lines of governing principles the system rewrites after every case. 43 amendments generated across the evaluation suite.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Across the Evaluation */}
      <div className="max-w-4xl mx-auto px-6 pb-16">
        <motion.p
          {...fade(0.3)}
          className="text-center text-slate-600 text-xs tracking-[0.3em] uppercase mb-8"
        >
          Across 6 Cases
        </motion.p>
        <div className="grid grid-cols-3 gap-4">
          <StatCard value="43" label="Constitutional Amendments" color="violet" delay={0.4} />
          <StatCard value="24" label="Cognitive Biases Caught" color="rose" delay={0.5} />
          <StatCard value="42" label="Medical Record Files" color="emerald" delay={0.6} />
        </div>
      </div>

      {/* Milestones */}
      <div className="max-w-3xl mx-auto px-6 pb-16">
        <motion.p
          {...fade(0.3)}
          className="text-center text-slate-600 text-xs tracking-[0.3em] uppercase mb-8"
        >
          Milestones
        </motion.p>
        <div className="space-y-6 bg-slate-900/20 border border-slate-800/30 rounded-xl p-8">
          <MilestoneItem
            icon="&#x1F9EC;"
            text="Designed a six-agent architecture where specialists debate, an observer catches bias, and a constitution evolves after every case"
            delay={0.4}
          />
          <MilestoneItem
            icon="&#x1F4C4;"
            text="Wrote 77,084 words of clinically detailed medical records — a 14-year diagnostic odyssey across 11 providers and 3 states"
            delay={0.5}
          />
          <MilestoneItem
            icon="&#x1F3A8;"
            text="Built a full interactive visualization with animated timelines, live debate playback, and a diagnosis reveal"
            delay={0.6}
          />
          <MilestoneItem
            icon="&#x1F680;"
            text="Deployed a dual-runtime Docker application (Node.js + Python) to Railway — live and accessible to anyone"
            delay={0.7}
          />
          <MilestoneItem
            icon="&#x1F3AC;"
            text="Created a cinematic demo mode and title card sequence for the hackathon video submission"
            delay={0.8}
          />
          <MilestoneItem
            icon="&#x1F4D6;"
            text="Built 5 additional evaluation cases covering cardiology, autoimmune, neurodegenerative, neonatal, and rheumatology"
            delay={0.9}
          />
        </div>
      </div>

      {/* Tech Stack */}
      <div className="max-w-3xl mx-auto px-6 pb-16">
        <motion.p
          {...fade(0.3)}
          className="text-center text-slate-600 text-xs tracking-[0.3em] uppercase mb-8"
        >
          The Stack
        </motion.p>
        <div className="flex flex-wrap justify-center gap-3">
          {[
            'Claude Opus 4.6', 'Claude Code', 'Python', 'Anthropic SDK',
            'React', 'Framer Motion', 'Tailwind CSS', 'Express', 'SSE',
            'Vite', 'Docker', 'Railway', 'GitHub',
          ].map((name, i) => (
            <StackBadge key={name} name={name} delay={0.3 + i * 0.05} />
          ))}
        </div>
      </div>

      {/* Closing */}
      <div className="max-w-3xl mx-auto px-6 pb-24 text-center">
        <motion.div {...fade(0.4)} className="py-12">
          <p className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-violet-400 bg-clip-text text-transparent mb-4">
            We didn&rsquo;t make finalist. But we built something real.
          </p>
          <p className="text-slate-500 text-base font-light max-w-xl mx-auto leading-relaxed">
            An institution that emerges from the collaboration of AI agents, governs itself, catches its own blind spots, and gets smarter with every patient it sees. This is just the beginning.
          </p>
        </motion.div>
        <motion.p {...fade(0.6)} className="text-slate-700 text-xs tracking-wider">
          emergentdiagnostic-ai.up.railway.app
        </motion.p>
      </div>
    </div>
  );
}
