/**
 * seed-proof-library-clm-content.ts
 *
 * Prose content for each of the 8 CLM Studios demo documents.
 * Imported by seed-proof-library-clm.ts to keep the main script lean.
 *
 * Org persona: CLM Studios as a 501(c)(3) public charity (demo framing only).
 * All metrics and facts are internally consistent per the PRD §2 org persona.
 */

export interface DocSection {
  heading: string;
  body: string;
  bullet?: string[]; // optional bulleted list under body
}

export interface DocContent {
  filename: string;
  category: "grant_proposal" | "program_description" | "marketing_materials";
  title: string; // PDF title shown at top
  sections: DocSection[];
}

// ---------------------------------------------------------------------------
// Canonical constants reused across documents
// ---------------------------------------------------------------------------

const MISSION =
  "CLM Studios builds AI-powered learning, communication, and workforce-readiness tools for developmentally disabled young adults ages 16–25, with a particular focus on neurodivergent learners who have aged out of school-based supports.";

// ---------------------------------------------------------------------------
// Doc 1: MEAF-2024-grant-application-FUNDED.pdf
// ---------------------------------------------------------------------------

export const doc1: DocContent = {
  filename: "MEAF-2024-grant-application-FUNDED.pdf",
  category: "grant_proposal",
  title: "Grant Application — Mitsubishi Electric America Foundation",
  sections: [
    {
      heading: "Cover Letter",
      body: `November 4, 2024

Mitsubishi Electric America Foundation
Grant Programs Office
3 Manhattanville Road
Purchase, NY 10577

Dear MEAF Program Team,

On behalf of CLM Studios, I am pleased to submit this proposal requesting $45,000 in support of our Hope Pathways workforce-readiness expansion and the deployment of our Kodama Voice Studio tools in two New York City District 75 schools.

CLM Studios is a Brooklyn-based nonprofit organization with the mission: ${MISSION}

The project described in this application is a direct extension of our proven model — expanding Hope Pathways to a third annual cohort (serving an additional 30 young adults) and deploying Kodama's augmentative and alternative communication (AAC) tools to 12 students with speech disabilities in two District 75 classroom settings. Both initiatives are operational priorities for FY2025.

MEAF's commitment to disability inclusion in education and employment aligns precisely with CLM Studios' core work. We believe this partnership represents a natural fit.

We are grateful for your consideration and are available to discuss this proposal at your convenience.

Respectfully,
Citlali Sylvy
Executive Director, CLM Studios
Brooklyn, NY`,
    },
    {
      heading: "Organization Background",
      body: `CLM Studios was founded to close a persistent gap in workforce and communication supports for young adults with developmental disabilities who have aged out of school-based services. The transition from school to adulthood — often called "the cliff" — is particularly steep for neurodivergent young adults: federal IDEA protections expire at 21, and community-based adult services are fragmented and chronically underfunded.

Our model is built on two interlocking pillars. First, we develop and deploy AI-powered tools that provide learners with disabilities personalized, scalable support that is otherwise inaccessible due to cost or geography. Second, we wrap those tools in direct-service programming — cohort-based workforce preparation, school-embedded AAC support, and 1:1 tutoring — to ensure that technology serves learners in context, not in isolation.

In FY2024, CLM Studios served 89 unique young adults across all programs. Our geographic footprint spans Brooklyn and Queens, with partner schools in NYC's District 75 (the city's dedicated special education district) and one satellite pilot in Westchester County.

Annual budget: approximately $680,000. Staff: 4 program staff, 2 part-time technical staff, Executive Director, and a 5-person volunteer board.`,
    },
    {
      heading: "Project Narrative",
      body: `This proposal covers two integrated program activities for FY2025:

Activity 1 — Hope Pathways Cohort 3 Expansion

Hope Pathways is CLM Studios' signature 16-week workforce-readiness cohort for neurodivergent young adults ages 18–25. The curriculum combines:`,
      bullet: [
        "Soft-skills coaching (communication, self-advocacy, workplace norms)",
        "Mock interview preparation and employer-panel workshops",
        "Individualized job matching with 11 current employer partners",
        "Supported placement and 90-day employment follow-up",
      ],
    },
    {
      heading: "",
      body: `Cohort capacity is 24 participants. In FY2024 we ran two cohorts; Cohort 3 (proposed for FY2025) will bring our annual throughput to the program's designed capacity of 72 participants per year. To date, 47 young adults have graduated from Hope Pathways; 31 are employed within 90 days of graduation (a 66% placement rate), and of those, 81% remain employed at 90 days.

Activity 2 — Kodama Voice Studio: District 75 Classroom Deployment

Kodama is CLM Studios' proprietary AI-powered platform that provides voice synthesis and animated avatar communication tools for AAC users — individuals with speech disabilities who rely on aided communication to participate in daily life. Kodama operates on standard iPad hardware and integrates with existing classroom workflows.

In FY2024, Kodama served 18 AAC users (8 in classroom settings, 10 in community settings). This grant will fund:`,
      bullet: [
        "Deployment in 2 additional District 75 classrooms, reaching an estimated 12 new AAC users",
        "Teacher training (two 3-hour PD sessions per school)",
        "Device configuration and 12-month technical support",
        "Outcome documentation for replication and peer dissemination",
      ],
    },
    {
      heading: "Program Logic Model (Narrative)",
      body: `Inputs: MEAF funding ($45,000), CLM staff time (2.0 FTE program, 0.5 FTE technical), partner school space and co-facilitation, employer partner network.

Activities: Cohort 3 delivery (16 weeks × 24 participants), Kodama classroom installation and teacher training, 90-day employment follow-up, outcome data collection.

Outputs: 30 additional young adults served via Hope Pathways Cohort 3; 12 AAC users accessing Kodama in 2 District 75 classrooms; 2 teacher teams trained; outcome documentation completed.

Outcomes (12 months):`,
      bullet: [
        "≥18 Cohort 3 participants employed within 90 days of graduation (target: 60% placement rate)",
        "≥80% of Kodama classroom users demonstrating increased spontaneous communication per teacher log",
        "Replication guide published and shared with 3+ peer organizations",
      ],
    },
    {
      heading: "Budget Summary",
      body: `Requested: $45,000 over 12 months (January–December 2025).

Allocation:`,
      bullet: [
        "Hope Pathways Cohort 3 staffing and supplies: $22,000",
        "Kodama device procurement and configuration (12 licenses, iPad cases): $13,500",
        "Teacher professional development delivery: $4,000",
        "Outcome documentation and report preparation: $3,500",
        "Indirect costs (10%): $4,090 — capped and disclosed per MEAF policy",
      ],
    },
    {
      heading: "Award Notification — December 2024",
      body: `December 18, 2024

Citlali Sylvy
Executive Director, CLM Studios
Brooklyn, NY

Dear Ms. Sylvy,

We are pleased to inform you that the Mitsubishi Electric America Foundation Board of Directors has approved a grant of $45,000 to CLM Studios in support of Hope Pathways expansion and Kodama Voice Studio classroom deployment in District 75 schools.

This grant reflects MEAF's commitment to disability inclusion and workforce development for young people with disabilities. We look forward to the outcomes you have proposed and to tracking your progress through the reporting cycle.

Reporting timeline: Interim progress report due April 15, 2025; final report due October 15, 2025. A report template and wire transfer instructions will follow under separate cover.

Congratulations on this award. We are proud to support CLM Studios' important work.

Sincerely,
Program Officer
Mitsubishi Electric America Foundation`,
    },
  ],
};

