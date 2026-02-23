import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import {
  mkdirSync, writeFileSync, readFileSync, existsSync, cpSync, rmSync, readdirSync,
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
let pipelineMode = 'legacy'; // 'legacy' or 'agentic'
let dynamicStages = [];       // Agentic mode: stages grow as Observer calls tools

const PYTHON_BIN = process.env.PYTHON_BIN || 'python3';
const PIPELINE_MODE = process.env.PIPELINE_MODE || 'legacy';
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

// ── Dynamic stage helpers (agentic mode) ───────────────────────────────────

function parseStructuredStage(jsonStr) {
  try {
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

function handleDynamicStage(stageEvent) {
  const { name, message, agent, round, index } = stageEvent;

  // Add to dynamic stages if not already present
  const existing = dynamicStages.findIndex(s => s.name === name);
  if (existing === -1) {
    dynamicStages.push({
      name,
      message: message || name.replace(/_/g, ' '),
      agent: agent || null,
      round: round || null,
      status: 'active',
    });
  }

  // Mark all earlier stages as done, current as active
  const currentIdx = dynamicStages.findIndex(s => s.name === name);
  dynamicStages = dynamicStages.map((s, i) => ({
    ...s,
    status: i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'pending',
  }));

  // Broadcast to SSE clients
  broadcastSSE({
    stage: name === 'complete' ? 'complete' : 'running',
    index: currentIdx,
    message: message || name,
    total: dynamicStages.length,
    dynamic: true,
    stages: dynamicStages,
  });
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
  // ── Dynamically scan all debate rounds for specialist files ──────────
  if (existsSync(DEBATE_DIR)) {
    let roundDirs;
    try { roundDirs = readdirSync(DEBATE_DIR).filter(d => d.startsWith('round_')).sort(); } catch { roundDirs = []; }

    for (const roundDir of roundDirs) {
      const roundNum = parseInt(roundDir.replace('round_', ''), 10) || 1;
      const roundPath = resolve(DEBATE_DIR, roundDir);

      let files;
      try { files = readdirSync(roundPath).filter(f => f.endsWith('.json')); } catch { continue; }

      for (const file of files) {
        const fileKey = file.replace('.json', '');
        const key = `r${roundNum}:${fileKey}`;
        if (seenFiles.has(key)) continue;

        const filePath = resolve(roundPath, file);
        const data = tryReadJSON(filePath);
        if (!data) continue;
        seenFiles.add(key);

        // Display name and icon — use known agents or derive from filename
        const display = AGENT_DISPLAY[fileKey] || {
          name: fileKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          icon: 'brain',
        };

        let text = '';
        if (roundNum > 1) {
          // For later rounds, look for bias acknowledgment or confidence change
          const r1Path = resolve(DEBATE_DIR, 'round_1', file);
          const r1Data = tryReadJSON(r1Path);

          if (data.bias_acknowledgment) {
            text = truncate(data.bias_acknowledgment, 180);
          } else if (r1Data && data.confidence && r1Data.confidence) {
            const oldConf = (r1Data.confidence * 100).toFixed(0);
            const newConf = (data.confidence * 100).toFixed(0);
            text = oldConf !== newConf
              ? `Revised confidence from ${oldConf}% to ${newConf}% after Observer feedback. ${truncate(data.diagnosis_hypothesis || '', 100)}`
              : `Maintained position at ${newConf}% confidence after peer review. ${truncate(data.diagnosis_hypothesis || '', 100)}`;
          } else {
            text = truncate(data.diagnosis_hypothesis || '', 180) || `Round ${roundNum} analysis complete`;
          }
        } else {
          // Round 1: independent analysis
          const hypothesis = data.diagnosis_hypothesis || data.analysis?.primary_hypothesis || '';
          const evidence = Array.isArray(data.key_evidence) ? data.key_evidence[0] : '';
          text = hypothesis
            ? truncate(hypothesis, 180)
            : truncate(evidence, 180) || `Analysis complete (confidence: ${data.confidence || '?'})`;
        }

        broadcastSSE({
          type: 'reasoning',
          agent: fileKey,
          agentName: display.name,
          icon: display.icon,
          round: roundNum,
          text,
        });
      }
    }
  }

  // ── Dynamically scan all observer analysis files ────────────────────
  if (existsSync(OBSERVER_DIR)) {
    let obsFiles;
    try { obsFiles = readdirSync(OBSERVER_DIR).filter(f => f.startsWith('analysis_round_') && f.endsWith('.json')).sort(); } catch { obsFiles = []; }

    for (const obsFile of obsFiles) {
      const roundMatch = obsFile.match(/analysis_round_(\d+)\.json/);
      if (!roundMatch) continue;
      const roundNum = parseInt(roundMatch[1], 10);
      const key = `obs${roundNum}`;
      if (seenFiles.has(key)) continue;

      const obsPath = resolve(OBSERVER_DIR, obsFile);
      const data = tryReadJSON(obsPath);
      if (!data) continue;
      seenFiles.add(key);

      // Bias detection message
      const biases = data.biases_detected || [];
      if (biases.length > 0) {
        const b = biases[0];
        const text = `BIAS DETECTED: ${b.bias_type?.replace(/_/g, ' ')} in ${b.agent || 'specialist'} — ${truncate(b.evidence || b.recommendation || '', 140)}`;
        broadcastSSE({ type: 'reasoning', agent: 'observer', agentName: 'Observer', icon: 'eye', round: roundNum, text });
      }
      if (biases.length > 1) {
        const count = biases.length;
        const severities = biases.filter(b => b.severity === 'high' || b.severity === 'critical').length;
        const text = severities > 0
          ? `Found ${count} total biases across specialists — ${severities} rated high/critical severity`
          : `Found ${count} cognitive biases across the team. Recommending corrections for Round ${roundNum + 1}`;
        broadcastSSE({ type: 'reasoning', agent: `observer_summary_r${roundNum}`, agentName: 'Observer', icon: 'eye', round: roundNum, text });
      }

      // Quality score message (for rounds > 1)
      const quality = data.reasoning_quality;
      if (quality && roundNum > 1) {
        const overall = quality.overall_score ? (quality.overall_score * 100).toFixed(0) : null;
        if (overall) {
          const text = `Round ${roundNum} reasoning quality: ${overall}% overall. Independence: ${((quality.independence_score || 0) * 100).toFixed(0)}%, Evidence utilization: ${((quality.evidence_utilization || 0) * 100).toFixed(0)}%`;
          broadcastSSE({ type: 'reasoning', agent: `observer_quality_r${roundNum}`, agentName: 'Observer', icon: 'eye', round: roundNum, text });
        }
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
  mkdirSync(resolve(dest, 'observer'), { recursive: true });

  // Always copy these fixed files
  const fixedCopies = [
    [resolve(SHARED_DIR, 'cases', 'current_case.json'), 'case.json'],
    [resolve(SHARED_DIR, 'output', 'final_diagnosis.json'), 'diagnosis.json'],
    [resolve(SHARED_DIR, 'output', 'patient_explanation.md'), 'patient_explanation.md'],
    [resolve(SHARED_DIR, 'constitution', 'amendments_log.json'), 'amendments.json'],
    [resolve(SHARED_DIR, 'output', 'pipeline_completion.json'), 'pipeline_completion.json'],
  ];

  let copied = 0;
  for (const [src, dst] of fixedCopies) {
    if (existsSync(src)) {
      cpSync(src, resolve(dest, dst));
      copied++;
    }
  }

  // Dynamically copy all round directories (round_1, round_2, round_3, etc.)
  if (existsSync(DEBATE_DIR)) {
    const roundDirs = readdirSync(DEBATE_DIR).filter(d => d.startsWith('round_'));
    for (const roundDir of roundDirs) {
      const roundNum = roundDir.replace('round_', '');
      const destRound = resolve(dest, `round${roundNum}`);
      mkdirSync(destRound, { recursive: true });
      const srcRound = resolve(DEBATE_DIR, roundDir);
      const files = readdirSync(srcRound).filter(f => f.endsWith('.json'));
      for (const file of files) {
        cpSync(resolve(srcRound, file), resolve(destRound, file));
        copied++;
      }
    }
  }

  // Copy all observer analysis files
  if (existsSync(OBSERVER_DIR)) {
    const obsFiles = readdirSync(OBSERVER_DIR).filter(f => f.endsWith('.json'));
    for (const file of obsFiles) {
      // Map analysis_round_1.json -> observer/round1.json for backward compat
      const roundMatch = file.match(/analysis_round_(\d+)\.json/);
      const destName = roundMatch ? `round${roundMatch[1]}.json` : file;
      cpSync(resolve(OBSERVER_DIR, file), resolve(dest, 'observer', destName));
      copied++;
    }
  }

  console.log(`[server] Copied ${copied} result files to user-results/`);
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
  pipelineMode = 'legacy';
  dynamicStages = [];
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
  const { accessCode, caseText, images, mode } = req.body || {};

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

  // ── Determine pipeline mode ──────────────────────────────────────────────
  // Client can request a mode; falls back to server env var, then 'legacy'
  pipelineMode = (mode === 'agentic' || mode === 'legacy') ? mode : PIPELINE_MODE;
  dynamicStages = [];

  // ── Send initial SSE event ─────────────────────────────────────────────────
  if (pipelineMode === 'agentic') {
    dynamicStages = [{ name: 'loading', message: 'Loading case and constitution', status: 'active' }];
    broadcastSSE({
      stage: 'running',
      index: 0,
      message: 'Loading case and constitution',
      total: 1,
      dynamic: true,
      stages: dynamicStages,
    });
  } else {
    broadcastSSE({
      stage: 'running',
      index: 0,
      message: 'Loading case and constitution',
      total: STAGE_MESSAGES.length,
    });
  }

  // ── Spawn orchestrator ─────────────────────────────────────────────────────
  const modeFlag = `--mode=${pipelineMode}`;
  console.log(`[server] Spawning pipeline (${pipelineMode}): ${PYTHON_BIN} orchestrator.py ${modeFlag} ${casePath}`);

  orchestratorProcess = spawn(
    PYTHON_BIN,
    [resolve(PROJECT_ROOT, 'orchestrator.py'), modeFlag, casePath],
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

      // ── Agentic mode: parse structured [STAGE] JSON events ──────────
      const stageJsonMatch = line.match(/\[STAGE\]\s*(\{.+\})/);
      if (stageJsonMatch && pipelineMode === 'agentic') {
        const stageEvent = parseStructuredStage(stageJsonMatch[1]);
        if (stageEvent) {
          handleDynamicStage(stageEvent);
          continue;
        }
      }

      // ── Legacy mode: detect individual specialist completions ────────
      if (pipelineMode === 'legacy') {
        if (line.includes('✅') && line.includes('Neurologist') && !line.includes('Round 2')) {
          broadcastSSE({ stage: 'running', index: 1, message: 'Round 1: Neurologist complete', total: STAGE_MESSAGES.length });
        } else if (line.includes('✅') && (line.includes('Developmental Pediatrician') || line.includes('Dev.')) && !line.includes('Round 2')) {
          broadcastSSE({ stage: 'running', index: 2, message: 'Round 1: Dev. Pediatrician complete', total: STAGE_MESSAGES.length });
        } else if (line.includes('✅') && line.includes('Geneticist') && !line.includes('Round 2')) {
          broadcastSSE({ stage: 'running', index: 3, message: 'Round 1: Geneticist complete', total: STAGE_MESSAGES.length });
        }
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

        // Build completion event
        const completionEvent = {
          stage: 'complete',
          message: 'Diagnosis complete',
          resultsPath: '/data/user-results/',
          caseId: `user_case_${currentRunId}`,
        };

        if (pipelineMode === 'agentic') {
          // Mark all dynamic stages as done
          dynamicStages = dynamicStages.map(s => ({ ...s, status: 'done' }));
          completionEvent.index = dynamicStages.length - 1;
          completionEvent.total = dynamicStages.length;
          completionEvent.dynamic = true;
          completionEvent.stages = dynamicStages;
        } else {
          completionEvent.index = 9;
          completionEvent.total = STAGE_MESSAGES.length;
        }

        broadcastSSE(completionEvent);
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
  } else if (pipelineMode === 'agentic' && dynamicStages.length > 0) {
    // Send current dynamic stage state
    const currentIdx = dynamicStages.findIndex(s => s.status === 'active');
    res.write(`data: ${JSON.stringify({
      stage: 'running',
      index: currentIdx >= 0 ? currentIdx : 0,
      message: dynamicStages[currentIdx >= 0 ? currentIdx : 0]?.message || 'Processing...',
      total: dynamicStages.length,
      dynamic: true,
      stages: dynamicStages,
    })}\n\n`);
  } else if (lastKnownPhase) {
    // Send the latest known state to catch up (legacy mode)
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
