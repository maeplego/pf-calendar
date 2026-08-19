import { expect, test } from "@playwright/test";

const api = "http://localhost:18095";
const slug = "e2e-30";

test.beforeAll(async () => {
  const res = await fetch(`${api}/v1/event-types`, {
    method: "POST",
    headers: { "X-Dev-Host-Sub": "e2e-host", "Content-Type": "application/json" },
    body: JSON.stringify({
      slug,
      name: "E2E 30",
      durationMinutes: 30,
      hostTimeZone: "Asia/Tokyo",
      bufferMinutes: 0,
      minNoticeMinutes: 0,
      rules: [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
        dayOfWeek,
        startLocal: "00:00",
        endLocal: "23:30",
      })),
    }),
  });
  if (res.status !== 201) {
    throw new Error(`seed event type: ${res.status} ${await res.text()}`);
  }
});

test("guest books a public slot", async ({ page }) => {
  await page.goto(`/book/${slug}`);
  await expect(page.getByRole("heading", { name: "E2E 30" })).toBeVisible();
  await page.getByRole("button").filter({ hasNotText: "予約" }).first().click();
  const slot = page.locator("button").filter({ hasText: /ホスト/ });
  await expect(slot.first()).toBeVisible();
  await slot.first().click();
  await page.getByLabel("お名前").fill("E2E Guest");
  await page.getByLabel("メール").fill("e2e-guest@example.test");
  await page.getByRole("button", { name: "予約する" }).click();
  await expect(page.getByRole("heading", { name: "予約が確定しました" })).toBeVisible();
  await expect(page.getByText("キャンセルトークン")).toBeVisible();
});