// ---------------------------------------------------------------------------
// Doc 2: DDCF-2024-grant-application-DECLINED.pdf
// ---------------------------------------------------------------------------

export const doc2: DocContent = {
  filename: "DDCF-2024-grant-application-DECLINED.pdf",
  category: "grant_proposal",
  title: "Grant Application — Doris Duke Charitable Foundation",
  sections: [
    {
      heading: "Cover Letter",
      body: `September 12, 2024

Doris Duke Charitable Foundation
Child Wellbeing Program
650 Fifth Avenue, 19th Floor
New York, NY 10019

Dear Child Wellbeing Program Team,

CLM Studios is pleased to submit this proposal to the Doris Duke Charitable Foundation requesting $120,000 over 24 months to support a research initiative on the efficacy of AI-powered tutoring for neurodivergent youth — work we are calling the Companion AI Tutors Research Initiative.

We want to be transparent at the outset: we recognize that our proposal sits at the edge of DDCF's Child Wellbeing portfolio. DDCF's focus is on child wellbeing in the broadest sense; CLM Studios' work centers on a specific subset — developmentally disabled young adults ages 16–25 — and the specific lever of AI-enabled educational access. We believe the connection is meaningful, and we have tried to frame our proposal with that lens, while acknowledging that the fit may not be perfect.

CLM Studios' mission is: ${MISSION}

We are based in Brooklyn and Queens, NY, and operate in partnership with two District 75 schools and one Westchester pilot site. Annual operating budget is approximately $680,000.

We appreciate your consideration and welcome any feedback on whether this proposal aligns with DDCF's current funding priorities.

Respectfully,
Citlali Sylvy
Executive Director, CLM Studios`,
    },
    {
      heading: "Project Overview",
      body: `The Companion AI Tutors Research Initiative would fund a 24-month mixed-methods study of CLM Studios' Companion AI Tutors program — a 1:1 AI tutoring platform built on a multi-agent architecture and deployed in two partner schools. The research questions:`,
      bullet: [
        "Does personalized AI tutoring improve academic progress for students on individualized education plans (IEPs)?",
        "What implementation conditions predict positive outcomes?",
        "What are the equity and access implications of AI tutoring at scale for neurodivergent learners?",
      ],
    },
    {
      heading: "Program Description",
      body: `Companion AI Tutors is currently in pilot phase with 2 partner schools in District 75. The platform delivers 1:1 tutoring sessions adapted to each student's IEP goals. In FY2024, the program delivered 312 hours of tutoring across a small initial cohort.

The proposed research initiative would expand the pilot to 4 additional classrooms (approximately 40 additional students), add a comparison group design, and engage an external evaluator to assess outcomes. We believe the resulting evidence base would be valuable not only to CLM Studios but to the broader field of special education and assistive technology.

We acknowledge that this project is more research-intensive and less directly tied to child wellbeing service delivery than DDCF's typical portfolio. We have attempted to frame the connection through the lens of educational equity — access to quality instruction for children who have been historically underserved by traditional educational systems. We would value the Foundation's perspective on whether this framing resonates.`,
    },
    {
      heading: "Budget Summary",
      body: `Requested: $120,000 over 24 months.

Allocation (24-month):`,
      bullet: [
        "External evaluator (contracted): $45,000",
        "Platform expansion and technical staff: $38,000",
        "School partner coordination and teacher training: $18,000",
        "Data management and analysis: $12,000",
        "Dissemination (report, webinar, publication support): $7,000",
      ],
    },
    {
      heading: "Why This Matters for Child Wellbeing",
      body: `Young adults with developmental disabilities face compounding disadvantages: limited access to post-secondary education, high unemployment rates (estimated 80%+ for adults with I/DD), and few pathways to economic self-sufficiency. The wellbeing implications are profound — economic marginalization correlates with poor health outcomes, social isolation, and family stress.

AI tutoring, if shown to be effective for IEP learners, could substantially expand access to individualized instruction in resource-constrained school settings. We believe this is a child wellbeing story, even if our target population is at the older end of the typical "child" definition.

We recognize this framing may not fully satisfy DDCF's program focus criteria and submit this proposal as a genuine attempt at alignment, not a perfect fit.`,
    },
    {
      heading: "Funding Decision — March 2025",
      body: `March 4, 2025

Citlali Sylvy
Executive Director, CLM Studios
Brooklyn, NY

Dear Ms. Sylvy,

Thank you for submitting a proposal to the Doris Duke Charitable Foundation's Child Wellbeing Program. We appreciate the thoughtfulness with which you framed CLM Studios' work within our funding priorities.

After careful review, the Foundation has determined that we are unable to fund this request at this time. While we admire CLM Studios' commitment to serving developmentally disabled young adults, the proposed Companion AI Tutors Research Initiative does not align closely enough with our current funding priorities in child wellbeing, which center on direct wellbeing services for younger children in vulnerable family situations.

We encourage you to revisit our current guidelines and consider whether a future proposal might more directly address these priorities. CLM Studios' work is compelling, and we would welcome a future conversation if you identify a more direct alignment.

Thank you again for your interest.

Sincerely,
Program Associate
Doris Duke Charitable Foundation`,
    },
  ],
};

