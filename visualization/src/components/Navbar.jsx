import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';

const NAV_LINKS = [
  { id: 'patient-story', label: 'Patient Story' },
  { id: 'the-process', label: 'The Process' },
  { id: 'diagnosis', label: 'Diagnosis' },
  { id: 'institution-learns', label: 'Institution Learns' },
  { id: 'eval-results', label: 'Results' },
  { id: 'how-it-works', label: 'How It Works' },
  { id: 'about', label: 'About' },
];

const CASE_NAV_LINKS = [
  { id: 'patient-story', label: 'Patient Story' },
  { id: 'the-process', label: 'The Process' },
  { id: 'diagnosis', label: 'Diagnosis' },
  { id: 'institution-learns', label: 'Institution Learns' },
];

const NAV_HEIGHT = 60;

export default function Navbar({ mode = 'showcase' }) {
  const isCase = mode === 'case';
  const links = isCase ? CASE_NAV_LINKS : NAV_LINKS;

  const [activeId, setActiveId] = useState(null);
  const [scrolled, setScrolled] = useState(isCase); // Always scrolled on case pages
  const [menuOpen, setMenuOpen] = useState(false);

  // Track which section is in view
  useEffect(() => {
    const sectionIds = isCase
      ? links.map(l => l.id)
      : ['hero', 'run-diagnosis', ...links.map(l => l.id)];
    const observers = [];

    for (const id of sectionIds) {
      const el = document.getElementById(id);
      if (!el) continue;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            if (id === 'hero' && !isCase) {
              setActiveId(null);
              setScrolled(false);
            } else {
              setActiveId(id);
              if (!isCase) setScrolled(true);
            }
          }
        },
        { rootMargin: `-${NAV_HEIGHT + 20}px 0px -40% 0px`, threshold: 0 }
      );
      observer.observe(el);
      observers.push(observer);
    }

    return () => observers.forEach(o => o.disconnect());
  }, [isCase, links]);

  // Fallback: use scroll position to detect when past hero (showcase only)
  useEffect(() => {
    if (isCase) return;
    function onScroll() {
      setScrolled(window.scrollY > window.innerHeight * 0.6);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [isCase]);

  const scrollTo = useCallback((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - NAV_HEIGHT;
    window.scrollTo({ top: y, behavior: 'smooth' });
    setMenuOpen(false);
  }, []);

  return (
    <motion.nav
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'bg-slate-900/80 backdrop-blur-md border-b border-slate-800/50 shadow-lg shadow-black/20'
          : 'bg-transparent border-b border-transparent'
      }`}
      style={{ height: NAV_HEIGHT }}
    >
      <div className="max-w-7xl mx-auto h-full px-5 flex items-center justify-between">
        {/* Left: Logo / Back link */}
        {isCase ? (
          <Link
            to="/"
            className="flex items-center gap-2 text-slate-400 hover:text-cyan-400 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            <span className="text-[11px] tracking-[0.15em] uppercase font-medium hidden sm:inline">
              Back to Showcase
            </span>
          </Link>
        ) : (
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className={`flex items-center gap-2 transition-opacity duration-500 ${
              scrolled ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-none" />
            <span className="text-cyan-400 text-[11px] tracking-[0.2em] uppercase font-medium hidden sm:inline">
              The Emergent Diagnostic Institution
            </span>
            <span className="text-cyan-400 text-[11px] tracking-[0.2em] uppercase font-medium sm:hidden">
              EDI
            </span>
          </button>
        )}

        {/* Right: Desktop nav links + CTA */}
        <div className={`hidden md:flex items-center gap-1 transition-opacity duration-500 ${
          scrolled ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}>
          {links.map((link) => (
            <button
              key={link.id}
              onClick={() => scrollTo(link.id)}
              className={`relative px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-200 ${
                activeId === link.id
                  ? 'text-cyan-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {link.label}
              {activeId === link.id && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute inset-0 rounded-md bg-cyan-500/[0.08] border border-cyan-500/20"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          ))}

          {/* Gradient CTA — showcase only */}
          {!isCase && (
            <button
              onClick={() => scrollTo('run-diagnosis')}
              className="ml-3 px-4 py-1.5 text-xs font-semibold rounded-full bg-gradient-to-r from-cyan-500 to-violet-500 text-white hover:from-cyan-400 hover:to-violet-400 transition-all shadow-sm shadow-cyan-500/20"
            >
              Run a Diagnosis
            </button>
          )}
        </div>

        {/* Right: Mobile hamburger */}
        <button
          onClick={() => setMenuOpen(prev => !prev)}
          className={`md:hidden p-2 rounded-md transition-all duration-500 ${
            scrolled ? 'opacity-100 text-slate-400 hover:text-white' : 'opacity-0 pointer-events-none'
          }`}
          aria-label="Toggle menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {menuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile dropdown */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden bg-slate-900/95 backdrop-blur-md border-b border-slate-800/50 overflow-hidden"
          >
            <div className="px-5 py-3 space-y-1">
              {/* CTA at top of mobile menu — showcase only */}
              {!isCase && (
                <button
                  onClick={() => scrollTo('run-diagnosis')}
                  className="block w-full text-left px-3 py-2.5 text-sm font-semibold rounded-md bg-gradient-to-r from-cyan-500 to-violet-500 text-white mb-2"
                >
                  Run a Diagnosis
                </button>
              )}

              {/* Back to Showcase — case only */}
              {isCase && (
                <Link
                  to="/"
                  onClick={() => setMenuOpen(false)}
                  className="block w-full text-left px-3 py-2.5 text-sm text-cyan-400 rounded-md hover:bg-slate-800/50 mb-2"
                >
                  &larr; Back to Showcase
                </Link>
              )}

              {links.map((link) => (
                <button
                  key={link.id}
                  onClick={() => scrollTo(link.id)}
                  className={`block w-full text-left px-3 py-2.5 text-sm rounded-md transition-colors ${
                    activeId === link.id
                      ? 'text-cyan-400 bg-cyan-500/[0.08]'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  {link.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
