const fs = require('fs');
const path = require('path');
const express = require('express');
const { parse } = require('csv-parse/sync');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// -----------------------------------------------------------------------------
// Course Mapping & Global State
// -----------------------------------------------------------------------------
const COURSE_MAPPING = {
  1: "Biofuel Technologies",
  2: "Animation & Multimedia",
  3: "Social Service (Evening)",
  4: "Agronomy",
  5: "Communication Design",
  6: "Veterinary Nursing",
  7: "Informatics Engineering",
  8: "Journalism & Comm",
  9: "Basic Education",
  10: "Management (Evening)",
  11: "Social Service (Day)",
  12: "Tourism",
  13: "Nursing",
  14: "Oral Hygiene",
  15: "Advertising & Marketing",
  16: "Journalism & Media",
  17: "Management (Day)"
};

let students = [];
let studentMap = new Map();
let courseBenchmarks = new Map();
let overviewStats = null;
const llmCache = new Map();
const growthCache = new Map();

// Runtime configuration (configurable via env vars or UI)
const config = {
  provider: (process.env.MODEL_PROVIDER || 'ollama').toLowerCase(),
  ollamaHost: process.env.OLLAMA_HOST || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'qwen2.5:3b',
  anthropicKey: process.env.ANTHROPIC_API_KEY || ''
};

// -----------------------------------------------------------------------------
// Rule-Based Risk Engine (Deterministic Fallback)
// -----------------------------------------------------------------------------
function calculateRuleRisk(student) {
  let score = 15; // baseline probability
  const reasons = [];

  const feesUpToDate = Number(student['Tuition fees up to date'] ?? 1);
  const debtor = Number(student['Debtor'] ?? 0);
  const scholarship = Number(student['Scholarship holder'] ?? 0);

  if (feesUpToDate === 0) {
    score += 35;
    reasons.push("Tuition fees are overdue");
  }
  if (debtor === 1) {
    score += 15;
    reasons.push("Identified as institutional debtor");
  }
  if (scholarship === 1) {
    score -= 10;
  }

  // 1st Semester
  const s1Enr = Number(student['Curricular units 1st sem (enrolled)'] ?? 0);
  const s1App = Number(student['Curricular units 1st sem (approved)'] ?? 0);
  const s1Grade = Number(student['Curricular units 1st sem (grade)'] ?? 0);

  if (s1Enr > 0) {
    const ratio = s1App / s1Enr;
    if (ratio < 0.5) {
      score += 20;
      reasons.push(`Low 1st sem completion (${s1App}/${s1Enr} units)`);
    }
    if (s1Grade < 10.0 && s1Grade > 0) {
      score += 10;
      reasons.push(`Below average 1st sem grade (${s1Grade.toFixed(1)}/20)`);
    }
  } else if (s1App === 0) {
    score += 15;
    reasons.push("Zero 1st sem units approved");
  }

  // 2nd Semester
  const s2Enr = Number(student['Curricular units 2nd sem (enrolled)'] ?? 0);
  const s2App = Number(student['Curricular units 2nd sem (approved)'] ?? 0);
  const s2Grade = Number(student['Curricular units 2nd sem (grade)'] ?? 0);

  if (s2Enr > 0) {
    const ratio = s2App / s2Enr;
    if (ratio < 0.5) {
      score += 25;
      reasons.push(`Low 2nd sem completion (${s2App}/${s2Enr} units)`);
    }
    if (s2Grade < 10.0 && s2Grade > 0) {
      score += 10;
      reasons.push(`Below average 2nd sem grade (${s2Grade.toFixed(1)}/20)`);
    }
  } else if (s2App === 0) {
    score += 20;
    reasons.push("Zero 2nd sem units approved");
  }

  score = Math.max(5, Math.min(95, Math.round(score)));

  let risk = "low";
  if (score >= 60) {
    risk = "high";
  } else if (score >= 35) {
    risk = "medium";
  }

  if (reasons.length === 0) {
    if (scholarship === 1 && s2App > 0) {
      reasons.push("Good curricular progress", "Active scholarship recipient", "Fees up to date");
    } else {
      reasons.push("Consistent unit completion", "Passing academic grades", "No overdue fees");
    }
  }

  let action = "Maintain standard progress tracking; student is meeting core academic benchmarks.";
  if (risk === "high") {
    if (feesUpToDate === 0) {
      action = "Immediate financial counselor outreach to establish tuition payment plan and academic support.";
    } else {
      action = "Urgent advisor meeting to address unit non-completion and restructure course load.";
    }
  } else if (risk === "medium") {
    action = "Schedule mid-term academic check-in and recommend peer tutoring for struggling modules.";
  }

  return {
    risk,
    dropout_probability: score,
    top_reasons: reasons.slice(0, 3),
    suggested_action: action,
    provider: "rule-based"
  };
}

