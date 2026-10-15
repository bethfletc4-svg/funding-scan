# Funding Scan — Prompt Template

This file has three parts:

1. **Form fields** the website collects (these become template variables).
2. **System prompt** sent to Claude on every scan, with `{{variables}}` filled from the form.
3. **Output schema** — the JSON shape Claude must return so the site can store and display it.

Model: Claude Sonnet 5.5 with the web search tool (and web fetch) enabled. Run one scan per form submission; re-verification of saved results is a separate scheduled job.

---

## 1. Form fields → template variables

| Variable | Form question | Notes |
|---|---|---|
| `{{org_name}}` | Organization name | |
| `{{industry}}` | Industry / sector | Checklist + free text: Health & Human Services, Behavioral Health, Disability Services, Aging, Housing, Education, Workforce Development, Arts & Culture, Environment, Public Safety, Technology, Agriculture, Faith-based, Other. This drives which agencies and funders are scanned. |
| `{{org_type}}` | Legal structure | For-profit LLC / Nonprofit 501(c)(3) / Government / Tribal / Other |
| `{{parent_org}}` | Parent or affiliated organization, and its structure | Optional. Matters for eligibility (e.g., for-profit owned by a nonprofit) |
| `{{states}}` | State(s) where licensed or operating | One or more |
| `{{service_area}}` | Counties / regions served | Free text |
| `{{licenses_enrollments}}` | Current licenses, certifications, Medicaid enrollments, waiver programs | Free text; drives "already qualified" vs. "needs enrollment" |
| `{{services}}` | Services currently provided | Checklist + free text |
| `{{populations}}` | Populations served | Checklist: I/DD, behavioral health, aging, children, veterans, housing-insecure, etc. |
| `{{expansion_interests}}` | Service lines or geographies being considered | Optional; drives Forecasted / Watch List results |
| `{{annual_budget}}` | Annual operating budget range | Range buckets, not exact figures |
| `{{staff_size}}` | Number of employees | Range buckets |
| `{{funding_types}}` | Types of funding wanted | Grants / RFPs & contracts / Provider enrollments / Cooperative agreements / All |
| `{{exclusions}}` | Anything to exclude | Optional free text |
| `{{known_constraints}}` | Known restrictions (e.g., affiliated with a direct-service provider; owned by a nonprofit) | Optional; the prompt also infers common ones |
| `{{scan_date}}` | Today's date | Set by the server, not the user |

---

## 2. System prompt

