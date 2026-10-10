# 🎓 StudentSuccess: AI-Powered Student Analytics & Success Platform

> **Project Title**: **MindMetric** *(StudentSuccess AI Platform)*  
> **Repository Link**: [https://github.com/itznan/mind-metric](https://github.com/itznan/mind-metric)  
> **One-Line Summary**: A zero-shot, privacy-first student retention intelligence platform delivering explainable dropout risk scoring, longitudinal journey timelines, mental health peer growth roadmaps, and real-time daily surveys with zero custom model training.  
> **Competition Track**: KPMG Challenge — *AI-Powered Student Analytics and Success Platform*  
> **Hackathon**: HacXLerate 2026 (Round 1 Campus Hackathon)  
> **Live Deployment Link**: `http://localhost:3000` *(or institutional cloud deployment URL)*  
> **Access Credentials**: Public Access (No authentication required for evaluators). Sample IDs: `STU-0003`, `STU-0001`, `STU-0002` (or click **"🎲 Random Student"**).  
> **Local LLM Engine Status**: **Active & Verified** — Running `qwen2.5:3b` via Ollama (`http://localhost:11434`) with zero cloud dependencies.

---

## 1. Problem Statement

Higher education institutions face a silent retention crisis. In the competition benchmark dataset (UCI Higher Education, 4,424 students), **32.1% (1,421 students) drop out**, causing substantial institutional revenue loss, misallocated academic resources, and derailed career trajectories.

### The Problem with Existing Approaches:
* **Black-Box Predictions**: Traditional machine learning models output arbitrary risk scores without explaining *why* a student is struggling.
* **Heavy Training & Maintenance**: Training, tuning, and hosting custom neural networks or gradient boosting trees creates technical debt and deployment bottlenecks.
* **Lack of Actionability**: Advisors are alerted that a student is at risk, but receive no tailored intervention or remediation plan.
* **Disconnected Real-Time Signals**: End-of-semester grade data comes too late; faculty lack real-time mechanisms to capture daily student strain and lecture friction.
* **Privacy & Compliance Hazards**: Exposing student Personal Identifiable Information (PII) to external cloud AI systems violates institutional privacy standards.

---

## 2. Solution Description

**StudentSuccess** is a lightweight, zero-shot retention decision-support system built for academic counselors, professors, and university leadership. It marries **deterministic behavioral analytics** with **pretrained small language models (local Ollama or Claude API)** to evaluate students in real time without training any custom models.

### Key Aspects of the Approach:
* **Understand the Journey**: Compares Semester 1 and Semester 2 academic velocity (enrolled vs. approved curricular units alongside grade curves) on a dual-axis interactive Plotly canvas.
* **Uncover Cohort Patterns**: Visualizes vulnerability by degree program, tuition arrears, and scholarship protection.
* **Explainable Risk Scoring**: Pairs a deterministic rule engine (fast, 0–100%) with zero-shot LLM reasoning to generate the **top 3 root causes** behind each flag.
* **Enable Better Outcomes**: Prescribes an AI-written, tailored counselor intervention strategy for every student.
* **🌱 Mental Health & Peer Growth Pipeline**: Benchmarks individual credit velocity, GPA momentum, exam attendance, and relocation stress against degree cohort averages, producing a 3-stage recovery plan.
* **📝 Daily Pulse Surveys & Faculty Hub**: Students complete < 60s pulse reflections; faculty create custom surveys and receive automated zero-shot AI cohort briefs.
* **Privacy by Design**: Fully de-identifies all data before prompting—zero student names, national IDs, or identifiers ever leave the server.

---

## 3. Mandatory Functionalities Checklist

This checklist tracks every required feature from the competition challenge brief for automated and manual evaluators:

| Status | Mandatory Feature | Description / Evidence | Implementation Location |
| :---: | :--- | :--- | :--- |
| ✅ | **Per-Student Timeline / Journey** | Dual-track chart comparing 1st vs 2nd sem grades, approved vs enrolled units, and fees status. | [public/app.js](file:///home/nan/hackvedant/public/app.js) (`renderJourneyChart`), [server.js](file:///home/nan/hackvedant/server.js) |
| ✅ | **Cohort Overview Analytics** | Total students (4,424), dropout rate (32.1%), graduation rate (49.9%), enrolled rate (18.0%). | [public/index.html](file:///home/nan/hackvedant/public/index.html) (`#page-overview`), `/api/overview` |
| ✅ | **Pattern Discovery Charts** | Plotly charts showing student outcomes grouped by Degree Program, Tuition Payment Status, and Scholarship Status. | [public/app.js](file:///home/nan/hackvedant/public/app.js) (`initOverview`), [public/index.html](file:///home/nan/hackvedant/public/index.html) |
| ✅ | **Student Risk Scoring** | Instant 0–100% dropout risk score, risk level badge (High / Medium / Low). | [server.js](file:///home/nan/hackvedant/server.js) (`calculateRuleRisk`), [public/app.js](file:///home/nan/hackvedant/public/app.js) |
| ✅ | **At-Risk Ranked Roster** | Fast sortable table of all 4,424 students sorted by risk score descending with multi-attribute filtering. | [public/index.html](file:///home/nan/hackvedant/public/index.html) (`#page-at-risk`), `/api/students` |
| ✅ | **Top Reasons / Explainability** | Explicit extraction of the top 3 root causes behind every risk flag (no black-box scores). | [server.js](file:///home/nan/hackvedant/server.js) (`parseModelJson`), [public/app.js](file:///home/nan/hackvedant/public/app.js) |
| ✅ | **AI Intervention Notes** | AI-prescribed counselor action plan tailored to academic and financial circumstances. | [server.js](file:///home/nan/hackvedant/server.js) (`callOllama`, `callClaude`), [public/app.js](file:///home/nan/hackvedant/public/app.js) |
| ✅ | **No Model Training** | Uses small pretrained models zero-shot; no model training pipelines or custom weights required. | [server.js](file:///home/nan/hackvedant/server.js) (`MODEL_PROVIDER`) |
| ✅ | **Multi-Provider LLM Switching** | Switchable via `MODEL_PROVIDER` env var or UI sidebar: `ollama` (default local) or `claude` (Anthropic API). | [server.js](file:///home/nan/hackvedant/server.js) (`/api/config`), [public/app.js](file:///home/nan/hackvedant/public/app.js) |
| ✅ | **Strict JSON Schema & Auto-Retry** | Validates `{"risk": "...", "dropout_probability": ..., "top_reasons": [...], "suggested_action": "..."}` with 1x auto-retry on failure. | [server.js](file:///home/nan/hackvedant/server.js) (`parseModelJson`, retry loop) |
| ✅ | **Deterministic Rule-Based Fallback** | Instant offline fallback labeled `"rule-based"` if models are unreachable. | [server.js](file:///home/nan/hackvedant/server.js) (`calculateRuleRisk`) |
| ✅ | **Caching & Performance Optimization**| In-memory server caching (`llmCache`, `growthCache`) to prevent redundant inference calls. | [server.js](file:///home/nan/hackvedant/server.js) (`llmCache`, `growthCache`) |
| ✅ | **Complete Data Anonymization** | Zero student names, national IDs, or personal identifiers sent to LLMs; only de-identified metrics. | [server.js](file:///home/nan/hackvedant/server.js) (`buildFeaturePayload`) |
| ✅ | **Visible Decision-Support Notice** | Mandatory banner: *"Predictions come from a general pretrained model, not trained on this data. Treat as decision support, not a final judgement."* | [public/index.html](file:///home/nan/hackvedant/public/index.html) (`.notice-banner`) |
| ✅ | **Robust CSV Parser** | Auto-detects delimiter (comma/semicolon), cleans UTF-8 BOM, and strips whitespace from `dataset.csv`. | [server.js](file:///home/nan/hackvedant/server.js) (`loadDataset`) |
| ✅ | **Daily Survey & Faculty Hub** | Real-time student pulse checks, mood tracking, professor survey creation, and zero-shot AI cohort brief. | [server.js](file:///home/nan/hackvedant/server.js) (`/api/surveys`), [public/app.js](file:///home/nan/hackvedant/public/app.js) |
| ✅ | **Mental Health & Growth Pipeline** | Longitudinal cohort peer-benchmarking, cognitive strain scoring, and 3-stage recovery roadmaps. | [server.js](file:///home/nan/hackvedant/server.js) (`/api/students/:id/growth`), [public/app.js](file:///home/nan/hackvedant/public/app.js) |
| ✅ | **Usage & Operational Guide** | In-app instructions detailing model setup, Ollama installation, API keys, privacy, and limits. | [public/index.html](file:///home/nan/hackvedant/public/index.html) (`#page-guide`) |

---

## 4. Additional Features (Innovation & Depth)

Beyond the baseline requirements, StudentSuccess incorporates several production-grade innovations:

* **🌱 Mental Health & Peer Growth Pipeline**:
  * **Longitudinal Cohort Benchmarking**: Compares the specific student's credit completion velocity, GPA momentum, and exam evaluation attendance against peer averages in their exact degree program.
  * **Relocation & Socio-Emotional Stress Indicators**: Accounts for students living away from home (54% of cohort) and tuition arrears that drive psychological anxiety and academic withdrawal.
  * **Cognitive Strain & Burnout Vulnerability Scoring**: Classifies strain into `Low`, `Moderate`, or `Elevated` based on evaluation drop-offs and semester grade fatigue.
  * **Personalized 3-Stage Growth & Recovery Roadmap**: Generates an actionable step-by-step growth path (Stage 1: Pacing & Load Rebalancing, Stage 2: Wellness & Mentorship, Stage 3: Long-term Skill Mastery).
  * **Counselor Empathy Note**: Provides a non-judgmental, compassionate conversation starter for advisors to initiate check-ins without causing defensiveness or test anxiety.

* **📝 Daily Pulse Surveys & Faculty Management Hub**:
  * **Student Pulse Portal**: Enables students to submit quick (< 60 second) reflections on their daily mental state (emoji moods), workload manageability (1–5 scale), exam confidence, and open blockers.
  * **Faculty Survey Builder**: Empowers professors to design and publish targeted surveys for specific degree programs or classes with customized question types (mood emojis, 1–5 rating scales, multiple-choice, and free-text).
  * **AI Executive Cohort Brief**: Zero-shot LLM analyzes recent student feedback to provide professors with actionable guidance (overall cohort anxiety status, top 3 student takeaways, recommended lecture pacing adjustments, and flagged students needing immediate outreach).

* **One-Click Advisor Deep Dive**: Clicking **"Analyze ➔"** on any row in the At-Risk List instantly loads the student's longitudinal trajectory in the Explorer.
* **Instant "🎲 Random Student" Tester**: Allows hackathon evaluators to test random records across different risk profiles with a single click.
* **Transparent Feature Inspector Drawer**: Expandable `<details>` view displaying the exact de-identified JSON payload transmitted to the LLM, enabling audits.
* **Dynamic Client-Side Filtering**: Interactive filtering by Risk Level, Tuition Arrears, and Degree Program with debounced live search.
* **Offline Resilient Dual-Layer Architecture**: Runs 100% locally with zero external network connectivity when using Ollama (`qwen2.5:3b`) or the Rule Engine.

---

## 5. Technology Stack

| Layer | Technologies / Tools | Description / Purpose |
| :--- | :--- | :--- |
| **Runtime & Backend** | **Node.js (v22 / v18+)** | Asynchronous JavaScript runtime environment |
| **Web Server** | **Express.js (v4.21)** | Fast, lightweight REST API and static dashboard server |
| **CSV Engine** | **csv-parse (v5.6)** | Delimiter-sniffing, BOM-stripping streaming CSV parser |
| **Frontend Framework** | **HTML5 + Modern Vanilla JS** | Pure standards-compliant frontend with zero framework bloat |
| **Styling & Design** | **Custom CSS3** | Minimalist aesthetic: pure white (`#FFFFFF`) with KPMG Navy (`#00338D`) |
| **Data Visualization** | **Plotly.js (v2.35)** | Responsive interactive SVG/WebGL charts (dual-axis, stacked bar) |
| **Local LLM Engine** | **Ollama** (`qwen2.5:3b` - **Active**) | Local on-premise zero-shot structured JSON inference via `http://localhost:11434` |
| **Cloud LLM Engine** | **Anthropic Claude API** (`claude-haiku-5-5`) | Low-latency cloud zero-shot inference |
| **Data Stores** | **In-Memory + Tabular CSV + JSON** | [dataset.csv](file:///home/nan/hackvedant/dataset.csv) (4,424 records) & [surveys.json](file:///home/nan/hackvedant/surveys.json) |

---

## 6. Architecture & Implementation Details

```
                                 ┌─────────────────────────┐
                                 │   dataset.csv (4,424)   │
                                 └────────────┬────────────┘
                                              │ Auto-detect separator & clean BOM
                                 ┌────────────▼────────────┐
                                 │   server.js Data Loader │
                                 └────────────┬────────────┘
                                              │ In-memory indexing & rule scoring
                      ┌───────────────────────┴───────────────────────┐
                      │                                               │
         ┌────────────▼────────────┐                     ┌────────────▼────────────┐
         │  REST Endpoints (API)   │                     │  Zero-Shot LLM Router   │
         │  /api/overview          │                     │  - De-identify payload  │
         │  /api/students          │                     │  - Check in-memory cache│
         │  /api/students/:id      │                     │  - Validate JSON schema │
         │  /api/students/:id/growth                     │  - 1x retry on failure  │
         │  /api/surveys           │                     │  - Fallback to rules    │
         └────────────┬────────────┘                     └────────────┬────────────┘
                      │                                               │
                      │ JSON Responses            ┌───────────────────┴───────────────────┐
                      │                           │                                       │
                      │               ┌───────────▼──────────┐                ┌───────────▼──────────┐
                      │               │   Local Ollama       │                │   Anthropic Claude   │
                      │               │ (qwen2.5:3b ACTIVE)  │                │    (Haiku-5-5 API)   │
                      │               └───────────┬──────────┘                └───────────┬──────────┘
                      │                           │                                       │
                      │                           └───────────────────┬───────────────────┘
                      │                                               │ (Fallback on fail)
                      │                                  ┌────────────▼────────────┐
                      │                                  │ Deterministic Rule Engine│
                      │                                  └────────────┬────────────┘
                      │                                               │
         ┌────────────▼───────────────────────────────────────────────▼────────────┐
         │                          Client Dashboard (Browser)                     │
         │  Overview ── Student Explorer ── At-Risk Roster ── Daily Surveys ── Guide│
         └─────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Live Deployment & Evaluator Sample Data

* **Local Evaluation URL**: [http://localhost:3000](http://localhost:3000)
* **Authentication**: None required (open evaluation dashboard).
* **Sample Test Records for Evaluators**:
  * **`STU-0003`** (High Risk — 80–95%): Overdue tuition fees, zero 2nd semester approved units, relocated student away from family.
  * **`STU-0001`** (Medium Risk — 50%): Tuition up to date, but struggled with unit completion in early semesters.
  * **`STU-0002`** (Low Risk — 15%): Completed all units in Sem 1 and Sem 2 with solid grades; graduated.
  * **`🎲 Random Student` Button**: Located in the Student Explorer for spontaneous stress testing.
  * **Daily Survey Test**: Go to **Daily Surveys & Faculty Hub**, select `Daily Student Well-Being & Academic Pulse`, submit as `STU-0003`, and switch to the **Professor Hub** tab to see the live AI update!

---

## 8. Setup and Run Instructions

### Prerequisites
* **Node.js** v18.0 or higher (`node -v`)
* **npm** (`npm -v`)
* **Ollama** (Already installed on `/usr/local/bin/ollama` with `qwen2.5:3b` downloaded)

### Step 1: Install Dependencies
```bash
git clone <your-repo-link>
cd hackvedant
npm install
```

### Step 2: Environment Variables
Create an optional `.env` file or export environment variables in your terminal:

| Variable | Required? | Default Value | Description |
| :--- | :---: | :---: | :--- |
| `PORT` | Optional | `3000` | Port for the Express web server |
| `MODEL_PROVIDER` | Optional | `ollama` | Inference engine: `ollama`, `claude`, or `rule-based` |
| `OLLAMA_HOST` | Optional | `http://localhost:11434` | Base URL of local Ollama server |
| `OLLAMA_MODEL` | Optional | `qwen2.5:3b` | Local Ollama model tag (Active: `qwen2.5:3b`) |
| `ANTHROPIC_API_KEY` | Optional | `""` | Anthropic API key (only needed if using Claude) |

> 🔒 **Security Notice**: Never commit real API keys to version control. The platform functions completely offline via local Ollama without requiring any external API keys.

### Step 3: Run the Application
```bash
npm start
```
Open **[http://localhost:3000](http://localhost:3000)** in any modern web browser.

---

## 9. 3-Minute Hackathon Demo Script for Judges

When presenting to evaluators, follow this 4-step walkthrough:

1. **The Problem & Macro View (30s)**:
   * Show the **Cohort Overview** page.
   * Point out the **32.1% dropout rate** (1,421 students).
   * Show the **Financial Drivers** chart: demonstrate how unpaid tuition and lack of scholarships multiply dropout probability.

2. **The Roster & Deep Dive (45s)**:
   * Navigate to the **At-Risk List**.
   * Filter by **"High Risk Only"** and **"Overdue Tuition"**.
   * Click **"Analyze ➔"** on student `STU-0003` to jump straight into the Student Explorer.

3. **Student Journey, AI Diagnosis & Mental Health Pipeline (60s)**:
   * Review the **Academic Journey Progression** chart: show how Sem 2 approvals collapsed to 0.
   * View the **Zero-Shot Risk Card**: show `HIGH RISK (80%)`, top explainable reasons, and the suggested intervention note generated live by local `qwen2.5:3b`.
   * Scroll to the **Mental Health & Peer Growth Pipeline**: show the student’s velocity compared to their degree cohort, cognitive strain level (`ELEVATED`), and the 3-stage recovery roadmap with counselor empathy conversation starters.

4. **Real-Time Daily Surveys & Faculty AI Synthesis (45s)**:
   * Navigate to **Daily Surveys & Faculty Hub**.
   * Show the **Student Pulse Portal**: submit a daily reflection with mood emojis and workload rating.
   * Switch to the **Professor Hub**: show the live response feed and click **"Generate AI Cohort Brief"** to show how professors get automated lecture pacing adjustments and flagged student alerts.

---

## 10. Team Details

* **Team Name**: StudentSuccess Analytics
* **Team Lead**: Vedant Nan (Architecture, Full-Stack Node.js, AI Integration)
* **Team Members**:
  * Vedant Nan — Lead Full-Stack & AI Engineer
  * *(Add additional team member names & roles here)*

---

## 11. AI Usage Statement (Section 12 Compliance)

In accordance with Section 12 ("Ownership and Intellectual Property") of the HacXLerate 2026 Round 1 RuleBook:

* **Where AI was used**: AI assistant tools were utilized to accelerate initial boilerplate scaffolding, assist in CSS formatting, and test zero-shot prompt framing.
* **Ownership and Understanding**: The team designed the overarching architecture, implemented the delimiter-sniffing CSV pipeline, formulated the deterministic rule scoring heuristics, integrated the dual-axis Plotly visualizations, authored all custom Express routes, built the mental health peer-benchmarking engine, and designed the daily survey subsystem. The team maintains 100% intellectual comprehension and ownership over every line of code submitted.

---

## 12. Challenge-Specific Items: Responsible AI & Fairness

* **Fairness & Demographic Bias Audit**:
  * The prediction router deliberately excludes protected demographic attributes (`Gender`, `Nacionality`, `Marital status`) from the feature payload to prevent demographic algorithmic bias.
  * Decisions rely strictly on demonstrated academic behaviors (grades, credits attempted vs. earned) and financial status (tuition arrears).
* **Limitations & Institutional Transferability**:
  * The dataset originates from the Polytechnic Institute of Portalegre, Portugal (UCI Machine Learning Repository).
  * Institutional grading conventions (0–20 scale) and curriculum dynamics vary across universities; before real-world production deployment, threshold parameters should be calibrated against local institutional distributions.
* **Human-in-the-Loop Philosophy**:
  * StudentSuccess is explicitly engineered as a **decision-support augment**, not an autonomous evaluator. The platform provides transparent signals to empower human advisors to conduct compassionate, timely outreach.
