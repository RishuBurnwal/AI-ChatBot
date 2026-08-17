import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const cleanupEmails: string[] = [];

async function startChat(page: Page, suffix: string) {
  await page.goto("/widget");
  await expect(page.getByRole("heading", { name: "Before we start" })).toBeVisible();
  await page.getByLabel(/Full name/i).fill(`Realtime ${suffix}`);
  await page.getByLabel(/^Phone/i).fill("9999999999");
  await page.getByLabel(/^Email/i).fill(`realtime-${suffix}@example.com`);
  await page.getByRole("button", { name: /Continue|Start chat/ }).click();
  if (
    await page
      .getByLabel(/^Age/i)
      .isVisible()
      .catch(() => false)
  ) {
    await page.getByLabel(/^Age/i).fill("30");
    await page.getByRole("button", { name: "Start chat" }).click();
  }
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
}

async function cleanupCustomer(request: APIRequestContext, email: string) {
  const state = await request.get("/api/state");
  const body = (await state.json()) as { users: Array<{ id: string; intake: { email: string } }> };
  const user = body.users.find((candidate) => candidate.intake.email === email);
  if (user) await request.delete(`/api/users/${user.id}`);
}

test.afterEach(async ({ request }) => {
  for (const email of cleanupEmails.splice(0)) await cleanupCustomer(request, email);
});

test("refresh restores the active widget session without asking for the form again", async ({
  page,
}) => {
  const suffix = crypto.randomUUID();
  const email = `realtime-${suffix}@example.com`;
  cleanupEmails.push(email);
  await startChat(page, suffix);

  await page.reload();

  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Before we start" })).toHaveCount(0);
});

test("customer and agent receive transfer, messages, and typing status live", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const widget = await context.newPage();
  const admin = await context.newPage();
  const suffix = crypto.randomUUID();
  const email = `realtime-${suffix}@example.com`;
  cleanupEmails.push(email);
  await startChat(widget, suffix);

  await admin.goto("/admin/live-chats");
  await admin
    .getByRole("button", { name: new RegExp(`Realtime ${suffix}`) })
    .first()
    .click();
  await admin.getByRole("switch", { name: /Take over/ }).click();
  await expect(widget.getByText("Chat transferred to Support Admin.")).toBeVisible();

  await widget.getByRole("textbox", { name: "Message" }).fill("Live hello from customer");
  await expect(admin.getByText("Customer is typing…").first()).toBeVisible();
  await widget.getByRole("textbox", { name: "Message" }).press("Enter");
  await expect(admin.getByText("Live hello from customer", { exact: true }).last()).toBeVisible();

  await admin.getByLabel("Agent reply").fill("Live reply from agent");
  await expect(widget.getByText("Agent is typing")).toBeVisible();
  await admin.getByRole("button", { name: "Send" }).click();
  await expect(widget.getByText("Live reply from agent")).toBeVisible();

  await context.close();
});

test("video and screen-share controls connect customer and agent media", async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    const stream = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 180;
      return canvas.captureStream(5);
    };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => stream(),
        getDisplayMedia: async () => stream(),
      },
    });
  });
  const suffix = crypto.randomUUID();
  const email = `realtime-${suffix}@example.com`;
  cleanupEmails.push(email);
  await startChat(page, suffix);
  const admin = await context.newPage();
  await admin.goto("/admin/live-chats");
  await expect(admin.getByText("Active sessions")).toBeVisible();

  await page.getByRole("button", { name: "Start video call" }).click();
  let dialog = page.getByRole("dialog", { name: "Device & data permissions" });
  await dialog.getByRole("button", { name: "Allow" }).nth(1).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Start video call" }).click();
  await expect(page.getByText("Waiting for an agent…")).toBeVisible();
  await expect(admin.getByText(/Incoming video call/)).toBeVisible();
  await admin.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByText(/Connected ·/)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "End call" }).click();
  await page.getByRole("button", { name: "Back to chat" }).click();
  await admin.getByRole("button", { name: "Back to chat" }).click();

  await page.getByRole("button", { name: "Share screen" }).click();
  dialog = page.getByRole("dialog", { name: "Device & data permissions" });
  await dialog.getByRole("button", { name: "Allow" }).nth(2).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Share screen" }).click();
  await expect(page.getByText("Waiting for an agent…")).toBeVisible();
  await expect(admin.getByText(/Incoming screen call/)).toBeVisible();
  await admin.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByText(/Connected ·/)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "End call" }).click();
});
