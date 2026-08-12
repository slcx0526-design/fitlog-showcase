import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const ROUTES = [
  "/",
  "/train",
  "/templates",
  "/schedule",
  "/progress?tab=body",
  "/progress?tab=training",
  "/progress?tab=log",
  "/nutrition",
  "/cardio",
  "/cut",
  "/settings",
  "/training-policy",
  "/adaptive-outcomes",
];

function localDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function offsetLocalDateKey(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function trainingPolicy(goal: "strength" | "hypertrophy" = "strength") {
  return {
    version: 3,
    goal,
    musclePriorities: {},
    exercisePreferences: {},
    preferredEquipment: [],
    unavailableEquipment: [],
    weeklyTrainingDays: { minimum: 3, target: 5, maximum: 6 },
    maxSessionMinutes: 90,
    maxExercisesPerSession: 9,
    maxWorkingSetsPerSession: 30,
    restrictions: [],
    overrides: [],
    adaptationMode: "approvalRequired",
    evidenceMode: "preview",
    evidenceMinimumConfidence: "building",
    autoApply: {
      loadChanges: false,
      repChanges: false,
      setChanges: false,
      exerciseReplacement: false,
      scheduleChanges: false,
    },
    decisionEvents: [],
    confirmedLearningSignalIds: [],
    dismissedLearningSignalIds: [],
    ignoredPlanRevisions: [],
    updatedAt: "2026-08-02T00:00:00.000Z",
  };
}

test("primary routes stay visible and inside the viewport", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  for (const route of ROUTES) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page.locator("main")).toBeVisible();
    const layout = await page.evaluate(() => ({
      viewport: window.innerWidth,
      body: document.body.scrollWidth,
      html: document.documentElement.scrollWidth,
      navRight: document.querySelector("nav")?.getBoundingClientRect().right ?? 0,
    }));
    expect(layout.body, `${route} body overflow`).toBeLessThanOrEqual(layout.viewport + 1);
    expect(layout.html, `${route} html overflow`).toBeLessThanOrEqual(layout.viewport + 1);
    expect(layout.navRight, `${route} navigation overflow`).toBeLessThanOrEqual(layout.viewport + 1);
  }
  await expect(page.locator("[data-apple-health-sync]")).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

test("home and training entry follow the next microcycle step instead of the weekday fallback", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "The sequential-cycle entry flow needs one focused browser regression.");
  const date = localDateKey();
  await page.addInitScript(({ dateKey }) => {
    const steps = [
      { id: "cycle_push", type: "push", label: "胸部力量日" },
      { id: "cycle_pull", type: "pull", label: "背部力量日" },
      { id: "cycle_legs", type: "legs", label: "腿部训练日" },
      { id: "cycle_rest", type: "rest", label: "恢复日" },
    ];
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString() },
      days: {},
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      templates: [],
      schedule: { split: Array.from({ length: 7 }, () => "legs"), microcycle: steps },
      microcycle: {
        currentId: "mc_sequential_entry",
        startedAt: dateKey,
        index: 1,
        phase: "build",
        steps,
      },
    }));
  }, { dateKey: date });

  await page.goto("/");
  await expect(page.locator(".primary-workout-panel h2")).toHaveText("胸部力量日");
  const start = page.locator(".primary-workout-panel .primary-command");
  await expect(start).toHaveAttribute("href", /start=push/);
  await expect(start).toHaveAttribute("href", /cycleStep=cycle_push/);

  await page.goto("/train");
  await expect(page.getByRole("heading", { name: "胸部力量日" })).toBeVisible();
  await expect(page.getByText("本轮下一步：胸部力量日。开始后才会写入训练日志。", { exact: true })).toBeVisible();

  await page.goto("/");
  await start.click();
  await expect.poll(() => page.evaluate((dateKey) => {
    const workout = JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}").days?.[dateKey]?.workout;
    return [workout?.type, workout?.microcycleStepId];
  }, date)).toEqual(["push", "cycle_push"]);
});

test("empty cycle templates start a blank workout without a false apply action", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "Empty-template behavior needs one focused browser regression.");
  const date = localDateKey();
  await page.addInitScript(({ dateKey }) => {
    const template = { id: "tpl_empty_push", name: "空推模板", type: "push", items: [] };
    const step = { id: "step_empty_push", type: "push", label: "空模板训练", templateId: template.id };
    localStorage.setItem("fitlog:locale", "zh");
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString() },
      days: {},
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      templates: [template],
      schedule: { split: ["push", "pull", "legs", "rest", "", "", ""], microcycle: [step] },
      microcycle: {
        currentId: "mc_empty_template",
        startedAt: dateKey,
        index: 1,
        phase: "build",
        steps: [step],
      },
    }));
  }, { dateKey: date });

  await page.goto("/train?start=push&cycleStep=step_empty_push&template=tpl_empty_push");
  await expect.poll(() => page.evaluate((dateKey) => {
    const workout = JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}").days?.[dateKey]?.workout;
    return [workout?.type, workout?.microcycleStepId, workout?.templateId ?? null, workout?.exercises?.length];
  }, date)).toEqual(["push", "step_empty_push", null, 0]);
  await expect(page.getByRole("button", { name: "空推模板" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "编辑模板" })).toBeVisible();
  await expect(page.getByText("模板为空，先添加动作", { exact: true })).toBeVisible();
  await expect(page.getByText("模板动作已经都在本次训练中", { exact: true })).toHaveCount(0);

  await page.goto("/schedule");
  await page.locator("[data-microcycle-editor] summary").click();
  await expect(page.getByRole("combobox", { name: "第 1 步训练模板" }).locator("option:checked")).toHaveText("空推模板 · 空模板");
});

test("starter setup never reports success when its local write fails", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "Persistence feedback needs one focused browser regression.");
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await page.getByRole("button", { name: "继续" }).click();
  await page.getByRole("button", { name: "继续" }).click();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key: string, value: string) {
      if (key === "fitlog:v1") throw new DOMException("Quota exceeded", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "建立第一轮" }).click();

  await expect(page.locator("[data-setup-guide]")).toBeVisible();
  await expect(page.getByText("起始计划未能保存，请检查浏览器存储", { exact: true })).toBeVisible();
  await expect(page.getByText("起始计划已建立", { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-persistence-state="error"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("fitlog:v1"))).toBeNull();
});

test("partial working sets use one completion-credit value across home, schedule, and training", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "Completion-credit consistency needs one focused mobile regression.");
  const date = localDateKey();
  await page.addInitScript(({ dateKey }) => {
    localStorage.setItem("fitlog:locale", "zh");
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString() },
      days: {
        [dateKey]: {
          date: dateKey,
          workout: {
            type: "push",
            templateId: "tpl_partial",
            done: false,
            cyclePhase: "deload",
            exercises: [{
              id: "px_barbell_bench",
              name: "平板杠铃卧推",
              isMain: true,
              sets: [{ weight: 80, reps: 6, type: "working", completion: "partial" }],
            }],
          },
        },
      },
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      templates: [{
        id: "tpl_partial",
        name: "半组口径",
        type: "push",
        items: [{ exerciseId: "px_barbell_bench", name: "平板杠铃卧推", sets: 2, repsLow: 4, repsHigh: 6 }],
      }],
      schedule: { split: ["push", "pull", "legs", "rest", "push", "pull", "rest"] },
    }));
  }, { dateKey: date });

  await page.goto("/");
  await expect(page.locator(".primary-workout-panel")).toContainText("已完成 0.5 组，随时继续。");
  await expect(page.locator("[data-daily-overview]")).toContainText("0.5 组");

  await page.goto("/schedule");
  await expect(page.getByText("0.5 组", { exact: true })).toBeVisible();

  await page.goto("/train");
  await expect(page.locator("[data-session-volume-plan]")).toContainText("0.5 组");
  await expect(page.getByRole("button", { name: "用本次完整工作组存为模板" })).toHaveCount(0);
});

test("legacy completed workouts stay immutable until the user explicitly resumes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "Completed-session immutability needs one focused mobile regression.");
  const date = localDateKey();
  await page.addInitScript(({ dateKey }) => {
    if (localStorage.getItem("fitlog:test:legacy-cycle-seeded")) return;
    localStorage.setItem("fitlog:locale", "zh");
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString(), starterPlan: "compact3" },
      days: {
        [dateKey]: {
          date: dateKey,
          workout: {
            type: "push",
            microcycleId: "mc_legacy_today",
            microcycleStepId: "legacy_push",
            exercises: [{
              id: "px_barbell_bench",
              name: "平板杠铃卧推",
              isMain: true,
              sets: [{ weight: 80, reps: 8, type: "working" }],
              planned: { sets: 3, repsLow: 6, repsHigh: 8 },
            }],
          },
        },
      },
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      templates: [],
      schedule: { split: ["push", "pull", "legs", "rest", "push", "pull", "rest"] },
      microcycle: {
        currentId: "mc_legacy_today",
        startedAt: dateKey,
        index: 1,
        steps: [
          { id: "legacy_push", type: "push", label: "推力量" },
          { id: "legacy_pull", type: "pull", label: "拉增肌" },
        ],
      },
    }));
    localStorage.setItem("fitlog:test:legacy-cycle-seeded", "1");
  }, { dateKey: date });

  await page.goto("/train");
  await expect(page.locator(".page-status")).toHaveText("已完成");
  const exercise = page.locator("#exercise-px_barbell_bench");
  await expect(exercise).toHaveAttribute("data-read-only", "true");
  await expect(exercise.getByLabel("第1组次数")).toHaveCount(0);
  await expect(exercise.getByRole("button", { name: "删除动作" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "添加动作", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "更改", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "用本次完整工作组存为模板" })).toBeVisible();
  await expect.poll(() => page.evaluate((dateKey) => {
    const workout = JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}").days?.[dateKey]?.workout;
    return workout ? Object.prototype.hasOwnProperty.call(workout, "done") : null;
  }, date)).toBe(false);

  await page.goto("/progress?tab=training");
  await expect(page.getByText(/本轮 1\/2 · 下一步/)).toContainText("拉增肌");
  await page.goto("/train");

  await page.getByRole("button", { name: /继续训练 · 已完成 1 组/ }).click();
  await expect.poll(() => page.evaluate((dateKey) => (
    JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}").days?.[dateKey]?.workout?.done
  ), date)).toBe(false);
  await expect(exercise).toHaveAttribute("data-read-only", "false");
  await expect(exercise.getByLabel("第1组次数")).toBeVisible();
  await expect(exercise.getByRole("button", { name: "删除动作" })).toBeVisible();
  await expect(page.getByRole("button", { name: "添加动作", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "更改", exact: true })).toBeVisible();

  await page.goto("/progress?tab=training");
  await expect(page.getByText(/本轮 0\/2 · 下一步/)).toContainText("推力量");
});