// -----------------------------------------------------------------------------
// Peer Benchmark & Mental Health / Growth Pipeline
// -----------------------------------------------------------------------------
function getStudentPeerComparison(student) {
  const benchmark = courseBenchmarks.get(student.course_name) || {
    avgGrade: 12.0,
    avgCompletionRate: 0.70,
    avgEvaluations: 8.0,
    displacedRatio: 0.54
  };

  const s1Enr = student.sem1.enrolled;
  const s2Enr = student.sem2.enrolled;
  const totalEnr = s1Enr + s2Enr;
  const totalApp = student.sem1.approved + student.sem2.approved;
  const studentCompletionRate = totalEnr > 0 ? (totalApp / totalEnr) : 0;

  const validGrades = [];
  if (student.sem1.grade > 0) validGrades.push(student.sem1.grade);
  if (student.sem2.grade > 0) validGrades.push(student.sem2.grade);
  const studentAvgGrade = validGrades.length > 0 ? (validGrades.reduce((a, b) => a + b, 0) / validGrades.length) : 0;

  const studentEvaluations = student.sem1.evaluations + student.sem2.evaluations;
  const missedEvaluations = student.sem1_without_eval + student.sem2_without_eval;
  const gradeTrajectory = (student.sem2.grade > 0 && student.sem1.grade > 0) 
    ? (student.sem2.grade - student.sem1.grade) 
    : 0;

  return {
    student: {
      completionRate: Math.round(studentCompletionRate * 100),
      avgGrade: Number(studentAvgGrade.toFixed(1)),
      totalEvaluations: studentEvaluations,
      missedEvaluations,
      gradeTrajectory: Number(gradeTrajectory.toFixed(1)),
      isDisplaced: student.displaced === 1,
      hasSpecialNeeds: student.special_needs === 1,
      hasFinancialStrain: student.tuition_fees_up_to_date === 0 || student.debtor === 1
    },
    peerBenchmark: {
      courseName: student.course_name,
      avgCompletionRate: Math.round(benchmark.avgCompletionRate * 100),
      avgGrade: Number(benchmark.avgGrade.toFixed(1)),
      avgEvaluations: Math.round(benchmark.avgEvaluations),
      displacedRatio: Math.round(benchmark.displacedRatio * 100)
    }
  };
}

function calculateDeterministicGrowth(student, comparison) {
  let burnoutScore = 20; // baseline strain
  const signals = [];

  const st = comparison.student;
  const peer = comparison.peerBenchmark;

  // Grade fatigue / sharp drop
  if (st.gradeTrajectory <= -2.5) {
    burnoutScore += 25;
    signals.push(`Acute semester-over-semester grade decline (${st.gradeTrajectory.toFixed(1)} pts) indicating academic fatigue`);
  } else if (st.avgGrade < 10 && st.avgGrade > 0) {
    burnoutScore += 15;
    signals.push(`Struggling below passing grade threshold (${st.avgGrade}/20 vs cohort ${peer.avgGrade}/20)`);
  }

  // Missed evaluations / academic withdrawal
  if (st.missedEvaluations > 0) {
    burnoutScore += 20;
    signals.push(`Missed ${st.missedEvaluations} examination evaluations (disengagement & anxiety signal)`);
  }

  // Completion pace lag compared to cohort peers
  const compGap = peer.avgCompletionRate - st.completionRate;
  if (compGap >= 25) {
    burnoutScore += 20;
    signals.push(`Coursework completion rate (${st.completionRate}%) trails degree cohort average (${peer.avgCompletionRate}%) by ${compGap}%`);
  }

  // Displaced / relocation isolation
  if (st.isDisplaced) {
    burnoutScore += 15;
    signals.push(`Relocated student living away from family network (heightened social adjustment pressure)`);
  }

  // Financial stress
  if (st.hasFinancialStrain) {
    burnoutScore += 20;
    signals.push(`Elevated psychological stress linked to tuition arrears or institutional debtor status`);
  }

  // Special needs accommodation
  if (st.hasSpecialNeeds) {
    burnoutScore += 10;
    signals.push(`Requires tailored learning accommodations and pace restructuring`);
  }

  burnoutScore = Math.max(10, Math.min(95, burnoutScore));
  let burnoutRisk = "low";
  if (burnoutScore >= 60) burnoutRisk = "elevated";
  else if (burnoutScore >= 35) burnoutRisk = "moderate";

  if (signals.length === 0) {
    signals.push("Healthy academic pacing consistent with degree cohort averages");
    signals.push("No missed evaluations or financial stress flags");
    signals.push("Demonstrating resilience and stable semester-over-semester momentum");
  }

  // 3-Stage Growth Roadmap
  let actionPlan = [];
  if (burnoutRisk === "elevated") {
    actionPlan = [
      {
        stage: "Stage 1: Cognitive De-escalation & Load Rebalancing",
        focus: "Immediate Stress Relief",
        recommendation: "Temporarily reduce credit module overload; grant extensions on pending units and schedule a counseling check-in."
      },
      {
        stage: "Stage 2: Holistic Wellness & Relocation Support",
        focus: "Community & Peer Connection",
        recommendation: "Connect with campus wellness center and assign a senior student peer mentor to combat living-away-from-home isolation."
      },
      {
        stage: "Stage 3: Structured Academic Mastery Pods",
        focus: "Paced Credit Recovery",
        recommendation: "Enroll in structured weekly tutoring pods targeting difficult modules to gradually restore passing grades."
      }
    ];
  } else if (burnoutRisk === "moderate") {
    actionPlan = [
      {
        stage: "Stage 1: Pacing & Study Habit Restructuring",
        focus: "Time Management",
        recommendation: "Audit weekly study blocks and break complex assignments into manageable milestones to avoid exam crunch."
      },
      {
        stage: "Stage 2: Peer Study Circles",
        focus: "Collaborative Learning",
        recommendation: "Pair student with a high-performing study circle within their degree program for collaborative problem solving."
      },
      {
        stage: "Stage 3: Mid-Semester Progress Review",
        focus: "Confidence Rebuilding",
        recommendation: "Schedule a 15-minute advisor check-in ahead of midterm exams to review grade momentum and alleviate test anxiety."
      }
    ];
  } else {
    actionPlan = [
      {
        stage: "Stage 1: Maintain Academic Momentum",
        focus: "Continuous Growth",
        recommendation: "Encourage consistent weekly study pacing and celebrate strong completion rate compared to cohort peers."
      },
      {
        stage: "Stage 2: Leadership & Peer Mentoring",
        focus: "Enrichment & Engagement",
        recommendation: "Invite student to join departmental study groups or act as an informal peer tutor to deepen mastery."
      },
      {
        stage: "Stage 3: Advanced Research & Career Pathway",
        focus: "Professional Development",
        recommendation: "Introduce undergraduate research initiatives or internship exploration workshops aligned with their degree."
      }
    ];
  }

  // Advisor Empathy Note
  let empathyNote = "I wanted to check in because semester transitions can be demanding. How is your energy holding up, and how are you settling in this term?";
  if (st.isDisplaced && st.hasFinancialStrain) {
    empathyNote = "Balancing coursework while managing living away from home and finances is a huge load. I want you to know you're not alone—let's look at campus resources and find a pacing that works for you.";
  } else if (st.gradeTrajectory <= -2.0) {
    empathyNote = "I noticed your momentum dipped a bit in the second semester. That often happens when cognitive fatigue builds up. How can we take some pressure off this month?";
  }

  const comparisonSummary = `Student is performing at a ${st.completionRate}% completion rate (cohort avg: ${peer.avgCompletionRate}%) and an average grade of ${st.avgGrade}/20 (cohort avg: ${peer.avgGrade}/20). Burnout vulnerability is evaluated as ${burnoutRisk.toUpperCase()}.`;

  return {
    burnout_risk: burnoutRisk,
    burnout_score: burnoutScore,
    peer_comparison_summary: comparisonSummary,
    wellness_signals: signals.slice(0, 3),
    growth_action_plan: actionPlan,
    advisor_empathy_note: empathyNote,
    provider: "rule-based"
  };
}

