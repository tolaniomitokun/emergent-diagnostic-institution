import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import {
  mkdirSync, writeFileSync, readFileSync, existsSync, cpSync, rmSync,
} from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// ── Paths ──────────────────────────────────────────────────────────────────────

const PROJECT_ROOT = resolve(__dirname, '..');
const SHARED_DIR = resolve(PROJECT_ROOT, 'shared');
const STATE_FILE = resolve(SHARED_DIR, 'visualization', 'state.json');
const USER_RESULTS_DIR = resolve(__dirname, 'public', 'data', 'user-results');

// ── Middleware ──────────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ── Access codes ───────────────────────────────────────────────────────────────

const ACCESS_CODES = (process.env.ACCESS_CODES || '')
  .split(',')
  .map(s => s.trim().toUpperCase())
  .filter(Boolean);

function isValidCode(code) {
  return ACCESS_CODES.includes((code || '').trim().toUpperCase());
}

// ── Pipeline state ─────────────────────────────────────────────────────────────

let runInProgress = false;
let orchestratorProcess = null;
let currentRunId = null;
let sseClients = [];
let killTimer = null;
let lastKnownPhase = null;
let statePoller = null;
let reasoningPoller = null;
let seenFiles = new Set();
let stderrBuffer = '';

const PYTHON_BIN = process.env.PYTHON_BIN || 'python3';
const TIMEOUT_MS = 25 * 60 * 1000; // 25 minutes

// ── Phase-to-stage mapping ─────────────────────────────────────────────────────