test("the first historical backfill cannot redefine the active microcycle", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "The fresh-storage backfill boundary needs one focused mobile regression.");
  const today = localDateKey();
  const backfillDate = offsetLocalDateKey(-1);
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("fitlog:locale", "zh");
  });

  await page.goto(`/train?date=${backfillDate}`);
  await expect(page.getByRole("heading", { name: "补记训练" })).toBeVisible();
  await page.getByRole("button", { name: "推", exact: true }).click();

  await expect.poll(() => page.evaluate(({ todayKey, backfillKey }) => {
    const raw = localStorage.getItem("fitlog:v1");
    if (!raw) return null;
    const data = JSON.parse(raw);
    const activeId = data.microcycle?.currentId;
    const workoutId = data.days?.[backfillKey]?.workout?.microcycleId;
    return {
      activeStartedAt: data.microcycle?.startedAt,
      mesocycleStartedAt: data.mesocycle?.startedAt,
      historicalId: workoutId,
      separatedFromActive: Boolean(activeId && workoutId && activeId !== workoutId),
      expectedHistoricalId: `legacy_mc_${backfillKey.replace(/-/g, "")}`,
      todayKey,
    };
  }, { todayKey: today, backfillKey: backfillDate })).toEqual({
    activeStartedAt: today,
    mesocycleStartedAt: today,
    historicalId: `legacy_mc_${backfillDate.replace(/-/g, "")}`,
    separatedFromActive: true,
    expectedHistoricalId: `legacy_mc_${backfillDate.replace(/-/g, "")}`,
    todayKey: today,
  });
});

test("a post-cycle backfill reviews the cycle before entering the next one", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "The post-cycle backfill gate needs one focused mobile regression.");
  const completedDate = offsetLocalDateKey(-2);
  const backfillDate = offsetLocalDateKey(-1);
  await page.addInitScript(({ completedKey }) => {
    const step = { id: "cycle_push", type: "push", label: "推力量" };
    localStorage.setItem("fitlog:locale", "zh");
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString() },
      days: {
        [completedKey]: {
          date: completedKey,
          workout: {
            type: "push",
            done: true,
            completedAt: `${completedKey}T10:00:00.000Z`,
            microcycleId: "mc_completed_backfill",
            microcycleStepId: step.id,
            mesocycleId: "meso_completed_backfill",
            mesocycleCycleNumber: 1,
            cyclePhase: "build",
            exercises: [{
              id: "px_barbell_bench",
              name: "平板杠铃卧推",
              isMain: true,
              sets: [{ weight: 80, reps: 6, type: "working" }],
            }],
          },
        },
      },
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      templates: [],
      schedule: { split: ["push", "pull", "legs", "rest", "push", "pull", "rest"], microcycle: [step] },
      microcycle: {
        currentId: "mc_completed_backfill",
        startedAt: completedKey,
        index: 1,
        phase: "build",
        mesocycleId: "meso_completed_backfill",
        mesocycleCycleNumber: 1,
        steps: [step],
      },
      mesocycle: {
        currentId: "meso_completed_backfill",
        startedAt: completedKey,
        index: 1,
        targetBuildCycles: 4,
        currentBuildCycle: 1,
      },
    }));
  }, { completedKey: completedDate });

  await page.goto(`/train?date=${backfillDate}`);
  await expect(page.getByRole("heading", { name: "补记训练" })).toBeVisible();
  await expect(page.getByText("先完成本轮复盘", { exact: true })).toBeVisible();
  await expect(page.locator("[data-workout-type-picker]")).toHaveCount(0);
  const layout = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
  expect(layout.width).toBeLessThanOrEqual(layout.viewport + 1);

  await page.getByRole("button", { name: "应用本轮复盘并开始下一周期" }).click();
  await page.getByRole("button", { name: "确认并开始" }).click();
  await expect(page.locator("[data-workout-type-picker]")).toBeVisible();
  await page.getByRole("button", { name: "推", exact: true }).click();

  await expect.poll(() => page.evaluate((dateKey) => {
    const data = JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}");
    return {
      startedAt: data.microcycle?.startedAt,
      sameCycle: data.days?.[dateKey]?.workout?.microcycleId === data.microcycle?.currentId,
      reviewedCycle: data.lastCycleReview?.sourceMicrocycleId,
    };
  }, backfillDate)).toEqual({
    startedAt: backfillDate,
    sameCycle: true,
    reviewedCycle: "mc_completed_backfill",
  });
});

test("an unconfirmed workout blocks manual microcycle reset", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "The reset guard needs one focused mobile regression.");
  const date = localDateKey();
  await page.addInitScript(({ dateKey }) => {
    const steps = [{ id: "cycle_push", type: "push", label: "推" }, { id: "cycle_pull", type: "pull", label: "拉" }];
    localStorage.setItem("fitlog:locale", "zh");
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString() },
      days: {
        [dateKey]: {
          date: dateKey,
          workout: {
            type: "push",
            done: false,
            microcycleId: "mc_active_reset_guard",
            microcycleStepId: "cycle_push",
            exercises: [],
          },
        },
      },
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      templates: [],
      schedule: { split: ["push", "pull", "legs", "rest", "push", "pull", "rest"], microcycle: steps },
      microcycle: { currentId: "mc_active_reset_guard", startedAt: dateKey, index: 1, steps },
    }));
  }, { dateKey: date });

  await page.goto("/progress?tab=training");
  const resetControl = page.locator("[data-cycle-reset-control]");
  await expect(resetControl).toHaveText("先确认训练");
  await expect(page.getByRole("button", { name: "手动重置" })).toHaveCount(0);
  await resetControl.click();
  await expect(page).toHaveURL(/\/train$/);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}").microcycle?.currentId)).toBe("mc_active_reset_guard");
});

test("microcycle muscle advice uses the remaining-plan forecast", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "The cycle forecast needs one focused mobile regression.");
  const date = localDateKey();
  await page.addInitScript(({ dateKey }) => {
    const template = (id: string, name: string, sets: number) => ({
      id,
      name,
      type: "push",
      items: [{
        exerciseId: "px_barbell_bench",
        name: "平板杠铃卧推",
        sets,
        repsLow: 8,
        repsHigh: 12,
        isMain: true,
        primaryMuscle: "chest",
        volumeContributions: [{ muscle: "chest", weight: 1, direct: true }],
      }],
    });
    const completed = template("tpl_forecast_done", "已完成推日", 4);
    const remaining = template("tpl_forecast_remaining", "剩余推日", 8);
    const steps = [
      { id: "forecast_done", type: "push", label: "已完成推日", templateId: completed.id },
      { id: "forecast_remaining", type: "push", label: "剩余推日", templateId: remaining.id },
      ...Array.from({ length: 5 }, (_, index) => ({ id: `forecast_rest_${index}`, type: "rest", label: "休息" })),
    ];
    localStorage.setItem("fitlog:locale", "zh");
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString() },
      profile: { trainingLevel: "intermediate" },
      days: {
        [dateKey]: {
          date: dateKey,
          workout: {
            type: "push",
            done: true,
            completedAt: new Date().toISOString(),
            microcycleId: "mc_forecast",
            microcycleStepId: "forecast_done",
            templateId: completed.id,
            exercises: [{
              id: "px_barbell_bench",
              name: "平板杠铃卧推",
              isMain: true,
              primaryMuscle: "chest",
              volumeContributions: [{ muscle: "chest", weight: 1, direct: true }],
              sets: Array.from({ length: 4 }, () => ({ weight: 80, reps: 8, type: "working" })),
            }],
          },
        },
      },
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      templates: [completed, remaining],
      schedule: { split: ["push", "push", "rest", "rest", "rest", "rest", "rest"], microcycle: steps },
      microcycle: { currentId: "mc_forecast", startedAt: dateKey, index: 1, steps },
    }));
  }, { dateKey: date });

  await page.goto("/progress?tab=training");
  const chest = page.locator('[data-muscle="chest"]');
  await expect(chest).toContainText("预计合适");
  await chest.getByRole("button").click();
  await expect(chest).toContainText("计入剩余模板预计 12 组");
  await expect(chest).not.toContainText("下一个对应训练日先增加");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});

test("IME composition Enter does not submit a custom exercise prematurely", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "One mobile flow covers composition-safe keyboard submission.");
  const date = localDateKey();
  await page.addInitScript(({ dateKey }) => {
    localStorage.setItem("fitlog:locale", "zh");
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString() },
      days: {
        [dateKey]: {
          date: dateKey,
          workout: { type: "push", done: false, exercises: [] },
        },
      },
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      templates: [],
      schedule: { split: ["push", "pull", "legs", "rest", "push", "pull", "rest"] },
    }));
  }, { dateKey: date });

  await page.goto("/train");
  await page.getByRole("button", { name: "添加动作", exact: true }).click();
  const name = page.getByLabel("新建动作名称");
  await name.fill("哑铃飞鸟变式");
  await page.getByLabel("选部位").selectOption("chest");
  await name.evaluate((input) => input.dispatchEvent(new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true,
    isComposing: true,
  })));
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}").customExercises?.length ?? 0)).toBe(0);
  await expect(name).toHaveValue("哑铃飞鸟变式");

  await name.press("Enter");
  await expect.poll(() => page.evaluate((dateKey) => {
    const data = JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}");
    return [data.customExercises?.length ?? 0, data.days?.[dateKey]?.workout?.exercises?.length ?? 0];
  }, date)).toEqual([1, 1]);
});