// -----------------------------------------------------------------------------
// Data Loader (dataset.csv)
// -----------------------------------------------------------------------------
function loadDataset() {
  const csvPath = path.join(__dirname, 'dataset.csv');
  if (!fs.existsSync(csvPath)) {
    console.error(`Error: dataset.csv not found at ${csvPath}`);
    return;
  }

  const raw = fs.readFileSync(csvPath, 'utf8');
  const firstLine = raw.slice(0, 1000).split(/\r?\n/)[0];
  const delimiter = firstLine.includes(';') ? ';' : ',';

  const records = parse(raw, {
    delimiter,
    columns: header => header.map(h => h.trim().replace(/^\uFEFF/, '')),
    skip_empty_lines: true,
    trim: true
  });

  students = records.map((r, i) => {
    const studentId = `STU-${String(i + 1).padStart(4, '0')}`;
    const courseId = Number(r['Course'] || 0);
    const courseName = COURSE_MAPPING[courseId] || `Course ${courseId}`;
    const ruleRisk = calculateRuleRisk(r);

    return {
      student_id: studentId,
      raw: r,
      course_id: courseId,
      course_name: courseName,
      target: r['Target'] || 'Unknown',
      tuition_fees_up_to_date: Number(r['Tuition fees up to date'] ?? 1),
      debtor: Number(r['Debtor'] ?? 0),
      scholarship_holder: Number(r['Scholarship holder'] ?? 0),
      age_at_enrollment: Number(r['Age at enrollment'] ?? 0),
      daytime_attendance: Number(r['Daytime/evening attendance'] ?? 1),
      displaced: Number(r['Displaced'] ?? 0),
      special_needs: Number(r['Educational special needs'] ?? 0),
      sem1_without_eval: Number(r['Curricular units 1st sem (without evaluations)'] ?? 0),
      sem2_without_eval: Number(r['Curricular units 2nd sem (without evaluations)'] ?? 0),
      sem1: {
        enrolled: Number(r['Curricular units 1st sem (enrolled)'] ?? 0),
        approved: Number(r['Curricular units 1st sem (approved)'] ?? 0),
        evaluations: Number(r['Curricular units 1st sem (evaluations)'] ?? 0),
        grade: Number(r['Curricular units 1st sem (grade)'] ?? 0)
      },
      sem2: {
        enrolled: Number(r['Curricular units 2nd sem (enrolled)'] ?? 0),
        approved: Number(r['Curricular units 2nd sem (approved)'] ?? 0),
        evaluations: Number(r['Curricular units 2nd sem (evaluations)'] ?? 0),
        grade: Number(r['Curricular units 2nd sem (grade)'] ?? 0)
      },
      rule_risk: ruleRisk
    };
  });

  studentMap = new Map(students.map(s => [s.student_id, s]));
  console.log(`Loaded ${students.length} students from dataset.csv`);

  // Compute course benchmarks
  const courseAccumulators = {};
  for (const s of students) {
    if (!courseAccumulators[s.course_name]) {
      courseAccumulators[s.course_name] = {
        count: 0,
        totalEnrolled: 0,
        totalApproved: 0,
        totalGrades: 0,
        gradeCount: 0,
        totalEvaluations: 0,
        displacedCount: 0
      };
    }
    const acc = courseAccumulators[s.course_name];
    acc.count++;
    acc.totalEnrolled += s.sem1.enrolled + s.sem2.enrolled;
    acc.totalApproved += s.sem1.approved + s.sem2.approved;
    if (s.sem1.grade > 0) { acc.totalGrades += s.sem1.grade; acc.gradeCount++; }
    if (s.sem2.grade > 0) { acc.totalGrades += s.sem2.grade; acc.gradeCount++; }
    acc.totalEvaluations += s.sem1.evaluations + s.sem2.evaluations;
    if (s.displaced === 1) acc.displacedCount++;
  }

  courseBenchmarks = new Map();
  for (const [courseName, acc] of Object.entries(courseAccumulators)) {
    courseBenchmarks.set(courseName, {
      avgCompletionRate: acc.totalEnrolled > 0 ? (acc.totalApproved / acc.totalEnrolled) : 0.70,
      avgGrade: acc.gradeCount > 0 ? (acc.totalGrades / acc.gradeCount) : 12.0,
      avgEvaluations: acc.count > 0 ? (acc.totalEvaluations / acc.count) : 8.0,
      displacedRatio: acc.count > 0 ? (acc.displacedCount / acc.count) : 0.50,
      studentCount: acc.count
    });
  }

  // Compute overview aggregated metrics
  const total = students.length;
  const targetCounts = { Dropout: 0, Graduate: 0, Enrolled: 0 };
  const courseOutcomes = {};
  const tuitionOutcomes = {
    'Fees Up-to-Date': { Dropout: 0, Graduate: 0, Enrolled: 0 },
    'Fees Overdue': { Dropout: 0, Graduate: 0, Enrolled: 0 }
  };
  const scholOutcomes = {
    'Scholarship Recipient': { Dropout: 0, Graduate: 0, Enrolled: 0 },
    'No Scholarship': { Dropout: 0, Graduate: 0, Enrolled: 0 }
  };

  for (const s of students) {
    const tgt = s.target;
    if (targetCounts[tgt] !== undefined) targetCounts[tgt]++;

    // Course breakdown
    if (!courseOutcomes[s.course_name]) {
      courseOutcomes[s.course_name] = { Dropout: 0, Graduate: 0, Enrolled: 0, total: 0 };
    }
    if (courseOutcomes[s.course_name][tgt] !== undefined) {
      courseOutcomes[s.course_name][tgt]++;
      courseOutcomes[s.course_name].total++;
    }

    // Tuition
    const tKey = s.tuition_fees_up_to_date === 1 ? 'Fees Up-to-Date' : 'Fees Overdue';
    if (tuitionOutcomes[tKey][tgt] !== undefined) tuitionOutcomes[tKey][tgt]++;

    // Scholarship
    const sKey = s.scholarship_holder === 1 ? 'Scholarship Recipient' : 'No Scholarship';
    if (scholOutcomes[sKey][tgt] !== undefined) scholOutcomes[sKey][tgt]++;
  }

  overviewStats = {
    totalStudents: total,
    targets: targetCounts,
    dropoutRate: ((targetCounts.Dropout / total) * 100).toFixed(1),
    gradRate: ((targetCounts.Graduate / total) * 100).toFixed(1),
    enrolledRate: ((targetCounts.Enrolled / total) * 100).toFixed(1),
    courseOutcomes,
    tuitionOutcomes,
    scholOutcomes
  };
}

