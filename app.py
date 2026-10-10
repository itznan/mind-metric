import os
import json
import re
import csv
import urllib.request
import urllib.error
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

# -----------------------------------------------------------------------------
# Configuration & Theme Styling
# -----------------------------------------------------------------------------
st.set_page_config(
    page_title="StudentSuccess | AI Student Analytics",
    page_icon="🎓",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Minimalist, clean styling with KPMG Navy accent (#00338D)
st.markdown(
    """
    <style>
    :root {
        --primary-color: #00338D;
        --secondary-color: #005EB8;
        --background-color: #FFFFFF;
        --surface-color: #F8FAFC;
        --text-color: #0F172A;
        --muted-text: #64748B;
        --border-color: #E2E8F0;
        --high-risk: #DC2626;
        --med-risk: #D97706;
        --low-risk: #16A34A;
    }
    
    /* Main container clean spacing */
    .block-container {
        padding-top: 2rem;
        padding-bottom: 3rem;
        max-width: 1200px;
    }
    
    /* Notice banner */
    .notice-banner {
        background-color: #F8FAFC;
        border: 1px solid #E2E8F0;
        border-left: 4px solid #00338D;
        padding: 0.75rem 1rem;
        border-radius: 4px;
        font-size: 0.85rem;
        color: #475569;
        margin-bottom: 1.5rem;
    }
    
    /* Metric cards */
    .metric-card {
        background-color: #FFFFFF;
        border: 1px solid #E2E8F0;
        border-radius: 6px;
        padding: 1rem 1.25rem;
        text-align: left;
        box-shadow: 0 1px 2px rgba(0,0,0,0.03);
    }
    .metric-label {
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #64748B;
        margin-bottom: 0.25rem;
    }
    .metric-value {
        font-size: 1.75rem;
        font-weight: 700;
        color: #0F172A;
        line-height: 1.2;
    }
    .metric-sub {
        font-size: 0.8rem;
        color: #94A3B8;
        margin-top: 0.2rem;
    }
    
    /* Badges */
    .badge-high {
        background-color: #FEE2E2;
        color: #B91C1C;
        padding: 0.25rem 0.6rem;
        border-radius: 9999px;
        font-size: 0.8rem;
        font-weight: 600;
        display: inline-block;
    }
    .badge-medium {
        background-color: #FEF3C7;
        color: #B45309;
        padding: 0.25rem 0.6rem;
        border-radius: 9999px;
        font-size: 0.8rem;
        font-weight: 600;
        display: inline-block;
    }
    .badge-low {
        background-color: #DCFCE7;
        color: #15803D;
        padding: 0.25rem 0.6rem;
        border-radius: 9999px;
        font-size: 0.8rem;
        font-weight: 600;
        display: inline-block;
    }
    
    /* Risk card */
    .risk-box {
        background-color: #FFFFFF;
        border: 1px solid #E2E8F0;
        border-radius: 6px;
        padding: 1.25rem;
        margin-top: 1rem;
        margin-bottom: 1rem;
    }
    
    .source-tag {
        font-size: 0.75rem;
        background-color: #EEF2F6;
        color: #1E293B;
        padding: 0.2rem 0.5rem;
        border-radius: 4px;
        font-weight: 600;
    }
    </style>
    """,
    unsafe_allow_html=True,
)

COURSE_MAPPING = {
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
    17: "Management (Day)",
}


# -----------------------------------------------------------------------------
# Data Loader (Auto-detect separator, clean BOM & whitespace, cache)
# -----------------------------------------------------------------------------
@st.cache_data(show_spinner=False)
def load_dataset(csv_path: str = "dataset.csv") -> pd.DataFrame:
    """Loads and standardizes dataset.csv."""
    if not os.path.exists(csv_path):
        st.error(f"Dataset file '{csv_path}' not found in the current directory.")
        return pd.DataFrame()

    # Detect delimiter
    sep = ","
    try:
        with open(csv_path, "r", encoding="utf-8-sig", errors="ignore") as f:
            sample = f.read(4096)
            sniffer = csv.Sniffer()
            dialect = sniffer.sniff(sample, delimiters=",;\t")
            sep = dialect.delimiter
    except Exception:
        sep = ","

    df = pd.read_csv(csv_path, sep=sep, encoding="utf-8-sig")

    # Clean column headers: strip whitespace, remove invisible characters
    df.columns = [str(c).strip().replace("\ufeff", "") for c in df.columns]

    # Create readable student index
    df["Student_ID"] = [f"STU-{i+1:04d}" for i in range(len(df))]
    
    # Map course names
    if "Course" in df.columns:
        df["Course_Name"] = df["Course"].map(lambda x: COURSE_MAPPING.get(int(x), f"Course {x}"))
    else:
        df["Course_Name"] = "Unknown"

    return df


# -----------------------------------------------------------------------------
# Rule-Based Risk Engine (Deterministic Fallback)
# -----------------------------------------------------------------------------
def calculate_rule_based_risk(row: pd.Series) -> dict:
    """
    Computes a deterministic, explainable risk score (0-100) based on academic
    and financial risk signals in the UCI dataset.
    """
    score = 15  # baseline probability
    reasons = []

    # Financial / Tuition Status
    fees_up_to_date = int(row.get("Tuition fees up to date", 1))
    debtor = int(row.get("Debtor", 0))
    scholarship = int(row.get("Scholarship holder", 0))

    if fees_up_to_date == 0:
        score += 35
        reasons.append("Tuition fees are overdue")
    if debtor == 1:
        score += 15
        reasons.append("Identified as institutional debtor")
    if scholarship == 1:
        score -= 10

    # Semester 1 Performance
    s1_enrolled = float(row.get("Curricular units 1st sem (enrolled)", 0))
    s1_approved = float(row.get("Curricular units 1st sem (approved)", 0))
    s1_grade = float(row.get("Curricular units 1st sem (grade)", 0))

    if s1_enrolled > 0:
        s1_ratio = s1_approved / s1_enrolled
        if s1_ratio < 0.5:
            score += 20
            reasons.append(f"Low 1st sem completion ({int(s1_approved)}/{int(s1_enrolled)} units)")
        if s1_grade < 10.0 and s1_grade > 0:
            score += 10
            reasons.append(f"Below average 1st sem grade ({s1_grade:.1f}/20)")
    elif s1_approved == 0:
        score += 15
        reasons.append("Zero 1st sem units approved")

    # Semester 2 Performance
    s2_enrolled = float(row.get("Curricular units 2nd sem (enrolled)", 0))
    s2_approved = float(row.get("Curricular units 2nd sem (approved)", 0))
    s2_grade = float(row.get("Curricular units 2nd sem (grade)", 0))

    if s2_enrolled > 0:
        s2_ratio = s2_approved / s2_enrolled
        if s2_ratio < 0.5:
            score += 25
            reasons.append(f"Low 2nd sem completion ({int(s2_approved)}/{int(s2_enrolled)} units)")
        if s2_grade < 10.0 and s2_grade > 0:
            score += 10
            reasons.append(f"Below average 2nd sem grade ({s2_grade:.1f}/20)")
    elif s2_approved == 0:
        score += 20
        reasons.append("Zero 2nd sem units approved")

    # Clamping
    score = max(5, min(95, score))

    if score >= 60:
        risk = "high"
    elif score >= 35:
        risk = "medium"
    else:
        risk = "low"

    if not reasons:
        if scholarship == 1 and s2_approved > 0:
            reasons = ["Good curricular progress", "Active scholarship recipient", "Fees up to date"]
        else:
            reasons = ["Consistent unit completion", "Passing academic grades", "No overdue fees"]

    # Select top 3 reasons
    top_reasons = reasons[:3]

    # Action recommendation
    if risk == "high":
        if fees_up_to_date == 0:
            action = "Immediate financial counselor outreach to establish tuition payment plan and academic support."
        else:
            action = "Urgent advisor meeting to address unit non-completion and restructure course load."
    elif risk == "medium":
        action = "Schedule mid-term academic check-in and recommend peer tutoring for struggling modules."
    else:
        action = "Maintain standard progress tracking; student is meeting core academic benchmarks."

    return {
        "risk": risk,
        "dropout_probability": int(score),
        "top_reasons": top_reasons,
        "suggested_action": action,
        "provider": "rule-based",
    }


# Fast precalculation of rule-based risk for all rows (cached)
@st.cache_data(show_spinner=False)
def get_all_rule_scores(df: pd.DataFrame) -> pd.DataFrame:
    records = []
    for idx, row in df.iterrows():
        res = calculate_rule_based_risk(row)
        records.append({
            "Student_ID": row["Student_ID"],
            "Risk_Level": res["risk"].capitalize(),
            "Dropout_Risk_%": res["dropout_probability"],
            "Course": row.get("Course_Name", "Unknown"),
            "Tuition_Fees": "Up to date" if int(row.get("Tuition fees up to date", 1)) == 1 else "Overdue",
            "Scholarship": "Yes" if int(row.get("Scholarship holder", 0)) == 1 else "No",
            "Sem1_Approved": int(row.get("Curricular units 1st sem (approved)", 0)),
            "Sem2_Approved": int(row.get("Curricular units 2nd sem (approved)", 0)),
            "Actual_Outcome": str(row.get("Target", "Unknown")),
            "Primary_Reason": res["top_reasons"][0] if res["top_reasons"] else "N/A"
        })
    return pd.DataFrame(records)


# -----------------------------------------------------------------------------
# Zero-Shot LLM Risk Prediction (Ollama & Claude with Retry & Fallback)
# -----------------------------------------------------------------------------
def build_feature_payload(row: pd.Series) -> dict:
    """Builds strict anonymized feature dictionary (no names or IDs)."""
    return {
        "age_at_enrollment": int(row.get("Age at enrollment", 20)),
        "attendance": "Daytime" if int(row.get("Daytime/evening attendance", 1)) == 1 else "Evening",
        "tuition_fees_up_to_date": "Yes" if int(row.get("Tuition fees up to date", 1)) == 1 else "No",
        "debtor": "Yes" if int(row.get("Debtor", 0)) == 1 else "No",
        "scholarship_holder": "Yes" if int(row.get("Scholarship holder", 0)) == 1 else "No",
        "sem1_enrolled_units": int(row.get("Curricular units 1st sem (enrolled)", 0)),
        "sem1_approved_units": int(row.get("Curricular units 1st sem (approved)", 0)),
        "sem1_grade_scale_20": round(float(row.get("Curricular units 1st sem (grade)", 0)), 1),
        "sem2_enrolled_units": int(row.get("Curricular units 2nd sem (enrolled)", 0)),
        "sem2_approved_units": int(row.get("Curricular units 2nd sem (approved)", 0)),
        "sem2_grade_scale_20": round(float(row.get("Curricular units 2nd sem (grade)", 0)), 1),
    }


def clean_and_parse_json(raw_text: str) -> dict:
    """Extracts and validates JSON structure."""
    text = raw_text.strip()
    match = re.search(r"(\{.*\})", text, re.DOTALL)
    if match:
        text = match.group(1)

    data = json.loads(text)
    risk = str(data.get("risk", "")).lower().strip()
    if risk not in ["low", "medium", "high"]:
        prob = int(data.get("dropout_probability", 50))
        risk = "high" if prob >= 60 else ("medium" if prob >= 35 else "low")

    prob = int(float(data.get("dropout_probability", 50)))
    prob = max(0, min(100, prob))

    reasons = data.get("top_reasons", [])
    if isinstance(reasons, str):
        reasons = [reasons]
    elif not isinstance(reasons, list) or len(reasons) == 0:
        reasons = ["Academic and financial indicator analysis"]
    reasons = [str(r) for r in reasons[:3]]

    action = str(data.get("suggested_action", "Provide personalized advising.")).strip()

    return {
        "risk": risk,
        "dropout_probability": prob,
        "top_reasons": reasons,
        "suggested_action": action,
    }


def call_ollama(payload: dict, host: str, model: str) -> dict:
    """Calls local Ollama API."""
    url = f"{host.rstrip('/')}/api/generate"
    prompt = f"""You are an educational risk assessment system. Evaluate this anonymous student's academic & financial features:
{json.dumps(payload, indent=2)}

Predict the likelihood of student dropout.
Return ONLY valid JSON in this exact structure with no surrounding markdown or explanation:
{{
  "risk": "low|medium|high",
  "dropout_probability": 0-100,
  "top_reasons": ["short reason 1", "short reason 2", "short reason 3"],
  "suggested_action": "one clear actionable sentence"
}}"""

    req_data = json.dumps({
        "model": model,
        "prompt": prompt,
        "stream": False,
        "format": "json"
    }).encode("utf-8")

    req = urllib.request.Request(url, data=req_data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        result = json.loads(resp.read().decode("utf-8"))
        raw_output = result.get("response", "")
        parsed = clean_and_parse_json(raw_output)
        parsed["provider"] = f"ollama ({model})"
        return parsed


def call_claude(payload: dict, api_key: str, model: str = "claude-haiku-5-5") -> dict:
    """Calls Anthropic Claude API."""
    url = "https://api.anthropic.com/v1/messages"
    system_prompt = "You are an educational risk assessment system. Return ONLY valid JSON with no markdown formatting."
    user_prompt = f"""Evaluate this anonymous student's features:
{json.dumps(payload, indent=2)}

Return strictly JSON matching:
{{
  "risk": "low|medium|high",
  "dropout_probability": 0-100,
  "top_reasons": ["short reason 1", "short reason 2", "short reason 3"],
  "suggested_action": "one clear actionable sentence"
}}"""

    body = {
        "model": model,
        "max_tokens": 300,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_prompt}]
    }

    req_data = json.dumps(body).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
    }

    req = urllib.request.Request(url, data=req_data, headers=headers)
    with urllib.request.urlopen(req, timeout=15) as resp:
        result = json.loads(resp.read().decode("utf-8"))
        raw_text = result["content"][0]["text"]
        parsed = clean_and_parse_json(raw_text)
        parsed["provider"] = f"claude ({model})"
        return parsed