for (const visualMode of ["lite", "pulse", "midnight", "survival"]) {
test(`active product routes meet the WCAG AA baseline in ${visualMode}`, async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "Accessibility is audited once at the primary mobile viewport.");
  test.setTimeout(60_000);
  const date = localDateKey();
  await page.addInitScript(({ dateKey, mode }) => {
    localStorage.setItem("fitlog:uiMode", mode);
    const prescription = {
      progressionTrackId: "px_barbell_bench:strength:4-6:4:reps",
      progressionTrackLabel: "力量 · 4–6 次",
      trainingIntent: "strength",
      targetRepMin: 4,
      targetRepMax: 6,
      targetRirMin: 1,
      targetRirMax: 2,
      workingSets: 4,
      loadIncrementKg: 2.5,
      progressionRule: "doubleProgression",
      performanceMode: "reps",
    };
    const exercise = {
      id: "px_barbell_bench",
      name: "平板杠铃卧推",
      isMain: true,
      primaryMuscle: "chest",
      volumeContributions: [{ muscle: "chest", weight: 1, direct: true }],
      equipment: "free",
      recordModes: ["weight", "reps"],
      prescription,
    };
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString() },
      profile: { trainingLevel: "intermediate", sex: "male", heightCm: 178, birthYear: 1998 },
      days: {
        [dateKey]: {
          date: dateKey,
          recovery: { sleepHours: 7.5, sleepQuality: 4, energy: 4, soreness: 2, stress: 2 },
          workout: {
            type: "push",
            done: false,
            microcycleId: "mc_accessibility",
            exercises: [{ ...exercise, sets: [{ weight: 80, reps: 5, type: "working", completion: "completed" }] }],
          },
        },
      },
      bodyWeights: [{ date: dateKey, weight: 79.5 }],
      waistEntries: [{ date: dateKey, waist: 83.5 }],
      customExercises: [],
      templates: [{
        id: "tpl_accessibility",
        name: "推 · 力量",
        type: "push",
        items: [{ exerciseId: exercise.id, name: exercise.name, sets: 4, repsLow: 4, repsHigh: 6, isMain: true, primaryMuscle: "chest", volumeContributions: exercise.volumeContributions, equipment: "free", recordModes: ["weight", "reps"], prescription }],
      }],
      schedule: { split: ["push", "pull", "legs", "rest", "", "", ""] },
      microcycle: {
        currentId: "mc_accessibility",
        startedAt: dateKey,
        stepIndex: 0,
        steps: [{ id: "step_accessibility", type: "push", label: "Push Strength", templateId: "tpl_accessibility" }],
        phase: "build",
      },
    }));
  }, { dateKey: date, mode: visualMode });

  for (const route of ROUTES) {
    await page.goto(route, { waitUntil: "load" });
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-mode", visualMode);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const violations = result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.flatMap((node) => node.target),
    }));
    expect(violations, `${visualMode} ${route} accessibility violations`).toEqual([]);
  }
});
}

test("all visual modes keep core mobile flows contained", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "Theme containment is a focused mobile regression.");
  const date = localDateKey();
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  const modes = ["lite", "pulse", "midnight", "survival"];
  const routes = ["/", "/train", "/progress?tab=training", "/settings"];

  await page.addInitScript(({ dateKey }) => {
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString() },
      days: {
        [dateKey]: {
          date: dateKey,
          workout: {
            type: "push",
            done: false,
            exercises: [{
              id: "px_barbell_bench",
              name: "平板杠铃卧推",
              isMain: true,
              equipment: "free",
              recordModes: ["weight", "reps"],
              sets: [],
            }],
          },
        },
      },
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      schedule: { split: ["push", "pull", "legs", "rest", "", "", ""] },
    }));
  }, { dateKey: date });
  await page.goto("/");
  for (const mode of modes) {
    await page.evaluate((nextMode) => localStorage.setItem("fitlog:uiMode", nextMode), mode);
    for (const route of routes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator("html")).toHaveAttribute("data-mode", mode);
      await expect(page.locator("main")).toBeVisible();
      if (route === "/") await expect(page.locator("[data-daily-overview]")).toBeVisible();
      if (route === "/train") await expect(page.locator("[data-session-guide]")).toBeVisible();
      const layout = await page.evaluate(() => ({
        viewport: window.innerWidth,
        body: document.body.scrollWidth,
        html: document.documentElement.scrollWidth,
      }));
      expect(layout.body, `${mode} ${route} body overflow`).toBeLessThanOrEqual(layout.viewport + 1);
      expect(layout.html, `${mode} ${route} html overflow`).toBeLessThanOrEqual(layout.viewport + 1);
    }
  }
  expect(consoleErrors).toEqual([]);
});

test("starter setup remains localized and contained", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "Locale layout is a focused mobile regression.");
  const locales = [
    { id: "en", heading: "Set your training baseline" },
    { id: "ja", heading: "トレーニングの起点を設定" },
  ];
  for (const locale of locales) {
    await page.goto("/");
    await page.evaluate((nextLocale) => localStorage.setItem("fitlog:locale", nextLocale), locale.id);
    await page.reload();
    await expect(page.getByRole("heading", { name: locale.heading })).toBeVisible();
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width, `${locale.id} setup overflow`).toBeLessThanOrEqual(391);
  }
});

test("planning controls stay reachable without floating overlap", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "Touch geometry is a focused mobile regression.");
  await page.addInitScript(() => {
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString(), starterPlan: "compact3" },
      profile: { trainingLevel: "intermediate" },
      days: {},
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      templates: [{ id: "tpl_push", name: "Push Strength", type: "push", items: [] }],
      schedule: {
        split: ["push", "pull", "legs", "rest", "", "", ""],
        microcycle: [
          { id: "step_push", type: "push", label: "Push Strength", templateId: "tpl_push" },
          { id: "step_pull", type: "pull", label: "Pull" },
          { id: "step_legs", type: "legs", label: "脚" },
          { id: "step_rest", type: "rest", label: "Rest" },
        ],
      },
    }));
  });

  await page.goto("/schedule");
  const editor = page.locator("[data-microcycle-editor]");
  await expect(editor).not.toHaveAttribute("open", "");
  await expect(page.locator("[data-training-workspace-nav]")).toHaveCSS("position", "static");
  await editor.locator("summary").click();
  await expect(editor).toHaveAttribute("open", "");
  await expect(editor.getByRole("textbox", { name: "第 3 步名称" })).toHaveValue("腿");
  const fourthStepName = editor.getByRole("textbox", { name: "第 4 步名称" });
  await expect(fourthStepName).toHaveValue("休息");
  await editor.getByRole("combobox", { name: "第 4 步训练类型" }).selectOption("push");
  await expect(fourthStepName).toHaveValue("推");
  await expect.poll(() => page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}");
    return data.schedule?.microcycle?.[3]?.label;
  })).toBe("推");
  const controlHeights = await editor.locator("button, input, select, summary").evaluateAll((elements) => elements
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    })
    .map((element) => Math.round(element.getBoundingClientRect().height)));
  expect(Math.min(...controlHeights)).toBeGreaterThanOrEqual(40);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);

  await page.goto("/templates");
  await expect(page.locator("[data-training-policy-shortcut]")).toHaveCSS("position", "static");
  await expect(page.getByRole("button", { name: "复制全部计划" })).toBeVisible();
});

test("set-count edits keep generated shared progression history connected", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "Shared-track continuity needs one focused mobile regression.");
  await page.addInitScript(() => {
    const progressionTrackId = "px_barbell_bench-hypertrophy-3x8-12";
    localStorage.setItem("fitlog:locale", "zh");
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString() },
      days: {},
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      templates: [{
        id: "tpl_shared_track",
        name: "组数延续测试",
        type: "push",
        items: [{
          exerciseId: "px_barbell_bench",
          name: "平板杠铃卧推",
          sets: 4,
          repsLow: 8,
          repsHigh: 12,
          progressionTrackId,
          prescription: {
            progressionTrackId,
            progressionTrackLabel: "增肌 · 8–12 次",
            trainingIntent: "hypertrophy",
            targetRepMin: 8,
            targetRepMax: 12,
            targetRirMin: 1,
            targetRirMax: 2,
            workingSets: 3,
            loadIncrementKg: 2.5,
            progressionRule: "doubleProgression",
            performanceMode: "reps",
          },
        }],
      }],
      schedule: { split: ["push", "pull", "legs", "rest", "", "", ""] },
    }));
  });

  await page.goto("/templates");
  await page.getByRole("button", { name: /组数延续测试/ }).click();
  const shared = page.getByRole("button", { name: "共享", exact: true });
  const independent = page.getByRole("button", { name: "独立", exact: true });
  await expect(shared).toHaveAttribute("aria-pressed", "true");
  await expect(independent).toHaveAttribute("aria-pressed", "false");
  await shared.click();
  await page.getByRole("button", { name: "组数 · 增加" }).click();
  await expect(shared).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate(() => {
    const item = JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}").templates?.[0]?.items?.[0];
    return [item?.sets, item?.prescription?.workingSets, item?.prescription?.progressionTrackId];
  })).toEqual([5, 5, "px_barbell_bench-hypertrophy-3x8-12"]);
  await independent.click();
  await expect(independent).toHaveAttribute("aria-pressed", "true");
  const independentTrackId = "px_barbell_bench-hypertrophy-5x8-12-ind-tpl_shared_track";
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}").templates?.[0]?.items?.[0]?.prescription?.progressionTrackId)).toBe(independentTrackId);
  await page.getByRole("button", { name: "组数 · 增加" }).click();
  await page.getByRole("button", { name: "RPE", exact: true }).click();
  await expect(independent).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate(() => {
    const item = JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}").templates?.[0]?.items?.[0];
    return [item?.sets, item?.rpe, item?.prescription?.progressionTrackId];
  })).toEqual([6, 8, independentTrackId]);
  await page.getByRole("button", { name: "复制为新模板" }).click();
  await expect.poll(() => page.evaluate(() => {
    const templates = JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}").templates ?? [];
    const copy = templates[1];
    return templates.length === 2
      && copy?.items?.[0]?.prescription?.progressionTrackId === `px_barbell_bench-hypertrophy-5x8-12-ind-${copy?.id}`;
  })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});