// -----------------------------------------------------------------------------
// LLM Anonymized Payload & Predictor
// -----------------------------------------------------------------------------
function buildFeaturePayload(student) {
  return {
    age_at_enrollment: student.age_at_enrollment,
    attendance: student.daytime_attendance === 1 ? 'Daytime' : 'Evening',
    tuition_fees_up_to_date: student.tuition_fees_up_to_date === 1 ? 'Yes' : 'No',
    debtor: student.debtor === 1 ? 'Yes' : 'No',
    scholarship_holder: student.scholarship_holder === 1 ? 'Yes' : 'No',
    sem1_enrolled_units: student.sem1.enrolled,
    sem1_approved_units: student.sem1.approved,
    sem1_grade_scale_20: Number(student.sem1.grade.toFixed(1)),
    sem2_enrolled_units: student.sem2.enrolled,
    sem2_approved_units: student.sem2.approved,
    sem2_grade_scale_20: Number(student.sem2.grade.toFixed(1))
  };
}

function parseModelJson(raw) {
  let text = String(raw).trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (match) text = match[0];

  const parsed = JSON.parse(text);
  let risk = String(parsed.risk || '').toLowerCase().trim();
  let prob = Math.round(Number(parsed.dropout_probability || 50));
  prob = Math.max(0, Math.min(100, isNaN(prob) ? 50 : prob));

  if (!['low', 'medium', 'high'].includes(risk)) {
    risk = prob >= 60 ? 'high' : (prob >= 35 ? 'medium' : 'low');
  }

  let reasons = parsed.top_reasons;
  if (typeof reasons === 'string') reasons = [reasons];
  else if (!Array.isArray(reasons) || reasons.length === 0) {
    reasons = ["Academic and financial indicators review"];
  }
  reasons = reasons.slice(0, 3).map(r => String(r));

  const action = String(parsed.suggested_action || 'Review academic trajectory with advisor.').trim();

  return {
    risk,
    dropout_probability: prob,
    top_reasons: reasons,
    suggested_action: action
  };
}

