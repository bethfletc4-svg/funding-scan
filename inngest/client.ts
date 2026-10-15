import { Inngest } from "inngest";

// One Inngest client for the whole app. Every scheduled or long-running job
// (API pulls, email parsing, research scans, re-verification, the digest) is an
// Inngest function in inngest/functions/ that uses this client.
export const inngest = new Inngest({ id: "funding-scan" });
