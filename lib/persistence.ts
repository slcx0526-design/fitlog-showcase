export const PERSISTENCE_EVENT = "fitlog:persistence";

export type PersistenceEventDetail = {
  status: "saved" | "error";
  at: string;
};

export function emitPersistenceStatus(status: PersistenceEventDetail["status"]) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<PersistenceEventDetail>(PERSISTENCE_EVENT, {
    detail: { status, at: new Date().toISOString() },
  }));
}
