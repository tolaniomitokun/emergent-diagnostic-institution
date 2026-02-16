import { useState, useEffect, useCallback } from 'react';

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}

// Age range labels for timeline keys
const AGE_LABELS = {
  age_0_to_2: '0\u20132 years',
  age_2_to_4: '2\u20134 years',
  age_4_to_7: '4\u20137 years',
  age_7_to_10: '7\u201310 years',
  age_10_to_14: '10\u201314 years',
};

// Critical miss annotations (from reference file, not shown to the AI pipeline)
const CRITICAL_MISS = {
  age_0_to_2: 'Early motor plateau at 18 months was dismissed as normal variation. No further workup was initiated.',
  age_2_to_4: 'The hand-wringing was stereotypic, not stimming. The staring spells were likely absence seizures. No EEG was ordered. The ASD diagnosis anchored all subsequent providers.',
  age_4_to_7: 'True autism does not feature loss of previously acquired motor skills. The mildly prominent ventricles on MRI, combined with motor regression, should have prompted metabolic workup or genetic testing.',
  age_7_to_10: 'Progressive cerebellar atrophy was finally noted when two MRIs were compared. The elevated lactate was noted but not urgently followed up \u2014 the family was told to schedule a genetics appointment (4-month wait).',
  age_10_to_14: 'At age 13, a geneticist finally questioned the ASD diagnosis. The entire trajectory \u2014 regression, seizures, cerebellar atrophy, elevated lactate \u2014 pointed to a neurodegenerative disorder that was NEVER autism.',
};

/** Convert the timeline object into an array of period entries. */
function normalizeTimeline(timeline) {
  if (!timeline) return [];
  // If it's already an array, return as-is
  if (Array.isArray(timeline)) return timeline;

  // Handle unstructured full_narrative from user submissions
  if (timeline.full_narrative && Object.keys(timeline).filter(k => k !== 'full_narrative').length === 0) {
    const sentences = timeline.full_narrative
      .split(/\.\s+/)
      .filter(s => s.trim())
      .map(s => s.replace(/\.$/, ''));
    return [{
      age_range: 'Full History',
      observations: sentences,
      medical_contacts: [],
      tests: [],
      diagnoses_given: [],
      critical_miss: '',
    }];
  }

  // Convert object keyed by age_X_to_Y into an array
  return Object.entries(timeline).map(([key, val]) => {
    // observations might be a string — split into sentences
    let observations = val.observations;
    if (typeof observations === 'string') {
      observations = observations.split(/\.\s+/).filter(s => s.trim()).map(s => s.replace(/\.$/, ''));
    }
    return {
      age_range: AGE_LABELS[key] || key.replace(/_/g, ' '),
      observations,
      medical_contacts: val.medical_contacts || [],
      tests: val.tests || [],
      diagnoses_given: val.diagnoses_given || [],
      critical_miss: val.critical_miss || CRITICAL_MISS[key] || '',
    };
  });
}

export function useData(basePath = '/data') {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (overridePath) => {
    const prefix = overridePath || basePath;
    setLoading(true);
    setError(null);
    try {
      const [
        caseData,
        r1Neurologist, r1DevPeds, r1Geneticist,
        r2Neurologist, r2DevPeds, r2Geneticist,
        observerR1, observerR2,
        diagnosis,
        patientExplanation,
        amendments,
        evalResults,
      ] = await Promise.all([
        fetchJSON(`${prefix}/case.json`),
        fetchJSON(`${prefix}/round1/neurologist.json`),
        fetchJSON(`${prefix}/round1/developmental_pediatrician.json`),
        fetchJSON(`${prefix}/round1/geneticist.json`),
        fetchJSON(`${prefix}/round2/neurologist.json`),
        fetchJSON(`${prefix}/round2/developmental_pediatrician.json`),
        fetchJSON(`${prefix}/round2/geneticist.json`),
        fetchJSON(`${prefix}/observer/round1.json`),
        fetchJSON(`${prefix}/observer/round2.json`),
        fetchJSON(`${prefix}/diagnosis.json`),
        fetchText(`${prefix}/patient_explanation.md`),
        fetchJSON(`${prefix}/amendments.json`),
        fetchJSON(`${prefix}/eval-results.json`).catch(() => null),
      ]);

      // Normalize the timeline into an array
      caseData.timeline = normalizeTimeline(caseData.timeline);

      setData({
        caseData,
        round1: {
          neurologist: r1Neurologist,
          developmental_pediatrician: r1DevPeds,
          geneticist: r1Geneticist,
        },
        round2: {
          neurologist: r2Neurologist,
          developmental_pediatrician: r2DevPeds,
          geneticist: r2Geneticist,
        },
        observerR1,
        observerR2,
        diagnosis,
        patientExplanation,
        amendments,
        evalResults,
      });
    } catch (e) {
      console.error('Failed to load data:', e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [basePath]);

  // Initial load
  useEffect(() => { load(); }, [load]);

  return { data, loading, error, reload: load };
}