async function callOllama(payload, host, model) {
  const url = `${host.replace(/\/+$/, '')}/api/generate`;
  const prompt = `You are an educational risk assessment system. Evaluate this anonymous student's academic & financial features:
${JSON.stringify(payload, null, 2)}

Predict the likelihood of student dropout.
Return ONLY valid JSON in this exact structure with no surrounding markdown or explanation:
{
  "risk": "low|medium|high",
  "dropout_probability": 0-100,
  "top_reasons": ["short reason 1", "short reason 2", "short reason 3"],
  "suggested_action": "one clear actionable sentence"
}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        format: 'json'
      }),
      signal: controller.signal
    });

    if (!res.ok) {
      throw new Error(`Ollama returned HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    const parsed = parseModelJson(data.response);
    parsed.provider = `ollama (${model})`;
    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

async function callClaude(payload, apiKey, model = 'claude-haiku-5-5') {
  const url = 'https://api.anthropic.com/v1/messages';
  const system = 'You are an educational risk assessment system. Return ONLY valid JSON with no markdown formatting.';
  const user = `Evaluate this anonymous student's features:
${JSON.stringify(payload, null, 2)}

Return strictly JSON matching:
{
  "risk": "low|medium|high",
  "dropout_probability": 0-100,
  "top_reasons": ["short reason 1", "short reason 2", "short reason 3"],
  "suggested_action": "one clear actionable sentence"
}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 300,
        system,
        messages: [{ role: 'user', content: user }]
      }),
      signal: controller.signal
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Claude API HTTP ${res.status}: ${errBody}`);
    }

    const data = await res.json();
    const rawText = data.content?.[0]?.text || '';
    const parsed = parseModelJson(rawText);
    parsed.provider = `claude (${model})`;
    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

// -----------------------------------------------------------------------------
// Zero-Shot Mental Health & Growth Roadmap Generator
// -----------------------------------------------------------------------------
async function generateGrowthPlan(student, activeProvider, ollamaHost, ollamaModel, anthropicKey) {
  const comparison = getStudentPeerComparison(student);
  const cacheKey = `growth_${student.student_id}_${activeProvider}_${ollamaModel}`;

  if (growthCache.has(cacheKey)) {
    return { ...growthCache.get(cacheKey), cached: true, peerComparison: comparison };
  }

  const promptPayload = {
    degree_course: student.course_name,
    student_metrics: comparison.student,
    degree_peer_benchmarks: comparison.peerBenchmark
  };

  let result = null;
  let warning = null;

  if (activeProvider === 'claude' && anthropicKey) {
    const url = 'https://api.anthropic.com/v1/messages';
    const system = 'You are a compassionate university student retention and academic wellness coach. Return ONLY valid JSON with no markdown.';
    const userPrompt = `Compare this student's velocity and cognitive fatigue against their degree cohort peers:
${JSON.stringify(promptPayload, null, 2)}

Return strictly valid JSON matching this schema:
{
  "burnout_risk": "low|moderate|elevated",
  "burnout_score": 0-100,
  "peer_comparison_summary": "1-2 sentences summarizing how the student compares to their degree cohort",
  "wellness_signals": ["signal 1", "signal 2", "signal 3"],
  "growth_action_plan": [
    { "stage": "Stage 1: Pacing & Load Relief", "focus": "Immediate Stress Relief", "recommendation": "concrete advice" },
    { "stage": "Stage 2: Holistic Wellness & Community", "focus": "Support & Belonging", "recommendation": "concrete advice" },
    { "stage": "Stage 3: Academic Mastery & Resilience", "focus": "Long-Term Growth", "recommendation": "concrete advice" }
  ],
  "advisor_empathy_note": "A warm, supportive opening question or conversation starter for the counselor."
}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-haiku-5-5',
            max_tokens: 500,
            system,
            messages: [{ role: 'user', content: userPrompt }]
          }),
          signal: controller.signal
        });
        if (res.ok) {
          const data = await res.json();
          const raw = data.content?.[0]?.text || '';
          const match = raw.match(/\{[\s\S]*\}/);
          if (match) {
            result = JSON.parse(match[0]);
            result.provider = `claude (claude-haiku-5-5)`;
            break;
          }
        }
      } catch (err) {
        if (attempt === 1) warning = `Claude growth analysis failed: ${err.message}`;
      }
    }
    clearTimeout(timeout);
  } else if (activeProvider === 'ollama') {
    const url = `${ollamaHost.replace(/\/+$/, '')}/api/generate`;
    const prompt = `You are a compassionate university student retention and academic wellness coach. Compare this student's velocity against their degree peers:
${JSON.stringify(promptPayload, null, 2)}

Return strictly valid JSON matching this schema:
{
  "burnout_risk": "low|moderate|elevated",
  "burnout_score": 0-100,
  "peer_comparison_summary": "1-2 sentences summarizing how the student compares to their degree cohort",
  "wellness_signals": ["signal 1", "signal 2", "signal 3"],
  "growth_action_plan": [
    { "stage": "Stage 1: Pacing & Load Relief", "focus": "Immediate Stress Relief", "recommendation": "concrete advice" },
    { "stage": "Stage 2: Holistic Wellness & Community", "focus": "Support & Belonging", "recommendation": "concrete advice" },
    { "stage": "Stage 3: Academic Mastery & Resilience", "focus": "Long-Term Growth", "recommendation": "concrete advice" }
  ],
  "advisor_empathy_note": "A warm, supportive opening question or conversation starter for the counselor."
}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: ollamaModel,
            prompt,
            stream: false,
            format: 'json'
          }),
          signal: controller.signal
        });
        if (res.ok) {
          const data = await res.json();
          const match = data.response.match(/\{[\s\S]*\}/);
          if (match) {
            result = JSON.parse(match[0]);
            result.provider = `ollama (${ollamaModel})`;
            break;
          }
        }
      } catch (err) {
        if (attempt === 1) warning = `Ollama growth analysis failed: ${err.message}`;
      }
    }
    clearTimeout(timeout);
  }

  // Fallback to deterministic growth & mental health evaluation
  if (!result) {
    result = calculateDeterministicGrowth(student, comparison);
  }

  result.peerComparison = comparison;
  result.warning = warning;
  growthCache.set(cacheKey, result);

  return result;
}