@st.cache_data(show_spinner=False)
def predict_student_risk(
    student_id: str,
    feature_payload_json: str,
    provider: str,
    ollama_host: str,
    ollama_model: str,
    claude_key: str
) -> tuple[dict, str | None]:
    """
    Cached risk prediction for a student.
    Returns (result_dict, error_message_or_none).
    """
    payload = json.loads(feature_payload_json)
    error_msg = None

    if provider == "claude":
        if not claude_key:
            return None, "ANTHROPIC_API_KEY is not set. Please supply a key or switch provider to Ollama / Rule-based."
        for attempt in range(2):
            try:
                res = call_claude(payload, claude_key)
                return res, None
            except Exception as e:
                if attempt == 1:
                    error_msg = f"Claude API call failed: {str(e)}"
    elif provider == "ollama":
        for attempt in range(2):
            try:
                res = call_ollama(payload, ollama_host, ollama_model)
                return res, None
            except Exception as e:
                if attempt == 1:
                    error_msg = f"Ollama connection failed at '{ollama_host}': {str(e)}"

    return None, error_msg


# -----------------------------------------------------------------------------
# Main Application Navigation & Layout
# -----------------------------------------------------------------------------
def main():
    df = load_dataset()
    if df.empty:
        st.stop()

    # Pre-calculate fast rule-based table
    rule_df = get_all_rule_scores(df)

    # Sidebar settings & navigation
    with st.sidebar:
        st.markdown(
            """
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 0.5rem;">
                <span style="font-size: 1.5rem;">🎓</span>
                <span style="font-weight: 700; font-size: 1.25rem; color: #00338D; letter-spacing: -0.02em;">StudentSuccess</span>
            </div>
            <p style="font-size: 0.78rem; color: #64748B; margin-top: -0.5rem; margin-bottom: 1.5rem;">
                AI-Powered Student Analytics & Retention
            </p>
            """,
            unsafe_allow_html=True,
        )

        nav_page = st.radio(
            "Navigation",
            ["Overview", "Student Explorer", "At-Risk List", "How to Use"],
            index=0,
            label_visibility="collapsed",
        )

        st.markdown("---")
        st.markdown("<p style='font-size: 0.8rem; font-weight: 600; color: #475569;'>MODEL CONFIGURATION</p>", unsafe_allow_html=True)
        
        # Provider selection with env var fallback
        default_provider_env = os.getenv("MODEL_PROVIDER", "ollama").lower()
        if default_provider_env not in ["ollama", "claude"]:
            default_provider_env = "ollama"

        provider_idx = 0 if default_provider_env == "ollama" else 1
        active_provider = st.selectbox(
            "Provider",
            ["ollama", "claude", "rule-based"],
            index=provider_idx if default_provider_env in ["ollama", "claude"] else 2,
            help="Switch between local Ollama LLM, Anthropic Claude API, or offline rule-based scoring."
        )

        ollama_host = os.getenv("OLLAMA_HOST", "http://localhost:11434")
        ollama_model = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
        anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")

        if active_provider == "ollama":
            ollama_host = st.text_input("Ollama Host", value=ollama_host)
            ollama_model = st.text_input("Ollama Model", value=ollama_model)
        elif active_provider == "claude":
            anthropic_key = st.text_input("Anthropic Key", value=anthropic_key, type="password")

        st.markdown("---")
        st.markdown(
            """
            <div style="font-size: 0.75rem; color: #94A3B8;">
                KPMG Challenge Platform<br>
                Dataset: UCI Higher Education (4,424 records)
            </div>
            """,
            unsafe_allow_html=True,
        )

    # Mandatory decision support disclosure banner
    st.markdown(
        """
        <div class="notice-banner">
            <strong>Notice:</strong> Predictions come from a general pretrained model, not trained on this data. 
            Treat as decision support, not a final judgement.
        </div>
        """,
        unsafe_allow_html=True,
    )

    # Page Routing
    if nav_page == "Overview":
        render_overview(df)
    elif nav_page == "Student Explorer":
        render_student_explorer(df, active_provider, ollama_host, ollama_model, anthropic_key)
    elif nav_page == "At-Risk List":
        render_at_risk_list(df, rule_df)
    elif nav_page == "How to Use":
        render_how_to_use()


