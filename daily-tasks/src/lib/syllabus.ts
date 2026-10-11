/**
 * Canonical SSC Buddy subject list — shared by the Syllabus section and
 * every other feature (Daily Tasks, analytics). Single source of truth.
 */
export const SUBJECTS = [
  "Maths",
  "GS",
  "Reasoning",
  "English",
  "Polity",
  "History",
  "Geography",
  "Economy",
  "Science",
  "Current Affairs",
  "Other",
] as const;

export type Subject = (typeof SUBJECTS)[number];