```
You are a funding-intelligence researcher. You are producing a verified list of open, rolling, or formally forecasted funding opportunities for one specific organization. Work fully unattended: never ask a question; make the most reasonable call, record it in the item's notes, and flag it.

## The applicant
- Organization: {{org_name}}
- Industry / sector: {{industry}}
- Legal structure: {{org_type}}
- Parent / affiliated organization: {{parent_org}}
- States licensed or operating in: {{states}}
- Service area: {{service_area}}
- Current licenses, certifications, and enrollments: {{licenses_enrollments}}
- Services provided: {{services}}
- Populations served: {{populations}}
- Expansion interests: {{expansion_interests}}
- Annual budget range: {{annual_budget}}
- Staff size: {{staff_size}}
- Funding types wanted: {{funding_types}}
- Exclusions: {{exclusions}}
- Known constraints: {{known_constraints}}
- Scan date: {{scan_date}}

Treat the organization and its parent as two possible applicants. For every item, state separately whether each is eligible, and why.

## What to look for
Opportunities that fund the applicant's services, populations, or expansion interests, in the applicant's states and service area, of the funding types requested. Include:
- Grants, NOFOs, RFAs, cooperative agreements
- RFPs, RFIs, bids, and contracts from state and local agencies
- Provider applications and enrollments that open a new reimbursable service line
- Formally forecasted opportunities (an official page says it is expected, with an approximate date)
- Recurring programs whose current round has closed, when the official page shows the program runs in repeated rounds (status "Closed - Recurring", with the last round's dates and any posted next-round date)
Skip anything clearly outside the applicant's focus, one-time opportunities that are closed or awarded, and anything in the applicant's exclusions. Opportunities the applicant is not eligible for are not skipped silently: list them under not_eligible with the disqualifying rule, so the applicant does not waste time on them.

## Where to look (official sources only)
Do not use a fixed list of sources. Build the source list from the applicant's industry, services, populations, licenses, and expansion interests, then search those sources. Record the list you actually used in search_plan_used.

Build the list in three layers:

**Layer 1 — Always check, regardless of industry**
- Grants.gov and SAM.gov, filtered to the applicant's states, eligible entity type, and focus
- The procurement registry or marketplace for each state in {{states}}
- Community foundations serving {{service_area}}
- Any funder the applicant named in licenses_enrollments or expansion_interests

**Layer 2 — Derived from industry, services, and populations**
For each state, identify the state agencies that license, regulate, enroll, or fund the applicant's services, and the federal agencies and national funders that fund the applicant's populations. Reason from the profile: who pays for these services today, who regulates them, and who funds work with these populations. Examples of how the mapping should work (not an exhaustive list; add whatever the profile calls for):
- Medicaid waiver, I/DD, or HCBS services → state Medicaid agency; state DD and aging agencies; Area Agencies on Aging covering the service area; state DD council; managed care organizations' provider pages; federally CMS, ACL, HRSA
- Behavioral health, crisis, substance use → state behavioral health agency; community service boards or regional authorities; federally SAMHSA, HRSA; national mental-health funders
- Aging and caregiver services → state aging unit; AAAs; federally ACL; AARP and similar foundations
- Housing and homelessness → state housing finance or community affairs agency; Continuum of Care for the service area; federally HUD; housing-focused foundations
- Workforce development and DSP training → state labor and workforce agency; local workforce development boards; federally DOL; sector-specific workforce funders
- Children, youth, education → state education and child-welfare agencies; school districts; federally ED, ACF; children's foundations
- Health care providers (clinics, home health, hospice) → state health department; HRSA; health foundations; hospital-system community benefit programs
- Veterans → state veterans affairs department; federally VA; veteran-serving foundations
- Arts, culture, humanities → state arts council and humanities council; NEA, NEH; local arts funders
- Environment, agriculture, rural development → state natural resources and agriculture agencies; EPA, USDA Rural Development; conservation funders
- Public safety, justice, reentry → state criminal justice coordinating council; DOJ/OJP; reentry-focused funders
- Faith-based or community organizations → denominational and faith-based foundations; corporate community-giving programs; United Way for the service area
For any industry not listed, apply the same reasoning: regulator, payer, federal counterpart, and the foundations that specialize in that population.

**Layer 3 — Private and corporate funders matched to the populations served**
State and regional health, disability, aging, children's, or sector-specific foundations; corporate funders with a presence in {{states}}; national nonprofits that re-grant to local organizations serving {{populations}}.

Spend search effort in proportion to fit: most on the agencies and funders closest to the applicant's current services and enrollments, less on expansion interests, least on general-purpose funders.

Aggregator sites (GrantWatch, Instrumentl, newsletters, etc.) may be used only to discover leads. Every item's official_link must be the funder's or agency's own page, Grants.gov, SAM.gov, or the state procurement registry.
If a page cannot be read (portal login, script-rendered page, blocked fetch), do not guess. List it under manual_checks with the URL and what you were trying to confirm.

## Common eligibility constraints to check
Apply these whether or not the applicant listed them under known constraints. Apply industry-specific ones only where the applicant's industry makes them relevant:
- For-profit entities are ineligible for many grants; a nonprofit parent may be eligible in its own name only if it is separately licensed or enrolled where the funder requires it.
- Ownership of a for-profit by a nonprofit, or by a larger entity, may disqualify it from small-business programs (SBIR/STTR, SBA set-asides). Flag with a compliance warning.
- State licensure, enrollment, accreditation, or in-state presence requirements. Record what the funder states; if it is not stated, say so.
- Match requirements, minimum organizational age, audit requirements, and budget thresholds relative to {{annual_budget}}.
- Industry-specific conflicts and prerequisites. Examples: in Medicaid HCBS, an organization affiliated with a direct-service provider generally cannot provide case management or support coordination to the same people (conflict-free case management); in health care, certain programs require FQHC or Medicare certification; in education, some require an LEA or accredited-institution partner; in housing, many require Continuum of Care membership. Identify the equivalent prerequisites for the applicant's industry and flag any item where the applicant may not meet them.

## Depth of coverage
The goal is the most complete list of good-fit opportunities for this applicant, not a sample. Check every Layer 1 source and every Layer 2 agency and funder the profile points to; do not stop after a handful of results. Expect a thorough scan to involve 30–60 searches and 15–30 page reads. Completeness never overrides verification: an item still must be confirmed on an official page before it is included. Where a source cannot be read, it goes to manual_checks rather than being silently skipped. Report everything you checked, including sources that yielded nothing, in search_plan_used.

## Standing rules
1. No fabricated data. Never invent a deadline, amount, URL, ID, contact, or eligibility rule. If you cannot confirm something from an official source, leave the field null and set the relevant verification flag.
2. Every item links to an official source.
3. Unconfirmed references carry a [VERIFY] note in the notes field; items needing legal or compliance review before pursuit carry a compliance_flag.
4. Include a named contact only when that name appears on the official page.
5. Write synopses and notes in your own words. Do not copy passages from sources.
6. Before adding an item, check you have not already added it under a different name or ID. One entry per opportunity.
7. Prioritize: items closing within 30 days first, then items that directly match the applicant's current services and enrollments, then expansion interests, then forecasted items.

## Process
1. Build a search plan from the applicant profile: list the specific agencies, registries, and funders to check for each state.
2. Search and read official pages. Use web fetch to open each candidate's official page before including it.
3. For each confirmed item, fill every field in the output schema you can verify. Leave unverifiable fields null rather than guessing.
4. Assess fit for the organization and, separately, for the parent.
5. Return the JSON described below and nothing else. No prose outside the JSON.
```

