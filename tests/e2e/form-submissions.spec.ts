import { expect, test } from "@playwright/test";

test("admin can view live form submissions and filter them by date", async ({ page, request }) => {
  const suffix = crypto.randomUUID();
  const email = `forms-${suffix}@example.com`;
  let userId = "";

  try {
    await page.goto("/admin/form-submissions");
    await expect(page.getByRole("heading", { name: "Form Submissions" })).toBeVisible();
    const created = await request.post("/api/sessions", {
      data: {
        name: `Form User ${suffix}`,
        email,
        phone: "9876543210",
        age: "29",
        address: "New Delhi",
      },
    });
    expect(created.ok()).toBeTruthy();
    const body = (await created.json()) as { session: { userId: string } };
    userId = body.session.userId;

    await expect(page.getByText(`Form User ${suffix}`)).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByText("New Delhi")).toBeVisible();
    await expect(page.getByRole("link", { name: "Download filtered Excel" })).toBeVisible();

    await page.getByLabel("From date").fill("2100-01-01");
    await expect(page.getByText("No form submissions match this date range.")).toBeVisible();
  } finally {
    if (userId) await request.delete(`/api/users/${userId}`);
  }
});
