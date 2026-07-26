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
];

function localDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
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
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  const modes = ["lite", "pulse", "midnight", "survival"];
  const routes = ["/", "/train", "/progress?tab=training", "/settings"];

  await page.goto("/");
  for (const mode of modes) {
    await page.evaluate((nextMode) => localStorage.setItem("fitlog:uiMode", nextMode), mode);
    for (const route of routes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator("html")).toHaveAttribute("data-mode", mode);
      await expect(page.locator("main")).toBeVisible();
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
  const calculator = page.getByRole("button", { name: /杠铃片计算/ });
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
