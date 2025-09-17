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

async function renderPdfBuffer(html) {
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
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" }
    });
    // garantisci Buffer
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
    const pdfBuffer = await renderPdfBuffer(html);

    const safeFilename = sanitizeFilename(filename) + ".pdf";
    const headers = {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeFilename}"`,
      "Cache-Control": "no-store",
      "Content-Length": String(pdfBuffer.length)
    };

    res.writeHead(200, headers);
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
