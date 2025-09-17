// api/generate-pdf.js
const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");
const { buildPreventivoHtml } = require("../app");

function sanitizeFilename(name) {
  return String(name)
    .replace(/[\r\n]+/g, " ")
    .replace(/[^\p{L}\p{N}\.\-_]+/gu, "_")
    .slice(0, 120) || "preventivo";
}

async function renderSinglePagePdf(html) {
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.emulateMediaType("screen");

    // Assicurati che i font siano pronti
    if (page.evaluateHandle) {
      try { await page.evaluateHandle(() => document.fonts && document.fonts.ready); } catch {}
    }

    // Altezza effettiva del contenuto in px
    const contentHeight = await page.evaluate(() => {
      const body = document.body;
      const html = document.documentElement;
      return Math.max(
        body.scrollHeight, body.offsetHeight,
        html.clientHeight, html.scrollHeight, html.offsetHeight
      );
    });

    // Chrome ha un limite massimo di altezza per pagina PDF (~200in).
    // Clamp prudenziale per evitare errori.
    const MAX_PX = 18800; // ~196in a 96dpi
    const heightPx = Math.min(contentHeight, MAX_PX);

    // Larghezza fissa 210mm, altezza dinamica in px
    const pdf = await page.pdf({
      width: "210mm",
      height: `${heightPx}px`,
      printBackground: true,
      pageRanges: "1" // singola pagina
    });

    return Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

module.exports = async (req, res) => {
  try {
    const q = req.query || {};
    const body = req.body || {};
    const domain =
      body.domain ||
      q.domain ||
      q.textDomain ||
      process.env.DEFAULT_TEXT_DOMAIN ||
      "casawa";

    const { html, filename } = await buildPreventivoHtml(domain);
    const pdfBuffer = await renderSinglePagePdf(html);

    const safeFilename = sanitizeFilename(filename) + ".pdf";
    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeFilename}"`,
      "Cache-Control": "no-store",
      "Content-Length": String(pdfBuffer.length)
    });
    res.end(pdfBuffer);
  } catch (err) {
    console.error("PDF ERROR", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      message: "Error generating PDF",
      error: err?.message || "Unknown",
      code: err?.code || "FUNCTION_INVOCATION_FAILED",
      when: new Date().toISOString()
    }));
  }
};
