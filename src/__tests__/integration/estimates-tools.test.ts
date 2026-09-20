import { documentTests } from "./phase2-helpers.js";
import { registerEstimateTools } from "../../tools/estimates.js";

documentTests("estimate", "estimates", "/estimates/", registerEstimateTools,
  { client: "123" }, { title: "Service", quantity: "2", unit_value: "10.00", taxes: [{ tax: "456", auto_calculate: true }] }, false);
