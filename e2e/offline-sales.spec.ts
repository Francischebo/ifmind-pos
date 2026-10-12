import { expect, test } from "@playwright/test";

test("captures only provisional cash offline and syncs idempotently when the same cashier reconnects", async ({
  page,
  context,
}) => {
  const offlinePayloads: Record<string, unknown>[] = [];
  let authenticatedUserId = "cashier-offline-e2e";

  await page.addInitScript(() => {
    localStorage.setItem("jwt_token", "offline-e2e-token");
  });

  await page.route("**/api/**", async (route) => {
    const { pathname } = new URL(route.request().url());

    if (pathname.endsWith("/auth/me")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: authenticatedUserId,
          email: "offline@example.test",
          role: "cashier",
        }),
      });
      return;
    }

    if (pathname.endsWith("/api/health")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "ok" }),
      });
      return;
    }

    if (pathname.endsWith("/warehouses")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ id: "warehouse-offline", name: "Main Warehouse" }]),
      });
      return;
    }

    if (pathname.endsWith("/products")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{
          id: "product-offline",
          sku: "OFF-001",
          barcode: "616100000001",
          name: "Offline Test Product",
          retail_price: 100,
          tax_rate: 0,
          tax_class: { rate: 16 },
          stock_on_hand: 5,
        }]),
      });
      return;
    }

    if (pathname.endsWith("/sales") && route.request().method() === "POST") {
      offlinePayloads.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: "server-sale-offline-e2e" }),
      });
      return;
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.goto("/sales", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Offline Test Product", { exact: true })).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByText("Server unavailable - offline POS mode")).toBeVisible();
  await page.getByText("Offline Test Product", { exact: true }).click();
  await page.getByRole("button", { name: /Exact/ }).click();
  await page.getByRole("button", { name: "Complete Sale & Print Receipt" }).click();

  await expect(page.getByTestId("offline-sale-receipt")).toBeVisible();
  await expect(page.getByText("Provisional cash receipt")).toBeVisible();
  expect(offlinePayloads).toHaveLength(0);

  await page.getByRole("button", { name: "Done" }).click();
  authenticatedUserId = "another-cashier";
  await context.setOffline(false);
  await expect(page.getByText(/belong to a different cashier/i)).toBeVisible();
  expect(offlinePayloads).toHaveLength(0);

  authenticatedUserId = "cashier-offline-e2e";
  await page.getByRole("button", { name: "Sync" }).click();
  await expect.poll(() => offlinePayloads.length, { timeout: 20_000 }).toBe(1);
  expect(offlinePayloads[0]).toMatchObject({
    payment_method: "cash",
    cash_amount: 116,
    expected_total_amount: 116,
    items: [{ product_id: "product-offline", quantity: 1 }],
  });
  expect(typeof offlinePayloads[0].offline_created_at).toBe("string");
  expect(String(offlinePayloads[0].idempotency_key)).toMatch(/^offline_/);
});
