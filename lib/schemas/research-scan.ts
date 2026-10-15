import { z } from "zod";

// The JSON a research scan returns, as defined in prompts/research-scan.md
// section 3. Used to validate Claude's structured output and the fixture.

export const eligibilitySchema = z.object({
  organization: z.enum(["Eligible", "Not eligible", "Unclear - VERIFY"]),
  parent: z.enum(["Eligible", "Not eligible", "Unclear - VERIFY", "Not applicable"]),
  // Nullable because real scans (14 items in the Cardinal fixture) leave it empty.
  notes: z.string().nullable(),
});

export const scanItemSchema = z.object({
  name: z.string(),
  funder: z.string(),
  funder_type: z.enum([
    "State Agency",
    "Federal",
    "Private Foundation",
    "Local",
    "Corporate",
    "National Nonprofit",
  ]),
  opportunity_type: z.enum([
    "Grant",
    "RFP",
    "RFA",
    "NOFO",
    "RFI",
    "Cooperative Agreement",
    "Provider Application",
    "Enrollment",
    "Contract",
    "Bid",
  ]),
  category: z.string(),
  match_basis: z.enum([
    "Current services",
    "Populations served",
    "Expansion interest",
    "Industry-general",
  ]),
  status: z.enum(["Open - Fixed Deadline", "Open - Rolling", "Forecasted", "Closed - Recurring"]),
  last_round: z.string().nullable(),
  deadline: z.iso.date().nullable(),
  award_amount: z.string(),
  official_link: z.url(),
  opportunity_id: z.string().nullable(),
  synopsis: z.string(),
  eligibility: eligibilitySchema,
  state_requirement: z.enum([
    "License/enrollment required",
    "In-state presence required",
    "Serves state residents only",
    "None stated",
    "Unclear - VERIFY",
  ]),
  fit: z.string(),
  priority: z.enum(["High", "Medium", "Low"]),
  compliance_flag: z.string().nullable(),
  verification: z.enum(["Verified - Official Source", "Needs Verification"]),
  verify_notes: z.string().nullable(),
  contact: z.string().nullable(),
});

export const notEligibleSchema = z.object({
  name: z.string(),
  funder: z.string(),
  official_link: z.url(),
  disqualifying_rule: z.string(),
  could_become_eligible_if: z.string().nullable(),
});

export const manualCheckSchema = z.object({
  source: z.string(),
  url: z.url(),
  reason: z.string(),
});

export const researchScanSchema = z.object({
  scan_date: z.iso.date(),
  applicant: z.string(),
  states_scanned: z.array(z.string()),
  summary: z.object({
    items_found: z.number().int(),
    closing_within_30_days: z.number().int(),
    compliance_flags: z.number().int(),
    not_eligible: z.number().int(),
    manual_checks: z.number().int(),
    sources_checked: z.number().int(),
  }),
  items: z.array(scanItemSchema),
  not_eligible: z.array(notEligibleSchema),
  manual_checks: z.array(manualCheckSchema),
  search_plan_used: z.array(z.string()),
});

export type ScanItem = z.infer<typeof scanItemSchema>;
export type ResearchScan = z.infer<typeof researchScanSchema>;