// -----------------------------------------------------------------------------
// API Endpoints
// -----------------------------------------------------------------------------

// 1. Overview Statistics
app.get('/api/overview', (req, res) => {
  if (!overviewStats) return res.status(503).json({ error: 'Data not loaded yet' });
  res.json(overviewStats);
});

// 2. All / Filtered Students for At-Risk List
app.get('/api/students', (req, res) => {
  const { risk, tuition, course, search } = req.query;

  let list = students.map(s => ({
    student_id: s.student_id,
    risk_level: s.rule_risk.risk.charAt(0).toUpperCase() + s.rule_risk.risk.slice(1),
    dropout_probability: s.rule_risk.dropout_probability,
    course: s.course_name,
    tuition_fees: s.tuition_fees_up_to_date === 1 ? 'Up to date' : 'Overdue',
    scholarship: s.scholarship_holder === 1 ? 'Yes' : 'No',
    sem1_approved: s.sem1.approved,
    sem2_approved: s.sem2.approved,
    actual_outcome: s.target,
    primary_reason: s.rule_risk.top_reasons[0] || 'N/A'
  }));

  if (risk && risk !== 'All') {
    list = list.filter(s => s.risk_level.toLowerCase() === risk.toLowerCase());
  }
  if (tuition && tuition !== 'All') {
    list = list.filter(s => s.tuition_fees === tuition);
  }
  if (course && course !== 'All Programs') {
    list = list.filter(s => s.course === course);
  }
  if (search) {
    const q = search.toLowerCase().trim();
    list = list.filter(s => s.student_id.toLowerCase().includes(q) || s.course.toLowerCase().includes(q));
  }

  // Sort descending by risk score
  list.sort((a, b) => b.dropout_probability - a.dropout_probability);

  res.json({
    total: list.length,
    highRiskCount: list.filter(s => s.risk_level === 'High').length,
    overdueCount: list.filter(s => s.tuition_fees === 'Overdue').length,
    students: list
  });
});

// 3. Single Student Details
app.get('/api/students/:id', (req, res) => {
  const student = studentMap.get(req.params.id.toUpperCase());
  if (!student) {
    return res.status(404).json({ error: `Student ${req.params.id} not found` });
  }

  const payload = buildFeaturePayload(student);
  const peerComparison = getStudentPeerComparison(student);

  res.json({
    student_id: student.student_id,
    course_name: student.course_name,
    target: student.target,
    tuition_fees_up_to_date: student.tuition_fees_up_to_date,
    debtor: student.debtor,
    scholarship_holder: student.scholarship_holder,
    age_at_enrollment: student.age_at_enrollment,
    daytime_attendance: student.daytime_attendance,
    displaced: student.displaced,
    special_needs: student.special_needs,
    sem1: student.sem1,
    sem2: student.sem2,
    deidentified_payload: payload,
    peer_comparison: peerComparison,
    rule_risk: student.rule_risk
  });
});

// 4. Zero-Shot Dropout Risk Prediction (Cached, with retry & fallback)
app.post('/api/students/:id/predict', async (req, res) => {
  const student = studentMap.get(req.params.id.toUpperCase());
  if (!student) {
    return res.status(404).json({ error: `Student ${req.params.id} not found` });
  }

  const activeProvider = (req.body.provider || config.provider || 'ollama').toLowerCase();
  const ollamaHost = req.body.ollamaHost || config.ollamaHost;
  const ollamaModel = req.body.ollamaModel || config.ollamaModel;
  const anthropicKey = req.body.anthropicKey || config.anthropicKey;

  const cacheKey = `${student.student_id}_${activeProvider}_${ollamaModel}`;
  if (llmCache.has(cacheKey)) {
    return res.json({
      ...llmCache.get(cacheKey),
      cached: true
    });
  }

  const payload = buildFeaturePayload(student);
  let prediction = null;
  let errorMsg = null;

  if (activeProvider === 'claude') {
    if (!anthropicKey) {
      errorMsg = 'ANTHROPIC_API_KEY is not configured. Falling back to rule-based score.';
    } else {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          prediction = await callClaude(payload, anthropicKey);
          break;
        } catch (err) {
          if (attempt === 1) {
            errorMsg = `Claude API failed: ${err.message}`;
          }
        }
      }
    }
  } else if (activeProvider === 'ollama') {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        prediction = await callOllama(payload, ollamaHost, ollamaModel);
        break;
      } catch (err) {
        if (attempt === 1) {
          errorMsg = `Ollama connection failed at ${ollamaHost}: ${err.message}`;
        }
      }
    }
  }

  if (!prediction) {
    prediction = {
      ...student.rule_risk,
      fallbackReason: errorMsg || 'Rule-based evaluation requested'
    };
  }

  llmCache.set(cacheKey, prediction);

  res.json({
    ...prediction,
    cached: false,
    warning: errorMsg
  });
});

