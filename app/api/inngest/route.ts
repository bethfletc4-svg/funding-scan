import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { functions } from "@/inngest/functions";

// Inngest calls this endpoint to discover and run background functions.
// INNGEST_SIGNING_KEY (read automatically by the SDK) verifies those calls.
export const { GET, POST, PUT } = serve({ client: inngest, functions });