test("adaptive outcomes render actual dose evidence across every visual mode", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "Adaptive outcome visuals need one focused mobile regression.");
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.addInitScript(() => {
    const exercise = (completedSets: number) => ({
      id: "px_barbell_bench",
      name: "平板杠铃卧推",
      isMain: true,
      primaryMuscle: "chest",
      volumeContributions: [{ muscle: "chest", weight: 1, direct: true }],
      prescription: {
        progressionTrackId: "px_barbell_bench-hypertrophy-4x8-12",
        progressionTrackLabel: "增肌 · 8–12 次",
        trainingIntent: "hypertrophy",
        targetRepMin: 8,
        targetRepMax: 12,
        targetRirMin: 1,
        targetRirMax: 2,
        workingSets: 4,
        loadIncrementKg: 2.5,
        progressionRule: "doubleProgression",
        performanceMode: "reps",
      },
      sets: Array.from({ length: completedSets }, () => ({ weight: 70, reps: 10, type: "working", completion: "completed" })),
    });
    const trainingDay = (date: string, microcycleId: string, cycleNumber: number, stepId: string, completedSets: number, difficulty: string, recoveryRating: number) => ({
      date,
      recovery: {
        sleepQuality: recoveryRating,
        energy: recoveryRating,
        soreness: 6 - recoveryRating,
        stress: 6 - recoveryRating,
      },
      workout: {
        type: "push",
        done: true,
        completedAt: `${date}T12:00:00.000Z`,
        microcycleId,
        microcycleStepId: stepId,
        mesocycleId: "meso_visual",
        mesocycleCycleNumber: cycleNumber,
        cyclePhase: "build",
        difficulty,
        exercises: [exercise(completedSets)],
      },
    });
    const restDay = (date: string, microcycleId: string, cycleNumber: number) => ({
      date,
      workout: {
        type: "rest",
        done: true,
        completedAt: `${date}T12:00:00.000Z`,
        microcycleId,
        microcycleStepId: `${microcycleId}_rest`,
        mesocycleId: "meso_visual",
        mesocycleCycleNumber: cycleNumber,
        cyclePhase: "build",
        exercises: [],
      },
    });
    localStorage.setItem("fitlog:locale", "zh");
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString() },
      days: {
        "2026-08-01": trainingDay("2026-08-01", "mc_visual_1", 1, "mc_visual_1_push_1", 4, "hard", 2),
        "2026-08-02": trainingDay("2026-08-02", "mc_visual_1", 1, "mc_visual_1_push_2", 4, "hard", 2),
        "2026-08-03": restDay("2026-08-03", "mc_visual_1", 1),
        "2026-08-05": trainingDay("2026-08-05", "mc_visual_2", 2, "mc_visual_2_push_1", 5, "onTarget", 4),
        "2026-08-06": trainingDay("2026-08-06", "mc_visual_2", 2, "mc_visual_2_push_2", 5, "onTarget", 4),
        "2026-08-07": restDay("2026-08-07", "mc_visual_2", 2),
      },
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      schedule: { split: ["push", "push", "rest"], microcycle: [
        { id: "future_push_1", type: "push", label: "推 1" },
        { id: "future_push_2", type: "push", label: "推 2" },
        { id: "future_rest", type: "rest", label: "休息" },
      ] },
      microcycle: {
        currentId: "mc_visual_future",
        startedAt: "2026-08-09",
        index: 3,
        mesocycleId: "meso_visual",
        mesocycleCycleNumber: 3,
      },
    }));
  });

  for (const mode of ["lite", "pulse", "midnight", "survival"]) {
    await page.goto("/adaptive-outcomes");
    await page.evaluate((nextMode) => localStorage.setItem("fitlog:uiMode", nextMode), mode);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-mode", mode);
    await expect(page.getByText("7 日实际", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("实际训练量 125%", { exact: true })).toBeVisible();
    await expect(page.getByText("3 项结果证据", { exact: true })).toBeVisible();
    const width = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
    expect(width.page, `${mode} adaptive outcome overflow`).toBeLessThanOrEqual(width.viewport + 1);
  }
  expect(consoleErrors).toEqual([]);
});

test("existing daily and review surfaces remain fully localized", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "Locale copy is a focused mobile regression.");
  const date = localDateKey();
  await page.addInitScript(({ dateKey }) => {
    localStorage.setItem("fitlog:locale", "en");
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString(), starterPlan: "compact3" },
      profile: { trainingLevel: "intermediate" },
      days: {
        [dateKey]: {
          date: dateKey,
          workout: {
            type: "push",
            done: false,
            exercises: [{
              id: "px_barbell_bench",
              name: "平板杠铃卧推",
              isMain: true,
              recordModes: ["weight", "reps"],
              prescription: {
                progressionTrackId: "px_barbell_bench:hypertrophy:8-12:3:reps",
                progressionTrackLabel: "增肌 · 8–12 次",
                trainingIntent: "hypertrophy",
                targetRepMin: 8,
                targetRepMax: 12,
                workingSets: 3,
                loadIncrementKg: 2.5,
                progressionRule: "doubleProgression",
                performanceMode: "reps",
              },
              sets: [],
            }],
          },
        },
      },
      bodyWeights: [{ date: "2026-07-01", weight: 80 }, { date: "2026-07-15", weight: 79.4 }],
      waistEntries: [{ date: "2026-07-01", waist: 84 }, { date: "2026-07-15", waist: 82.5 }],
      customExercises: [],
      templates: [{ id: "starter_push_strength", name: "推 · 力量", type: "push", items: [] }],
      schedule: {
        split: ["push", "pull", "legs", "rest", "", "", ""],
        microcycle: [
          { id: "step_push", type: "push", label: "Push Strength", templateId: "starter_push_strength" },
          { id: "step_rest", type: "rest", label: "Rest" },
        ],
      },
    }));
  }, { dateKey: date });

  await page.goto("/");
  await expect(page.getByText("A workout type is selected, but no effective working sets are logged yet.", { exact: true })).toBeVisible();
  await expect(page.getByText("已选择训练类型，尚未记录有效工作组。", { exact: true })).toHaveCount(0);
  await page.goto("/progress?tab=training");
  await expect(page.getByText("Muscle volume prescription", { exact: true })).toBeVisible();
  await expect(page.getByText("肌群容量处方", { exact: true })).toHaveCount(0);
  await page.goto("/train");
  await expect(page.getByText("Hypertrophy · 8–12 reps", { exact: true })).toBeVisible();
  await expect(page.getByText("Template is empty; add exercises first", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Push · Strength", exact: true })).toHaveCount(0);
  await expect(page.getByText("增肌 · 8–12 次", { exact: true })).toHaveCount(0);
  await page.goto("/schedule");
  await expect(page.getByText("Push strength", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Push Strength", { exact: true })).toHaveCount(0);
  await page.goto("/progress?tab=body");
  const chartRangeButtons = page.locator('[aria-label="Chart range"] button');
  await expect(chartRangeButtons.first()).toBeVisible();
  const chartRangeSizes = await chartRangeButtons.evaluateAll((buttons) => buttons.map((button) => {
    const rect = button.getBoundingClientRect();
    return { width: Math.round(rect.width), height: Math.round(rect.height) };
  }));
  expect(chartRangeSizes.every(({ width, height }) => width >= 40 && height >= 40)).toBe(true);
  await page.goto("/nutrition");
  await expect(page.getByText("Total calories", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("总热量", { exact: true })).toHaveCount(0);
  await page.goto("/cardio");
  await expect(page.getByText("Quick log", { exact: true })).toBeVisible();
  await expect(page.getByText("快速记录", { exact: true })).toHaveCount(0);
  await page.goto("/settings");
  await expect(page.getByText("Preferences", { exact: true })).toBeVisible();
  await expect(page.getByText("Clear and bright", { exact: true })).toBeVisible();
});

test("adaptive planning stays localized, persistent, and contained", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.addInitScript(({ policy }) => {
    localStorage.setItem("fitlog:locale", "en");
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString() },
      days: {},
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      schedule: { split: ["push", "pull", "legs", "rest", "", "", ""] },
    }));
    localStorage.setItem("fitlog:training-policy:v3", JSON.stringify(policy));
  }, { policy: trainingPolicy("hypertrophy") });

  await page.goto("/training-policy");
  await expect(page.getByRole("heading", { name: "Adaptive training plan" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Training planning views" })).toBeVisible();
  await page.getByText("Quick preference input", { exact: true }).click();
  const preferenceInput = page.getByRole("textbox", { name: "Training preference description" });
  await expect(preferenceInput).toBeVisible();
  await preferenceInput.fill("Focus on chest and grow side delts");
  await page.getByRole("button", { name: "Parse preferences" }).click();
  await expect(page.getByText("胸/上胸: specialize", { exact: true })).toBeVisible();
  await expect(page.getByText("中束: grow", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Strength/ }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("fitlog:training-policy:v3") ?? "{}").goal)).toBe("strength");
  await expect.poll(() => page.evaluate(() => {
    const priorities = JSON.parse(localStorage.getItem("fitlog:training-policy:v3") ?? "{}").musclePriorities ?? {};
    return [priorities.chest, priorities.upperChest, priorities.sideDelt];
  })).toEqual(["specialize", "specialize", "grow"]);

  const policyWidth = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
  expect(policyWidth.width).toBeLessThanOrEqual(policyWidth.viewport + 1);
  await page.goto("/adaptive-outcomes");
  await expect(page.getByRole("heading", { name: "Personal response" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue training" })).toBeVisible();
  const outcomeWidth = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
  expect(outcomeWidth.width).toBeLessThanOrEqual(outcomeWidth.viewport + 1);
  expect(consoleErrors).toEqual([]);
});

test("empty workspace can create a complete starter cycle", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("[data-setup-guide]")).toBeVisible();
  await page.getByRole("button", { name: "继续" }).click();
  await page.getByRole("button", { name: /精简 3 练/ }).click();
  await page.getByRole("button", { name: "继续" }).click();
  await page.getByRole("button", { name: "建立第一轮" }).click();
  await expect(page.locator("[data-setup-guide]")).toHaveCount(0);

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}"));
  expect(stored.templates).toHaveLength(3);
  expect(stored.schedule.microcycle).toHaveLength(4);
  expect(stored.onboarding.starterPlan).toBe("compact3");

  await page.goto("/schedule");
  await expect(page.getByText("推", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Push", { exact: true })).toHaveCount(0);
});

test("training execution exposes superset navigation and plate loading", async ({ page }) => {
  const date = localDateKey();
  await page.addInitScript(({ dateKey }) => {
    const prescription = {
      progressionTrackId: "px_barbell_bench:hypertrophy:8-12:3:reps",
      progressionTrackLabel: "增肌 · 8–12 次",
      trainingIntent: "hypertrophy",
      targetRepMin: 8,
      targetRepMax: 12,
      targetRirMin: 1,
      targetRirMax: 2,
      workingSets: 3,
      loadIncrementKg: 2.5,
      progressionRule: "doubleProgression",
      performanceMode: "reps",
    };
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString(), starterPlan: "compact3" },
      days: {
        [dateKey]: {
          date: dateKey,
          workout: {
            type: "push",
            done: false,
            templateId: "tpl_push_focus",
            exercises: [
              {
                id: "px_barbell_bench",
                name: "平板杠铃卧推",
                isMain: true,
                equipment: "free",
                supersetGroup: "A",
                recordModes: ["weight", "reps"],
                prescription,
                plannedLoadKg: 100,
                sets: [1, 2, 3].map((index) => ({ weight: 80, reps: 10, type: "working", at: `${dateKey}T00:0${index}:00.000Z` })),
              },
              {
                id: "px_lateral_raise",
                name: "哑铃侧平举",
                isMain: false,
                equipment: "free",
                supersetGroup: "A",
                recordModes: ["weight", "reps"],
                prescription: { ...prescription, progressionTrackId: "px_lateral_raise:hypertrophy:10-15:3:reps", progressionTrackLabel: "增肌 · 10–15 次", targetRepMin: 10, targetRepMax: 15 },
                sets: [],
              },
            ],
          },
        },
      },
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      templates: [{
        id: "tpl_push_focus",
        name: "推 · 增肌",
        type: "push",
        items: [
          { exerciseId: "px_barbell_bench", name: "平板杠铃卧推", sets: 3, repsLow: 8, repsHigh: 12, isMain: true, prescription },
          { exerciseId: "px_lateral_raise", name: "哑铃侧平举", sets: 3, repsLow: 10, repsHigh: 15, isMain: false, prescription: { ...prescription, progressionTrackId: "px_lateral_raise:hypertrophy:10-15:3:reps", progressionTrackLabel: "增肌 · 10–15 次", targetRepMin: 10, targetRepMax: 15 } },
        ],
      }],
      schedule: { split: ["push", "pull", "legs", "rest", "", "", ""] },
    }));
  }, { dateKey: date });

  await page.goto("/train");
  await expect(page.locator("[data-integrated-coach]")).toHaveCount(0);
  await expect(page.locator("[data-workout-type-control]")).toContainText("推");
  await expect(page.locator("[data-workout-type-picker]")).toHaveCount(0);
  await page.getByRole("button", { name: "更改", exact: true }).click();
  await expect(page.locator("[data-workout-type-picker]")).toBeVisible();
  await page.getByRole("button", { name: "收起", exact: true }).click();
  const volumePlan = page.locator("[data-session-volume-plan-details]");
  await expect(volumePlan).not.toHaveAttribute("open", "");
  await expect(page.getByText("超级组 A").first()).toBeVisible();
  const bench = page.locator("#exercise-px_barbell_bench");
  const expandBench = bench.getByRole("button", { name: "展开平板杠铃卧推" });
  await expect(expandBench).toHaveAttribute("aria-expanded", "false");
  await expandBench.click();
  const calculator = bench.getByRole("button", { name: /杠铃片计算/ });
  await expect(calculator).toBeVisible();
  await calculator.click();
  await expect(page.getByText("100kg", { exact: true }).first()).toBeVisible();
  const next = page.getByRole("button", { name: /切换超级组 A/ });
  await expect(next).toBeVisible();
  await next.click();
  const targetExercise = page.locator("#exercise-px_lateral_raise");
  await expect(targetExercise.getByText("哑铃侧平举", { exact: true })).toBeVisible();
  await expect(targetExercise.getByRole("button", { name: /添加下一组/ })).toBeVisible();

  await page.getByRole("button", { name: "休息 60 秒" }).click();
  await expect.poll(() => page.evaluate(() => Number(sessionStorage.getItem("fitlog:rest-timer:v1")) > Date.now())).toBe(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "结束休息" })).toBeVisible();
  await page.getByRole("button", { name: "结束休息" }).click();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("fitlog:rest-timer:v1"))).toBeNull();
});