const STAGE_MESSAGES = [
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

const PHASE_MAP = {
  'specialist_analysis:1': { index: 1, message: 'Round 1: Specialists analyzing independently' },
  'observer_analysis:1':   { index: 4, message: 'Metacognitive Observer scanning for biases' },
  'observer_complete:1':   { index: 4, message: 'Metacognitive Observer scanning for biases' },
  'specialist_debate:2':   { index: 5, message: 'Round 2: Specialists debating with Observer feedback' },
  'observer_analysis:2':   { index: 5, message: 'Round 2: Specialists debating with Observer feedback' },
  'observer_complete:2':   { index: 5, message: 'Round 2: Specialists debating with Observer feedback' },
  'synthesis':             { index: 6, message: 'Synthesizing institutional diagnosis' },
  'synthesis_complete':    { index: 6, message: 'Synthesizing institutional diagnosis' },
  'patient_translation':   { index: 7, message: 'Translating for patient communication' },
  'translation_complete':  { index: 7, message: 'Translating for patient communication' },
  'constitution_amendment': { index: 8, message: 'Amending clinical constitution' },
  'amendment_complete':    { index: 8, message: 'Amending clinical constitution' },
};

function mapPhaseToStage(phase, round) {
  // Try round-qualified key first, then bare phase
  const key = PHASE_MAP[`${phase}:${round}`] ? `${phase}:${round}` : phase;
  const entry = PHASE_MAP[key];
  if (!entry) return null;
  return { stage: 'running', ...entry, total: STAGE_MESSAGES.length };
}

// ── SSE helpers ────────────────────────────────────────────────────────────────

function broadcastSSE(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  sseClients = sseClients.filter(res => {
    try { res.write(data); return true; }
    catch { return false; }
  });
}

// ── Reasoning extraction helpers ──────────────────────────────────────────────

const DEBATE_DIR = resolve(SHARED_DIR, 'debate');
const OBSERVER_DIR = resolve(SHARED_DIR, 'observer');
const OUTPUT_DIR = resolve(SHARED_DIR, 'output');
const CONSTITUTION_DIR = resolve(SHARED_DIR, 'constitution');

const AGENT_DISPLAY = {
  neurologist:                 { name: 'Neurologist',          icon: 'brain' },
  developmental_pediatrician:  { name: 'Dev. Pediatrician',    icon: 'baby' },
  geneticist:                  { name: 'Geneticist',           icon: 'dna' },
};

function truncate(str, max = 200) {
  if (!str) return '';
  const clean = str.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return clean.substring(0, max).replace(/\s\S*$/, '') + '...';
}

function tryReadJSON(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch { return null; }
}

function extractReasoning() {
  // ── Round 1 specialist files ──────────────────────────────────────────
  for (const [fileKey, display] of Object.entries(AGENT_DISPLAY)) {
    const filePath = resolve(DEBATE_DIR, 'round_1', `${fileKey}.json`);
    const key = `r1:${fileKey}`;
    if (seenFiles.has(key)) continue;

    const data = tryReadJSON(filePath);
    if (!data) continue;
    seenFiles.add(key);

    // Extract diagnosis hypothesis and first key evidence item
    const hypothesis = data.diagnosis_hypothesis || data.analysis?.primary_hypothesis || '';
    const evidence = Array.isArray(data.key_evidence) ? data.key_evidence[0] : '';
    const text = hypothesis
      ? truncate(hypothesis, 180)
      : truncate(evidence, 180) || `Analysis complete (confidence: ${data.confidence || '?'})`;

    broadcastSSE({
      type: 'reasoning',
      agent: fileKey,
      agentName: display.name,
      icon: display.icon,
      round: 1,
      text,
    });
  }

  // ── Observer Round 1 ──────────────────────────────────────────────────
  const obs1Path = resolve(OBSERVER_DIR, 'analysis_round_1.json');
  if (!seenFiles.has('obs1')) {
    const data = tryReadJSON(obs1Path);
    if (data) {
      seenFiles.add('obs1');
      const biases = data.biases_detected || [];
      if (biases.length > 0) {
        const b = biases[0];
        const text = `BIAS DETECTED: ${b.bias_type?.replace(/_/g, ' ')} in ${b.agent || 'specialist'} — ${truncate(b.evidence || b.recommendation || '', 140)}`;
        broadcastSSE({ type: 'reasoning', agent: 'observer', agentName: 'Observer', icon: 'eye', round: 1, text });
      }
      // Send a second message if there are multiple biases
      if (biases.length > 1) {
        const count = biases.length;
        const severities = biases.filter(b => b.severity === 'high' || b.severity === 'critical').length;
        const text = severities > 0
          ? `Found ${count} total biases across specialists — ${severities} rated high/critical severity`
          : `Found ${count} cognitive biases across the team. Recommending corrections for Round 2`;
        broadcastSSE({ type: 'reasoning', agent: 'observer_summary', agentName: 'Observer', icon: 'eye', round: 1, text });
      }
    }
  }

  // ── Round 2 specialist files ──────────────────────────────────────────
  for (const [fileKey, display] of Object.entries(AGENT_DISPLAY)) {
    const filePath = resolve(DEBATE_DIR, 'round_2', `${fileKey}.json`);
    const key = `r2:${fileKey}`;
    if (seenFiles.has(key)) continue;

    const data = tryReadJSON(filePath);
    if (!data) continue;
    seenFiles.add(key);

    // Look for confidence change and bias acknowledgment
    const r1Path = resolve(DEBATE_DIR, 'round_1', `${fileKey}.json`);
    const r1Data = tryReadJSON(r1Path);
    let text = '';

    if (data.bias_acknowledgment) {
      text = truncate(data.bias_acknowledgment, 180);
    } else if (r1Data && data.confidence && r1Data.confidence) {
      const oldConf = (r1Data.confidence * 100).toFixed(0);
      const newConf = (data.confidence * 100).toFixed(0);
      text = oldConf !== newConf
        ? `Revised confidence from ${oldConf}% to ${newConf}% after Observer feedback. ${truncate(data.diagnosis_hypothesis || '', 100)}`
        : `Maintained position at ${newConf}% confidence after peer review. ${truncate(data.diagnosis_hypothesis || '', 100)}`;
    } else {
      text = truncate(data.diagnosis_hypothesis || '', 180) || 'Round 2 analysis complete';
    }

    broadcastSSE({ type: 'reasoning', agent: fileKey, agentName: display.name, icon: display.icon, round: 2, text });
  }

  // ── Observer Round 2 ──────────────────────────────────────────────────
  const obs2Path = resolve(OBSERVER_DIR, 'analysis_round_2.json');
  if (!seenFiles.has('obs2')) {
    const data = tryReadJSON(obs2Path);
    if (data) {
      seenFiles.add('obs2');
      const quality = data.reasoning_quality;
      if (quality) {
        const overall = quality.overall_score ? (quality.overall_score * 100).toFixed(0) : null;
        const text = overall
          ? `Round 2 reasoning quality: ${overall}% overall. Independence: ${((quality.independence_score || 0) * 100).toFixed(0)}%, Evidence utilization: ${((quality.evidence_utilization || 0) * 100).toFixed(0)}%`
          : 'Round 2 quality assessment complete';
        broadcastSSE({ type: 'reasoning', agent: 'observer', agentName: 'Observer', icon: 'eye', round: 2, text });
      }
    }
  }

  // ── Synthesis / final diagnosis ───────────────────────────────────────
  const diagPath = resolve(OUTPUT_DIR, 'final_diagnosis.json');
  if (!seenFiles.has('synthesis')) {
    const data = tryReadJSON(diagPath);
    if (data) {
      seenFiles.add('synthesis');
      const text = data.primary_diagnosis
        ? `Primary diagnosis: ${truncate(data.primary_diagnosis, 160)}`
        : truncate(data.reasoning_chain || '', 180) || 'Synthesis complete';
      broadcastSSE({ type: 'reasoning', agent: 'synthesis', agentName: 'Synthesis', icon: 'convergence', round: 0, text });
    }
  }

  // ── Patient explanation ───────────────────────────────────────────────
  const letterPath = resolve(OUTPUT_DIR, 'patient_explanation.md');
  if (!seenFiles.has('letter')) {
    try {
      if (existsSync(letterPath)) {
        const content = readFileSync(letterPath, 'utf-8');
        if (content.trim()) {
          seenFiles.add('letter');
          // Extract opening line after any title
          const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
          const opening = lines[0] || '';
          broadcastSSE({ type: 'reasoning', agent: 'translator', agentName: 'Translator', icon: 'letter', round: 0, text: truncate(opening, 180) });
        }
      }
    } catch {}
  }

  // ── Constitution amendments ───────────────────────────────────────────
  const amendPath = resolve(CONSTITUTION_DIR, 'amendments_log.json');
  if (!seenFiles.has('amendments')) {
    const data = tryReadJSON(amendPath);
    if (data) {
      const amendments = Array.isArray(data) ? data : data.amendments || [];
      // Only consider amendments from the current run (most recent ones)
      if (amendments.length > 0) {
        seenFiles.add('amendments');
        const latest = amendments[amendments.length - 1];
        const text = latest.proposal
          ? `New amendment: ${truncate(latest.proposal, 160)}`
          : `${amendments.length} constitutional amendment${amendments.length !== 1 ? 's' : ''} proposed`;
        broadcastSSE({ type: 'reasoning', agent: 'amender', agentName: 'Amender', icon: 'scroll', round: 0, text });
      }
    }
  }
}

// ── File copy helpers ──────────────────────────────────────────────────────────

function copyResultsToUserDir() {
  const dest = USER_RESULTS_DIR;
  for (const dir of ['round1', 'round2', 'observer']) {
    mkdirSync(resolve(dest, dir), { recursive: true });
  }
  const copies = [
    [resolve(SHARED_DIR, 'cases', 'current_case.json'), 'case.json'],
    [resolve(SHARED_DIR, 'debate', 'round_1', 'neurologist.json'), 'round1/neurologist.json'],
    [resolve(SHARED_DIR, 'debate', 'round_1', 'developmental_pediatrician.json'), 'round1/developmental_pediatrician.json'],
    [resolve(SHARED_DIR, 'debate', 'round_1', 'geneticist.json'), 'round1/geneticist.json'],
    [resolve(SHARED_DIR, 'debate', 'round_2', 'neurologist.json'), 'round2/neurologist.json'],
    [resolve(SHARED_DIR, 'debate', 'round_2', 'developmental_pediatrician.json'), 'round2/developmental_pediatrician.json'],
    [resolve(SHARED_DIR, 'debate', 'round_2', 'geneticist.json'), 'round2/geneticist.json'],
    [resolve(SHARED_DIR, 'observer', 'analysis_round_1.json'), 'observer/round1.json'],
    [resolve(SHARED_DIR, 'observer', 'analysis_round_2.json'), 'observer/round2.json'],
    [resolve(SHARED_DIR, 'output', 'final_diagnosis.json'), 'diagnosis.json'],
    [resolve(SHARED_DIR, 'output', 'patient_explanation.md'), 'patient_explanation.md'],
    [resolve(SHARED_DIR, 'constitution', 'amendments_log.json'), 'amendments.json'],
  ];
  let copied = 0;
  for (const [src, dst] of copies) {
    if (existsSync(src)) {
      cpSync(src, resolve(dest, dst));
      copied++;
    }
  }
  console.log(`[server] Copied ${copied}/${copies.length} result files to user-results/`);
}

// ── Cleanup ────────────────────────────────────────────────────────────────────

function cleanup() {
  if (statePoller) { clearInterval(statePoller); statePoller = null; }
  if (reasoningPoller) { clearInterval(reasoningPoller); reasoningPoller = null; }
  if (killTimer) { clearTimeout(killTimer); killTimer = null; }
  orchestratorProcess = null;
  runInProgress = false;
  lastKnownPhase = null;
  seenFiles = new Set();
  stderrBuffer = '';
  // Close all SSE connections
  sseClients.forEach(res => { try { res.end(); } catch {} });
  sseClients = [];
  // Clean up temp dir
  if (currentRunId) {
    const tempDir = `/tmp/edi-case-${currentRunId}`;
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
    currentRunId = null;
  }
}

// ── Routes ─────────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.post('/api/validate-code', (req, res) => {
  const { accessCode } = req.body || {};
  res.json({ valid: isValidCode(accessCode) });
});