// 5. Mental Health & Growth Pipeline Endpoint (NEW)
app.get('/api/students/:id/growth', async (req, res) => {
  const student = studentMap.get(req.params.id.toUpperCase());
  if (!student) {
    return res.status(404).json({ error: `Student ${req.params.id} not found` });
  }

  const result = await generateGrowthPlan(
    student,
    config.provider,
    config.ollamaHost,
    config.ollamaModel,
    config.anthropicKey
  );

  res.json(result);
});

app.post('/api/students/:id/growth', async (req, res) => {
  const student = studentMap.get(req.params.id.toUpperCase());
  if (!student) {
    return res.status(404).json({ error: `Student ${req.params.id} not found` });
  }

  const activeProvider = (req.body.provider || config.provider || 'ollama').toLowerCase();
  const ollamaHost = req.body.ollamaHost || config.ollamaHost;
  const ollamaModel = req.body.ollamaModel || config.ollamaModel;
  const anthropicKey = req.body.anthropicKey || config.anthropicKey;

  const result = await generateGrowthPlan(
    student,
    activeProvider,
    ollamaHost,
    ollamaModel,
    anthropicKey
  );

  res.json(result);
});

// 6. Config routes
app.get('/api/config', (req, res) => {
  res.json({
    provider: config.provider,
    ollamaHost: config.ollamaHost,
    ollamaModel: config.ollamaModel,
    hasClaudeKey: Boolean(config.anthropicKey)
  });
});

app.post('/api/config', (req, res) => {
  if (req.body.provider) config.provider = req.body.provider;
  if (req.body.ollamaHost) config.ollamaHost = req.body.ollamaHost;
  if (req.body.ollamaModel) config.ollamaModel = req.body.ollamaModel;
  if (req.body.anthropicKey !== undefined) config.anthropicKey = req.body.anthropicKey;

  res.json({ success: true, config });
});

// -----------------------------------------------------------------------------
// 7. Daily Survey & Professor Hub System
// -----------------------------------------------------------------------------
let surveyData = { surveys: [], responses: [] };

function loadSurveys() {
  const p = path.join(__dirname, 'surveys.json');
  if (fs.existsSync(p)) {
    try {
      surveyData = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (!Array.isArray(surveyData.surveys)) surveyData.surveys = [];
      if (!Array.isArray(surveyData.responses)) surveyData.responses = [];
      console.log(`Loaded ${surveyData.surveys.length} surveys and ${surveyData.responses.length} responses.`);
    } catch (e) {
      console.error('Error reading surveys.json', e);
    }
  }
}

function saveSurveys() {
  const p = path.join(__dirname, 'surveys.json');
  try {
    fs.writeFileSync(p, JSON.stringify(surveyData, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving surveys.json', e);
  }
}

// Get all surveys
app.get('/api/surveys', (req, res) => {
  const list = surveyData.surveys.map(s => {
    const responses = surveyData.responses.filter(r => r.survey_id === s.id);
    return {
      ...s,
      response_count: responses.length,
      latest_response_at: responses[0]?.submitted_at || null
    };
  });
  res.json(list);
});

// Get single survey details
app.get('/api/surveys/:id', (req, res) => {
  const survey = surveyData.surveys.find(s => s.id === req.params.id);
  if (!survey) return res.status(404).json({ error: 'Survey not found' });
  const responses = surveyData.responses.filter(r => r.survey_id === survey.id);
  res.json({ ...survey, responses });
});

// Professor creates a new survey
app.post('/api/surveys', (req, res) => {
  const { title, target_course, created_by, questions } = req.body;
  if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: 'Survey title and at least one question are required.' });
  }

  const newSurvey = {
    id: `srv_${Date.now()}`,
    title: title.trim(),
    target_course: target_course || 'All Programs',
    created_by: created_by ? created_by.trim() : 'Faculty Advisor',
    created_at: new Date().toISOString(),
    status: 'active',
    questions: questions.map((q, i) => ({
      id: `q${i + 1}`,
      text: q.text.trim(),
      type: q.type || 'rating',
      scale: q.scale || 5,
      options: q.options || [],
      labels: q.labels || []
    }))
  };

  surveyData.surveys.unshift(newSurvey);
  saveSurveys();
  res.json({ success: true, survey: newSurvey });
});

// Student submits a survey response
app.post('/api/surveys/:id/respond', (req, res) => {
  const survey = surveyData.surveys.find(s => s.id === req.params.id);
  if (!survey) return res.status(404).json({ error: 'Survey not found' });

  const { student_id, answers } = req.body;
  const student = studentMap.get((student_id || '').toUpperCase());

  const newResponse = {
    id: `resp_${Date.now()}`,
    survey_id: survey.id,
    student_id: student ? student.student_id : (student_id || 'STU-ANON'),
    course: student ? student.course_name : (req.body.course || survey.target_course || 'General'),
    submitted_at: new Date().toISOString(),
    answers: answers || {}
  };

  surveyData.responses.unshift(newResponse);
  saveSurveys();
  res.json({ success: true, response: newResponse });
});

