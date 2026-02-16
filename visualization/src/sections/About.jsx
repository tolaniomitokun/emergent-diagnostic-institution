import { motion } from 'framer-motion';

const SOCIAL_LINKS = [
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/in/tolaniomitokunproductmanager/',
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
  {
    label: 'GitHub',
    href: 'https://github.com/tolaniomitokun',
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
      </svg>
    ),
  },
  {
    label: 'X',
    href: 'https://x.com/tolatokuns',
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    label: 'Discord',
    href: 'https://discord.gg/XCmjaECT',
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
      </svg>
    ),
  },
];

const TECH_PILLS = [
  'Claude Opus 4.6',
  'Claude Sonnet 4.5',
  'Claude Code',
  'Anthropic Python SDK',
  'React',
  'Tailwind CSS',
  'Vite',
];

export default function About() {
  return (
    <section className="py-20 md:py-28 px-6">
      <div className="max-w-4xl mx-auto space-y-10">

        {/* ── 1. BUILT IN 3 DAYS CALLOUT ── */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="rounded-xl p-[1px] bg-gradient-to-r from-cyan-500/50 via-blue-500/30 to-violet-500/50"
        >
          <div className="rounded-[11px] bg-slate-900/90 backdrop-blur-sm p-8 md:p-10 text-center">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold mb-5 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-violet-400">
              Built in 3 Days with Claude Code &amp; Opus 4.6
            </h2>
            <p className="text-slate-400 text-base md:text-lg leading-relaxed max-w-3xl mx-auto font-light">
              One AI product manager. No engineering background. Six AI agents. One institution
              that doesn&rsquo;t forget, doesn&rsquo;t anchor, and doesn&rsquo;t stop looking.
            </p>
          </div>
        </motion.div>

        {/* ── 2. CREATOR SECTION ── */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="rounded-xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm p-8 md:p-10"
        >
          <h3 className="text-2xl md:text-3xl font-bold mb-1 tracking-tight">
            Tolani Omitokun
          </h3>
          <p className="text-cyan-400 text-sm font-medium tracking-wide mb-6">
            Creator &amp; Founder
          </p>

          <div className="space-y-4 text-slate-300 text-[15px] leading-relaxed font-light">
            <p>I&rsquo;m not an engineer.</p>

            <p>
              I&rsquo;m an AI product manager who spends too many mornings reading stories
              that end the same way: a child with a rare condition misdiagnosed for years,
              a family that fought for answers and ran out of time, a patient whose records held
              the truth but no one ever connected the dots. Different names, different diseases,
              same ending.
            </p>

            <p>I built this because I&rsquo;m tired of that ending.</p>

            <p>
              Opus 4.6 and Claude Code made it possible for someone like me, someone who
              understands the problem but can&rsquo;t write production code, to build a system
              with six AI agents, real-time bias detection, and a constitution that rewrites itself.
              In 3 days.
            </p>

            <p>
              The next generation of AI products won&rsquo;t be built only by engineers.
              They&rsquo;ll be built by the people who can&rsquo;t stop thinking about the problem.
            </p>
          </div>

          {/* Social links */}
          <div className="flex items-center gap-3 mt-8">
            {SOCIAL_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={link.label}
                className="p-2.5 rounded-lg border border-slate-700/80 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/40 transition-colors duration-200"
              >
                {link.icon}
              </a>
            ))}
          </div>
        </motion.div>

        {/* ── 3. BUILT WITH CLAUDE ── */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="rounded-xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-sm p-8 md:p-10 text-center"
        >
          <p className="text-[11px] tracking-[0.3em] uppercase text-slate-500 font-semibold mb-2">
            Built With
          </p>
          <h3 className="text-xl md:text-2xl font-bold mb-5 tracking-tight">
            Claude, by Anthropic
          </h3>

          <p className="text-slate-400 text-sm md:text-base leading-relaxed max-w-2xl mx-auto mb-8 font-light">
            Designed and built in partnership with Claude. Architecture through conversation.
            Code through Claude Code. Every diagnostic agent powered by Opus 4.6, the only
            model with the context, thinking depth, and parallel execution to make this possible.
          </p>

          {/* Tech stack pills */}
          <div className="flex flex-wrap justify-center gap-2 mb-8">
            {TECH_PILLS.map((tech) => (
              <span
                key={tech}
                className="px-3.5 py-1.5 rounded-full border border-slate-700/80 text-slate-400 text-xs font-medium tracking-wide"
              >
                {tech}
              </span>
            ))}
          </div>

          {/* Footer line */}
          <p className="text-slate-600 text-xs tracking-wide">
            The Emergent Diagnostic Institution &middot; Built with Opus 4.6: a Claude Code
            Hackathon &middot; February 2026
          </p>
        </motion.div>

      </div>
    </section>
  );
}