test("the latest set survives an immediate reload", async ({ page }) => {
  const date = localDateKey();
  await page.addInitScript(({ dateKey }) => {
    if (sessionStorage.getItem("fitlog:e2e:immediate-reload-seeded")) return;
    sessionStorage.setItem("fitlog:e2e:immediate-reload-seeded", "1");
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString(), starterPlan: "compact3" },
      days: {
        [dateKey]: {
          date: dateKey,
          workout: {
            type: "push",
            done: false,
            exercises: [{
              id: "px_barbell_bench",
              name: "平板杠铃卧推",
              isMain: true,
              equipment: "free",
              recordModes: ["weight", "reps"],
              prescription: {
                progressionTrackId: "px_barbell_bench:hypertrophy:8-12:3:reps",
                progressionTrackLabel: "增肌 · 8–12 次",
                trainingIntent: "hypertrophy",
                targetRepMin: 8,
                targetRepMax: 12,
                workingSets: 3,
                loadIncrementKg: 2.5,
                progressionRule: "doubleProgression",
                performanceMode: "reps",
              },
              sets: [],
            }],
          },
        },
      },
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      schedule: { split: ["push", "pull", "legs", "rest", "", "", ""] },
    }));
  }, { dateKey: date });

  await page.goto("/train");
  const exercise = page.locator("#exercise-px_barbell_bench");
  const addSet = exercise.getByRole("button", { name: /添加下一组/ });
  const expand = exercise.getByRole("button", { name: "展开平板杠铃卧推" });
  await expect(exercise).toBeVisible();
  await expect(addSet.or(expand)).toBeVisible();
  if (await expand.isVisible()) await expand.click();
  await expect(addSet).toBeVisible();
  await addSet.click();
  await exercise.getByRole("textbox", { name: "第1组次数" }).fill("6");
  await page.reload({ waitUntil: "domcontentloaded" });

  await expect.poll(() => page.evaluate((dateKey) => {
    const data = JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}");
    return data.days?.[dateKey]?.workout?.exercises?.[0]?.sets?.[0]?.reps;
  }, date)).toBe(6);
});

test("typing a two-digit final set never advances before explicit confirmation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "The regression is specific to touch input and iOS-sized controls.");
  const date = localDateKey();
  await page.addInitScript(({ dateKey }) => {
    const prescription = (exerciseId: string) => ({
      progressionTrackId: `${exerciseId}:hypertrophy:8-12:1:reps`,
      progressionTrackLabel: "增肌 · 8–12 次",
      trainingIntent: "hypertrophy",
      targetRepMin: 8,
      targetRepMax: 12,
      targetRirMin: 1,
      targetRirMax: 2,
      workingSets: 1,
      loadIncrementKg: 2.5,
      progressionRule: "doubleProgression",
      performanceMode: "reps",
    });
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString(), starterPlan: "compact3" },
      days: {
        [dateKey]: {
          date: dateKey,
          workout: {
            type: "push",
            done: false,
            exercises: [
              {
                id: "px_barbell_bench",
                name: "平板杠铃卧推",
                isMain: true,
                recordModes: ["weight", "reps"],
                prescription: prescription("px_barbell_bench"),
                sets: [{ weight: 80, reps: 0, type: "working", completion: "completed" }],
              },
              {
                id: "px_machine_lateral",
                name: "器械侧平举",
                recordModes: ["weight", "reps"],
                prescription: prescription("px_machine_lateral"),
                sets: [],
              },
            ],
          },
        },
      },
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      schedule: { split: ["push", "pull", "legs", "rest", "", "", ""] },
    }));
  }, { dateKey: date });

  await page.goto("/train");
  const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(viewport).toMatch(/width=device-width/);
  await expect(page.locator("html")).toHaveCSS("touch-action", "pan-x pan-y");
  await expect(page.locator("body")).toHaveCSS("touch-action", "pan-x pan-y");
  const bench = page.locator("#exercise-px_barbell_bench");
  const lateralRaise = page.locator("#exercise-px_machine_lateral");
  const reps = bench.getByRole("textbox", { name: "第1组次数" });
  await expect(reps).toBeVisible();
  await expect(bench).toHaveAttribute("data-active", "true");
  await expect(reps).toHaveCSS("font-size", "16px");

  await reps.click();
  await reps.pressSequentially("1");
  await expect(reps).toBeFocused();
  await expect(reps).toHaveValue("1");
  await expect(bench).toHaveAttribute("data-active", "true");
  await expect(lateralRaise).toHaveAttribute("data-active", "false");

  await reps.pressSequentially("2");
  await expect(reps).toHaveValue("12");
  await expect(bench).toHaveAttribute("data-active", "true");
  await expect(bench.getByRole("button", { name: /下一项.*器械侧平举/ })).toBeVisible();
});

test("320px controls keep set actions, update feedback, and long labels contained", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-320", "This regression targets the narrowest supported viewport.");
  const date = localDateKey();
  await page.addInitScript(({ dateKey }) => {
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString(), starterPlan: "compact3" },
      profile: { trainingLevel: "intermediate" },
      days: {
        [dateKey]: {
          date: dateKey,
          workout: {
            type: "push",
            done: false,
            exercises: [{
              id: "px_barbell_bench",
              name: "平板杠铃卧推",
              isMain: true,
              recordModes: ["weight", "reps"],
              prescription: {
                progressionTrackId: "px_barbell_bench:hypertrophy:8-12:3:reps",
                progressionTrackLabel: "增肌 · 8–12 次",
                trainingIntent: "hypertrophy",
                targetRepMin: 8,
                targetRepMax: 12,
                workingSets: 3,
                loadIncrementKg: 2.5,
                progressionRule: "doubleProgression",
                performanceMode: "reps",
              },
              sets: [{ weight: 70, reps: 10, type: "working", completion: "completed" }],
            }],
          },
        },
      },
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      schedule: { split: ["push", "pull", "legs", "rest", "", "", ""] },
    }));
  }, { dateKey: date });

  await page.goto("/train");
  const setRow = page.locator("#exercise-px_barbell_bench .set-row").first();
  await expect(setRow).toBeVisible();
  const setGeometry = await setRow.evaluate((element) => {
    const row = element as HTMLElement;
    const weight = row.querySelector('[aria-label="第1组重量"]') as HTMLElement;
    const reps = row.querySelector('[aria-label="第1组次数"]') as HTMLElement;
    const options = row.querySelector('[aria-label="组设置"]') as HTMLElement;
    const remove = row.querySelector('[aria-label="删除组"]') as HTMLElement;
    const rects = [weight, reps, options, remove].map((item) => item.getBoundingClientRect());
    return {
      clientWidth: row.clientWidth,
      scrollWidth: row.scrollWidth,
      tops: rects.map((rect) => Math.round(rect.top)),
      heights: rects.map((rect) => Math.round(rect.height)),
    };
  });
  expect(setGeometry.scrollWidth).toBeLessThanOrEqual(setGeometry.clientWidth + 1);
  expect(new Set(setGeometry.tops).size).toBe(1);
  expect(setGeometry.heights.every((height) => height >= 40)).toBe(true);
  await expect(setRow.locator(".set-row__unit").first()).toBeHidden();

  const floatingGeometry = await page.evaluate(async () => {
    document.documentElement.dataset.updateWaiting = "true";
    const layer = document.createElement("div");
    layer.className = "app-update-layer pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4";
    const update = document.createElement("div");
    update.style.width = "180px";
    update.style.height = "44px";
    layer.appendChild(update);
    document.body.appendChild(layer);
    const toastLayer = document.querySelector(".toast-layer") as HTMLElement;
    const toast = document.createElement("div");
    toast.style.width = "160px";
    toast.style.height = "40px";
    toastLayer.appendChild(toast);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const updateRect = update.getBoundingClientRect();
    const toastRect = toast.getBoundingClientRect();
    const navRect = (document.querySelector(".app-nav") as HTMLElement).getBoundingClientRect();
    const mainPaddingBottom = Number.parseFloat(getComputedStyle(document.querySelector("main") as HTMLElement).paddingBottom);
    layer.remove();
    toast.remove();
    delete document.documentElement.dataset.updateWaiting;
    return {
      updateBottom: Math.round(updateRect.bottom),
      updateTop: Math.round(updateRect.top),
      toastBottom: Math.round(toastRect.bottom),
      navTop: Math.round(navRect.top),
      mainPaddingBottom: Math.round(mainPaddingBottom),
    };
  });
  expect(floatingGeometry.updateBottom).toBeLessThanOrEqual(floatingGeometry.navTop);
  expect(floatingGeometry.toastBottom).toBeLessThanOrEqual(floatingGeometry.updateTop);
  expect(floatingGeometry.mainPaddingBottom).toBeGreaterThanOrEqual(120);

  await page.goto("/training-policy");
  const daySizes = await page.locator(".adaptive-day-picker button").evaluateAll((buttons) => buttons.map((button) => {
    const rect = button.getBoundingClientRect();
    return { width: Math.round(rect.width), height: Math.round(rect.height) };
  }));
  expect(daySizes).toHaveLength(7);
  expect(daySizes.every(({ width, height }) => width >= 40 && height >= 40)).toBe(true);

  await page.evaluate(() => localStorage.setItem("fitlog:locale", "en"));
  await page.goto("/settings");
  const intermediate = page.getByRole("button", { name: /Intermediate/ });
  await expect(intermediate).toBeVisible();
  const labelGeometry = await intermediate.locator(".training-level-option__label").evaluate((label) => ({
    clientWidth: (label as HTMLElement).clientWidth,
    scrollWidth: (label as HTMLElement).scrollWidth,
  }));
  expect(labelGeometry.scrollWidth).toBeLessThanOrEqual(labelGeometry.clientWidth + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
});