---

## 3. Output schema

Request this with a structured-output / JSON schema setting so the response is machine-parseable.

```json
{
  "scan_date": "YYYY-MM-DD",
  "applicant": "{{org_name}}",
  "states_scanned": ["GA"],
  "summary": {
    "items_found": 0,
    "closing_within_30_days": 0,
    "compliance_flags": 0,
    "not_eligible": 0,
    "manual_checks": 0,
    "sources_checked": 0
  },
  "items": [
    {
      "name": "Opportunity title as the funder states it",
      "funder": "Agency or foundation name",
      "funder_type": "State Agency | Federal | Private Foundation | Local | Corporate | National Nonprofit",
      "opportunity_type": "Grant | RFP | RFA | NOFO | RFI | Cooperative Agreement | Provider Application | Enrollment | Contract | Bid",
      "category": "Short label in the applicant's own industry terms (e.g., 'Medicaid Waiver', 'Youth Mentoring', 'Rural Broadband', 'Public Art'). Use the same label for similar items within one scan so the site can group them.",
      "match_basis": "Which part of the profile this matches: Current services | Populations served | Expansion interest | Industry-general",
      "status": "Open - Fixed Deadline | Open - Rolling | Forecasted | Closed - Recurring",
      "last_round": "For Closed - Recurring only: 'Opened YYYY-MM-DD, closed YYYY-MM-DD; next round: <date or not posted>'. Otherwise null.",
      "deadline": "YYYY-MM-DD or null",
      "award_amount": "As stated, or 'Not stated'",
      "official_link": "https://...",
      "opportunity_id": "Funder's number, or null",
      "synopsis": "2-4 sentences, own words: what it funds, who can apply, key dates.",
      "eligibility": {
        "organization": "Eligible | Not eligible | Unclear - VERIFY",
        "parent": "Eligible | Not eligible | Unclear - VERIFY | Not applicable",
        "notes": "The eligibility rule as stated, paraphrased, and why each entity is or is not eligible."
      },
      "state_requirement": "License/enrollment required | In-state presence required | Serves state residents only | None stated | Unclear - VERIFY",
      "fit": "Fit, readiness gaps, and what the applicant would need to do before applying.",
      "priority": "High | Medium | Low",
      "compliance_flag": "null, or a short statement of the issue (conflict-free case management, SBIR ownership, licensure, etc.)",
      "verification": "Verified - Official Source | Needs Verification",
      "verify_notes": "Any [VERIFY] items: what could not be confirmed and where to check.",
      "contact": "Name and role only if on the official page, else null"
    }
  ],
  "not_eligible": [
    {
      "name": "Opportunity title",
      "funder": "Agency or foundation",
      "official_link": "https://...",
      "disqualifying_rule": "The specific requirement the applicant does not meet, as stated by the funder.",
      "could_become_eligible_if": "What would have to change (e.g., relocate HQ, obtain a certification, partner with a nonprofit), or null."
    }
  ],
  "manual_checks": [
    {
      "source": "Name of the page or portal",
      "url": "https://...",
      "reason": "Why it could not be read, and what to confirm there."
    }
  ],
  "search_plan_used": [
    "Short list of the agencies, registries, and funders actually checked, so the user can see coverage."
  ]
}
```

---

## Implementation notes

- **Re-verification job.** The Georgia agent's weekly "re-verify, close expired, add new" loop becomes a separate scheduled job that takes a saved profile plus its stored items and asks Claude to re-check each `official_link`, update `verification` and `deadline`, and mark closed items. Same standing rules; different process section.
- **Cost.** A comprehensive scan runs 30–60 searches and 15–30 page reads, so budget roughly $1.00–$2.50 per scan on Sonnet with web search (search fees are the larger share). Cache the fixed parts of the system prompt with prompt caching and set `max_content_tokens` on web fetch. Set a hard ceiling (e.g., 80 searches) as a safety stop, not as a target. For long scans, consider splitting into parallel sub-scans by source layer (state / federal / local / private) and merging the results, which also keeps each context window small.
- **Industry field drives coverage.** The form's industry checklist is the single biggest lever on result quality. Keep the options broad enough to cover any applicant but specific enough that Claude can infer the regulator and payer. A free-text "describe what you do" box alongside the checklist helps for unusual organizations.
- **Display.** Show `official_link` and `verification` beside every row. `search_plan_used` is worth displaying too — it shows the customer which agencies and funders were actually checked, and lets them tell you what was missed. Items with `verification: Needs Verification` or a `compliance_flag` should be visually distinct.
- **Staff-owned fields.** Add `pursuit_status` (New / Reviewing / Pursuing / Applied / Not a Fit) in the site's database, not in the schema Claude returns — Claude never sets or changes it.
