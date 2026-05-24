-- Migration 00039: Demo org seed data for proof library
--
-- Context: Populates synthetic prior_grants and outcomes for the demo org so
-- the Q3 side-by-side demo has real data to cite. Realistic but clearly
-- fictional ("Hope Foundation", "Served 247 students in 2024", etc.).
--
-- IMPORTANT: Before applying, replace the placeholder org_id below with the
-- actual demo org's UUID from the orgs table. Lopmon should obtain this from
-- Citlali or from a SELECT on the orgs table.
--
-- To find the demo org id:
--   SELECT id, name FROM public.orgs LIMIT 20;
--
-- Manual apply: run in Supabase SQL Editor after confirming the org_id.
-- Same workflow as 00033/00036/00037/00038.

-- ---------------------------------------------------------------------------
-- CONFIGURATION: Replace this placeholder with the real demo org UUID
-- ---------------------------------------------------------------------------
-- If the demo org UUID is not yet known, set this migration aside and run it
-- separately once Lopmon/Citlali provides the org_id. The proof library
-- pipeline works without seed data; this is purely for Q3 demo readiness.

DO $$
DECLARE
  demo_org_id uuid;
BEGIN
  -- Try to find the demo org by a known name pattern.
  -- Update 'Hope Foundation' to match the actual demo org name.
  SELECT id INTO demo_org_id
  FROM public.orgs
  WHERE name ILIKE '%hope%' OR name ILIKE '%demo%' OR name ILIKE '%edify%'
  ORDER BY created_at ASC
  LIMIT 1;

  -- If no demo org found, skip silently (this migration is idempotent/safe to
  -- apply even if the demo org doesn't exist yet).
  IF demo_org_id IS NULL THEN
    RAISE NOTICE 'Demo org not found — seed migration skipped. Run after setting up the demo org.';
    RETURN;
  END IF;

  RAISE NOTICE 'Seeding proof library data for demo org: %', demo_org_id;

  -- ---------------------------------------------------------------------------
  -- prior_grants seed data
  -- ---------------------------------------------------------------------------

  INSERT INTO public.memory_entries (org_id, category, title, content, data, source, auto_generated)
  VALUES
    (
      demo_org_id,
      'prior_grants',
      'Hyde Family Foundation — After-School Programming 2024',
      'Received $50,000 from Hyde Family Foundation in 2024 for after-school programming serving underserved youth in the East Side neighborhood. Application emphasized STEM enrichment and homework support components. Reporting completed on time; strong relationship with program officer Sarah Chen.',
      '{"funder_name": "Hyde Family Foundation", "year": 2024, "amount_requested": 60000, "amount_awarded": 50000, "status": "funded", "grant_program": "After-School Programming", "notes": "Strong relationship with program officer Sarah Chen. STEM enrichment focus."}'::jsonb,
      'demo_seed',
      true
    ),
    (
      demo_org_id,
      'prior_grants',
      'Wallace Community Trust — Youth Workforce Development 2024',
      'Applied for $75,000 from Wallace Community Trust for youth workforce development in Q2 2024. Received partial funding of $35,000. Program officer indicated budget constraints limited the award but expressed interest in a full grant cycle in 2025.',
      '{"funder_name": "Wallace Community Trust", "year": 2024, "amount_requested": 75000, "amount_awarded": 35000, "status": "partial", "grant_program": "Youth Workforce Development", "notes": "Budget constraints led to partial award. Follow up for 2025 cycle."}'::jsonb,
      'demo_seed',
      true
    ),
    (
      demo_org_id,
      'prior_grants',
      'Riverside Community Foundation — General Operating 2023',
      'Received $25,000 general operating support from Riverside Community Foundation in 2023. This was a renewal grant; we have received this grant for three consecutive years. Foundation relationship managed by Executive Director.',
      '{"funder_name": "Riverside Community Foundation", "year": 2023, "amount_requested": 25000, "amount_awarded": 25000, "status": "funded", "grant_program": "General Operating Support", "notes": "Three-year consecutive renewal. Strong foundation relationship."}'::jsonb,
      'demo_seed',
      true
    ),
    (
      demo_org_id,
      'prior_grants',
      'State Department of Education — GEAR UP 2023',
      'Applied for $120,000 from the State Department of Education GEAR UP program in 2023. Application was declined due to program eligibility criteria — we did not meet the middle school partnership requirement. Revised program model may make us eligible in the next cycle.',
      '{"funder_name": "State Department of Education", "year": 2023, "amount_requested": 120000, "amount_awarded": 0, "status": "declined", "grant_program": "GEAR UP", "notes": "Declined — missing middle school partnership requirement. Revisit eligibility for next cycle."}'::jsonb,
      'demo_seed',
      true
    )
  ON CONFLICT DO NOTHING;

  -- ---------------------------------------------------------------------------
  -- outcomes seed data
  -- ---------------------------------------------------------------------------

  INSERT INTO public.memory_entries (org_id, category, title, content, data, source, auto_generated)
  VALUES
    (
      demo_org_id,
      'outcomes',
      'Students Served — After-School Program 2024',
      'Served 247 students in the after-school program during the 2024 academic year. Students were ages 12-18, predominantly from the East Side neighborhood. 78% of participants maintained or improved their GPA.',
      '{"year": 2024, "metric_name": "students served", "value": 247, "unit": "students", "program": "After-School Program", "source": "Q4 2024 Board Report"}'::jsonb,
      'demo_seed',
      true
    ),
    (
      demo_org_id,
      'outcomes',
      'GPA Improvement Rate — After-School Program 2024',
      '78% of after-school program participants maintained or improved their GPA during the 2024 academic year, compared to a 61% rate for non-participants at the same schools.',
      '{"year": 2024, "metric_name": "GPA maintenance/improvement rate", "value": 78, "unit": "percent", "program": "After-School Program", "source": "Q4 2024 Impact Report"}'::jsonb,
      'demo_seed',
      true
    ),
    (
      demo_org_id,
      'outcomes',
      'Youth Workforce Certifications 2024',
      'Issued 43 workforce readiness certificates through the Youth Workforce Development program in 2024. 68% of certificate earners secured employment or enrolled in post-secondary education within 90 days of program completion.',
      '{"year": 2024, "metric_name": "workforce certifications issued", "value": 43, "unit": "certificates", "program": "Youth Workforce Development", "source": "2024 Annual Report"}'::jsonb,
      'demo_seed',
      true
    ),
    (
      demo_org_id,
      'outcomes',
      'Volunteer Hours 2024',
      'Engaged 89 volunteers who contributed a combined 3,420 hours of service in 2024. Volunteer contributions represent approximately $85,000 in in-kind value at the Independent Sector rate of $31.80/hour.',
      '{"year": 2024, "metric_name": "volunteer hours", "value": 3420, "unit": "hours", "program": "All Programs", "source": "2024 Volunteer Tracking Log"}'::jsonb,
      'demo_seed',
      true
    ),
    (
      demo_org_id,
      'outcomes',
      'Students Served — After-School Program 2023',
      'Served 198 students in the after-school program during the 2023 academic year — a 25% increase from 158 students in 2022.',
      '{"year": 2023, "metric_name": "students served", "value": 198, "unit": "students", "program": "After-School Program", "source": "Q4 2023 Board Report"}'::jsonb,
      'demo_seed',
      true
    )
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Proof library demo seed complete for org: %', demo_org_id;
END $$;
