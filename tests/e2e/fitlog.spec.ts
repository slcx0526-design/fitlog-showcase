import { expect, test } from "@playwright/test";

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
          { id: "step_legs", type: "legs", label: "Legs" },
          { id: "step_rest", type: "rest", label: "Rest" },
        ],
      },
    }));
  });

  await page.goto("/schedule");
  const editor = page.locator("[data-microcycle-editor]");
  await expect(editor).not.toHaveAttribute("open", "");
  await expect(page.locator("[data-training-policy-shortcut]")).toHaveCSS("position", "static");
  await editor.locator("summary").click();
  await expect(editor).toHaveAttribute("open", "");
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

test("existing daily and review surfaces remain fully localized", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "Locale copy is a focused mobile regression.");
  await page.addInitScript(() => {
    localStorage.setItem("fitlog:locale", "en");
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString(), starterPlan: "compact3" },
      profile: { trainingLevel: "intermediate" },
      days: {},
      bodyWeights: [],
      waistEntries: [],
      customExercises: [],
      templates: [],
      schedule: { split: ["push", "pull", "legs", "rest", "", "", ""] },
    }));
  });

  await page.goto("/progress?tab=training");
  await expect(page.getByText("Muscle volume prescription", { exact: true })).toBeVisible();
  await expect(page.getByText("肌群容量处方", { exact: true })).toHaveCount(0);
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
  await expect(page.getByRole("navigation", { name: "Training plan views" })).toBeVisible();
  await page.getByRole("button", { name: /^Strength/ }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("fitlog:training-policy:v3") ?? "{}").goal)).toBe("strength");

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
  await expect(page.getByText("Push", { exact: true }).first()).toBeVisible();
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
      schedule: { split: ["push", "pull", "legs", "rest", "", "", ""] },
    }));
  }, { dateKey: date });

  await page.goto("/train");
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

  await page.getByRole("button", { name: "休息", exact: true }).click();
  await expect.poll(() => page.evaluate((dateKey) => {
    const data = JSON.parse(localStorage.getItem("fitlog:v1") ?? "{}");
    return {
      type: data.days?.[dateKey]?.workout?.type,
      done: data.days?.[dateKey]?.workout?.done,
      completed: Boolean(data.days?.[dateKey]?.workout?.completedAt),
    };
  }, date)).toEqual({ type: "rest", done: true, completed: true });

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
});