// ---------------------------------------------------------------------------
// Doc 3: MEAF-Q4-2024-funder-report.pdf
// ---------------------------------------------------------------------------

export const doc3: DocContent = {
  filename: "MEAF-Q4-2024-funder-report.pdf",
  category: "program_description",
  title: "Interim Progress Report — Mitsubishi Electric America Foundation Grant",
  sections: [
    {
      heading: "Report Overview",
      body: `Submitted to: Mitsubishi Electric America Foundation
Grant Period: January 1, 2025 – December 31, 2025
Report Type: Interim (Month 11 of 12)
Report Prepared: November 30, 2025
Prepared by: Citlali Sylvy, Executive Director

This report summarizes CLM Studios' progress against the outcomes proposed in our FY2025 MEAF grant application (award: $45,000) through the end of Month 11. We are on track to meet or exceed most targets by the grant period close on December 31, 2025.`,
    },
    {
      heading: "Progress Against Proposed Outcomes",
      body: `Outcome 1: Serve 30 additional young adults via Hope Pathways Cohort 3.

Actual progress through Month 11: 28 participants enrolled in Cohort 3; 22 have completed the full 16-week program; 6 are currently in the final two weeks and expected to complete by December 20. Of the 22 completers, 11 of 16 graduates who completed the extended 90-day follow-up window have secured employment (69% placement rate, exceeding our 60% target).

Note: Enrollment ran 2 participants short of our 30-person target. We attribute this primarily to recruitment lag — our referral pipeline from partner agencies was slower to activate than projected in months 1–3. We address this in the Lessons Learned section below. We expect to reach 30 enrolled participants before December 31 as we have 2 individuals on a waitlist for final program slots.

Outcome 2: Deploy Kodama tools to 12 AAC users in 2 District 75 classrooms.

Actual progress: Kodama is deployed in both target classrooms as of February 2025 — ahead of our March 1 target. As of this report, 8 AAC users are actively using Kodama in classroom settings, with 4 additional students onboarding in the final month. Teacher surveys at Month 6 showed 87% of students demonstrating increased spontaneous communication attempts (vs. pre-deployment baseline). The 2-school teacher teams have completed all professional development sessions.

Outcome 3: Outcome documentation for replication.

A replication guide draft is complete and under internal review. We anticipate finalizing and distributing to 3+ peer organizations by December 31.`,
    },
    {
      heading: "Lessons Learned",
      body: `Lesson 1 — Referral pipeline lead times: Our partner agencies (primarily District 75 school-based transition coordinators and community day habilitation programs) needed more notice to identify and prepare candidates. For Cohort 4, we are beginning outreach 3 months earlier and co-designing the intake process with 2 key referral partners.

Lesson 2 — Kodama deployment ahead of schedule: The Kodama deployment ran ahead of plan because our technical team had refined the iPad configuration workflow from the FY2024 community pilot. We added 2 additional classrooms (not counted as part of this grant's 2-school target) using operational funds, bringing our total active Kodama classroom users to 8 (vs. the 8 originally targeted, but with more classrooms involved than planned). This is a positive efficiency finding.

Lesson 3 — AAC user onboarding pacing: We initially set an aggressive ramp-up timeline for new AAC users. Some students required 6–8 weeks of familiarization before independently initiating Kodama sessions. We have revised our "new user onboarding" protocol to build in a longer scaffolded introduction phase, which we will document in the replication guide.`,
    },
    {
      heading: "Budget Summary",
      body: `Total grant: $45,000
Total expended through Month 11: $35,160 (78.1% of total grant)
Projected final expenditure at December 31: $43,800 (~97.3%)

Remaining $1,200 will roll to the replication guide print and distribution costs in December. All expenditures have been incurred in accordance with the approved budget categories. No material variances to report. Full financial detail available upon request.`,
    },
    {
      heading: "Plans for Remaining Grant Period (Month 12)",
      body: `Remaining activities for December 2025:`,
      bullet: [
        "Cohort 3 final 2-week program delivery for 6 continuing participants",
        "90-day employment follow-up calls for months 7–9 cohort graduates",
        "Finalize and distribute Kodama replication guide",
        "Compile final outcomes data for the October 15, 2025 final report (note: we are submitting this interim in advance of the April 15 date; final report will follow the October deadline per the grant agreement)",
        "Close out grant financials and prepare audit-ready documentation",
      ],
    },
    {
      heading: "Closing Note",
      body: `We are grateful for MEAF's support of this work. The progress made in FY2025 — reaching 28 (soon 30) young adults through Hope Pathways and deploying Kodama in two District 75 classrooms — represents a meaningful step toward the mission we share. We look forward to sharing the final results in our October report.

Citlali Sylvy
Executive Director, CLM Studios`,
    },
  ],
};

