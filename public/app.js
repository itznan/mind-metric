// -----------------------------------------------------------------------------
// StudentSuccess Client Application
// -----------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initConfig();
  initOverview();
  initStudentExplorer();
  initAtRiskList();
  initSurveys();
});

// -----------------------------------------------------------------------------
// 1. Navigation & Page Routing
// -----------------------------------------------------------------------------
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const pages = document.querySelectorAll('.page-section');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetPage = item.dataset.page;

      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      pages.forEach(p => p.classList.remove('active'));
      const activeSection = document.getElementById(`page-${targetPage}`);
      if (activeSection) {
        activeSection.classList.add('active');
        // Trigger Plotly relayout on visible page change
        window.dispatchEvent(new Event('resize'));
      }
    });
  });

  // Tab switching on Overview page
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const targetTab = btn.dataset.tab;
      document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
      const content = document.getElementById(targetTab);
      if (content) {
        content.classList.add('active');
        window.dispatchEvent(new Event('resize'));
      }
    });
  });
}

// -----------------------------------------------------------------------------
// 2. Runtime Model Configuration
// -----------------------------------------------------------------------------
let runtimeConfig = {
  provider: 'ollama',
  ollamaHost: 'http://localhost:11434',
  ollamaModel: 'qwen2.5:3b',
  hasClaudeKey: false
};

async function initConfig() {
  const providerSelect = document.getElementById('provider-select');
  const ollamaSettings = document.getElementById('ollama-settings');
  const claudeSettings = document.getElementById('claude-settings');
  const ollamaHostInput = document.getElementById('ollama-host');
  const ollamaModelInput = document.getElementById('ollama-model');
  const claudeKeyInput = document.getElementById('claude-key');
  const saveBtn = document.getElementById('save-config-btn');
  const statusEl = document.getElementById('config-status');

  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      runtimeConfig = await res.json();
      providerSelect.value = runtimeConfig.provider || 'ollama';
      ollamaHostInput.value = runtimeConfig.ollamaHost || 'http://localhost:11434';
      ollamaModelInput.value = runtimeConfig.ollamaModel || 'qwen2.5:3b';
      toggleProviderFields(providerSelect.value);
    }
  } catch (err) {
    console.error('Failed to load initial config', err);
  }

  providerSelect.addEventListener('change', () => {
    toggleProviderFields(providerSelect.value);
  });

  function toggleProviderFields(provider) {
    if (provider === 'ollama') {
      ollamaSettings.style.display = 'block';
      claudeSettings.style.display = 'none';
    } else if (provider === 'claude') {
      ollamaSettings.style.display = 'none';
      claudeSettings.style.display = 'block';
    } else {
      ollamaSettings.style.display = 'none';
      claudeSettings.style.display = 'none';
    }
  }

  saveBtn.addEventListener('click', async () => {
    const payload = {
      provider: providerSelect.value,
      ollamaHost: ollamaHostInput.value.trim(),
      ollamaModel: ollamaModelInput.value.trim(),
    };
    if (claudeKeyInput.value.trim()) {
      payload.anthropicKey = claudeKeyInput.value.trim();
    }

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        runtimeConfig = data.config;
        statusEl.textContent = 'Saved successfully!';
        setTimeout(() => { statusEl.textContent = ''; }, 2500);
      }
    } catch (err) {
      statusEl.textContent = 'Failed to save config';
      statusEl.style.color = '#DC2626';
    }
  });
}

