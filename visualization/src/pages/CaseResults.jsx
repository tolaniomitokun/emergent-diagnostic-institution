import { useParams, Link } from 'react-router-dom';
import { useData } from '../hooks/useData';
import Navbar from '../components/Navbar';
import PatientTimeline from '../sections/PatientTimeline';
import InstitutionAtWork from '../sections/InstitutionAtWork';
import Diagnosis from '../sections/Diagnosis';
import InstitutionLearns from '../sections/InstitutionLearns';

export default function CaseResults() {
  const { caseId } = useParams();
  const { data, loading, error } = useData('/data/user-results');

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-cyan-400 text-sm tracking-widest uppercase">Loading case results</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
        <div className="text-center max-w-lg">
          <p className="text-slate-300 text-lg font-semibold mb-2">Case Not Available</p>
          <p className="text-slate-500 text-sm mb-6">
            This case is no longer available. Results are stored temporarily during your session.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Back to Showcase
          </Link>
        </div>
      </div>
    );
  }

  const patientName = data.caseData?.patient?.name || 'Patient';

  return (
    <div className="bg-gray-950 text-white min-h-screen">
      <Navbar mode="case" />

      {/* Case header */}
      <div className="pt-24 pb-12 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-cyan-400 text-xs tracking-[0.3em] uppercase mb-3 font-medium">
            Case Analysis
          </p>
          <h1 className="text-3xl md:text-4xl font-bold mb-3 tracking-tight">
            {patientName}
          </h1>
          <p className="text-slate-500 text-sm">
            {caseId?.replace(/_/g, ' ')} &middot; Analyzed by The Emergent Diagnostic Institution
          </p>
        </div>
      </div>

      <div className="section-divider" />

      <div id="patient-story" className="scroll-mt-[60px]">
        <PatientTimeline timeline={data.caseData.timeline} patient={data.caseData.patient} caseTitle={data.caseData.case_title !== 'User-Submitted Case' ? data.caseData.case_title : null} />
      </div>

      <div className="section-divider" />

      <div id="the-process" className="scroll-mt-[60px]">
        <InstitutionAtWork
          round1={data.round1}
          round2={data.round2}
          observerR1={data.observerR1}
          observerR2={data.observerR2}
          diagnosis={data.diagnosis}
        />
      </div>

      <div className="section-divider" />

      <div id="diagnosis" className="scroll-mt-[60px]">
        <Diagnosis explanation={data.patientExplanation} diagnosis={data.diagnosis} patientName={patientName !== 'Patient' ? patientName : null} />
      </div>

      <div className="section-divider" />

      <div id="institution-learns" className="scroll-mt-[60px]">
        <InstitutionLearns amendments={data.amendments} />
      </div>

      {/* Footer */}
      <div className="section-divider" />
      <footer className="py-16 px-6 text-center">
        <p className="text-slate-600 text-xs tracking-wide">
          This case was analyzed by The Emergent Diagnostic Institution. Built with Claude Opus 4.6.
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
