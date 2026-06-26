export interface ElorusConfig {
  apiKey: string;
  orgId: string;
  demo: boolean;
}

export function getConfig(): ElorusConfig {
  const apiKey = process.env.ELORUS_API_KEY;
  const orgId = process.env.ELORUS_ORG_ID;

  if (!apiKey) {
    throw new Error("ELORUS_API_KEY environment variable is required");
  }
  if (!orgId) {
    throw new Error("ELORUS_ORG_ID environment variable is required");
  }

  return { apiKey, orgId, demo: process.env.ELORUS_DEMO === "1" };
}
