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

test("WebKit mobile keeps the complete product route matrix usable", async ({ page }) => {
  const date = localDateKey();
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const detail = message.text();
    if (detail.startsWith("Failed to fetch RSC payload") && detail.includes("Falling back to browser navigation")) return;
    consoleErrors.push(detail);
  });
  await page.addInitScript(({ dateKey }) => {
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString() },
      days: {
        [dateKey]: {
          date: dateKey,
          workout: {
            type: "push",
            done: false,
            microcycleId: "mc_webkit",
            exercises: [{
              id: "px_barbell_bench",
              name: "平板杠铃卧推",
              isMain: true,
              primaryMuscle: "chest",
              volumeContributions: [{ muscle: "chest", weight: 1, direct: true }],
              recordModes: ["weight", "reps"],
              equipment: "free",
              prescription: {
                progressionTrackId: "px_barbell_bench:strength:4-6:4:reps",
                progressionTrackLabel: "力量 · 4–6 次",
                trainingIntent: "strength",
                targetRepMin: 4,
                targetRepMax: 6,
                workingSets: 4,
                loadIncrementKg: 2.5,
                progressionRule: "doubleProgression",
                performanceMode: "reps",
              },
              sets: [{ weight: 80, reps: 5, type: "working", completion: "completed" }],
            }],
          },
        },
      },
      bodyWeights: [{ date: dateKey, weight: 79.5 }],
      waistEntries: [{ date: dateKey, waist: 83.5 }],
      customExercises: [],
      templates: [],
      schedule: { split: ["push", "pull", "legs", "rest", "", "", ""] },
      microcycle: {
        currentId: "mc_webkit",
        startedAt: dateKey,
        stepIndex: 0,
        steps: [{ id: "step_webkit", type: "push", label: "Push Strength" }],
        phase: "build",
      },
    }));
  }, { dateKey: date });

  for (const route of ROUTES) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
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

  await page.goto("/training-policy", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-training-workspace-nav] a")).toHaveCount(4);
  await expect(page.locator('.app-nav a[href="/train"]')).toHaveAttribute("aria-current", "page");
  expect(consoleErrors).toEqual([]);
});

test("WebKit keeps final-set editing stable for two-digit reps", async ({ page }) => {
  const date = localDateKey();
  await page.addInitScript(({ dateKey }) => {
    const prescription = (id: string) => ({
      progressionTrackId: `${id}:hypertrophy:8-12:1:reps`,
      progressionTrackLabel: "增肌 · 8–12 次",
      trainingIntent: "hypertrophy",
      targetRepMin: 8,
      targetRepMax: 12,
      workingSets: 1,
      loadIncrementKg: 2.5,
      progressionRule: "doubleProgression",
      performanceMode: "reps",
    });
    localStorage.setItem("fitlog:v1", JSON.stringify({
      onboarding: { completedAt: new Date().toISOString() },
      days: {
        [dateKey]: {
          date: dateKey,
          workout: {
            type: "push",
            done: false,
            exercises: [
              { id: "px_barbell_bench", name: "平板杠铃卧推", isMain: true, recordModes: ["weight", "reps"], prescription: prescription("px_barbell_bench"), sets: [{ weight: 80, reps: 0, type: "working" }] },
              { id: "px_machine_lateral", name: "器械侧平举", recordModes: ["weight", "reps"], prescription: prescription("px_machine_lateral"), sets: [] },
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
  const bench = page.locator("#exercise-px_barbell_bench");
  const reps = bench.getByRole("textbox", { name: "第1组次数" });
  await expect(reps).toBeVisible();
  await expect(reps).toHaveCSS("font-size", "16px");
  await reps.click();
  await reps.pressSequentially("1");
  await expect(reps).toBeFocused();
  await expect(bench).toHaveAttribute("data-active", "true");
  await reps.pressSequentially("2");
  await expect(reps).toHaveValue("12");
  await expect(page.locator("#exercise-px_machine_lateral")).toHaveAttribute("data-active", "false");
});
