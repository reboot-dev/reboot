import { createTempDirectory, ITempDirectory } from "create-temp-directory";
import puppeteer from "puppeteer";
import Sitemapper from "sitemapper";
import path from "path";

export async function crawl({ url }: { url: string }) {
  // TODO: The Typescript compiler thinks that this constructor call is invalid,
  // but it's totally fine.
  // @ts-expect-error
  const sm = new Sitemapper();
  const sites = await sm.fetch(`${url}/sitemap.xml`);

  const tempDir: ITempDirectory = await createTempDirectory();
  const browser = await puppeteer.launch();
  const filepaths = [];
  try {
    // TODO: Concurrent crawl.
    for (const site of sites.sites) {
      const page = await browser.newPage();
      await page.goto(site, { waitUntil: "networkidle0" });
      const filepath = path.join(tempDir.path, `${filepaths.length}.pdf`);
      await page.pdf({ path: filepath, format: "A4" });
      await page.close();

      filepaths.push(filepath);
    }
  } finally {
    await browser.close();
  }

  return { tempDir, filepaths };
}
