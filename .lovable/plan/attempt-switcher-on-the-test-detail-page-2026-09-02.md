# Attempt switcher on the test detail page

Right now the history list groups attempts (same subject + chapter + start question) and shows "First → Latest", but opening a result shows only that one attempt. This adds an attempt toggle to the detail page too.

## What changes

On `/history/$id`, when the opened test belongs to a group with more than one attempt:

- A compact attempt switcher appears above the result: `Attempt 1 · 40` `Attempt 2 · 52` ... chips, ordered oldest → newest, with the current one highlighted.
- Clicking a chip swaps the result shown in place (no page reload feel), and the URL updates to that attempt's id so back/refresh works.
- Next to the switcher, a small delta line: `First 40 → Latest 52 (+12)`, coloured green/red like the history card.
- Single-attempt tests look exactly as they do today — no switcher, nothing extra.

## Grouping rule (unchanged)

Attempts are still matched by subject + chapter + start question number, the same rule the history list uses. Keeping it identical means the card and the detail page never disagree about what counts as a reattempt.

## Technical notes

- Add a small helper in `src/lib/exam.ts`, e.g. `getAttemptGroup(id)`, that loads history and returns the sorted attempts sharing `subject||chapter||startNumber` with the given record. Reuse it in `src/routes/history.index.tsx` so grouping logic lives in one place.
- `src/routes/history.$id.tsx`: load the group in the existing `useEffect`, render the chip row between the back/reattempt bar and `<ResultScreen />`, and navigate with `navigate({ to: '/history/$id', params: { id } })` on chip click (the existing `useParams` + effect already re-reads the record on id change).
- `ResultScreen` stays untouched; evaluation state remains per-attempt record.
