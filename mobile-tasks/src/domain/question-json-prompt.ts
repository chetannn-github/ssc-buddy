export const QUESTION_JSON_PROMPT = `Create an SSC Buddy question-bank JSON file. Return ONLY valid JSON, with no markdown or explanation.

Use this exact shape:
[
  {
    "id": "unique-question-id",
    "question": "Question text",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": "A",
    "explanation": "Short explanation"
  }
]

Rules: every question needs exactly four options; correctAnswer must be A, B, C, or D; each id must be unique.`;
