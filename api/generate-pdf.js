// server.js (per Vercel: sposta questo file in api/generate-pdf.js)
const path = require("path");
const fs = require("fs");
const http = require("http");
const url = require("url");

const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");
const { buildPreventivoHtml } = require("../app");

// Genera un Buffer PDF da HTML
async function renderPdfBuffer(html) {
  const executablePath = await chromium.executablePath();
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: chromium.headless
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });
  const pdf = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" }
  });
  await browser.close();
  return pdf;
}

// Handler serverless compatibile con Vercel
async function handler(req, res) {
  try {
    // Supporta ?domain= e anche ?casawa
    const q = req.query || {};
    const domain =
      q.domain ||
      q.textDomain ||
      Object.keys(q)[0] ||
      process.env.DEFAULT_TEXT_DOMAIN ||
      "casawa";

    const { html, filename } = await buildPreventivoHtml(domain);
    const pdf = await renderPdfBuffer(html);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}.pdf"`);
    res.statusCode = 200;
    res.end(pdf);
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      message: "Error generating PDF",
      error: err.message,
      timestamp: new Date().toISOString()
    }));
  }
}

module.exports = handler;

// Avvio locale opzionale: `node server.js`
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  const server = http.createServer(async (req, res) => {
    const parsed = url.parse(req.url, true);

    if (parsed.pathname === "/" || parsed.pathname === "/index.html") {
      fs.readFile(path.join(__dirname, "index.html"), (err, content) => {
        if (err) { res.statusCode = 500; return res.end("Errore index.html"); }
        res.setHeader("Content-Type", "text/html");
        res.end(content);
      });
      return;
    }

    if (parsed.pathname === "/generate-pdf") {
      // Adatta req per riusare l'handler
      req.query = parsed.query;
      await handler(req, res);
      return;
    }

    res.statusCode = 404;
    res.end("Not found");
  });

  server.listen(PORT, () => {
    console.log(`Dev server http://localhost:${PORT}`);
    console.log(`PDF: http://localhost:${PORT}/generate-pdf?domain=casawa`);
  });
}