// Get Survey Analytics for Professors
app.get('/api/surveys/:id/analytics', (req, res) => {
  const survey = surveyData.surveys.find(s => s.id === req.params.id);
  if (!survey) return res.status(404).json({ error: 'Survey not found' });

  const responses = surveyData.responses.filter(r => r.survey_id === survey.id);
  const total = responses.length;

  // Compute question-by-question metrics
  const questionAnalytics = survey.questions.map(q => {
    if (q.type === 'mood' || q.type === 'choice') {
      const counts = {};
      (q.options || []).forEach(opt => counts[opt] = 0);
      responses.forEach(r => {
        const val = r.answers[q.id];
        if (val) counts[val] = (counts[val] || 0) + 1;
      });
      return { id: q.id, text: q.text, type: q.type, distribution: counts };
    } else if (q.type === 'rating') {
      let sum = 0, count = 0;
      const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      responses.forEach(r => {
        const val = Number(r.answers[q.id]);
        if (!isNaN(val) && val >= 1 && val <= 5) {
          sum += val;
          count++;
          dist[val] = (dist[val] || 0) + 1;
        }
      });
      return {
        id: q.id,
        text: q.text,
        type: q.type,
        average: count > 0 ? Number((sum / count).toFixed(2)) : 0,
        distribution: dist
      };
    } else {
      // Text responses
      const texts = responses
        .map(r => ({ student_id: r.student_id, course: r.course, text: r.answers[q.id], submitted_at: r.submitted_at }))
        .filter(t => Boolean(t.text));
      return { id: q.id, text: q.text, type: q.type, comments: texts.slice(0, 15) };
    }
  });

  res.json({
    survey,
    total_responses: total,
    question_analytics: questionAnalytics,
    recent_responses: responses.slice(0, 20)
  });
});

// AI Executive Synthesis for Professors
app.get('/api/surveys/:id/ai-summary', async (req, res) => {
  const survey = surveyData.surveys.find(s => s.id === req.params.id);
  if (!survey) return res.status(404).json({ error: 'Survey not found' });

  const responses = surveyData.responses.filter(r => r.survey_id === survey.id);
  if (responses.length === 0) {
    return res.json({
      cohort_status: "No responses yet",
      key_takeaways: ["No student responses recorded yet for this survey."],
      recommended_adjustments: "Encourage students to submit their daily pulse during morning lectures.",
      distressed_students: []
    });
  }

  // Compile anonymous feedback for LLM
  const feedbackExcerpts = responses.map(r => ({
    student_id: r.student_id,
    course: r.course,
    answers: r.answers
  }));

  const prompt = `You are an expert higher education academic advisor and teaching coach. Analyze these anonymous student survey responses from "${survey.title}":
${JSON.stringify(feedbackExcerpts.slice(0, 12), null, 2)}

Provide an actionable executive summary for the professor.
Return ONLY valid JSON with this schema:
{
  "cohort_status": "Healthy / Stable | Moderate Strain | High Anxiety Warning",
  "average_sentiment": "Positive | Neutral | Stressed / Overloaded",
  "key_takeaways": [
    "takeaway 1 (concise)",
    "takeaway 2 (concise)",
    "takeaway 3 (concise)"
  ],
  "recommended_adjustments": "1-2 concrete sentences on lecture pacing, office hours, or assignment restructuring for the professor",
  "students_flagged_for_support": ["STU-XXXX: short reason", "STU-YYYY: short reason"]
}`;

  let aiResult = null;

  if (config.provider === 'claude' && config.anthropicKey) {
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.anthropicKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-5-5',
          max_tokens: 450,
          system: 'You are an educational feedback synthesizer. Return strictly valid JSON.',
          messages: [{ role: 'user', content: prompt }]
        })
      });
      if (resp.ok) {
        const d = await resp.json();
        const raw = d.content?.[0]?.text || '';
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) aiResult = JSON.parse(match[0]);
      }
    } catch (e) {
      console.error('Claude survey synthesis error', e);
    }
  } else if (config.provider === 'ollama') {
    try {
      const resp = await fetch(`${config.ollamaHost.replace(/\/+$/, '')}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.ollamaModel,
          prompt,
          stream: false,
          format: 'json'
        })
      });
      if (resp.ok) {
        const d = await resp.json();
        const match = d.response.match(/\{[\s\S]*\}/);
        if (match) aiResult = JSON.parse(match[0]);
      }
    } catch (e) {
      console.error('Ollama survey synthesis error', e);
    }
  }

  // Fallback heuristic synthesis
  if (!aiResult) {
    let stressedCount = 0;
    const flagged = [];
    responses.forEach(r => {
      const m = String(r.answers.q1 || '').toLowerCase();
      if (m.includes('stress') || m.includes('overwhelm')) {
        stressedCount++;
        flagged.push(`${r.student_id}: Reported feeling ${r.answers.q1} in recent pulse check`);
      }
    });

    const status = stressedCount > (responses.length / 3) 
      ? "High Anxiety Warning" 
      : (stressedCount > 0 ? "Moderate Strain" : "Healthy / Stable");

    aiResult = {
      cohort_status: status,
      average_sentiment: stressedCount > 0 ? "Stressed / Overloaded" : "Positive / Receptive",
      key_takeaways: [
        `${responses.length} total students completed this pulse check across ${survey.target_course}.`,
        `${stressedCount} out of ${responses.length} students expressed acute workload stress or exam anxiety.`,
        "Course project deadlines and living accommodations are common drivers of cognitive fatigue."
      ],
      recommended_adjustments: "Consider opening tomorrow's lecture with a 10-minute Q&A addressing difficult project requirements and reminding students of free campus tutoring pods.",
      students_flagged_for_support: flagged.slice(0, 3)
    };
  }

  res.json(aiResult);
});

// Start Server
loadDataset();
loadSurveys();


app.listen(PORT, () => {
  console.log(`StudentSuccess platform running on http://localhost:${PORT}`);
});