test("exercise picker behaves as an accessible mobile sheet", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString() },
      days: {},
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      schedule: { split: ["push", "pull", "legs", "rest", "", "", ""] },
    }));
  });
  await page.goto("/train?start=push");
  await page.getByRole("button", { name: "添加动作", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "添加动作" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("textbox", { name: "搜索动作" })).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("");
});

test("local persistence failures are visible and actionable", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString() },
      days: {},
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      schedule: { split: ["push", "pull", "legs", "rest", "", "", ""] },
    }));
  });
  await page.goto("/train");
  await page.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key: string, value: string) {
      if (key === "fitlog:v1") throw new DOMException("Storage quota exceeded", "QuotaExceededError");
      originalSetItem.call(this, key, value);
    };
  });

  await page.getByRole("button", { name: "推", exact: true }).click();
  const alert = page.locator(".persistence-alert");
  await expect(alert).toContainText("本次修改未能保存");
  await expect(alert.getByRole("link", { name: "去设置" })).toHaveAttribute("href", "/settings");
});

test("workout drafts and rest days keep explicit completion state", async ({ page }) => {
  const date = localDateKey();
  await page.addInitScript(() => {
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString() },
      days: {},
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      schedule: { split: ["push", "pull", "legs", "rest", "", "", ""] },
    }));
  });

  await page.goto("/train?start=push");
  await expect.poll(() => page.evaluate((dateKey) => {
    const data = JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}");
    return data.days?.[dateKey]?.workout?.done;
  }, date)).toBe(false);
  await expect(page.getByText("进行中", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "更改", exact: true }).click();
  await page.getByRole("button", { name: "休息", exact: true }).click();
  await expect.poll(() => page.evaluate((dateKey) => {
    const data = JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}");
    return {
      type: data.days?.[dateKey]?.workout?.type,
      done: data.days?.[dateKey]?.workout?.done,
      completed: Boolean(data.days?.[dateKey]?.workout?.completedAt),
    };
  }, date)).toEqual({ type: "rest", done: true, completed: true });

  await page.getByRole("button", { name: "更改", exact: true }).click();
  await page.getByRole("button", { name: "推", exact: true }).click();
  await expect.poll(() => page.evaluate((dateKey) => {
    const data = JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}");
    return {
      type: data.days?.[dateKey]?.workout?.type,
      done: data.days?.[dateKey]?.workout?.done,
      completedAt: data.days?.[dateKey]?.workout?.completedAt,
    };
  }, date)).toEqual({ type: "push", done: false, completedAt: undefined });
});

test("pending local edits merge cross-tab updates before persistence", async ({ page, context }) => {
  const date = localDateKey();
  await context.addInitScript(() => {
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString() },
      days: {},
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      schedule: { split: ["push", "pull", "legs", "rest", "", "", ""] },
    }));
  });
  const remote = await context.newPage();
  await Promise.all([page.goto("/train"), remote.goto("/")]);

  await page.getByRole("button", { name: "推", exact: true }).click();
  await remote.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}");
    data.days["2026-01-02"] = { date: "2026-01-02", recovery: { energy: 4 } };
    localStorage.setItem("fitlog:v1", JSON.stringify(data));
  });

  await expect.poll(() => page.evaluate((dateKey) => {
    const data = JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}");
    return {
      workout: data.days?.[dateKey]?.workout?.type,
      recovery: data.days?.["2026-01-02"]?.recovery?.energy,
    };
  }, date)).toEqual({ workout: "push", recovery: 4 });
  await remote.close();
});

test("large legacy JSON migrates to compact storage without changing portable backups", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "Long-term storage migration needs one focused browser regression.");
  await page.addInitScript(() => {
    if (localStorage.getItem("fitlog:v1")) return;
    const days: Record<string, unknown> = {};
    for (let dayIndex = 0; dayIndex < 360; dayIndex += 1) {
      const date = new Date(Date.UTC(2024, 0, 1 + dayIndex)).toISOString().slice(0, 10);
      days[date] = {
        date,
        workout: {
          type: dayIndex % 3 === 0 ? "push" : dayIndex % 3 === 1 ? "pull" : "legs",
          done: true,
          microcycleId: `legacy_cycle_${Math.floor(dayIndex / 7)}`,
          exercises: Array.from({ length: 6 }, (_, exerciseIndex) => ({
            id: `legacy_exercise_${exerciseIndex}`,
            name: `历史动作 ${exerciseIndex + 1}`,
            isMain: exerciseIndex < 2,
            primaryMuscle: exerciseIndex < 2 ? "chest" : "upperBack",
            volumeContributions: [{ muscle: exerciseIndex < 2 ? "chest" : "upperBack", weight: 1, direct: true }],
            prescription: {
              progressionTrackId: `legacy_exercise_${exerciseIndex}:hypertrophy:8-12`,
              progressionTrackLabel: "增肌 · 8–12 次",
              trainingIntent: "hypertrophy",
              targetRepMin: 8,
              targetRepMax: 12,
              targetRirMin: 1,
              targetRirMax: 2,
              workingSets: 4,
              loadIncrementKg: 2.5,
              progressionRule: "doubleProgression",
            },
            sets: Array.from({ length: 4 }, (_, setIndex) => ({
              weight: 40 + exerciseIndex * 5,
              reps: 8 + (setIndex % 3),
              type: "working",
              completion: "completed",
              at: `${date}T10:${String(setIndex).padStart(2, "0")}:00.000Z`,
            })),
          })),
        },
      };
    }
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString() },
      days,
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      schedule: { split: ["push", "pull", "legs", "rest", "", "", ""] },
    }));
  });

  await page.goto("/train");
  await expect.poll(() => page.evaluate(() => (
    localStorage.getItem("fitlog:v1")?.startsWith("fitlog:deflate:v1:") ?? false
  ))).toBe(true);

  await page.goto("/settings");
  await expect(page.getByText(/本地已无损压缩/)).toBeVisible();
  const layout = await page.evaluate(() => ({
    viewport: window.innerWidth,
    width: document.documentElement.scrollWidth,
  }));
  expect(layout.width).toBeLessThanOrEqual(layout.viewport + 1);
});

test("an interrupted storage transaction restores its readable checkpoint", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "Recovery needs one focused browser regression.");
  await page.addInitScript(() => {
    const recovery = JSON.stringify({
      onboarding: { completedAt: new Date().toISOString() },
      days: { "2026-08-01": { date: "2026-08-01", recovery: { energy: 4 } } },
      bodyWeights: [{ date: "2026-08-01", weight: 78.4 }],
      waistEntries: [],
      customExercises: [],
      schedule: { split: ["push", "pull", "legs", "rest", "", "", ""] },
    });
    localStorage.setItem("fitlog:v1", "fitlog:deflate:v1:not-valid");
    localStorage.setItem("fitlog:v1:recovery", recovery);
  });

  await page.goto("/");
  await expect(page.locator("main")).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const restored = JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}");
    return {
      energy: restored.days?.["2026-08-01"]?.recovery?.energy,
      weight: restored.bodyWeights?.[0]?.weight,
      checkpoint: localStorage.getItem("fitlog:v1:recovery"),
    };
  })).toEqual({ energy: 4, weight: 78.4, checkpoint: null });
});

test("installed PWA reloads the current workout offline", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "Offline recovery needs one focused PWA regression.");
  const date = localDateKey();
  await page.addInitScript(() => {
    if (localStorage.getItem("fitlog:v1")) return;
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString() },
      days: {},
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      schedule: { split: ["push", "pull", "legs", "rest", "", "", ""] },
    }));
  });

  await page.goto("/train");
  await page.getByRole("button", { name: "推", exact: true }).click();
  await expect.poll(() => page.evaluate((dateKey) => {
    const data = JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}");
    return data.days?.[dateKey]?.workout?.type;
  }, date)).toBe("push");

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  // One controlled online load gives the worker the exact document and chunks
  // that the installed app needs for its next offline launch.
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-session-guide]")).toBeVisible();

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("[data-session-guide]")).toBeVisible();
    expect(await page.evaluate((dateKey) => {
      const data = JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}");
      return data.days?.[dateKey]?.workout?.type;
    }, date)).toBe("push");
  } finally {
    await context.setOffline(false);
  }
});

test("backup preview offers non-destructive merge", async ({ page }) => {
  const currentDate = localDateKey();
  await page.addInitScript(({ dateKey }) => {
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString() },
      days: { [dateKey]: { date: dateKey, nutrition: { calories: 2000, protein: 150, carbs: 200, fat: 60 } } },
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      schedule: { split: ["push", "pull", "legs", "rest", "", "", ""] },
    }));
  }, { dateKey: currentDate });
  await page.goto("/settings");
  const incomingDate = "2026-01-02";
  await page.locator('input[type="file"]').setInputFiles({
    name: "fitlog-merge.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      app: "fitlog",
      version: 15,
      exportedAt: "2026-01-03T00:00:00.000Z",
      days: {
        [currentDate]: { date: currentDate, nutrition: { calories: 1800, protein: 140, carbs: 180, fat: 55 } },
        [incomingDate]: { date: incomingDate, recovery: { sleepHours: 8, energy: 4 } },
      },
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      schedule: { split: ["push", "pull", "legs", "rest", "", "", ""] },
    })),
  });
  await expect(page.getByRole("button", { name: "安全合并缺少数据" })).toBeVisible();
  await page.getByRole("button", { name: "安全合并缺少数据" }).click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}"));
  expect(stored.days[currentDate].nutrition.calories).toBe(2000);
  expect(stored.days[incomingDate].recovery.energy).toBe(4);
});