# -----------------------------------------------------------------------------
# PAGE 1: Overview
# -----------------------------------------------------------------------------
def render_overview(df: pd.DataFrame):
    st.markdown("### Cohort Overview")
    st.markdown("<p style='color: #64748B; font-size: 0.95rem; margin-top: -0.5rem;'>Global student population breakdown and primary retention indicators.</p>", unsafe_allow_html=True)

    # High-level KPIs
    total_students = len(df)
    target_counts = df["Target"].value_counts()
    dropouts = target_counts.get("Dropout", 0)
    graduates = target_counts.get("Graduate", 0)
    enrolled = target_counts.get("Enrolled", 0)

    dropout_rate = (dropouts / total_students) * 100 if total_students else 0
    grad_rate = (graduates / total_students) * 100 if total_students else 0
    enrolled_rate = (enrolled / total_students) * 100 if total_students else 0

    c1, c2, c3, c4 = st.columns(4)
    with c1:
        st.markdown(
            f"""
            <div class="metric-card">
                <div class="metric-label">Cohort Size</div>
                <div class="metric-value">{total_students:,}</div>
                <div class="metric-sub">Total enrolled records</div>
            </div>
            """,
            unsafe_allow_html=True,
        )
    with c2:
        st.markdown(
            f"""
            <div class="metric-card">
                <div class="metric-label">Dropout Rate</div>
                <div class="metric-value" style="color: #DC2626;">{dropout_rate:.1f}%</div>
                <div class="metric-sub">{dropouts:,} students dropped out</div>
            </div>
            """,
            unsafe_allow_html=True,
        )
    with c3:
        st.markdown(
            f"""
            <div class="metric-card">
                <div class="metric-label">Graduation Rate</div>
                <div class="metric-value" style="color: #16A34A;">{grad_rate:.1f}%</div>
                <div class="metric-sub">{graduates:,} students graduated</div>
            </div>
            """,
            unsafe_allow_html=True,
        )
    with c4:
        st.markdown(
            f"""
            <div class="metric-card">
                <div class="metric-label">Still Enrolled</div>
                <div class="metric-value" style="color: #00338D;">{enrolled_rate:.1f}%</div>
                <div class="metric-sub">{enrolled:,} active degree-seekers</div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    st.write("")
    st.write("")

    # Visualizations: Outcomes by Course, Scholarship & Tuition Status
    tab1, tab2 = st.tabs(["Degree Program Breakdown", "Financial & Scholarship Drivers"])

    with tab1:
        # Chart 1: Outcome by Course
        course_df = df.groupby(["Course_Name", "Target"]).size().reset_index(name="Count")
        course_pivot = course_df.pivot(index="Course_Name", columns="Target", values="Count").fillna(0)
        course_pivot["Total"] = course_pivot.sum(axis=1)
        course_pivot["Dropout_Rate"] = (course_pivot.get("Dropout", 0) / course_pivot["Total"]) * 100
        course_pivot = course_pivot.sort_values(by="Dropout_Rate", ascending=False).reset_index()

        fig_course = px.bar(
            course_df,
            x="Course_Name",
            y="Count",
            color="Target",
            color_discrete_map={"Dropout": "#EF4444", "Enrolled": "#3B82F6", "Graduate": "#10B981"},
            title="Student Outcomes by Degree Program (Ranked by Cohort Impact)",
            labels={"Course_Name": "Degree Program", "Count": "Students", "Target": "Outcome"},
            barmode="stack",
        )
        fig_course.update_layout(
            plot_bgcolor="#FFFFFF",
            paper_bgcolor="#FFFFFF",
            font=dict(family="sans-serif", color="#1E293B"),
            xaxis=dict(tickangle=-40, title=None),
            yaxis=dict(gridcolor="#F1F5F9", title="Number of Students"),
            legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
            margin=dict(t=50, b=100, l=40, r=20),
            height=460,
        )
        st.plotly_chart(fig_course, use_container_width=True)

    with tab2:
        col_f1, col_f2 = st.columns(2)

        with col_f1:
            # Chart 2: Outcome by Tuition Status
            tuition_df = df.copy()
            tuition_df["Tuition_Label"] = tuition_df["Tuition fees up to date"].map(
                {1: "Fees Up-to-Date", 0: "Fees Overdue"}
            )
            t_grp = tuition_df.groupby(["Tuition_Label", "Target"]).size().reset_index(name="Count")
            
            fig_tuition = px.bar(
                t_grp,
                x="Tuition_Label",
                y="Count",
                color="Target",
                color_discrete_map={"Dropout": "#EF4444", "Enrolled": "#3B82F6", "Graduate": "#10B981"},
                title="Outcome by Tuition Fee Status",
                barmode="group",
            )
            fig_tuition.update_layout(
                plot_bgcolor="#FFFFFF",
                paper_bgcolor="#FFFFFF",
                font=dict(family="sans-serif", color="#1E293B"),
                xaxis=dict(title=None),
                yaxis=dict(gridcolor="#F1F5F9"),
                legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
                height=380,
                margin=dict(t=50, b=30, l=40, r=20),
            )
            st.plotly_chart(fig_tuition, use_container_width=True)

        with col_f2:
            # Chart 3: Outcome by Scholarship Status
            schol_df = df.copy()
            schol_df["Schol_Label"] = schol_df["Scholarship holder"].map(
                {1: "Scholarship Recipient", 0: "No Scholarship"}
            )
            s_grp = schol_df.groupby(["Schol_Label", "Target"]).size().reset_index(name="Count")

            fig_schol = px.bar(
                s_grp,
                x="Schol_Label",
                y="Count",
                color="Target",
                color_discrete_map={"Dropout": "#EF4444", "Enrolled": "#3B82F6", "Graduate": "#10B981"},
                title="Outcome by Scholarship Grant Status",
                barmode="group",
            )
            fig_schol.update_layout(
                plot_bgcolor="#FFFFFF",
                paper_bgcolor="#FFFFFF",
                font=dict(family="sans-serif", color="#1E293B"),
                xaxis=dict(title=None),
                yaxis=dict(gridcolor="#F1F5F9"),
                legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
                height=380,
                margin=dict(t=50, b=30, l=40, r=20),
            )
            st.plotly_chart(fig_schol, use_container_width=True)


# -----------------------------------------------------------------------------
# PAGE 2: Student Explorer
# -----------------------------------------------------------------------------
def render_student_explorer(
    df: pd.DataFrame,
    provider: str,
    ollama_host: str,
    ollama_model: str,
    anthropic_key: str
):
    st.markdown("### Individual Student Journey & AI Risk Assessment")
    st.markdown("<p style='color: #64748B; font-size: 0.95rem; margin-top: -0.5rem;'>Examine semester-by-semester trajectory and run zero-shot model inference.</p>", unsafe_allow_html=True)

    # Student selector controls
    c_sel, c_rnd = st.columns([4, 1])
    
    # Check if a student was pre-selected from At-Risk List
    target_idx = 0
    if "selected_student_id" in st.session_state and st.session_state.selected_student_id:
        match = df[df["Student_ID"] == st.session_state.selected_student_id]
        if not match.empty:
            target_idx = int(match.index[0])

    with c_sel:
        selected_id = st.selectbox(
            "Select or Search Student ID",
            options=df["Student_ID"].tolist(),
            index=target_idx,
            help="Type to search e.g. STU-0042",
        )
    with c_rnd:
        st.write("")
        st.write("")
        if st.button("🎲 Random", help="Sample a random student record"):
            import random
            rand_idx = random.randint(0, len(df) - 1)
            selected_id = df.iloc[rand_idx]["Student_ID"]
            st.session_state.selected_student_id = selected_id
            st.rerun()

    # Extract chosen row
    row = df[df["Student_ID"] == selected_id].iloc[0]

    # Student Demographics & Academic Snapshot
    st.write("")
    st.markdown("##### Student Profile Snapshot")
    
    p1, p2, p3, p4, p5 = st.columns(5)
    with p1:
        st.markdown(
            f"""
            <div class="metric-card">
                <div class="metric-label">Course</div>
                <div style="font-weight: 600; font-size: 0.95rem; color: #0F172A;">{row.get('Course_Name', 'Unknown')}</div>
                <div class="metric-sub">Age: {int(row.get('Age at enrollment', 0))} yrs</div>
            </div>
            """,
            unsafe_allow_html=True
        )
    with p2:
        tuition_status = "Up to date" if int(row.get("Tuition fees up to date", 1)) == 1 else "Overdue"
        tuition_color = "#16A34A" if tuition_status == "Up to date" else "#DC2626"
        st.markdown(
            f"""
            <div class="metric-card">
                <div class="metric-label">Tuition Status</div>
                <div style="font-weight: 600; font-size: 0.95rem; color: {tuition_color};">{tuition_status}</div>
                <div class="metric-sub">Debtor: {'Yes' if int(row.get('Debtor',0))==1 else 'No'}</div>
            </div>
            """,
            unsafe_allow_html=True
        )
    with p3:
        schol = "Yes" if int(row.get("Scholarship holder", 0)) == 1 else "No"
        st.markdown(
            f"""
            <div class="metric-card">
                <div class="metric-label">Scholarship</div>
                <div style="font-weight: 600; font-size: 0.95rem; color: #0F172A;">{schol}</div>
                <div class="metric-sub">Mode: {'Day' if int(row.get('Daytime/evening attendance',1))==1 else 'Evening'}</div>
            </div>
            """,
            unsafe_allow_html=True
        )
    with p4:
        s1_app = int(row.get("Curricular units 1st sem (approved)", 0))
        s1_enr = int(row.get("Curricular units 1st sem (enrolled)", 0))
        st.markdown(
            f"""
            <div class="metric-card">
                <div class="metric-label">1st Sem Completion</div>
                <div style="font-weight: 600; font-size: 0.95rem; color: #0F172A;">{s1_app} / {s1_enr} Units</div>
                <div class="metric-sub">Grade: {float(row.get('Curricular units 1st sem (grade)', 0)):.1f} / 20</div>
            </div>
            """,
            unsafe_allow_html=True
        )
    with p5:
        s2_app = int(row.get("Curricular units 2nd sem (approved)", 0))
        s2_enr = int(row.get("Curricular units 2nd sem (enrolled)", 0))
        st.markdown(
            f"""
            <div class="metric-card">
                <div class="metric-label">2nd Sem Completion</div>
                <div style="font-weight: 600; font-size: 0.95rem; color: #0F172A;">{s2_app} / {s2_enr} Units</div>
                <div class="metric-sub">Grade: {float(row.get('Curricular units 2nd sem (grade)', 0)):.1f} / 20</div>
            </div>
            """,
            unsafe_allow_html=True
        )

    st.write("")
    
    # Student Journey Chart (Plotly)
    col_chart, col_ai = st.columns([1, 1])

    with col_chart:
        st.markdown("##### Academic Journey Progression")
        
        sem1_grade = float(row.get("Curricular units 1st sem (grade)", 0))
        sem2_grade = float(row.get("Curricular units 2nd sem (grade)", 0))
        
        # Dual-track journey representation
        fig_journey = go.Figure()

        # Enrolled units
        fig_journey.add_trace(go.Bar(
            name="Enrolled Units",
            x=["Semester 1", "Semester 2"],
            y=[s1_enr, s2_enr],
            marker_color="#CBD5E1",
        ))

        # Approved units
        fig_journey.add_trace(go.Bar(
            name="Approved Units",
            x=["Semester 1", "Semester 2"],
            y=[s1_app, s2_app],
            marker_color="#00338D",
        ))

        # Academic grade overlay
        fig_journey.add_trace(go.Scatter(
            name="Grade (Scale 0-20)",
            x=["Semester 1", "Semester 2"],
            y=[sem1_grade, sem2_grade],
            yaxis="y2",
            mode="lines+markers+text",
            text=[f"{sem1_grade:.1f}", f"{sem2_grade:.1f}"],
            textposition="top center",
            line=dict(color="#D97706", width=3),
            marker=dict(size=9, color="#D97706"),
        ))

        fig_journey.update_layout(
            barmode="group",
            plot_bgcolor="#FFFFFF",
            paper_bgcolor="#FFFFFF",
            font=dict(family="sans-serif", color="#1E293B"),
            yaxis=dict(title="Curricular Units", gridcolor="#F1F5F9", range=[0, max(max(s1_enr, s2_enr, 6) + 2, 8)]),
            yaxis2=dict(
                title="Grade (/20)",
                overlaying="y",
                side="right",
                range=[0, 22],
                showgrid=False,
            ),
            legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
            margin=dict(t=40, b=30, l=40, r=40),
            height=370,
        )
        st.plotly_chart(fig_journey, use_container_width=True)

    with col_ai:
        st.markdown("##### Zero-Shot Risk Prediction")
        
        # Compute or fetch prediction
        features_dict = build_feature_payload(row)
        features_json = json.dumps(features_dict, sort_keys=True)

        prediction = None
        error_info = None

        if provider in ["ollama", "claude"]:
            with st.spinner(f"Analyzing via {provider.capitalize()}..."):
                prediction, error_info = predict_student_risk(
                    selected_id,
                    features_json,
                    provider,
                    ollama_host,
                    ollama_model,
                    anthropic_key,
                )

        # Fallback to rule-based if error or rule-based selected
        if prediction is None:
            if error_info:
                st.warning(f"⚠️ {error_info}")
                st.info("Falling back to deterministic rule-based analysis.")
            prediction = calculate_rule_based_risk(row)

        risk_level = prediction["risk"].lower()
        badge_class = f"badge-{risk_level}"
        dropout_prob = prediction["dropout_probability"]
        provider_label = prediction.get("provider", "rule-based")

        # Color mapping for probability progress
        bar_color = "#DC2626" if risk_level == "high" else ("#D97706" if risk_level == "medium" else "#16A34A")

        st.markdown(
            f"""
            <div class="risk-box">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                    <div>
                        <span class="{badge_class}">{risk_level.upper()} RISK</span>
                        <span style="margin-left: 8px; font-size: 1.15rem; font-weight: 700; color: #0F172A;">{dropout_prob}% Dropout Probability</span>
                    </div>
                    <span class="source-tag">{provider_label}</span>
                </div>
                <div style="background-color: #E2E8F0; border-radius: 9999px; height: 8px; width: 100%; margin-bottom: 1rem; overflow: hidden;">
                    <div style="background-color: {bar_color}; width: {dropout_prob}%; height: 100%;"></div>
                </div>
                <div style="font-size: 0.85rem; font-weight: 600; color: #475569; margin-bottom: 0.4rem;">PRIMARY RISK SIGNALS</div>
                <ul style="margin: 0; padding-left: 1.2rem; font-size: 0.88rem; color: #334155;">
                    {''.join([f"<li style='margin-bottom: 0.25rem;'>{reason}</li>" for reason in prediction.get('top_reasons', [])])}
                </ul>
                <div style="font-size: 0.85rem; font-weight: 600; color: #475569; margin-top: 0.9rem; margin-bottom: 0.25rem;">RECOMMENDED ACTION</div>
                <div style="font-size: 0.88rem; color: #0F172A; background-color: #F8FAFC; border-left: 3px solid #00338D; padding: 0.5rem 0.75rem; border-radius: 0 4px 4px 0;">
                    {prediction.get('suggested_action', 'Review academic trajectory with advisor.')}
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

        with st.expander("Inspect Raw De-identified Features"):
            st.json(features_dict)


# -----------------------------------------------------------------------------
# PAGE 3: At-Risk List
# -----------------------------------------------------------------------------
def render_at_risk_list(df: pd.DataFrame, rule_df: pd.DataFrame):
    st.markdown("### Cohort At-Risk Priority List")
    st.markdown("<p style='color: #64748B; font-size: 0.95rem; margin-top: -0.5rem;'>Fast rule-based risk evaluation for all 4,424 students. Sort and inspect students in real time.</p>", unsafe_allow_html=True)

    # Filter controls
    f1, f2, f3 = st.columns([1, 1, 2])
    with f1:
        risk_filter = st.selectbox("Risk Level", ["All", "High", "Medium", "Low"], index=0)
    with f2:
        tuition_filter = st.selectbox("Tuition Status", ["All", "Overdue", "Up to date"], index=0)
    with f3:
        course_list = ["All Programs"] + sorted(list(rule_df["Course"].unique()))
        course_filter = st.selectbox("Degree Program", course_list, index=0)

    # Apply filters
    filtered_df = rule_df.copy()
    if risk_filter != "All":
        filtered_df = filtered_df[filtered_df["Risk_Level"] == risk_filter]
    if tuition_filter != "All":
        filtered_df = filtered_df[filtered_df["Tuition_Fees"] == tuition_filter]
    if course_filter != "All Programs":
        filtered_df = filtered_df[filtered_df["Course"] == course_filter]

    # Sort descending by risk score
    filtered_df = filtered_df.sort_values(by="Dropout_Risk_%", ascending=False).reset_index(drop=True)

    # Sub-header metrics
    m1, m2, m3 = st.columns(3)
    with m1:
        st.metric("Matching Students", f"{len(filtered_df):,}")
    with m2:
        high_risk_count = len(filtered_df[filtered_df["Risk_Level"] == "High"])
        st.metric("High Risk Count", f"{high_risk_count:,}")
    with m3:
        unpaid_count = len(filtered_df[filtered_df["Tuition_Fees"] == "Overdue"])
        st.metric("Unpaid Tuition", f"{unpaid_count:,}")

    st.write("")

    # Interactive Table
    st.dataframe(
        filtered_df,
        use_container_width=True,
        hide_index=True,
        column_config={
            "Student_ID": st.column_config.TextColumn("Student ID", width="small"),
            "Risk_Level": st.column_config.TextColumn("Risk Level", width="small"),
            "Dropout_Risk_%": st.column_config.ProgressColumn(
                "Risk %",
                min_value=0,
                max_value=100,
                format="%d%%",
                width="small"
            ),
            "Course": st.column_config.TextColumn("Degree Course", width="medium"),
            "Tuition_Fees": st.column_config.TextColumn("Tuition", width="small"),
            "Scholarship": st.column_config.TextColumn("Scholarship", width="small"),
            "Sem1_Approved": st.column_config.NumberColumn("S1 Appr.", width="small"),
            "Sem2_Approved": st.column_config.NumberColumn("S2 Appr.", width="small"),
            "Actual_Outcome": st.column_config.TextColumn("Historical Target", width="small"),
            "Primary_Reason": st.column_config.TextColumn("Primary Flag", width="large"),
        },
        height=450,
    )

    st.markdown("---")
    st.markdown("##### Quick Action: Launch AI Deep Dive")
    act_col1, act_col2 = st.columns([3, 1])
    with act_col1:
        quick_id = st.selectbox(
            "Select Student from Filtered List to analyze in Student Explorer:",
            options=filtered_df["Student_ID"].tolist() if not filtered_df.empty else ["None"],
        )
    with act_col2:
        st.write("")
        st.write("")
        if st.button("Open in Explorer ➔", disabled=filtered_df.empty):
            st.session_state.selected_student_id = quick_id
            st.info(f"Selected {quick_id}. Switch to 'Student Explorer' in the sidebar.")


# -----------------------------------------------------------------------------
# PAGE 4: How to Use
# -----------------------------------------------------------------------------
def render_how_to_use():
    st.markdown("### System Architecture & Operational Guide")
    st.markdown("<p style='color: #64748B; font-size: 0.95rem; margin-top: -0.5rem;'>Guide for academic advisors, technical operators, and competition evaluators.</p>", unsafe_allow_html=True)

    st.markdown(
        """
        #### 1. What StudentSuccess Does
        StudentSuccess is an AI-powered student analytics and retention platform built for higher education institutions.
        It flags students at risk of drop-out before they leave, explains the underlying academic and financial factors, 
        and prescribes concrete interventions to academic advisors.

        ---

        #### 2. Model Switching & Inference Modes
        The platform supports three switchable inference modalities controlled either via the sidebar or via the `MODEL_PROVIDER` environment variable:

        * **`ollama` (Default local execution):**
          Uses a small, open-weights model (e.g. `qwen2.5:3b` or `llama3.2:3b`) running completely on-premise or locally via Ollama.
          ```bash
          # 1. Install Ollama (Linux / macOS)
          curl -fsSL https://ollama.com/install.sh | sh

          # 2. Pull and run a small model
          ollama run qwen2.5:3b

          # 3. Launch the platform
          export MODEL_PROVIDER=ollama
          export OLLAMA_HOST=http://localhost:11434
          export OLLAMA_MODEL=qwen2.5:3b
          streamlit run app.py
          ```

        * **`claude` (Anthropic API):**
          Connects to Anthropic's `claude-haiku-5-5` for fast, zero-shot structured JSON inference.
          ```bash
          export MODEL_PROVIDER=claude
          export ANTHROPIC_API_KEY="your-anthropic-api-key"
          streamlit run app.py
          ```

        * **`rule-based` (Guaranteed Offline Fallback):**
          If Ollama is not active or an API key is missing, StudentSuccess automatically executes a transparent, 
          deterministic rule engine derived from curricular units, debt status, and semester completion rates.

        ---

        #### 3. Data Privacy & Ethical AI Standards
        * **Complete De-identification:** No student names, national IDs, or personal identifiable information (PII) are ingested or transmitted to LLMs.
        * **Zero Retention:** The prompt payload contains solely anonymized academic and enrollment metrics.
        * **Transparent Decision Support:** Pretrained models act strictly as decision augmenters for human advisors, not automated adjudicators.

        ---

        #### 4. Dataset & Known Boundaries
        * **Dataset Origin:** UCI Machine Learning Repository (*Predict Students' Dropout and Academic Success*, 4,424 records from the Polytechnic Institute of Portalegre, Portugal).
        * **Institutional Adaptation:** In real-world enterprise deployments, models would be fine-tuned or calibrated on the specific university's historical data, grading scales, and support services.
        """
    )


# -----------------------------------------------------------------------------
# Entry Point
# -----------------------------------------------------------------------------
if __name__ == "__main__":
    main()