// ---------------------------------------------------------------------------
// Doc 4: 2024-impact-report-board-edition.pdf
// ---------------------------------------------------------------------------

export const doc4: DocContent = {
  filename: "2024-impact-report-board-edition.pdf",
  category: "program_description",
  title: "CLM Studios — FY2024 Impact Report (Board Edition)",
  sections: [
    {
      heading: "Letter from the Executive Director",
      body: `Dear Board Members,

When I started CLM Studios, I kept coming back to one question: what happens to young people with developmental disabilities when school ends? The research is sobering. Unemployment for adults with intellectual and developmental disabilities runs above 80%. Waitlists for adult day services stretch years. The community-based programs that exist are often underfunded, understaffed, and not designed for the neurodivergent learner whose needs are complex and highly individual.

FY2024 was our most impactful year to date, and the numbers in this report reflect what is possible when technology and direct service work together. We served 89 unique young adults across our three programs. We graduated 47 participants from Hope Pathways — our workforce cohort — and 31 of them are employed. We brought Kodama's AI-powered communication tools to 18 users who had never had a device that sounded like them, moved like them, or felt genuinely responsive to them. We delivered 312 hours of 1:1 AI tutoring.

None of this happened because of a single breakthrough. It happened because our team showed up, our partners trusted us, and our participants — remarkable people who have every reason to be skeptical of a system that has let them down before — decided to try.

I am proud of what we built this year. I am more excited about what comes next.

With gratitude,
Citlali Sylvy
Executive Director, CLM Studios`,
    },
    {
      heading: "Year at a Glance",
      body: `FY2024 Headline Metrics:`,
      bullet: [
        "89 unique young adults served across all programs",
        "47 graduates from Hope Pathways across 3 cohorts",
        "31 employed within 90 days of graduation (66% placement rate)",
        "81% 90-day retention rate among placed graduates",
        "18 active Kodama AAC users (8 classroom, 10 community)",
        "312 hours of 1:1 Companion AI Tutoring delivered",
        "2 partner schools, 1 satellite pilot site (Westchester)",
        "11 employer partners",
        "Annual budget: ~$680,000",
      ],
    },
    {
      heading: "Program Highlights",
      body: `Hope Pathways — Workforce Readiness Cohort

Hope Pathways is our 16-week workforce preparation program for neurodivergent young adults ages 18–25. Cohorts of up to 24 participants move through a structured curriculum covering soft skills, mock interviews, workplace norms, and supported job placement with our employer partner network.

In FY2024, we ran three cohorts serving a total of 47 graduates. Our 66% placement rate (31 of 47 employed within 90 days) exceeds the national benchmark for supported employment programs serving adults with I/DD by nearly 20 percentage points. Among placed graduates, 81% remain employed at the 90-day mark — evidence that our placement approach is matching participants to roles where they can succeed, not just filling a metric.

Kodama Voice Studio — AAC Technology Access

Kodama is CLM Studios' proprietary platform for augmentative and alternative communication. For users with speech disabilities, Kodama provides voice synthesis and animated avatar communication tools that run on standard iPad hardware. Unlike commercial AAC apps that offer a fixed library of voices and symbols, Kodama adapts to the user's communication patterns over time and supports custom vocabulary sets built collaboratively with the user's support team.

In FY2024, 18 young adults used Kodama regularly: 8 in District 75 classroom settings and 10 in community settings. We are particularly proud of the community deployment — reaching users outside of school hours through partnerships with day habilitation programs and family caregivers.

Companion AI Tutors — 1:1 Personalized Instruction

Our Companion AI Tutors platform delivers personalized, adaptive instruction tied to each student's IEP goals. The platform is built on a multi-agent architecture that enables sustained, context-aware tutoring sessions. Two partner schools participated in the FY2024 pilot. The program delivered 312 hours of 1:1 tutoring across the pilot cohort.`,
    },
    {
      heading: "Financial Snapshot",
      body: `FY2024 Revenue Mix (approximate):`,
      bullet: [
        "Government and foundation grants: 71%",
        "Individual giving: 18%",
        "Earned income and contracts: 8%",
        "In-kind contributions: 3%",
      ],
    },
    {
      heading: "",
      body: `FY2024 Expense Breakdown (approximate):`,
      bullet: [
        "Program services: 78%",
        "General and administrative: 13%",
        "Fundraising: 9%",
      ],
    },
    {
      heading: "Looking Ahead to 2025",
      body: `In FY2025, CLM Studios will:`,
      bullet: [
        "Run Hope Pathways Cohort 4 (Q1 launch) and plan Cohort 5 for Q3",
        "Expand Kodama classroom deployment to 2 additional District 75 schools (MEAF-funded)",
        "Grow Companion AI Tutors to 4 classrooms and initiate a formal outcome evaluation",
        "Deepen our employer partner network, targeting 15 partners by year-end",
        "Launch our first individual giving campaign with a 'Build Their Next Chapter' theme",
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Doc 5: 2025-Q1-programs-brief.pdf
// ---------------------------------------------------------------------------

export const doc5: DocContent = {
  filename: "2025-Q1-programs-brief.pdf",
  category: "program_description",
  title: "CLM Studios — Q1 2025 Programs Brief (Internal)",
  sections: [
    {
      heading: "To / From / Date",
      body: `To: CLM Studios Board of Directors + Senior Staff
From: Programs Director
Date: April 10, 2025
Re: Q1 2025 Programs Status Brief

This brief summarizes outcomes and operational status for all three CLM Studios programs through the end of Q1 2025 (January 1 – March 31, 2025). It is intended for board briefing and internal planning; not for external distribution.`,
    },
    {
      heading: "Hope Pathways — Q1 Outcomes",
      body: `Hope Pathways Cohort 4 launched January 13, 2025. Cohort profile at enrollment:`,
      bullet: [
        "14 participants enrolled (vs. 24 target capacity — see below)",
        "Age range: 18–24 years",
        "Diagnoses represented: autism (9), intellectual disability (3), autism + ADHD (2)",
        "Referral sources: District 75 transition coordinators (7), community partners (5), direct outreach (2)",
      ],
    },
    {
      heading: "",
      body: `Cohort 4 completed March 31, 2025. End-of-cohort outcomes:`,
      bullet: [
        "12 of 14 enrolled participants completed the full 16-week program (86% completion rate)",
        "2 participants withdrew: 1 due to housing instability, 1 due to a medical reason",
        "8 of 12 completers accepted into employer placements within 30 days of program end (67% placement rate, Q1 window)",
        "4 completers are in active job search with ongoing coaching support",
      ],
    },
    {
      heading: "",
      body: `Note on enrollment shortfall: Cohort 4 enrolled 14 vs. the 24-person target. This reflects the referral pipeline lag we identified in our MEAF interim report — partner agencies need longer lead times to screen and refer candidates. We are implementing a 90-day referral-to-enrollment protocol for Cohort 5 (targeted Q3 launch). The pipeline is already 11 individuals deep for Cohort 5. This lag is a known issue; we do not view it as a program performance concern.`,
    },
    {
      heading: "Kodama Voice Studio — Q1 Engagement Metrics",
      body: `Kodama active users as of March 31, 2025: 20 total (10 classroom, 10 community). This reflects an increase from 18 at FY2024 year-end, with 2 new classroom users added via the MEAF-funded District 75 deployment.

Engagement metrics (Q1 average, per active user):`,
      bullet: [
        "Average Kodama sessions per week: 4.2 (classroom users), 2.8 (community users)",
        "Average session duration: 22 minutes",
        "New vocabulary items added per user per month: 14",
      ],
    },
    {
      heading: "",
      body: `Pending device requests: 6 community users have requested dedicated iPads; current model requires sharing with household. We have a grant request pending (Hyde Family Foundation, decision expected June 2025) that would fund 6 dedicated devices at $850 each. If awarded, deployment targeted July 2025.`,
    },
    {
      heading: "Companion AI Tutors — Q1 Update",
      body: `The Companion AI Tutors program expanded in Q1. Key updates:`,
      bullet: [
        "Added 4 new students at our Queens partner school in January 2025, bringing the active roster to 14 students across 2 schools",
        "Total tutoring hours delivered in Q1: 98 hours (vs. 312 for all of FY2024 — strong Q1 pace)",
        "IEP goal progress: 11 of 14 active students showed measurable gains on at least one IEP goal in Q1 teacher assessments",
      ],
    },
    {
      heading: "Risks and Asks",
      body: `Risk 1 — Volunteer recruitment gap. Our volunteer workforce (co-facilitators for Hope Pathways cohort sessions) has decreased from 12 active volunteers in Q4 2024 to 8 in Q1 2025. We attribute this to seasonal availability. Ask: board members with corporate contacts who might support a skills-based volunteering arrangement are encouraged to make introductions.

Risk 2 — Evaluation framework update needed. The Companion AI Tutors program has grown beyond the scope of our FY2024 pilot evaluation approach. We need to engage an external evaluator in Q2 2025 to design a rigorous outcome study for FY2025. Estimated cost: $15,000–$20,000. Ask: flagging for board awareness — we will pursue this through a targeted grant request.`,
    },
  ],
};

// ---------------------------------------------------------------------------
// Doc 6: workforce-prep-pilot-outcomes-memo.pdf
// ---------------------------------------------------------------------------

export const doc6: DocContent = {
  filename: "workforce-prep-pilot-outcomes-memo.pdf",
  category: "program_description",
  title: "Hope Pathways — Three-Cohort Outcomes Memo (FY2024)",
  sections: [
    {
      heading: "Purpose and Scope",
      body: `This memo synthesizes outcome data from the first three cohorts of Hope Pathways — CLM Studios' 16-week workforce-readiness program for neurodivergent young adults ages 18–25. It is intended to support program planning, grant reporting, and funder communications. Data covers Cohort 1 (Q1 2024), Cohort 2 (Q2–Q3 2024), and Cohort 3 (Q4 2024).

All participant references use pseudonyms. Metrics are aggregate; no individually identifiable data is included.`,
    },
    {
      heading: "Methodology",
      body: `Skill assessment: Participants completed a pre-program self-assessment and facilitator-rated assessment on 5 workforce competency domains at Week 1 and Week 16:`,
      bullet: [
        "Communication (verbal and written workplace communication)",
        "Self-advocacy (disclosure, accommodation requests, conflict navigation)",
        "Workplace norms (punctuality, professional conduct, digital presence)",
        "Job search skills (resume, application, interview preparation)",
        "Resilience and adaptability (response to feedback, managing setbacks)",
      ],
    },
    {
      heading: "",
      body: `Scores are rated on a 1–5 scale by trained facilitators using a standardized rubric. Pre/post comparisons use paired facilitator ratings; self-assessments are used for triangulation only.

Employment tracking: CLM staff conducted structured phone or in-person check-ins at 30, 60, and 90 days post-graduation. Employer surveys were administered at 90 days for participants in employer-partner placements.`,
    },
    {
      heading: "Aggregate Outcomes — Three Cohorts Combined",
      body: `Participants: 47 total graduates (Cohort 1: 14, Cohort 2: 16, Cohort 3: 17).

Pre-program average competency score (aggregate, all 5 domains): 2.4 / 5.0
Post-program average competency score (aggregate, all 5 domains): 4.1 / 5.0
Mean gain: +1.7 points (71% increase)

Largest gains (by domain):`,
      bullet: [
        "Self-advocacy: 2.1 → 4.3 (+2.2)",
        "Job search skills: 2.2 → 4.2 (+2.0)",
        "Communication: 2.5 → 4.1 (+1.6)",
        "Workplace norms: 2.7 → 4.0 (+1.3)",
        "Resilience and adaptability: 2.4 → 3.9 (+1.5)",
      ],
    },
    {
      heading: "",
      body: `Employment outcomes:`,
      bullet: [
        "31 of 47 graduates employed within 90 days of program end (66% placement rate)",
        "Of 31 employed graduates: 25 remain employed at 90-day mark (81% retention)",
        "Employer satisfaction survey (n=18 employer respondents): 4.2 / 5.0 average rating of participant performance",
        "6 graduates enrolled in post-secondary education or vocational training in lieu of employment",
      ],
    },
    {
      heading: "Participant Vignettes",
      body: `Jordan, age 22 (autism + ADHD)

Jordan came to Hope Pathways after two years of job searching without success. They had skills and passion — an interest in library science and a meticulous, detail-oriented approach — but had struggled to communicate their strengths to employers and to navigate interview settings, which amplified their sensory sensitivities and communication differences.

During the 16-week program, Jordan worked with a facilitator to develop a disclosure script that framed their autism as an asset in roles requiring precision and attention to detail. They practiced mock interviews weekly, gradually building the kind of routine and predictability that made the interview environment less overwhelming.

Jordan graduated Cohort 2 in August 2024 and was placed with a Queens Public Library branch through our employer partner network. They have been employed continuously since September 2024 — eight months as of this report — and their supervisor cites their cataloging accuracy and patron communication as standout contributions.`,
    },
    {
      heading: "",
      body: `Maya, age 19 (intellectual disability)

Maya was referred to Hope Pathways by her District 75 transition coordinator. She had no prior paid work experience and communicated primarily through short phrases and a AAC device. The transition from school to adult life was approaching fast, and her family was worried.

In the program, Maya worked on communication skills adapted to her AAC use, focusing on phrases relevant to workplace settings — requesting a break, clarifying a task, greeting coworkers. She participated in three mock interviews with modifications (shorter response windows, visual prompts, familiar facilitators), and her self-confidence grew visibly over the 16 weeks.

Maya graduated Cohort 1 in April 2024 and is employed part-time at a bakery supply company, 15 hours per week. Her job coach (a CLM partner) reports that she has become a reliable, engaged team member. Maya's mother says, "I didn't think she would get a job this fast. She proved everyone wrong."`,
    },
    {
      heading: "Implications for Program Design",
      body: `Several findings from the three-cohort review will shape Hope Pathways' FY2025 design:`,
      bullet: [
        "Self-advocacy gains are the strongest and may be the most durable. We plan to add a Year 1 alumni booster session focused on sustaining self-advocacy in long-term employment.",
        "Resilience scores, while improved, remain the lowest of the five domains. We are adding a structured 'navigating setbacks' module in weeks 12–14 of Cohort 4.",
        "Employer satisfaction is high but concentrated: 3 employers account for 14 of 18 survey respondents. Expanding our employer partner base remains a priority.",
        "AAC users (3 participants across three cohorts) required and benefited from modified interview protocols. We will formalize these accommodations in the Cohort 4 facilitator guide.",
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Doc 7: spring-2025-newsletter.pdf
// ---------------------------------------------------------------------------

export const doc7: DocContent = {
  filename: "spring-2025-newsletter.pdf",
  category: "marketing_materials",
  title: "CLM Studios — Spring 2025 Supporter Newsletter",
  sections: [
    {
      heading: "Letter from Our Founder",
      body: `Dear Friends of CLM Studios,

Earlier this month, I visited a classroom at one of our District 75 partner schools. I had gone to check in on Kodama's deployment — to see how the new devices were being used, what teachers thought, whether there were hiccups. What I found was something I wasn't quite prepared for.

A student I'll call Marcus — he's 19, has a significant speech disability, and has used AAC tools for years — was using Kodama to tell his teacher about his weekend. He described going to a basketball game. He described his team winning. And then he laughed — a real laugh, a delighted laugh — and pressed a sequence of buttons to say "we're number one!" to the room.

It was not a profoundly complicated moment. Lots of people told their teachers about their weekends that morning. But for Marcus, it was a breakthrough — not because he has never communicated before, but because Kodama gave him a way to be funny, spontaneous, and joyful in a school environment that has often felt, in his words (typed to me after the visit), "like a place where I follow rules, not a place where I get to be me."

That's what we're building toward. Not just competence. Not just access. Joy.

In this newsletter, you'll meet two more CLM Studios participants — Jamal and Priya — and hear about the spring push of our Hope Pathways Cohort 4. You'll also find a quick update on where we stand as an organization and how you can be part of what comes next.

With gratitude and hope,
Citlali Sylvy
Founder and Executive Director, CLM Studios`,
    },
    {
      heading: "Meet Jamal: From Doubt to Day One",
      body: `Jamal is 21 years old. He has autism and ADHD and spent three years after aging out of school services in what he calls "the gray zone" — not in school, not employed, not sure what came next. He heard about Hope Pathways from a community day program and applied in September 2024.

[Photo: Jamal, 21, at his job site at the Queens Public Library. He is holding a barcode scanner and smiling at the camera.]

"I didn't think I could work in a public place," Jamal told us. "I had a lot of anxiety about being around people I didn't know. The program helped me practice until it didn't feel so scary."

Jamal completed Hope Pathways Cohort 3 in December 2024. He was placed with the Queens Public Library in January 2025, where he works in the materials processing department. His supervisor says Jamal is one of the most detail-oriented team members she has ever worked with.

Jamal's goal for 2025: "I want to save enough to get my own apartment. And maybe get a cat."

We're rooting for both.`,
    },
    {
      heading: "Meet Priya: Finding Her Voice",
      body: `Priya is 17 years old and has an intellectual disability and a secondary speech impairment. She began using Kodama Voice Studio in October 2024 through a community-based partnership CLM Studios manages in Queens.

[Photo: Priya, 17, at home with her Kodama device. She is gesturing toward the screen and her mother is watching from the background.]

Before Kodama, Priya communicated primarily through a combination of gestures, facial expressions, and a handful of spoken words. She had tried two commercial AAC apps before — both, in her mother's words, "too slow and too robotic." Kodama's adaptive voice synthesis and customizable response library fit her communication style in a way the others hadn't.

In the six months since Priya started with Kodama, she has built a vocabulary of over 200 custom phrases. She can greet neighbors, order at restaurants (a milestone her family celebrates every time), and tell her mother — in her own synthesized voice — "I love you."

"Technology finally feels like it was made for her," her mother told us. "Not the other way around."`,
    },
    {
      heading: "By the Numbers — Spring 2025",
      body: `A quick snapshot of where we stand:`,
      bullet: [
        "20 active Kodama AAC users (up from 18 at year-end 2024)",
        "14 students enrolled in Companion AI Tutors across 2 partner schools",
        "Cohort 4 completed: 12 graduates, 8 in employment placements",
        "Cohort 5 in planning: 11 candidates in pipeline for Q3 launch",
        "11 employer partners and growing",
      ],
    },
    {
      heading: "Upcoming Events + How to Give",
      body: `Annual spring gathering — June 14, 2025. Join us for our annual supporter celebration at our Brooklyn program space. Meet participants, hear from employer partners, and see Kodama in action. RSVP by June 1 to events@clmstudios.org.

Support CLM Studios this spring. We are running our "Build Their Next Chapter" giving campaign through June 30. Suggested impact levels:`,
      bullet: [
        "$50 sponsors 1 hour of Companion AI tutoring for a student on an individualized education plan",
        "$250 provides a Kodama starter device for a community user without a dedicated device",
        "$1,000 sponsors a participant's full 16-week Hope Pathways cohort, including job placement support",
      ],
    },
    {
      heading: "",
      body: `Monthly giving makes a sustained difference. A gift of $25/month funds a participant's mock interview preparation materials and coaching time across an entire cohort. Join our monthly giving community at clmstudios.org/give.

Thank you for being part of what we're building.`,
    },
  ],
};

// ---------------------------------------------------------------------------
// Doc 8: mission-about-and-campaign-copy.pdf
// ---------------------------------------------------------------------------

export const doc8: DocContent = {
  filename: "mission-about-and-campaign-copy.pdf",
  category: "marketing_materials",
  title: "CLM Studios — Mission, About, and Campaign Copy (Spring 2025)",
  sections: [
    {
      heading: "About CLM Studios",
      body: `CLM Studios is a Brooklyn-based nonprofit organization that builds AI-powered tools and direct-service programs for developmentally disabled young adults ages 16–25. Our work focuses on the transition years — the period after school-based supports end and before adult services fully begin — when neurodivergent young people are most at risk of falling through the cracks.

Our mission: ${MISSION}

We serve young adults in Brooklyn and Queens, with partner schools in NYC's District 75 special education district and a satellite pilot site in Westchester County. In FY2024, we served 89 unique young adults across three programs: Hope Pathways (workforce readiness), Kodama Voice Studio (AAC technology access), and Companion AI Tutors (1:1 personalized instruction).

CLM Studios was founded by Citlali Sylvy, who brings direct-service experience working with developmentally disabled youth ages 17–21 and builds the AI and multi-agent systems that power CLM's tools. The organization is governed by a five-person volunteer board and staffed by a team of six.`,
    },
    {
      heading: "Our Approach",
      body: `At CLM Studios, AI is a tool for access — not a replacement for the human relationships that make learning and work possible.

We believe that young adults with developmental disabilities are not a problem to be solved. They are people with skills, goals, and the capacity for growth, who have historically been underserved by systems that weren't designed with them in mind. Our job is to build the tools and programs that change that.

We use AI and multi-agent systems to deliver the kind of personalized, sustained, adaptive support that has traditionally only been available to those who can afford it: individualized tutoring tied to each student's IEP goals; communication tools that learn a user's vocabulary and style over time; coaching platforms that meet a learner where they are and grow with them.

We pair that technology with direct service — human facilitators, employer partnerships, community relationships — because technology is only as powerful as the context in which it operates. Our goal is not efficiency. It is dignity, opportunity, and the chance for every young adult we serve to define their own next chapter.`,
    },
    {
      heading: "Spring 2025 Giving Campaign — \"Build Their Next Chapter\"",
      body: `Every young adult we serve has a next chapter. Hope Pathways. A first job. A device that finally sounds like them. A classroom where they belong.

Your gift builds those chapters.

This spring, CLM Studios is raising funds to expand all three of our programs — bringing Hope Pathways to more participants, deploying Kodama to more AAC users without dedicated devices, and growing our Companion AI Tutors pilot into a full outcome study.

Give at any level:`,
      bullet: [
        "$50 = 1 hour of Companion AI tutoring for a student on an individualized education plan",
        "$250 = a Kodama starter device for a community user who currently shares or goes without",
        "$1,000 = sponsor a Hope Pathways participant for their full 16-week workforce-readiness cohort",
      ],
    },
    {
      heading: "",
      body: `Monthly giving sustains our work year-round. $25/month funds a participant's mock interview materials and coaching. $100/month supports one month of Kodama maintenance and user support.

Donate at clmstudios.org/give. All gifts are tax-deductible to the extent permitted by law. Questions? Contact us at development@clmstudios.org.`,
    },
    {
      heading: "Sample Social Post (≤280 characters)",
      body: `"31 young adults with disabilities are working today because of Hope Pathways. 18 are communicating in new ways with Kodama. This is what's possible. Build their next chapter: clmstudios.org/give #DisabilityInclusion #WorkforceReadiness"`,
    },
  ],
};

// ---------------------------------------------------------------------------
// Ordered list for the script to iterate
// ---------------------------------------------------------------------------

export const ALL_DOCS: DocContent[] = [
  doc1,
  doc2,
  doc3,
  doc4,
  doc5,
  doc6,
  doc7,
  doc8,
];