test("backup merge preserves distinct custom and template identities that share imported ids", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "One mobile browser flow covers identity-safe backup merging.");
  await page.addInitScript(() => {
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString() },
      days: { "2026-01-01": { date: "2026-01-01", recovery: { energy: 4 } } },
      bodyWeights: [],
      waistEntries: [],
      customExercises: [{ id: "cx_merge_collision", name: "当前自定义推胸", isMain: false, type: "custom", primaryMuscle: "chest" }],
      templates: [{
        id: "tpl_merge_collision",
        name: "当前胸训练",
        type: "push",
        items: [{ exerciseId: "cx_merge_collision", name: "当前自定义推胸", sets: 3, repsLow: 8, repsHigh: 12 }],
      }],
      schedule: { split: ["push", "pull", "legs", "rest", "", "", ""] },
    }));
  });
  await page.goto("/settings");
  await page.locator('input[type="file"]').setInputFiles({
    name: "fitlog-identity-merge.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      app: "fitlog",
      version: 18,
      exportedAt: "2026-01-03T00:00:00.000Z",
      days: {
        "2026-01-02": {
          date: "2026-01-02",
          workout: {
            type: "push",
            templateId: "tpl_merge_collision",
            templateSnapshot: {
              id: "tpl_merge_collision",
              name: "导入肩训练",
              type: "push",
              items: [{ exerciseId: "cx_merge_collision", name: "导入自定义侧平举", sets: 4, repsLow: 12, repsHigh: 15 }],
            },
            done: true,
            exercises: [{
              id: "cx_merge_collision",
              name: "导入自定义侧平举",
              isMain: false,
              primaryMuscle: "sideDelt",
              volumeContributions: [{ muscle: "sideDelt", weight: 1, direct: true }],
              sets: [{ weight: 12, reps: 15, type: "working" }],
            }],
          },
        },
      },
      bodyWeights: [],
      waistEntries: [],
      customExercises: [{ id: "cx_merge_collision", name: "导入自定义侧平举", isMain: false, type: "custom", primaryMuscle: "sideDelt" }],
      templates: [{
        id: "tpl_merge_collision",
        name: "导入肩训练",
        type: "push",
        items: [{ exerciseId: "cx_merge_collision", name: "导入自定义侧平举", sets: 4, repsLow: 12, repsHigh: 15 }],
      }],
      schedule: { split: ["push", "pull", "legs", "rest", "", "", ""] },
    })),
  });
  await page.getByRole("button", { name: "安全合并缺少数据" }).click();
  await expect.poll(() => page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}");
    return {
      customIds: data.customExercises?.map((exercise: { id: string }) => exercise.id),
      templateIds: data.templates?.map((template: { id: string }) => template.id),
      workoutExerciseId: data.days?.["2026-01-02"]?.workout?.exercises?.[0]?.id,
      workoutTemplateId: data.days?.["2026-01-02"]?.workout?.templateId,
    };
  })).toEqual({
    customIds: ["cx_merge_collision", "cx_merge_collision_2"],
    templateIds: ["tpl_merge_collision", "tpl_merge_collision_2"],
    workoutExerciseId: "cx_merge_collision_2",
    workoutTemplateId: "tpl_merge_collision_2",
  });
});

test("failed backup merge keeps the current workspace unchanged", async ({ page }) => {
  const currentDate = localDateKey();
  const incomingDate = "2026-01-03";
  await page.addInitScript(({ dateKey }) => {
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString() },
      days: { [dateKey]: { date: dateKey, recovery: { energy: 3 } } },
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      schedule: { split: ["push", "pull", "legs", "rest", "", "", ""] },
    }));
  }, { dateKey: currentDate });
  await page.goto("/settings");
  await page.locator('input[type="file"]').setInputFiles({
    name: "fitlog-failed-merge.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      app: "fitlog",
      version: 18,
      exportedAt: "2026-01-04T00:00:00.000Z",
      days: { [incomingDate]: { date: incomingDate, recovery: { energy: 5 } } },
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      schedule: { split: ["push", "pull", "legs", "rest", "", "", ""] },
    })),
  });
  await page.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key: string, value: string) {
      if (key === "fitlog:v1") throw new DOMException("Storage quota exceeded", "QuotaExceededError");
      originalSetItem.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "安全合并缺少数据" }).click();
  await expect(page.getByText("合并失败", { exact: true })).toBeVisible();
  expect(await page.evaluate(({ current, incoming }) => {
    const data = JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}");
    return {
      current: data.days?.[current]?.recovery?.energy,
      imported: Boolean(data.days?.[incoming]),
    };
  }, { current: currentDate, incoming: incomingDate })).toEqual({ current: 3, imported: false });
});

test("clearing all data also resets adaptive training policy", async ({ page }) => {
  await page.addInitScript(({ policy }) => {
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString(), starterPlan: "compact3" },
      days: { "2026-01-02": { date: "2026-01-02", recovery: { energy: 4 } } },
      bodyWeights: [{ date: "2026-01-02", weight: 80 }],
      waistEntries: [],
      customExercises: [],
      schedule: { split: ["push", "pull", "legs", "rest", "", "", ""] },
    }));
    localStorage.setItem("fitlog:training-policy:v3", JSON.stringify(policy));
  }, { policy: trainingPolicy("strength") });
  await page.goto("/settings");
  await page.getByRole("button", { name: "清空全部数据" }).click();
  await page.getByRole("button", { name: "确认清空" }).click();

  await expect.poll(() => page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}");
    const policy = JSON.parse(localStorage.getItem("fitlog:training-policy:v3") ?? "{}");
    return {
      dayCount: Object.keys(data.days ?? {}).length,
      bodyWeightCount: data.bodyWeights?.length,
      onboarding: Boolean(data.onboarding),
      goal: policy.goal,
      decisionEvents: policy.decisionEvents?.length,
    };
  })).toEqual({ dayCount: 0, bodyWeightCount: 0, onboarding: false, goal: "hypertrophy", decisionEvents: 0 });
});

test("backup preview does not replace adaptive policy before confirmation", async ({ page }) => {
  await page.addInitScript(({ policy }) => {
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString() },
      days: {},
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      schedule: { split: ["push", "pull", "legs", "rest", "", "", ""] },
    }));
    localStorage.setItem("fitlog:training-policy:v3", JSON.stringify(policy));
  }, { policy: trainingPolicy("strength") });
  await page.goto("/settings");
  const importedPolicy = trainingPolicy("hypertrophy");
  await page.locator('input[type="file"]').setInputFiles({
    name: "fitlog-policy-preview.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      app: "fitlog",
      version: 18,
      exportedAt: "2026-08-02T00:00:00.000Z",
      days: { "2026-01-02": { date: "2026-01-02", recovery: { energy: 4 } } },
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      schedule: { split: ["push", "pull", "legs", "rest", "", "", ""] },
      adaptiveTraining: {
        app: "fitlog-adaptive-training",
        version: 3,
        exportedAt: "2026-08-02T00:00:00.000Z",
        policy: importedPolicy,
      },
    })),
  });
  await expect(page.getByRole("button", { name: "确认覆盖导入" })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("fitlog:training-policy:v3") ?? "{}").goal)).toBe("strength");

  await page.getByRole("button", { name: "确认覆盖导入" }).click();
  await expect.poll(() => page.evaluate(() => ({
    goal: JSON.parse(localStorage.getItem("fitlog:training-policy:v3") ?? "{}").goal,
    imported: Boolean(JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}").days?.["2026-01-02"]),
  }))).toEqual({ goal: "hypertrophy", imported: true });
});

test("failed overwrite import rolls back its adaptive policy and data", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "Import rollback needs one focused browser regression.");
  await page.addInitScript(({ policy }) => {
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString() },
      days: { "2026-08-01": { date: "2026-08-01", recovery: { energy: 3 } } },
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      schedule: { split: ["push", "pull", "legs", "rest", "", "", ""] },
    }));
    localStorage.setItem("fitlog:training-policy:v3", JSON.stringify(policy));
  }, { policy: trainingPolicy("strength") });
  await page.goto("/settings");

  const importedPolicy = trainingPolicy("hypertrophy");
  await page.locator('input[type="file"]').setInputFiles({
    name: "fitlog-rollback.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      app: "fitlog",
      version: 18,
      exportedAt: "2026-08-08T00:00:00.000Z",
      days: { "2026-08-02": { date: "2026-08-02", recovery: { energy: 5 } } },
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      schedule: { split: ["push", "pull", "legs", "rest", "", "", ""] },
      adaptiveTraining: {
        app: "fitlog-adaptive-training",
        version: 3,
        exportedAt: "2026-08-08T00:00:00.000Z",
        policy: importedPolicy,
      },
    })),
  });
  await page.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key: string, value: string) {
      if (key === "fitlog:v1") throw new DOMException("Storage quota exceeded", "QuotaExceededError");
      originalSetItem.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "确认覆盖导入" }).click();
  await expect(page.getByText("导入失败", { exact: true })).toBeVisible();
  await expect(page.locator(".persistence-alert")).toContainText("本次修改未能保存");
  expect(await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}");
    const policy = JSON.parse(localStorage.getItem("fitlog:training-policy:v3") ?? "{}");
    return {
      original: data.days?.["2026-08-01"]?.recovery?.energy,
      imported: Boolean(data.days?.["2026-08-02"]),
      goal: policy.goal,
      checkpoint: Boolean(localStorage.getItem("fitlog:v1:recovery")),
    };
  })).toEqual({ original: 3, imported: false, goal: "strength", checkpoint: true });
});

