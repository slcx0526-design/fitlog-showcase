"use client";

import { useEffect, useMemo, useState } from "react";
import { selectSafeAutomaticChanges } from "@/lib/adaptiveAutomation";
import { buildPlanAdaptation } from "@/lib/planAdaptation";
import { buildScheduleAdaptation } from "@/lib/scheduleAdaptation";
import { useStore } from "@/lib/store";
import {
  appendTrainingDecision,
  createRollbackSnapshot,
  defaultTrainingPolicy,
  loadTrainingPolicy,
  mergeTrainingPolicy,
  saveTrainingPolicy,
  type TrainingPolicy,
} from "@/lib/trainingPolicy";
import { todayKey } from "@/lib/date";

export default function AdaptivePlanController() {
  const { loaded, data, commitAdaptivePlan } = useStore();
  const [policy, setPolicy] = useState<TrainingPolicy>(() => defaultTrainingPolicy());
  const [policyLoaded, setPolicyLoaded] = useState(false);
  const today = todayKey();

  useEffect(() => {
    const refresh = () => {
      setPolicy(loadTrainingPolicy());
      setPolicyLoaded(true);
    };
    refresh();
    window.addEventListener("fitlog:training-policy", refresh);
    const onStorage = (event: StorageEvent) => {
      if (event.key?.startsWith("fitlog:training-policy:")) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("fitlog:training-policy", refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const templateProposal = useMemo(
    () => buildPlanAdaptation(data, policy, today, "policyChanged"),
    [data, policy, today],
  );
  const scheduleProposal = useMemo(
    () => buildScheduleAdaptation(data, policy, today),
    [data, policy, today],
  );
  const automatic = useMemo(
    () => selectSafeAutomaticChanges(data, policy, today, templateProposal, scheduleProposal),
    [data, policy, scheduleProposal, templateProposal, today],
  );

  useEffect(() => {
    if (!loaded || !policyLoaded || policy.adaptationMode !== "safeAuto") return;
    if (policy.lastAutoAppliedRevision === automatic.revision) return;
    if (
      policy.ignoredPlanRevisions.includes(automatic.revision)
      || policy.ignoredPlanRevisions.includes(templateProposal.sourceRevision)
      || policy.ignoredPlanRevisions.includes(scheduleProposal.sourceRevision)
    ) return;

    const hasChanges = automatic.templateChanges.length > 0 || automatic.applySchedule;
    if (!hasChanges) {
      const evaluated = mergeTrainingPolicy(policy, { lastAutoAppliedRevision: automatic.revision });
      if (saveTrainingPolicy(evaluated)) setPolicy(evaluated);
      return;
    }

    const templateIds = automatic.templateChanges.map((change) => change.templateId);
    const rollbackSnapshot = createRollbackSnapshot(
      data,
      automatic.revision,
      templateIds,
      automatic.applySchedule,
      "撤销最近一次安全自动调整",
    );

    let next = mergeTrainingPolicy(policy, {
      rollbackSnapshot,
      lastAutoAppliedRevision: automatic.revision,
    });
    next = appendTrainingDecision(next, {
      proposalId: automatic.revision,
      outcome: "autoApplied",
      summary: `安全自动应用 ${automatic.templateChanges.length} 个模板${automatic.applySchedule ? "并重排日程" : ""}`,
      templateIds,
      scheduleApplied: automatic.applySchedule,
    });
    const committed = commitAdaptivePlan(
      automatic.templateChanges.map((change) => ({
        templateId: change.templateId,
        nextItems: change.nextItems,
      })),
      automatic.applySchedule ? scheduleProposal.nextSchedule : undefined,
      next,
    );
    if (committed) setPolicy(next);
  }, [
    automatic,
    data,
    loaded,
    policy,
    policyLoaded,
    scheduleProposal.nextSchedule,
    scheduleProposal.sourceRevision,
    commitAdaptivePlan,
    templateProposal.sourceRevision,
  ]);

  return null;
}
