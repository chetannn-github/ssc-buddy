import type { doc, runTransaction, serverTimestamp, Firestore } from "firebase/firestore";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export function dashboardFieldsEqual(current: Record<string, unknown> | undefined, fields: Record<string, unknown>) {
  return !!current && Object.entries(fields).every(([key, value]) => JSON.stringify(canonical(current[key])) === JSON.stringify(canonical(value)));
}

/** Compare only dashboard-owned fields; focus totals and unrelated profile data survive. */
export function createPublicDashboardPublisher(api: { doc: typeof doc; runTransaction: typeof runTransaction; serverTimestamp: typeof serverTimestamp }) {
  return async (db: Firestore, uid: string, username: string, fields: Record<string, unknown>) => {
    const reference = api.doc(db, "publicProfiles", username);
    return api.runTransaction(db, async transaction => {
      const current = (await transaction.get(reference)).data();
      if (current?.["uid"] && current["uid"] !== uid) throw Error("This public profile belongs to another account.");
      if (fields["uid"] !== uid) throw Error("Invalid public profile owner.");
      if (dashboardFieldsEqual(current, fields)) return false;
      transaction.set(reference, { ...fields, updatedAt: api.serverTimestamp() }, { merge: true });
      return true;
    });
  };
}