app.post('/api/run-diagnosis', (req, res) => {
  const { accessCode, caseText, images } = req.body || {};

  if (!isValidCode(accessCode)) {
    return res.status(401).json({ error: 'Invalid access code' });
  }

  if (runInProgress) {
    return res.status(429).json({
      error: 'A diagnosis is currently in progress. Please wait.',
    });
  }

  if (!caseText || !caseText.trim()) {
    return res.status(400).json({ error: 'Case text is required' });
  }

  // ── Set up run ─────────────────────────────────────────────────────────────
  runInProgress = true;
  currentRunId = Date.now();
  stderrBuffer = '';
  lastKnownPhase = null;

  const tempDir = `/tmp/edi-case-${currentRunId}`;
  mkdirSync(tempDir, { recursive: true });

  // ── Build case.json ────────────────────────────────────────────────────────
  const firstParagraph = caseText.split(/\n\s*\n/)[0] || caseText.substring(0, 500);

  const caseData = {
    case_id: `user_case_${currentRunId}`,
    case_title: 'User-Submitted Case',
    narrative_context: 'Case submitted via EDI web interface',
    patient: {
      name: 'Patient',
      presenting_context: caseText.substring(0, 200),
    },
    chief_complaint: firstParagraph,
    timeline: {
      full_narrative: caseText,
    },
    complete_record_summary: {
      records_fragmentation: 'Complete record provided via web interface',
    },
  };

  // ── Save images if present ─────────────────────────────────────────────────
  if (images && images.length > 0) {
    caseData.attached_images = images.map((img, i) => {
      const ext = (img.mimeType || 'image/png').split('/')[1] || 'png';
      const filename = img.filename || `image_${i}.${ext}`;
      const filepath = resolve(tempDir, filename);
      writeFileSync(filepath, Buffer.from(img.base64, 'base64'));
      return { path: filepath, mime_type: img.mimeType, filename };
    });
  }

  const casePath = resolve(tempDir, 'case.json');
  writeFileSync(casePath, JSON.stringify(caseData, null, 2));

  // ── Send initial SSE event ─────────────────────────────────────────────────
  broadcastSSE({
    stage: 'running',
    index: 0,
    message: 'Loading case and constitution',
    total: STAGE_MESSAGES.length,
  });

  // ── Spawn orchestrator ─────────────────────────────────────────────────────
  console.log(`[server] Spawning pipeline: ${PYTHON_BIN} orchestrator.py ${casePath}`);

  orchestratorProcess = spawn(
    PYTHON_BIN,
    [resolve(PROJECT_ROOT, 'orchestrator.py'), casePath],
    {
      cwd: PROJECT_ROOT,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  // ── Stdout: log + parse specialist completions for granular updates ────────
  let stdoutLine = '';
  orchestratorProcess.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    stdoutLine += text;

    // Process complete lines
    const lines = stdoutLine.split('\n');
    stdoutLine = lines.pop(); // keep incomplete line

    for (const line of lines) {
      if (line.trim()) console.log('[orchestrator]', line);

      // Detect individual specialist completions for fine-grained R1 progress
      if (line.includes('✅') && line.includes('Neurologist') && !line.includes('Round 2')) {
        broadcastSSE({ stage: 'running', index: 1, message: 'Round 1: Neurologist complete', total: STAGE_MESSAGES.length });
      } else if (line.includes('✅') && (line.includes('Developmental Pediatrician') || line.includes('Dev.')) && !line.includes('Round 2')) {
        broadcastSSE({ stage: 'running', index: 2, message: 'Round 1: Dev. Pediatrician complete', total: STAGE_MESSAGES.length });
      } else if (line.includes('✅') && line.includes('Geneticist') && !line.includes('Round 2')) {
        broadcastSSE({ stage: 'running', index: 3, message: 'Round 1: Geneticist complete', total: STAGE_MESSAGES.length });
      }
    }
  });

  // ── Stderr: capture for error reporting ────────────────────────────────────
  orchestratorProcess.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    stderrBuffer += text;
    console.error('[orchestrator:err]', text.trimEnd());
  });

  // ── Poll state.json for phase transitions ──────────────────────────────────
  statePoller = setInterval(() => {
    try {
      if (!existsSync(STATE_FILE)) return;
      const state = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
      const phaseKey = `${state.phase}:${state.current_round}`;
      if (phaseKey === lastKnownPhase) return;
      lastKnownPhase = phaseKey;

      const event = mapPhaseToStage(state.phase, state.current_round);
      if (event) broadcastSSE(event);
    } catch {
      // Ignore parse errors during concurrent writes
    }
  }, 2000);

  // ── Poll shared/ directories for reasoning content ────────────────────────
  seenFiles = new Set();
  reasoningPoller = setInterval(() => {
    try { extractReasoning(); } catch {}
  }, 3000);

  // ── Process completion ─────────────────────────────────────────────────────
  orchestratorProcess.on('close', (code) => {
    console.log(`[server] Orchestrator exited with code ${code}`);

    if (code === 0) {
      try {
        copyResultsToUserDir();
        broadcastSSE({
          stage: 'complete',
          message: 'Diagnosis complete',
          index: 9,
          total: STAGE_MESSAGES.length,
          resultsPath: '/data/user-results/',
          caseId: `user_case_${currentRunId}`,
        });
      } catch (err) {
        console.error('[server] Error copying results:', err);
        broadcastSSE({
          stage: 'error',
          message: 'Pipeline completed but failed to copy results.',
        });
      }
    } else {
      const errMsg = stderrBuffer.trim().split('\n').slice(-3).join(' ') || `Pipeline failed with exit code ${code}`;
      broadcastSSE({
        stage: 'error',
        message: errMsg.substring(0, 500),
      });
    }

    cleanup();
  });

  orchestratorProcess.on('error', (err) => {
    console.error('[server] Failed to spawn orchestrator:', err);
    broadcastSSE({
      stage: 'error',
      message: `Failed to start pipeline: ${err.message}`,
    });
    cleanup();
  });

  // ── 15-minute timeout ──────────────────────────────────────────────────────
  killTimer = setTimeout(() => {
    if (orchestratorProcess) {
      console.log('[server] Pipeline timed out after 25 minutes, killing process');
      orchestratorProcess.kill('SIGTERM');
      setTimeout(() => {
        if (orchestratorProcess) {
          try { orchestratorProcess.kill('SIGKILL'); } catch {}
        }
      }, 5000);
      broadcastSSE({
        stage: 'error',
        message: 'Analysis timed out. Complex cases may require more processing time.',
      });
      cleanup();
    }
  }, TIMEOUT_MS);

  res.json({ success: true, runId: currentRunId });
});

