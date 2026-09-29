import { test, expect } from "@playwright/test";

test("完整主链路：注册→生成→回看→后台", async ({ page }) => {
  await page.goto("/");
  await page.waitForURL(/\/login/, { timeout: 15000 });

  // 去注册页
  await page.getByText("立即注册").click();
  await page.waitForURL(/\/register/);

  // 注册第一个账号（自动成为管理员）
  await page.getByPlaceholder("你的名字").fill("E2E管理员");
  await page.getByPlaceholder("you@example.com").fill("e2e@example.com");
  await page.getByPlaceholder("至少 6 位").fill("123456");
  await page.getByRole("button", { name: /注册/ }).click();

  // 回到工作台
  await page.waitForURL(/\/$/, { timeout: 15000 });
  await expect(page.getByText("E2E管理员").first()).toBeVisible({ timeout: 15000 });

  // 生成剧本
  await page.getByRole("button", { name: /下一步：选择风格/ }).click();
  await page.getByRole("button", { name: /生成风格化剧本/ }).click();
  await expect(page.getByText("LOGLINE")).toBeVisible({ timeout: 20000 });

  // 进入分镜
  await page.getByRole("button", { name: /生成分镜提示词/ }).click();
  await expect(page.locator(".prompt-label").filter({ hasText: "SELECTED SHOT" })).toBeVisible();

  // Mock Provider 异步完成全部镜头，并合成最终短剧
  await page.getByRole("button", { name: /进入视频生成队列/ }).click();
  await expect(page.getByText(/6 \/ 6 个镜头已完成/)).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: /合成最终短剧/ }).click();
  await expect(page.getByRole("link", { name: "打开成片" })).toBeVisible({ timeout: 30000 });

  // 管理员后台
  await page.getByText("后台管理").click();
  await page.waitForURL(/\/admin/);
  await expect(page.getByText("用户与权限管理")).toBeVisible();
});
