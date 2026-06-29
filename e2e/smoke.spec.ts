import { expect, test } from "@playwright/test";

const username = process.env.E2E_USERNAME;
const password = process.env.E2E_PASSWORD;

const coreRoutes = [
  ["/dashboard", /Dashboard|POS & Inventory/i],
  ["/suppliers", /Suppliers/i],
  ["/purchases", /Purchases/i],
  ["/grn", /GRN|Goods/i],
  ["/supplier-invoices", /Supplier Invoices/i],
  ["/items", /Raw Materials|Items/i],
  ["/products", /Products|Finished/i],
  ["/boms", /Bills of Materials|BOM/i],
  ["/production", /Production/i],
  ["/inventory", /Inventory|Warehouse/i],
  ["/transfers", /Transfers/i],
  ["/pos", /POS/i],
  ["/receipts", /Receipts/i],
  ["/customers", /Customers/i],
  ["/finance", /Finance|Books/i],
  ["/reports", /Reports/i],
  ["/users", /Users/i],
  ["/settings", /Settings/i]
] as const;

test("renders the public login form", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByText(/Sign in to continue/i)).toBeVisible();
  await expect(page.getByPlaceholder(/Username or email/i)).toBeVisible();
  await expect(page.getByPlaceholder(/Password/i)).toBeVisible();
});

test.describe("authenticated core module smoke", () => {
  test.skip(!username || !password, "Set E2E_USERNAME and E2E_PASSWORD to run authenticated smoke coverage.");

  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByPlaceholder(/Username or email/i).fill(username ?? "");
    await page.getByPlaceholder(/Password/i).fill(password ?? "");
    await page.getByRole("button", { name: /Continue/i }).click();
    await expect(page.getByText(/Cannot reach Blex API/i)).toHaveCount(0);
    await expect(page.getByText(/Sign in to continue/i)).toHaveCount(0);
  });

  for (const [route, heading] of coreRoutes) {
    test(`loads ${route}`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByText(heading).first()).toBeVisible();
      await expect(page.getByText(/Cannot reach Blex API/i)).toHaveCount(0);
    });
  }

  test("opens the POS sale surface", async ({ page }) => {
    await page.goto("/pos");
    await expect(page.getByPlaceholder(/Scan barcode or search/i)).toBeVisible();
    await expect(page.getByText(/Checkout|Cart|Payment/i).first()).toBeVisible();
  });

  test("exposes physical stock count controls", async ({ page }) => {
    await page.goto("/inventory");
    await expect(page.getByText(/Physical counts/i)).toBeVisible();
    await expect(page.getByText(/Start count|New count/i).first()).toBeVisible();
  });

  test("shows ledger-backed tax and invoice finance views", async ({ page }) => {
    await page.goto("/finance");
    await page.getByText(/P&L/i).click();
    await expect(page.getByText(/Tax payable/i).first()).toBeVisible();
    await page.getByText(/Receivable/i).click();
    await expect(page.getByText(/Customer|Invoice|Balance/i).first()).toBeVisible();
    await page.getByText(/Payable/i).click();
    await expect(page.getByText(/Supplier|Reference|Balance/i).first()).toBeVisible();
  });
});