test("adaptive plan apply and undo commit templates with policy", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "The transactional flow needs one focused browser regression.");
  const policy = trainingPolicy("strength");
  policy.exercisePreferences = { lg_squat: "exclude" };
  policy.weeklyTrainingDays = { minimum: 1, target: 1, maximum: 2 };
  await page.addInitScript(({ storedPolicy }) => {
    localStorage.setItem("fitlog:locale", "en");
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString() },
      days: {},
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      templates: [{
        id: "tpl_legs",
        name: "Leg strength",
        type: "legs",
        items: [{ exerciseId: "lg_squat", name: "深蹲", sets: 4, repsLow: 4, repsHigh: 6 }],
      }],
      schedule: {
        split: ["legs", "rest", "rest", "rest", "rest", "rest", "rest"],
        microcycle: [
          { id: "step_1", type: "legs", label: "Legs", templateId: "tpl_legs" },
          { id: "step_2", type: "rest", label: "Rest" },
        ],
      },
    }));
    localStorage.setItem("fitlog:training-policy:v3", JSON.stringify(storedPolicy));
  }, { storedPolicy: policy });

  await page.goto("/training-policy");
  await expect(page.getByRole("button", { name: "Apply selected changes" })).toBeEnabled();
  await page.getByRole("button", { name: "Apply selected changes" }).click();
  await expect.poll(() => page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}");
    const policyValue = JSON.parse(localStorage.getItem("fitlog:training-policy:v3") ?? "{}");
    return {
      exerciseId: data.templates?.[0]?.items?.[0]?.exerciseId,
      rollback: Boolean(policyValue.rollbackSnapshot),
    };
  })).toEqual({ exerciseId: "lg_front_squat", rollback: true });

  await page.getByText("Undo and backup", { exact: true }).click();
  await page.getByRole("button", { name: "Undo latest plan adaptation" }).click();
  await expect.poll(() => page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}");
    const policyValue = JSON.parse(localStorage.getItem("fitlog:training-policy:v3") ?? "{}");
    return {
      exerciseId: data.templates?.[0]?.items?.[0]?.exerciseId,
      rollback: Boolean(policyValue.rollbackSnapshot),
    };
  })).toEqual({ exerciseId: "lg_squat", rollback: false });
});

test("adaptive plan rolls back when policy persistence fails", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "The storage rollback needs one focused browser regression.");
  const policy = trainingPolicy("strength");
  policy.exercisePreferences = { lg_squat: "exclude" };
  policy.weeklyTrainingDays = { minimum: 1, target: 1, maximum: 2 };
  await page.addInitScript(({ storedPolicy }) => {
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString() },
      days: {},
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      templates: [{
        id: "tpl_legs",
        name: "Leg strength",
        type: "legs",
        items: [{ exerciseId: "lg_squat", name: "深蹲", sets: 4, repsLow: 4, repsHigh: 6 }],
      }],
      schedule: {
        split: ["legs", "rest", "rest", "rest", "rest", "rest", "rest"],
        microcycle: [{ id: "step_1", type: "legs", label: "Legs", templateId: "tpl_legs" }],
      },
    }));
    localStorage.setItem("fitlog:training-policy:v3", JSON.stringify(storedPolicy));
  }, { storedPolicy: policy });
  await page.goto("/training-policy");
  await page.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key: string, value: string) {
      if (key === "fitlog:training-policy:v3") throw new DOMException("Storage quota exceeded", "QuotaExceededError");
      originalSetItem.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "应用所选变化" }).click();
  await expect(page.locator(".persistence-alert")).toContainText("本次修改未能保存");
  expect(await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}");
    const policyValue = JSON.parse(localStorage.getItem("fitlog:training-policy:v3") ?? "{}");
    return {
      exerciseId: data.templates?.[0]?.items?.[0]?.exerciseId,
      rollback: Boolean(policyValue.rollbackSnapshot),
    };
  })).toEqual({ exerciseId: "lg_squat", rollback: false });
});

test("adaptive plan rolls back policy when data persistence fails", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "The second transaction failure needs one focused browser regression.");
  const policy = trainingPolicy("strength");
  policy.exercisePreferences = { lg_squat: "exclude" };
  policy.weeklyTrainingDays = { minimum: 1, target: 1, maximum: 2 };
  await page.addInitScript(({ storedPolicy }) => {
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString() },
      days: {},
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      templates: [{
        id: "tpl_legs",
        name: "Leg strength",
        type: "legs",
        items: [{ exerciseId: "lg_squat", name: "深蹲", sets: 4, repsLow: 4, repsHigh: 6 }],
      }],
      schedule: {
        split: ["legs", "rest", "rest", "rest", "rest", "rest", "rest"],
        microcycle: [{ id: "step_1", type: "legs", label: "Legs", templateId: "tpl_legs" }],
      },
    }));
    localStorage.setItem("fitlog:training-policy:v3", JSON.stringify(storedPolicy));
  }, { storedPolicy: policy });
  await page.goto("/training-policy");
  await page.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key: string, value: string) {
      if (key === "fitlog:v1") throw new DOMException("Storage quota exceeded", "QuotaExceededError");
      originalSetItem.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "应用所选变化" }).click();
  await expect(page.locator(".persistence-alert")).toContainText("本次修改未能保存");
  expect(await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}");
    const policyValue = JSON.parse(localStorage.getItem("fitlog:training-policy:v3") ?? "{}");
    return {
      exerciseId: data.templates?.[0]?.items?.[0]?.exerciseId,
      rollback: Boolean(policyValue.rollbackSnapshot),
    };
  })).toEqual({ exerciseId: "lg_squat", rollback: false });
});

test("native Apple Health bridge imports facts without replacing manual weight", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString() },
      days: {},
      bodyWeights: [{ date: "2026-07-25", weight: 78 }],
      waistEntries: [],
      customExercises: [],
      schedule: { split: ["push", "pull", "legs", "rest", "", "", ""] },
    }));
    Object.defineProperty(window, "fitlogNative", {
      value: { platform: "ios", healthKit: true, bridgeVersion: 1 },
      configurable: true,
    });
    Object.defineProperty(window, "webkit", {
      value: {
        messageHandlers: {
          fitlogHealth: {
            postMessage: () => {
              window.setTimeout(() => window.dispatchEvent(new CustomEvent("fitlog:health-snapshot", {
                detail: {
                  schemaVersion: 1,
                  generatedAt: "2026-07-26T09:00:00.000Z",
                  rangeStart: "2026-04-28",
                  rangeEnd: "2026-07-26",
                  days: [{
                    date: "2026-07-26",
                    steps: 12345,
                    activeEnergyKcal: 640,
                    exerciseMinutes: 55,
                    restingHeartRate: 54,
                    heartRateVariabilityMs: 72,
                    sleepMinutes: 465,
                  }],
                  bodyWeights: [
                    { date: "2026-07-25", weightKg: 77.6 },
                    { date: "2026-07-26", weightKg: 77.4 },
                  ],
                },
              })), 10);
            },
          },
        },
      },
      configurable: true,
    });
  });

  await page.goto("/settings");
  const healthCard = page.locator("[data-apple-health-sync]");
  await expect(healthCard).toBeVisible();
  await healthCard.getByRole("button", { name: "授权并同步" }).click();
  await expect(healthCard.getByText("12,345", { exact: true })).toBeVisible();
  await expect(healthCard.getByText("77.4 kg", { exact: true })).toHaveCount(0);

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}"));
  expect(stored.days["2026-07-26"].health.sleepMinutes).toBe(465);
  expect(stored.bodyWeights.find((entry: { date: string }) => entry.date === "2026-07-25").weight).toBe(78);
  expect(stored.bodyWeights.find((entry: { date: string }) => entry.date === "2026-07-26")).toEqual({
    date: "2026-07-26",
    weight: 77.4,
    source: "appleHealth",
  });
  expect(stored.healthSync.provider).toBe("appleHealth");
});

test("authorized native host refreshes stale Apple Health data automatically", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString() },
      days: {},
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      schedule: { split: ["push", "pull", "legs", "rest", "", "", ""] },
      healthSync: {
        provider: "appleHealth",
        lastSyncedAt: "2020-01-01T00:00:00.000Z",
        importedDays: 1,
        importedWeights: 0,
      },
    }));
    const hostWindow = window as Window & { fitlogHealthRequests?: unknown[] };
    hostWindow.fitlogHealthRequests = [];
    Object.defineProperty(window, "fitlogNative", {
      value: { platform: "ios", healthKit: true, bridgeVersion: 1 },
      configurable: true,
    });
    Object.defineProperty(window, "webkit", {
      value: {
        messageHandlers: {
          fitlogHealth: {
            postMessage: (message: unknown) => {
              hostWindow.fitlogHealthRequests!.push(message);
              window.setTimeout(() => window.dispatchEvent(new CustomEvent("fitlog:health-snapshot", {
                detail: {
                  schemaVersion: 1,
                  generatedAt: "2026-07-26T09:30:00.000Z",
                  rangeStart: "2026-07-13",
                  rangeEnd: "2026-07-26",
                  days: [{ date: "2026-07-26", steps: 8800, sleepMinutes: 440 }],
                  bodyWeights: [],
                },
              })), 10);
            },
          },
        },
      },
      configurable: true,
    });
  });

  await page.goto("/");
  await expect.poll(() => page.evaluate(() => (
    window as Window & { fitlogHealthRequests?: unknown[] }
  ).fitlogHealthRequests?.length ?? 0)).toBe(1);
  const request = await page.evaluate(() => (
    window as Window & { fitlogHealthRequests?: { days?: number }[] }
  ).fitlogHealthRequests?.[0]);
  expect(request?.days).toBe(14);
  await expect.poll(() => page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}");
    return stored.days?.["2026-07-26"]?.health?.steps;
  })).toBe(8800);
});

test("personal health baselines explain conservative training without editing the plan", async ({ page }) => {
  await page.addInitScript(() => {
    const dateKey = (date: Date) => (
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
    );
    const todayDate = new Date();
    const today = dateKey(todayDate);
    const days: Record<string, unknown> = {};
    for (let offset = 1; offset <= 20; offset += 1) {
      const date = new Date(todayDate);
      date.setDate(date.getDate() - offset);
      const key = dateKey(date);
      days[key] = {
        date: key,
        health: {
          source: "appleHealth",
          sleepMinutes: 450,
          heartRateVariabilityMs: 60,
          restingHeartRate: 55,
          updatedAt: new Date().toISOString(),
        },
      };
    }
    days[today] = {
      date: today,
      health: {
        source: "appleHealth",
        sleepMinutes: 300,
        heartRateVariabilityMs: 38,
        restingHeartRate: 67,
        updatedAt: new Date().toISOString(),
      },
    };
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString() },
      days,
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      schedule: { split: ["push", "pull", "legs", "rest", "", "", ""] },
    }));
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "今天保守推进" })).toBeVisible();
  await page.getByRole("button", { name: "判断依据" }).click();
  await expect(page.getByText(/20 天样本 · 多项偏离/)).toBeVisible();
  await page.getByRole("button", { name: /恢复状态/ }).click();
  await page.getByRole("button", { name: "采用 Health 5h" }).click();
  await expect(page.getByRole("textbox", { name: "睡眠时长" })).toHaveValue("5");

  await page.goto("/progress?tab=training");
  await expect(page.getByRole("heading", { name: "今天保守执行处方" })).toBeVisible();
  await expect(page.getByText("执行条件", { exact: true })).toBeVisible();
  await expect(page.getByText("复查时间", { exact: true })).toBeVisible();
  await expect(page.getByText("综合教练", { exact: true })).toHaveCount(0);
});
