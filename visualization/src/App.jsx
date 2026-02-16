import { Routes, Route } from 'react-router-dom';
import { useData } from './hooks/useData';
import Navbar from './components/Navbar';
import Hero from './sections/Hero';
import RunDiagnosis from './sections/RunDiagnosis';
import PatientTimeline from './sections/PatientTimeline';
import InstitutionAtWork from './sections/InstitutionAtWork';
import Diagnosis from './sections/Diagnosis';
import InstitutionLearns from './sections/InstitutionLearns';
import EvalResults from './sections/EvalResults';
import HowItWorks from './sections/HowItWorks';
import About from './sections/About';
import CaseResults from './pages/CaseResults';
import EvalSummary from './pages/EvalSummary';
import TitleCards from './pages/TitleCards';

function MainPage({ data, loading, error }) {
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-cyan-400 text-sm tracking-widest uppercase">Loading case data</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
        <div className="text-center max-w-lg">
          <p className="text-red-400 text-lg font-semibold mb-2">Failed to load data</p>
          <p className="text-slate-400 text-sm mb-4">{error}</p>
          <p className="text-slate-500 text-xs">
            Make sure the pipeline has been run first:<br />
            <code className="text-slate-400">python orchestrator.py cases/case_001_diagnostic_odyssey.json</code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-950 text-white">
      <Navbar />
      <div id="hero">
        <Hero />
      </div>
      <div className="section-divider" />
      <div id="run-diagnosis" className="scroll-mt-[60px]">
        <RunDiagnosis />
      </div>
      <div className="section-divider" />
      <div id="patient-story" className="scroll-mt-[60px]">
        <PatientTimeline timeline={data.caseData.timeline} patient={data.caseData.patient} caseTitle={data.caseData.case_title} />
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
        <Diagnosis explanation={data.patientExplanation} diagnosis={data.diagnosis} patientName={data.caseData?.patient?.name ? `${data.caseData.patient.name}'s Family` : null} />
      </div>
      <div className="section-divider" />
      <div id="institution-learns" className="scroll-mt-[60px]">
        <InstitutionLearns amendments={data.amendments} />
      </div>
      <div className="section-divider" />
      <div id="eval-results" className="scroll-mt-[60px]">
        <EvalResults evalData={data.evalResults} />
      </div>
      <div className="section-divider" />
      <div id="how-it-works" className="scroll-mt-[60px]">
        <HowItWorks />
      </div>
      <div className="section-divider" />
      <div id="about" className="scroll-mt-[60px]">
        <About />
      </div>
    </div>
  );
}

export default function App() {
  const { data, loading, error } = useData('/data');

  return (
    <Routes>
      <Route path="/" element={<MainPage data={data} loading={loading} error={error} />} />
      <Route path="/case/:caseId" element={<CaseResults />} />
      <Route path="/eval" element={<EvalSummary />} />
      <Route path="/titles" element={<TitleCards />} />
    </Routes>
  );
}