// ── SSE endpoint ───────────────────────────────────────────────────────────────

app.get('/api/run-status', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  // Add this client to the broadcast list
  sseClients.push(res);

  // Send current state
  if (!runInProgress) {
    res.write(`data: ${JSON.stringify({ stage: 'idle', message: 'No diagnosis in progress' })}\n\n`);
  } else if (lastKnownPhase) {
    // Send the latest known state to catch up
    try {
      const state = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
      const event = mapPhaseToStage(state.phase, state.current_round);
      if (event) res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      res.write(`data: ${JSON.stringify({ stage: 'running', index: 0, message: 'Loading case and constitution', total: STAGE_MESSAGES.length })}\n\n`);
    }
  }

  req.on('close', () => {
    sseClients = sseClients.filter(c => c !== res);
  });
});

// ── Cancel endpoint ────────────────────────────────────────────────────────────

app.post('/api/cancel-diagnosis', (req, res) => {
  if (orchestratorProcess) {
    console.log('[server] Cancelling diagnosis by user request');
    orchestratorProcess.kill('SIGTERM');
    broadcastSSE({ stage: 'error', message: 'Diagnosis cancelled' });
    cleanup();
  }
  res.json({ success: true });
});

// ── Serve user results statically (dev mode) ──────────────────────────────────

app.use('/data/user-results', express.static(USER_RESULTS_DIR));

// ── Static serving (production) ────────────────────────────────────────────────

app.use(express.static(join(__dirname, 'dist')));
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

// ── Start ──────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Access codes configured: ${ACCESS_CODES.length}`);
  console.log(`Orchestrator: ${PYTHON_BIN} ${resolve(PROJECT_ROOT, 'orchestrator.py')}`);
});
