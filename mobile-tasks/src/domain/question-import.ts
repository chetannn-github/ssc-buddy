type Option = "A" | "B" | "C" | "D";
type ImportedQuestion = {
  id: string;
  number: number;
  question: string;
  options: [string, string, string, string];
  correctAnswer: Option;
  explanation?: string;
};
const optionLetters: Option[] = ["A", "B", "C", "D"];

export function parseQuestionsJson(raw: string, createId: () => string): ImportedQuestion[] {
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.length === 0)
    throw new Error("Use a JSON array with at least one question.");
  if (value.length > 500) throw new Error("An exercise can contain at most 500 questions.");
  const questions = value.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`Question ${index + 1} is invalid.`);
    const q = item as Record<string, unknown>;
    const options = q["options"];
    const correct = q["correctAnswer"];
    if (typeof q["question"] !== "string" || !q["question"].trim())
      throw new Error(`Question ${index + 1} needs question text.`);
    if (
      !Array.isArray(options) ||
      options.length !== 4 ||
      options.some((option) => typeof option !== "string" || !option.trim())
    )
      throw new Error(`Question ${index + 1} needs exactly four non-empty options.`);
    const answer =
      typeof correct === "number" && Number.isInteger(correct)
        ? optionLetters[correct]
        : typeof correct === "string" && optionLetters.includes(correct as Option)
          ? (correct as Option)
          : undefined;
    if (!answer)
      throw new Error(`Question ${index + 1}: correctAnswer must be A, B, C, D or 0, 1, 2, 3.`);
    if (q["explanation"] !== undefined && typeof q["explanation"] !== "string")
      throw new Error(`Question ${index + 1}: explanation must be text.`);
    return {
      id: typeof q["id"] === "string" && q["id"].trim() ? q["id"] : createId(),
      number: index + 1,
      question: q["question"].trim(),
      options: [
        options[0] as string,
        options[1] as string,
        options[2] as string,
        options[3] as string,
      ] as [string, string, string, string],
      correctAnswer: answer,
      ...(typeof q["explanation"] === "string" && q["explanation"].trim()
        ? { explanation: q["explanation"].trim() }
        : {}),
    };
  });
  return questions;
}
