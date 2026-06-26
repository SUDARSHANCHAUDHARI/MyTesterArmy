import { chromium } from "playwright";
import type { Browser, BrowserContext, Page } from "playwright";
import { join } from "node:path";

export interface BrowserOptions {
  headed: boolean;
  /** Per-action timeout in milliseconds. */
  timeout: number;
  /** Directory where screenshots and traces are written. */
  artifactDir: string;
  /**
   * Optional Playwright browser channel (e.g. "chrome", "msedge"). When set,
   * Playwright drives the installed system browser instead of its bundled
   * Chromium — useful where the bundled download is blocked.
   */
  channel?: string;
}

export interface PageSnapshot {
  url: string;
  title: string;
  text: string;
  elements: string[];
}

/**
 * Thin Playwright wrapper exposing the handful of actions the agent drives.
 * Every method returns a short string the agent can read back; failures are
 * returned as strings rather than thrown so the agent can recover and adapt.
 */
export class BrowserSession {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private screenshotCount = 0;

  constructor(private readonly opts: BrowserOptions) {}

  async start(): Promise<void> {
    this.browser = await chromium.launch({
      headless: !this.opts.headed,
      ...(this.opts.channel ? { channel: this.opts.channel } : {}),
    });
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.opts.timeout);
  }

  async close(): Promise<void> {
    await this.context?.close().catch(() => {});
    await this.browser?.close().catch(() => {});
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  private get activePage(): Page {
    if (!this.page) throw new Error("Browser not started");
    return this.page;
  }

  async navigate(url: string): Promise<string> {
    try {
      const res = await this.activePage.goto(url, {
        waitUntil: "domcontentloaded",
      });
      const status = res?.status() ?? "unknown";
      return `Navigated to ${this.activePage.url()} (HTTP ${status}).`;
    } catch (err) {
      return `Failed to navigate to ${url}: ${errMsg(err)}`;
    }
  }

  /** Capture page text plus a list of interactive elements. */
  async snapshot(): Promise<PageSnapshot> {
    const page = this.activePage;
    const title = await page.title().catch(() => "");
    const text = (await page.evaluate(() => document.body?.innerText ?? "").catch(
      () => "",
    ))
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, 3000);

    const elements = await page
      .evaluate(() => {
        const out: string[] = [];
        const seen = new Set<string>();
        const push = (label: string) => {
          const clean = label.replace(/\s+/g, " ").trim();
          if (clean && !seen.has(clean) && out.length < 60) {
            seen.add(clean);
            out.push(clean);
          }
        };
        document
          .querySelectorAll<HTMLElement>(
            "a, button, [role=button], input, textarea, select, [role=link]",
          )
          .forEach((el) => {
            const tag = el.tagName.toLowerCase();
            if (tag === "input" || tag === "textarea") {
              const input = el as HTMLInputElement;
              const name =
                input.placeholder ||
                input.getAttribute("aria-label") ||
                input.name ||
                input.type ||
                "field";
              push(`input: ${name}`);
            } else if (tag === "select") {
              const name =
                el.getAttribute("aria-label") || el.getAttribute("name") || "select";
              push(`select: ${name}`);
            } else {
              push(`${tag === "a" ? "link" : "button"}: ${el.innerText || el.getAttribute("aria-label") || ""}`);
            }
          });
        return out;
      })
      .catch(() => [] as string[]);

    return { url: page.url(), title, text, elements };
  }

  async click(text: string): Promise<string> {
    const page = this.activePage;
    const candidates = [
      page.getByRole("button", { name: text }),
      page.getByRole("link", { name: text }),
      page.getByText(text, { exact: false }),
    ];
    for (const locator of candidates) {
      try {
        await locator.first().click({ timeout: this.opts.timeout });
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        return `Clicked "${text}". Now at ${page.url()}.`;
      } catch {
        // try next strategy
      }
    }
    return `Could not find a clickable element matching "${text}".`;
  }

  async fill(target: string, value: string): Promise<string> {
    const page = this.activePage;
    const candidates = [
      page.getByLabel(target, { exact: false }),
      page.getByPlaceholder(target, { exact: false }),
      page.getByRole("textbox", { name: target }),
    ];
    for (const locator of candidates) {
      try {
        await locator.first().fill(value, { timeout: this.opts.timeout });
        return `Filled "${target}" with the provided value.`;
      } catch {
        // try next strategy
      }
    }
    return `Could not find an input matching "${target}".`;
  }

  async screenshot(label: string): Promise<string> {
    const safe = label.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 40) || "shot";
    const file = `${String(++this.screenshotCount).padStart(2, "0")}-${safe}.png`;
    const path = join(this.opts.artifactDir, file);
    try {
      await this.activePage.screenshot({ path, fullPage: true });
      return `Saved screenshot: ${file}`;
    } catch (err) {
      return `Failed to capture screenshot: ${errMsg(err)}`;
    }
  }
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message.split("\n")[0];
  return String(err);
}