// -----------------------------------------------------------------------------
// 3. Overview Page & Visualizations
// -----------------------------------------------------------------------------
async function initOverview() {
  try {
    const res = await fetch('/api/overview');
    if (!res.ok) return;
    const stats = await res.json();

    // KPIs
    document.getElementById('kpi-total').textContent = stats.totalStudents.toLocaleString();
    document.getElementById('kpi-dropout').textContent = `${stats.dropoutRate}%`;
    document.getElementById('kpi-dropout-count').textContent = `${stats.targets.Dropout.toLocaleString()} students dropped out`;
    document.getElementById('kpi-grad').textContent = `${stats.gradRate}%`;
    document.getElementById('kpi-grad-count').textContent = `${stats.targets.Graduate.toLocaleString()} students graduated`;
    document.getElementById('kpi-enrolled').textContent = `${stats.enrolledRate}%`;
    document.getElementById('kpi-enrolled-count').textContent = `${stats.targets.Enrolled.toLocaleString()} active degree seekers`;

    // 1. Course Outcomes Stacked Chart
    const courses = Object.keys(stats.courseOutcomes);
    // Sort courses by dropout rate descending
    courses.sort((a, b) => {
      const rateA = stats.courseOutcomes[a].Dropout / stats.courseOutcomes[a].total;
      const rateB = stats.courseOutcomes[b].Dropout / stats.courseOutcomes[b].total;
      return rateB - rateA;
    });

    const dropouts = courses.map(c => stats.courseOutcomes[c].Dropout);
    const enrolled = courses.map(c => stats.courseOutcomes[c].Enrolled);
    const graduates = courses.map(c => stats.courseOutcomes[c].Graduate);

    const traceDrop = {
      x: courses,
      y: dropouts,
      name: 'Dropout',
      type: 'bar',
      marker: { color: '#EF4444' }
    };
    const traceEnr = {
      x: courses,
      y: enrolled,
      name: 'Enrolled',
      type: 'bar',
      marker: { color: '#3B82F6' }
    };
    const traceGrad = {
      x: courses,
      y: graduates,
      name: 'Graduate',
      type: 'bar',
      marker: { color: '#10B981' }
    };

    const courseLayout = {
      barmode: 'stack',
      plot_bgcolor: '#FFFFFF',
      paper_bgcolor: '#FFFFFF',
      font: { family: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto', color: '#1E293B' },
      xaxis: { tickangle: -35, automargin: true },
      yaxis: { title: 'Number of Students', gridcolor: '#F1F5F9' },
      legend: { orientation: 'h', y: 1.05, x: 1, xanchor: 'right' },
      margin: { t: 40, b: 100, l: 50, r: 20 },
      height: 440
    };

    Plotly.newPlot('chart-courses', [traceDrop, traceEnr, traceGrad], courseLayout, { responsive: true, displayModeBar: false });

    // 2. Tuition Status Chart
    const tuitionCategories = ['Fees Up-to-Date', 'Fees Overdue'];
    const tuitionDrop = tuitionCategories.map(c => stats.tuitionOutcomes[c]?.Dropout || 0);
    const tuitionEnr = tuitionCategories.map(c => stats.tuitionOutcomes[c]?.Enrolled || 0);
    const tuitionGrad = tuitionCategories.map(c => stats.tuitionOutcomes[c]?.Graduate || 0);

    const tuitionLayout = {
      title: 'Student Outcome by Tuition Payment Status',
      barmode: 'group',
      plot_bgcolor: '#FFFFFF',
      paper_bgcolor: '#FFFFFF',
      font: { family: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto', color: '#1E293B' },
      yaxis: { gridcolor: '#F1F5F9' },
      legend: { orientation: 'h', y: 1.1, x: 1, xanchor: 'right' },
      margin: { t: 50, b: 30, l: 50, r: 20 },
      height: 380
    };

    Plotly.newPlot('chart-tuition', [
      { x: tuitionCategories, y: tuitionDrop, name: 'Dropout', type: 'bar', marker: { color: '#EF4444' } },
      { x: tuitionCategories, y: tuitionEnr, name: 'Enrolled', type: 'bar', marker: { color: '#3B82F6' } },
      { x: tuitionCategories, y: tuitionGrad, name: 'Graduate', type: 'bar', marker: { color: '#10B981' } }
    ], tuitionLayout, { responsive: true, displayModeBar: false });

    // 3. Scholarship Status Chart
    const scholCategories = ['Scholarship Recipient', 'No Scholarship'];
    const scholDrop = scholCategories.map(c => stats.scholOutcomes[c]?.Dropout || 0);
    const scholEnr = scholCategories.map(c => stats.scholOutcomes[c]?.Enrolled || 0);
    const scholGrad = scholCategories.map(c => stats.scholOutcomes[c]?.Graduate || 0);

    const scholLayout = {
      title: 'Student Outcome by Scholarship Grant Status',
      barmode: 'group',
      plot_bgcolor: '#FFFFFF',
      paper_bgcolor: '#FFFFFF',
      font: { family: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto', color: '#1E293B' },
      yaxis: { gridcolor: '#F1F5F9' },
      legend: { orientation: 'h', y: 1.1, x: 1, xanchor: 'right' },
      margin: { t: 50, b: 30, l: 50, r: 20 },
      height: 380
    };

    Plotly.newPlot('chart-scholarship', [
      { x: scholCategories, y: scholDrop, name: 'Dropout', type: 'bar', marker: { color: '#EF4444' } },
      { x: scholCategories, y: scholEnr, name: 'Enrolled', type: 'bar', marker: { color: '#3B82F6' } },
      { x: scholCategories, y: scholGrad, name: 'Graduate', type: 'bar', marker: { color: '#10B981' } }
    ], scholLayout, { responsive: true, displayModeBar: false });

  } catch (err) {
    console.error('Error rendering overview', err);
  }
}

// -----------------------------------------------------------------------------
// 4. Student Explorer
// -----------------------------------------------------------------------------
let allStudentIds = [];
let currentSelectedStudentId = 'STU-0001';

async function initStudentExplorer() {
  const selector = document.getElementById('student-selector');
  const randomBtn = document.getElementById('random-student-btn');
  const rePredictBtn = document.getElementById('re-predict-btn');

  // Load all student IDs into select
  try {
    const res = await fetch('/api/students');
    if (res.ok) {
      const data = await res.json();
      allStudentIds = data.students.map(s => s.student_id);

      selector.innerHTML = allStudentIds
        .map(id => `<option value="${id}">${id}</option>`)
        .join('');

      selector.value = currentSelectedStudentId;
      await loadStudentDetails(currentSelectedStudentId);
    }
  } catch (err) {
    console.error('Error loading student dropdown', err);
  }

  selector.addEventListener('change', () => {
    currentSelectedStudentId = selector.value;
    loadStudentDetails(currentSelectedStudentId);
  });

  randomBtn.addEventListener('click', () => {
    if (allStudentIds.length === 0) return;
    const rand = allStudentIds[Math.floor(Math.random() * allStudentIds.length)];
    selector.value = rand;
    currentSelectedStudentId = rand;
    loadStudentDetails(rand);
  });

  rePredictBtn.addEventListener('click', () => {
    runAiPrediction(currentSelectedStudentId);
  });

  const reGrowthBtn = document.getElementById('re-growth-btn');
  if (reGrowthBtn) {
    reGrowthBtn.addEventListener('click', () => {
      loadGrowthPlan(currentSelectedStudentId, true);
    });
  }
}

async function loadStudentDetails(studentId) {
  if (!studentId) return;

  try {
    const res = await fetch(`/api/students/${studentId}`);
    if (!res.ok) return;
    const s = await res.json();

    // Populate Snapshot Cards
    document.getElementById('card-course').textContent = s.course_name;
    document.getElementById('card-age').textContent = `Age at enrollment: ${s.age_at_enrollment} yrs`;

    const tuitionText = s.tuition_fees_up_to_date === 1 ? 'Up to date' : 'Overdue';
    const cardTuition = document.getElementById('card-tuition');
    cardTuition.textContent = tuitionText;
    cardTuition.style.color = s.tuition_fees_up_to_date === 1 ? '#16A34A' : '#DC2626';
    document.getElementById('card-debtor').textContent = `Debtor: ${s.debtor === 1 ? 'Yes' : 'No'}`;

    document.getElementById('card-scholarship').textContent = s.scholarship_holder === 1 ? 'Yes' : 'No';
    document.getElementById('card-attendance').textContent = `Mode: ${s.daytime_attendance === 1 ? 'Daytime' : 'Evening'}`;

    document.getElementById('card-s1').textContent = `${s.sem1.approved} / ${s.sem1.enrolled} Units`;
    document.getElementById('card-s1-grade').textContent = `Grade: ${s.sem1.grade.toFixed(1)} / 20`;

    document.getElementById('card-s2').textContent = `${s.sem2.approved} / ${s.sem2.enrolled} Units`;
    document.getElementById('card-s2-grade').textContent = `Grade: ${s.sem2.grade.toFixed(1)} / 20`;

    // Render Journey Chart
    renderJourneyChart(s);

    // Run or fetch AI prediction
    await runAiPrediction(studentId);

    // Load Mental Health & Peer Growth Roadmap
    await loadGrowthPlan(studentId, false);

  } catch (err) {
    console.error('Error loading student details', err);
  }
}

function renderJourneyChart(s) {
  const semesters = ['Semester 1', 'Semester 2'];
  const enrolled = [s.sem1.enrolled, s.sem2.enrolled];
  const approved = [s.sem1.approved, s.sem2.approved];
  const grades = [s.sem1.grade, s.sem2.grade];

  const traceEnr = {
    x: semesters,
    y: enrolled,
    name: 'Enrolled Units',
    type: 'bar',
    marker: { color: '#CBD5E1' }
  };

  const traceApp = {
    x: semesters,
    y: approved,
    name: 'Approved Units',
    type: 'bar',
    marker: { color: '#00338D' }
  };

  const traceGrade = {
    x: semesters,
    y: grades,
    name: 'Grade (Scale 0-20)',
    type: 'scatter',
    mode: 'lines+markers+text',
    text: [grades[0].toFixed(1), grades[1].toFixed(1)],
    textposition: 'top center',
    yaxis: 'y2',
    line: { color: '#D97706', width: 3 },
    marker: { size: 9, color: '#D97706' }
  };

  const maxUnits = Math.max(Math.max(...enrolled, ...approved, 6) + 2, 8);

  const layout = {
    barmode: 'group',
    plot_bgcolor: '#FFFFFF',
    paper_bgcolor: '#FFFFFF',
    font: { family: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto', color: '#1E293B' },
    yaxis: { title: 'Curricular Units', gridcolor: '#F1F5F9', range: [0, maxUnits] },
    yaxis2: {
      title: 'Grade (/20)',
      overlaying: 'y',
      side: 'right',
      range: [0, 22],
      showgrid: false
    },
    legend: { orientation: 'h', y: 1.1, x: 1, xanchor: 'right' },
    margin: { t: 40, b: 30, l: 40, r: 40 },
    height: 350
  };

  Plotly.newPlot('chart-journey', [traceEnr, traceApp, traceGrade], layout, { responsive: true, displayModeBar: false });
}

async function runAiPrediction(studentId) {
  const loadingEl = document.getElementById('ai-loading');
  const cardEl = document.getElementById('ai-result-card');
  const loadingProviderEl = document.getElementById('loading-provider-label');
  const warningBox = document.getElementById('ai-warning-box');

  const providerSelect = document.getElementById('provider-select');
  const activeProvider = providerSelect ? providerSelect.value : 'ollama';

  loadingProviderEl.textContent = activeProvider.toUpperCase();
  loadingEl.style.display = 'flex';
  cardEl.style.opacity = '0.4';

  try {
    const res = await fetch(`/api/students/${studentId}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: activeProvider })
    });

    const pred = await res.json();

    // Populate prediction UI
    const risk = (pred.risk || 'low').toLowerCase();
    const badgeEl = document.getElementById('ai-risk-badge');
    badgeEl.textContent = `${risk.toUpperCase()} RISK`;
    badgeEl.className = `badge-${risk}`;

    document.getElementById('ai-prob-text').textContent = `${pred.dropout_probability}% Dropout Probability`;
    document.getElementById('ai-provider-badge').textContent = pred.provider || 'rule-based';

    const progBar = document.getElementById('ai-progress-bar');
    progBar.style.width = `${pred.dropout_probability}%`;
    progBar.className = `progress-bar ${risk === 'high' ? 'bg-danger' : (risk === 'medium' ? 'bg-warning' : 'bg-success')}`;

    if (pred.warning) {
      warningBox.textContent = `⚠️ ${pred.warning}`;
      warningBox.style.display = 'block';
    } else {
      warningBox.style.display = 'none';
    }

    const reasonsList = document.getElementById('ai-reasons-list');
    reasonsList.innerHTML = (pred.top_reasons || [])
      .map(r => `<li>${r}</li>`)
      .join('');

    document.getElementById('ai-action-text').textContent = pred.suggested_action || 'Review progress with student.';

    // Fetch feature payload for inspection
    const studentRes = await fetch(`/api/students/${studentId}`);
    if (studentRes.ok) {
      const s = await studentRes.json();
      document.getElementById('ai-payload-preview').textContent = JSON.stringify(s.deidentified_payload, null, 2);
    }

  } catch (err) {
    console.error('Error during AI prediction', err);
  } finally {
    loadingEl.style.display = 'none';
    cardEl.style.opacity = '1';
  }
}

// -----------------------------------------------------------------------------
// Mental Health & Peer Growth Pipeline Controller
// -----------------------------------------------------------------------------
async function loadGrowthPlan(studentId, forceReload = false) {
  if (!studentId) return;

  const providerSelect = document.getElementById('provider-select');
  const activeProvider = providerSelect ? providerSelect.value : 'ollama';

  try {
    const res = await fetch(`/api/students/${studentId}/growth`, {
      method: forceReload ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: forceReload ? JSON.stringify({ provider: activeProvider }) : undefined
    });
    if (!res.ok) return;
    const data = await res.json();

    const st = data.peerComparison.student;
    const peer = data.peerComparison.peerBenchmark;

    // Populate Benchmarking Grid
    document.getElementById('peer-student-comp').textContent = `${st.completionRate}%`;
    document.getElementById('peer-avg-comp').textContent = `${peer.avgCompletionRate}%`;
    const compDelta = st.completionRate - peer.avgCompletionRate;
    const compDeltaEl = document.getElementById('peer-comp-delta');
    compDeltaEl.textContent = `${compDelta >= 0 ? '+' : ''}${compDelta}% vs cohort`;
    compDeltaEl.className = `peer-delta ${compDelta >= 0 ? 'delta-positive' : 'delta-negative'}`;

    document.getElementById('peer-student-grade').textContent = `${st.avgGrade.toFixed(1)}`;
    document.getElementById('peer-avg-grade').textContent = `${peer.avgGrade.toFixed(1)}`;
    const gradeDelta = (st.avgGrade - peer.avgGrade).toFixed(1);
    const gradeDeltaEl = document.getElementById('peer-grade-delta');
    gradeDeltaEl.textContent = `${gradeDelta >= 0 ? '+' : ''}${gradeDelta} pts vs cohort`;
    gradeDeltaEl.className = `peer-delta ${gradeDelta >= 0 ? 'delta-positive' : 'delta-negative'}`;

    document.getElementById('peer-student-eval').textContent = `${st.totalEvaluations}`;
    document.getElementById('peer-avg-eval').textContent = `${peer.avgEvaluations}`;
    const evalDelta = st.totalEvaluations - peer.avgEvaluations;
    const evalDeltaEl = document.getElementById('peer-eval-delta');
    evalDeltaEl.textContent = `${evalDelta >= 0 ? '+' : ''}${evalDelta} assessments`;
    evalDeltaEl.className = `peer-delta ${evalDelta >= 0 ? 'delta-positive' : (evalDelta < -3 ? 'delta-negative' : 'delta-neutral')}`;

    const displacedEl = document.getElementById('peer-displaced-status');
    const displacedSubEl = document.getElementById('peer-displaced-sub');
    if (st.isDisplaced) {
      displacedEl.textContent = 'Relocated (Away from home)';
      displacedEl.style.color = '#D97706';
      displacedSubEl.textContent = `${peer.displacedRatio}% of peers relocated`;
    } else {
      displacedEl.textContent = 'Living at home / Local';
      displacedEl.style.color = '#16A34A';
      displacedSubEl.textContent = 'Family support network accessible';
    }

    // Burnout & Growth Card
    const burnoutRisk = (data.burnout_risk || 'moderate').toLowerCase();
    const burnoutBadge = document.getElementById('growth-burnout-badge');
    burnoutBadge.textContent = `${burnoutRisk.toUpperCase()} BURNOUT VULNERABILITY`;
    burnoutBadge.className = burnoutRisk === 'elevated' ? 'badge-high' : (burnoutRisk === 'moderate' ? 'badge-medium' : 'badge-low');

    const burnoutScore = data.burnout_score || (burnoutRisk === 'elevated' ? 75 : (burnoutRisk === 'moderate' ? 45 : 20));
    document.getElementById('growth-burnout-score').textContent = `${burnoutScore}% Strain Vulnerability`;
    document.getElementById('growth-provider-badge').textContent = data.provider || 'rule-based';

    const progBar = document.getElementById('growth-progress-bar');
    progBar.style.width = `${burnoutScore}%`;
    progBar.className = `progress-bar ${burnoutRisk === 'elevated' ? 'bg-danger' : (burnoutRisk === 'moderate' ? 'bg-warning' : 'bg-success')}`;

    document.getElementById('growth-summary-text').textContent = data.peer_comparison_summary || 'Evaluating velocity against cohort peers.';

    // Signals
    const signalsList = document.getElementById('wellness-signals-list');
    signalsList.innerHTML = (data.wellness_signals || [])
      .map(s => `<li>${s}</li>`)
      .join('');

    // Stages
    const stagesContainer = document.getElementById('growth-stages-container');
    stagesContainer.innerHTML = (data.growth_action_plan || []).map((step, idx) => `
      <div class="stage-card">
        <div class="stage-badge">${step.stage || `Stage ${idx + 1}`}</div>
        <div class="stage-focus">${step.focus || 'Action Focus'}</div>
        <div class="stage-rec">${step.recommendation || ''}</div>
      </div>
    `).join('');

    // Empathy Quote
    document.getElementById('advisor-empathy-quote').textContent = `"${data.advisor_empathy_note || 'How are you holding up with your classes this semester? Let us look at ways to support your journey.'}"`;

  } catch (err) {
    console.error('Error loading growth plan', err);
  }
}


// -----------------------------------------------------------------------------
// 5. At-Risk List & Table
// -----------------------------------------------------------------------------
async function initAtRiskList() {
  const filterRisk = document.getElementById('filter-risk');
  const filterTuition = document.getElementById('filter-tuition');
  const filterCourse = document.getElementById('filter-course');
  const filterSearch = document.getElementById('filter-search');

  // Populate degree programs in filter
  try {
    const res = await fetch('/api/overview');
    if (res.ok) {
      const stats = await res.json();
      const courses = Object.keys(stats.courseOutcomes).sort();
      filterCourse.innerHTML = '<option value="All Programs">All Programs</option>' +
        courses.map(c => `<option value="${c}">${c}</option>`).join('');
    }
  } catch (err) {
    console.error('Error loading courses for filter', err);
  }

  const fetchAndRenderTable = async () => {
    const params = new URLSearchParams({
      risk: filterRisk.value,
      tuition: filterTuition.value,
      course: filterCourse.value,
      search: filterSearch.value
    });

    try {
      const res = await fetch(`/api/students?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();

      document.getElementById('count-matching').textContent = data.total.toLocaleString();
      document.getElementById('count-highRisk' in data ? 'count-highRisk' : 'count-high-risk').textContent = data.highRiskCount.toLocaleString();
      document.getElementById('count-overdue').textContent = data.overdueCount.toLocaleString();

      const tbody = document.getElementById('at-risk-tbody');
      tbody.innerHTML = data.students.map(s => {
        const riskLower = s.risk_level.toLowerCase();
        const barColor = riskLower === 'high' ? 'bg-danger' : (riskLower === 'medium' ? 'bg-warning' : 'bg-success');

        return `
          <tr>
            <td><strong>${s.student_id}</strong></td>
            <td><span class="badge-${riskLower}">${s.risk_level.toUpperCase()}</span></td>
            <td>
              <div class="table-progress">
                <div class="table-bar-bg">
                  <div class="table-bar-fill ${barColor}" style="width: ${s.dropout_probability}%;"></div>
                </div>
                <span>${s.dropout_probability}%</span>
              </div>
            </td>
            <td>${s.course}</td>
            <td style="color: ${s.tuition_fees === 'Up to date' ? '#16A34A' : '#DC2626'}; font-weight: 500;">${s.tuition_fees}</td>
            <td>${s.scholarship}</td>
            <td>${s.sem1_approved}</td>
            <td>${s.sem2_approved}</td>
            <td>${s.actual_outcome}</td>
            <td title="${s.primary_reason}" style="max-width: 200px; overflow: hidden; text-overflow: ellipsis;">${s.primary_reason}</td>
            <td>
              <button class="btn-primary-sm" onclick="navigateToStudent('${s.student_id}')">Analyze ➔</button>
            </td>
          </tr>
        `;
      }).join('');

    } catch (err) {
      console.error('Error fetching filtered students', err);
    }
  };

  filterRisk.addEventListener('change', fetchAndRenderTable);
  filterTuition.addEventListener('change', fetchAndRenderTable);
  filterCourse.addEventListener('change', fetchAndRenderTable);
  filterSearch.addEventListener('input', debounce(fetchAndRenderTable, 250));

  fetchAndRenderTable();
}

// Global action to jump from At-Risk List directly to Student Explorer
window.navigateToStudent = function(studentId) {
  const explorerNav = document.querySelector('.nav-item[data-page="explorer"]');
  if (explorerNav) explorerNav.click();

  const selector = document.getElementById('student-selector');
  if (selector) {
    selector.value = studentId;
    currentSelectedStudentId = studentId;
    loadStudentDetails(studentId);
  }
};

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// -----------------------------------------------------------------------------
// 6. Daily Surveys & Faculty Hub System
// -----------------------------------------------------------------------------
async function initSurveys() {
  const takeSurveySelect = document.getElementById('take-survey-select');
  const facultySurveySelect = document.getElementById('faculty-survey-select');
  const formSurveyTitle = document.getElementById('form-survey-title');
  const formSurveyCourse = document.getElementById('form-survey-course');
  const questionsContainer = document.getElementById('survey-questions-container');
  const studentSurveyForm = document.getElementById('student-survey-form');
  const submitStatusMsg = document.getElementById('survey-submit-status');
  const refreshAiBtn = document.getElementById('refresh-survey-ai-btn');

  let surveysList = [];

  async function loadSurveysDropdowns() {
    try {
      const res = await fetch('/api/surveys');
      if (!res.ok) return;
      surveysList = await res.json();

      const optionsHtml = surveysList.map(s => 
        `<option value="${s.id}">${s.title} (${s.response_count} responses)</option>`
      ).join('');

      if (takeSurveySelect) takeSurveySelect.innerHTML = optionsHtml;
      if (facultySurveySelect) facultySurveySelect.innerHTML = optionsHtml;

      if (surveysList.length > 0) {
        renderStudentSurveyForm(surveysList[0].id);
        renderFacultyAnalytics(surveysList[0].id);
      }
    } catch (e) {
      console.error('Error loading surveys', e);
    }
  }

  if (takeSurveySelect) {
    takeSurveySelect.addEventListener('change', () => {
      renderStudentSurveyForm(takeSurveySelect.value);
    });
  }

  if (facultySurveySelect) {
    facultySurveySelect.addEventListener('change', () => {
      renderFacultyAnalytics(facultySurveySelect.value);
    });
  }

  if (refreshAiBtn) {
    refreshAiBtn.addEventListener('click', () => {
      fetchFacultyAiSummary(facultySurveySelect.value);
    });
  }

  async function renderStudentSurveyForm(surveyId) {
    if (!questionsContainer) return;
    try {
      const res = await fetch(`/api/surveys/${surveyId}`);
      if (!res.ok) return;
      const survey = await res.json();

      if (formSurveyTitle) formSurveyTitle.textContent = survey.title;
      if (formSurveyCourse) formSurveyCourse.textContent = survey.target_course;

      questionsContainer.innerHTML = survey.questions.map((q, idx) => {
        let inputHtml = '';
        if (q.type === 'mood') {
          const moods = [
            { label: 'Great', emoji: '😄' },
            { label: 'Good', emoji: '🙂' },
            { label: 'Okay', emoji: '😐' },
            { label: 'Stressed', emoji: '😰' },
            { label: 'Overwhelmed', emoji: '😫' }
          ];
          inputHtml = `
            <div class="mood-selector-group" data-qid="${q.id}">
              ${moods.map(m => `
                <button type="button" class="mood-btn" data-val="${m.label}">
                  <span>${m.emoji}</span> ${m.label}
                </button>
              `).join('')}
              <input type="hidden" name="${q.id}" value="">
            </div>
          `;
        } else if (q.type === 'rating') {
          inputHtml = `
            <div>
              <div class="rating-pill-group" data-qid="${q.id}">
                ${[1, 2, 3, 4, 5].map(num => `
                  <button type="button" class="rating-pill" data-val="${num}">${num}</button>
                `).join('')}
                <input type="hidden" name="${q.id}" value="3">
              </div>
              <div class="rating-hint">
                <span>1 (Struggling / Low)</span>
                <span>5 (Thriving / High)</span>
              </div>
            </div>
          `;
        } else if (q.type === 'choice') {
          inputHtml = `
            <div class="choice-group">
              ${(q.options || ['Yes', 'No']).map((opt, i) => `
                <label class="choice-label">
                  <input type="radio" name="${q.id}" value="${opt}" ${i === 0 ? 'checked' : ''}>
                  ${opt}
                </label>
              `).join('')}
            </div>
          `;
        } else {
          inputHtml = `
            <textarea name="${q.id}" rows="3" style="width: 100%; border: 1px solid var(--border); border-radius: 4px; padding: 0.5rem; font-family: inherit; font-size: 0.85rem;" placeholder="Share any specific blockers, feedback, or concepts you want reviewed..."></textarea>
          `;
        }

        return `
          <div class="survey-q-item">
            <div class="survey-q-title">${idx + 1}. ${q.text}</div>
            ${inputHtml}
          </div>
        `;
      }).join('');

      // Wire interactive mood buttons
      questionsContainer.querySelectorAll('.mood-selector-group').forEach(grp => {
        const hidden = grp.querySelector('input[type="hidden"]');
        const btns = grp.querySelectorAll('.mood-btn');
        btns.forEach(btn => {
          btn.addEventListener('click', () => {
            btns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            hidden.value = btn.dataset.val;
          });
        });
        if (btns[1]) btns[1].click();
      });

      // Wire interactive rating pills
      questionsContainer.querySelectorAll('.rating-pill-group').forEach(grp => {
        const hidden = grp.querySelector('input[type="hidden"]');
        const pills = grp.querySelectorAll('.rating-pill');
        pills.forEach(pill => {
          pill.addEventListener('click', () => {
            pills.forEach(p => p.classList.remove('selected'));
            pill.classList.add('selected');
            hidden.value = pill.dataset.val;
          });
        });
        if (pills[2]) pills[2].click();
      });

    } catch (e) {
      console.error('Error rendering survey questions', e);
    }
  }

  // Handle survey submission
  if (studentSurveyForm) {
    studentSurveyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const surveyId = takeSurveySelect.value;
      const studentId = document.getElementById('take-student-id').value.trim() || 'STU-0003';
      const formData = new FormData(studentSurveyForm);
      const answers = {};
      formData.forEach((val, key) => { answers[key] = val; });

      if (submitStatusMsg) {
        submitStatusMsg.textContent = 'Submitting reflection...';
        submitStatusMsg.style.color = '#00338D';
      }

      try {
        const res = await fetch(`/api/surveys/${surveyId}/respond`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ student_id: studentId, answers })
        });
        if (res.ok) {
          if (submitStatusMsg) {
            submitStatusMsg.textContent = '✅ Daily pulse recorded! Thank you.';
            submitStatusMsg.style.color = '#16A34A';
            setTimeout(() => { submitStatusMsg.textContent = ''; }, 3500);
          }
          await loadSurveysDropdowns();
          if (facultySurveySelect.value === surveyId) {
            renderFacultyAnalytics(surveyId);
          }
        }
      } catch (err) {
        if (submitStatusMsg) {
          submitStatusMsg.textContent = 'Error submitting survey.';
          submitStatusMsg.style.color = '#DC2626';
        }
      }
    });
  }

  // Render Faculty Analytics
  async function renderFacultyAnalytics(surveyId) {
    try {
      const res = await fetch(`/api/surveys/${surveyId}/analytics`);
      if (!res.ok) return;
      const data = await res.json();

      const countEl = document.getElementById('f-stat-count');
      if (countEl) countEl.textContent = data.total_responses;

      const ratingQ = data.question_analytics.find(q => q.type === 'rating');
      const compEl = document.getElementById('f-stat-comp');
      if (compEl) {
        compEl.textContent = (ratingQ && ratingQ.average) ? `${ratingQ.average} / 5` : 'N/A';
      }

      const moodQ = data.question_analytics.find(q => q.type === 'mood');
      let highStrainCount = 0;
      if (moodQ && moodQ.distribution) {
        highStrainCount = (moodQ.distribution['Stressed'] || 0) + (moodQ.distribution['Overwhelmed'] || 0);
      }
      const flaggedEl = document.getElementById('f-stat-flagged');
      if (flaggedEl) flaggedEl.textContent = highStrainCount;

      const strainEl = document.getElementById('f-stat-strain');
      if (strainEl) {
        if (highStrainCount > 2) {
          strainEl.textContent = 'Elevated';
          strainEl.className = 'metric-value text-danger';
        } else if (highStrainCount > 0) {
          strainEl.textContent = 'Moderate';
          strainEl.className = 'metric-value text-warning';
        } else {
          strainEl.textContent = 'Healthy';
          strainEl.className = 'metric-value text-success';
        }
      }

      // Render recent responses feed
      const feed = document.getElementById('faculty-feed-container');
      if (feed) {
        if (data.recent_responses && data.recent_responses.length > 0) {
          feed.innerHTML = data.recent_responses.map(r => {
            const ansEntries = Object.entries(r.answers).map(([k, v]) => `<div><strong>${k}:</strong> ${v}</div>`).join('');
            return `
              <div class="feed-item">
                <div class="feed-item-top">
                  <span class="feed-student">${r.student_id} (${r.course})</span>
                  <span class="feed-time">${new Date(r.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div class="feed-answers">${ansEntries}</div>
              </div>
            `;
          }).join('');
        } else {
          feed.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; padding: 1rem;">No student responses recorded yet.</div>';
        }
      }

      fetchFacultyAiSummary(surveyId);

    } catch (e) {
      console.error('Error rendering faculty analytics', e);
    }
  }

  async function fetchFacultyAiSummary(surveyId) {
    const badge = document.getElementById('f-ai-status-badge');
    if (badge) {
      badge.textContent = 'SYNTHESIZING...';
      badge.className = 'badge-medium';
    }

    try {
      const res = await fetch(`/api/surveys/${surveyId}/ai-summary`);
      if (!res.ok) return;
      const data = await res.json();

      if (badge) {
        badge.textContent = (data.cohort_status || 'ANALYZED').toUpperCase();
        badge.className = (data.cohort_status || '').includes('High') ? 'badge-high' : 'badge-low';
      }

      const takeawaysList = document.getElementById('f-ai-takeaways');
      if (takeawaysList) {
        takeawaysList.innerHTML = (data.key_takeaways || [])
          .map(t => `<li>${t}</li>`)
          .join('');
      }

      const adjEl = document.getElementById('f-ai-adjustments');
      if (adjEl) {
        adjEl.textContent = data.recommended_adjustments || 'Review pacing in class.';
      }

      const flaggedList = document.getElementById('f-ai-flagged-students');
      if (flaggedList) {
        if (data.students_flagged_for_support && data.students_flagged_for_support.length > 0) {
          flaggedList.innerHTML = data.students_flagged_for_support
            .map(s => `<li>${s}</li>`)
            .join('');
        } else {
          flaggedList.innerHTML = '<li style="color: #16A34A;">No critical distress flags in current batch.</li>';
        }
      }
    } catch (e) {
      console.error('Error generating AI faculty summary', e);
    }
  }

  // Populate course dropdown in create survey form
  try {
    const overviewRes = await fetch('/api/overview');
    if (overviewRes.ok) {
      const overviewData = await overviewRes.json();
      const courseSelect = document.getElementById('new-srv-course');
      if (courseSelect) {
        const courses = Object.keys(overviewData.courseOutcomes || {}).sort();
        courseSelect.innerHTML = '<option value="All Programs">All Programs</option>' +
          courses.map(c => `<option value="${c}">${c}</option>`).join('');
      }
    }
  } catch (e) {}

  // Survey Builder Logic
  const builderList = document.getElementById('builder-questions-list');
  const addQBtn = document.getElementById('add-question-btn');

  function addBuilderQuestion(defaultText = '', defaultType = 'rating') {
    if (!builderList) return;
    const item = document.createElement('div');
    item.className = 'builder-item';
    item.innerHTML = `
      <div style="flex-grow: 1; display: flex; gap: 0.75rem;">
        <input type="text" class="b-q-text" placeholder="Enter question text..." value="${defaultText}" required style="flex-grow: 1; border: 1px solid var(--border); border-radius: 4px; padding: 0.4rem 0.6rem; font-size: 0.85rem;">
        <select class="b-q-type" style="border: 1px solid var(--border); border-radius: 4px; padding: 0.4rem; font-size: 0.82rem;">
          <option value="rating" ${defaultType === 'rating' ? 'selected' : ''}>1-5 Rating Scale</option>
          <option value="mood" ${defaultType === 'mood' ? 'selected' : ''}>Mood / Emotion Emojis</option>
          <option value="choice" ${defaultType === 'choice' ? 'selected' : ''}>Yes / No Choice</option>
          <option value="text" ${defaultType === 'text' ? 'selected' : ''}>Open-Ended Text</option>
        </select>
      </div>
      <button type="button" class="remove-q-btn">Remove</button>
    `;
    item.querySelector('.remove-q-btn').addEventListener('click', () => item.remove());
    builderList.appendChild(item);
  }

  if (addQBtn) {
    addQBtn.addEventListener('click', () => addBuilderQuestion());
  }

  // Default initial builder questions
  if (builderList) {
    addBuilderQuestion("How well did you understand the core concepts covered in today's class?", "rating");
    addBuilderQuestion("How are you feeling about this week's assignment workload?", "mood");
    addBuilderQuestion("What topic or exercise would you like the professor to recap?", "text");
  }

  // Create survey form submission
  const createSurveyForm = document.getElementById('create-survey-form');
  const createStatus = document.getElementById('create-srv-status');

  if (createSurveyForm) {
    createSurveyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('new-srv-title').value.trim();
      const course = document.getElementById('new-srv-course').value;
      const author = document.getElementById('new-srv-author').value.trim();

      const qItems = builderList.querySelectorAll('.builder-item');
      const questions = [];
      qItems.forEach(item => {
        const text = item.querySelector('.b-q-text').value.trim();
        const type = item.querySelector('.b-q-type').value;
        if (text) {
          questions.push({
            text,
            type,
            options: type === 'mood' ? ['Great', 'Good', 'Okay', 'Stressed', 'Overwhelmed'] : (type === 'choice' ? ['Yes', 'Maybe', 'No'] : [])
          });
        }
      });

      if (questions.length === 0) {
        if (createStatus) {
          createStatus.textContent = 'Please add at least one question.';
          createStatus.style.color = '#DC2626';
        }
        return;
      }

      if (createStatus) {
        createStatus.textContent = 'Publishing survey...';
        createStatus.style.color = '#00338D';
      }

      try {
        const res = await fetch('/api/surveys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            target_course: course,
            created_by: author,
            questions
          })
        });
        if (res.ok) {
          if (createStatus) {
            createStatus.textContent = '✅ Survey successfully published!';
            createStatus.style.color = '#16A34A';
          }
          await loadSurveysDropdowns();
          setTimeout(() => {
            if (createStatus) createStatus.textContent = '';
            const takeTabBtn = document.querySelector('.tab-btn[data-tab="tab-survey-take"]');
            if (takeTabBtn) takeTabBtn.click();
          }, 1500);
        }
      } catch (err) {
        if (createStatus) {
          createStatus.textContent = 'Error creating survey.';
          createStatus.style.color = '#DC2626';
        }
      }
    });
  }

  loadSurveysDropdowns();
}

