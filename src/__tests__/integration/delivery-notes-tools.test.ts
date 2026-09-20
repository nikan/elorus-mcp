import { documentTests } from "./phase2-helpers.js";
import { registerDeliveryNoteTools } from "../../tools/delivery-notes.js";

documentTests("delivery_note", "delivery_notes", "/deliverynotes/", registerDeliveryNoteTools,
  { contact: "123", move_purpose: 1 }, { title: "Package", quantity: "2", unit_measure: "item" }, true);
