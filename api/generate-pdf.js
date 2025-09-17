// api/generate-pdf.js
// Serverless function per Vercel: genera un PDF in streaming da HTML costruito da app.js

const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");
const { buildPreventivoHtml } = require("../app");

// Renderizza l'HTML in un Buffer PDF
async function renderPdfBuffer(html) {
  const executablePath = await chromium.executablePath();
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: chromium.headless
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    // PDF A4, margini zero, sfondi inclusi
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" }
    });

    return pdf;
  } finally {
    await browser.close();
  }
}

// Handler serverless
module.exports = async (req, res) => {
  try {
    // Accetta ?domain=, ?textDomain= o il primo key-value della query
    // Supporta anche POST JSON: { "domain": "..." }
    const q = req.query || {};
    const body = req.body || {};
    const domain =
      body.domain ||
      q.domain ||
      q.textDomain ||
      process.env.DEFAULT_TEXT_DOMAIN ||
      "casawa";

    const { html, filename } = await buildPreventivoHtml(domain);
    const pdf = await renderPdfBuffer(html);

    // Inline per default. Usa ?download=1 per forzare "attachment".
    const download = String(q.download || "") === "1";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `${download ? "attachment" : "inline"}; filename="${filename}.pdf"`
    );
    res.setHeader("Cache-Control", "no-store");

    return res.status(200).send(pdf);
  } catch (err) {
    console.error("PDF ERROR", err);
    return res.status(500).json({
      message: "Error generating PDF",
      error: err?.message || "Unknown",
      code: err?.code || "FUNCTION_INVOCATION_FAILED",
      when: new Date().toISOString()
    });
  }
};
