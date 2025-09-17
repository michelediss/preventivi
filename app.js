// app.js — versione per Vercel: niente Puppeteer, solo HTML builder
require("dotenv").config();

const Airtable = require("airtable");
const fs = require("fs");
const path = require("path");

// -----------------------------
// DEBUG (spento di default)
// -----------------------------
const DEBUG = {
  enabled: process.env.DEBUG_ENABLED === "true",
  saveFiles: process.env.DEBUG_SAVE_FILES === "true",
  saveResponses: process.env.DEBUG_SAVE_RESPONSES === "true",
  saveTemplateData: process.env.DEBUG_SAVE_TEMPLATE_DATA === "true",
  saveHtml: process.env.DEBUG_SAVE_HTML === "true",
  verboseLogging: process.env.DEBUG_VERBOSE_LOGGING === "true",
  directory: path.join(__dirname, "debug_output"),
  _ensureDir() {
    if (this.enabled && this.saveFiles && !fs.existsSync(this.directory)) {
      fs.mkdirSync(this.directory, { recursive: true });
    }
  },
  log(msg) { if (this.enabled && this.verboseLogging) console.log("[DEBUG]", msg); },
  error(msg, err) {
    console.error("[ERROR]", msg, err?.message);
    if (this.enabled && this.saveFiles) {
      this._ensureDir();
      fs.writeFileSync(
        path.join(this.directory, "error_log.json"),
        JSON.stringify({ timestamp: new Date().toISOString(), message: msg, error: { message: err?.message, stack: err?.stack } }, null, 2)
      );
    }
  },
  saveToFile(filename, content, asJson = false) {
    if (!(this.enabled && this.saveFiles)) return;
    this._ensureDir();
    fs.writeFileSync(path.join(this.directory, filename), asJson ? JSON.stringify(content, null, 2) : content);
  }
};

// -----------------------------
// Airtable init (lazy)
// -----------------------------
let _airtableBase = null;
function getAirtableBase() {
  if (_airtableBase) return _airtableBase;
  const BASE_ID = process.env.AIRTABLE_BASE_ID;
  const TOKEN = process.env.AIRTABLE_API_KEY;
  if (!BASE_ID || !TOKEN) throw new Error("AIRTABLE_BASE_ID o AIRTABLE_API_KEY mancanti");
  Airtable.configure({ apiKey: TOKEN });
  _airtableBase = Airtable.base(BASE_ID);
  return _airtableBase;
}

// -----------------------------
// Template loader (cache)
// -----------------------------
let _templateHtml = null;
function loadTemplate() {
  if (_templateHtml) return _templateHtml;
  const candidates = [
    path.join(__dirname, "template.html"),
    path.join(process.cwd(), "template.html"),
    "template.html"
  ];
  for (const p of candidates) {
    try {
      _templateHtml = fs.readFileSync(p, "utf8");
      DEBUG.log(`template.html letto da: ${p}`);
      return _templateHtml;
    } catch {}
  }
  throw new Error("template.html non trovato. Controlla vercel.json includeFiles e il percorso.");
}

// -----------------------------
// Airtable helpers
// -----------------------------
async function getProjectByTextDomain(textDomain) {
  const base = getAirtableBase();
  const records = await base("progetti").select({ filterByFormula: `{text domain}='${textDomain}'` }).all();
  const result = { records: records.map(r => ({ id: r.id, fields: r.fields })) };
  if (DEBUG.saveResponses) DEBUG.saveToFile(`project_${textDomain}.json`, result, true);
  return result;
}
async function getRecordsByIds(table, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const base = getAirtableBase();
  const parts = ids.map(id => `RECORD_ID()='${id}'`);
  const formula = parts.length > 1 ? `OR(${parts.join(",")})` : parts[0];
  const recs = await base(table).select({ filterByFormula: formula }).all();
  const out = recs.map(r => ({ id: r.id, fields: r.fields }));
  if (DEBUG.saveResponses) DEBUG.saveToFile(`${table}_records.json`, out, true);
  return out;
}
async function getAllRecords(table) {
  const base = getAirtableBase();
  const recs = await base(table).select().all();
  const out = recs.map(r => ({ id: r.id, fields: r.fields }));
  if (DEBUG.saveResponses) DEBUG.saveToFile(`all_${table}.json`, out, true);
  return out;
}

// -----------------------------
// Template helpers
// -----------------------------
function formatPercentage(value) {
  if (value === "N/A") return value;
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  if (typeof value === "string" && value.includes("%")) return value;
  return num < 1 ? Math.round(num * 100) + "%" : Math.round(num) + "%";
}
function populateTemplate(template, data) {
  let html = template;

  // date
  const itDate = d => {
    const m = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
    return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear()}`;
  };
  const today = new Date();
  const valid = new Date(today); valid.setDate(valid.getDate() + 30);

  html = html.replace("data di emissione</p>", `data di emissione: <span class="font-semibold">${itDate(today)}</span></p>`);
  html = html.replace("valido fino al</p>", `valido fino al: <span class="font-semibold">${itDate(valid)}</span></p>`);

  // fornitore
  html = html.replace("{{fornitoreNome}}", data.personalData["nome e cognome"] || "N/A");
  html = html.replace("{{fornitoreIndirizzo}}", `${data.personalData["indirizzo (domicilio)"] || "N/A"} ${data.personalData["civico (domicilio)"] || ""}`);
  html = html.replace("{{fornitoreComune}}", `${data.personalData["CAP (domicilio)"] || "N/A"} - ${data.personalData["comune (domicilio)"] || "N/A"} (${data.personalData["provincia (domicilio)"] || "N/A"})`);
  html = html.replace("{{fornitorePiva}}", `${data.personalData["p. IVA"] || "N/A"}`);

  // footer fornitore
  html = html.replace("{{footer-fornitoreNome}}", data.personalData["nome e cognome"] || "N/A");
  html = html.replace("{{footer-fornitoreIndirizzo}}", `${data.personalData["indirizzo (domicilio)"] || "N/A"} ${data.personalData["civico (domicilio)"] || ""}`);
  html = html.replace("{{footer-fornitoreComune}}", `${data.personalData["CAP (domicilio)"] || "N/A"} - ${data.personalData["comune (domicilio)"] || "N/A"} (${data.personalData["provincia (domicilio)"] || "N/A"})`);
  html = html.replace("{{footer-fornitorePaese}}", data.personalData["paese (domicilio)"] || "N/A");
  html = html.replace("{{footer-fornitorePiva}}", `${data.personalData["p. IVA"] || "N/A"}`);
  html = html.replace("{{footer-fornitoreIban}}", `${data.personalData["IBAN"] || "N/A"}`);
  html = html.replace("{{footer-fornitoreMail}}", `${data.personalData.email || "N/A"}`);
  html = html.replace("{{footer-fornitoreSitoWeb}}", `${data.personalData["sito web"] || "N/A"}`);

  // cliente
  html = html.replace("{{clienteNome}}", data.nomeCliente || "N/A");
  html = html.replace("{{clienteIndirizzo}}", `${data.indirizzo || "N/A"} ${data.civico || ""}`);
  html = html.replace("{{clienteComune}}", `${data.cap || "N/A"} ${data.comune || "N/A"} (${data.provincia || "N/A"})`);
  html = html.replace("{{clientePiva}}", `${data.piva || "N/A"}`);

  // progetto e costi
  html = html.replace("{{progettoTitolo}}", data.progetto || "N/A");
  html = html.replace("{{progettoOggetto}}", data.oggetto || "N/A");
  html = html.replace("{{costoSviluppo}}", `${data.progettoLordo || "0"}`);
  html = html.replace("{{costoRicorrente}}", `${data.costiAnnuali || "0"}`);
  html = html.replace("{{costoTotale}}", `${data.lordoCosti || "0"}`);
  html = html.replace("{{migliorPrezzo}}", `${data.migliorPrezzo || "0"}`);
  html = html.replace("{{scontistica}}", `${data.scontistica || "0"}`);
  html = html.replace("{{tempiConsegna}}", `<span class="font-medium">Tempi di consegna:</span> ${data.tempiDiConsegna || "N/A"}`);
  html = html.replace("{{condizioniPagamento}}",
    `<span class="font-medium">Condizioni di pagamento:</span> ${
      (data.condizioniDiPagamento || "N/A").replace(
        "__anticipo_placeholder__",
        `<span>${formatPercentage(data.anticipoPerc)} (€ ${data.anticipo})</span>`
      )
    }`
  );

  // lavorazioni
  const lavorazioniRows = Array.isArray(data.tasks)
    ? data.tasks.map((task, index) => {
        const t = task.fields || {};
        const bg = index % 2 === 1 ? "" : "bg-slate-100";
        return `
          <tr class="${bg}">
            <td class="px-4 py-2 text-sm">
              <div class="text-base font-bold">${t.tasks || "N/A"}</div>
              <div class="text-sm">${t.descrizione || ""}</div>
            </td>
            <td class="px-4 py-2 text-lg text-sm font-semibold">€ ${t.lordo || "N/A"}</td>
          </tr>`;
      }).join("")
    : "<tr><td colspan='2' class='px-4 py-2 text-sm'>Nessuna lavorazione disponibile</td></tr>";
  html = html.replace("{{lavorazioniCorpo}}", lavorazioniRows);
  html = html.replace("{{lavorazioniSubtotale}}", `<p class="text-base px-4">SUBTOTALE:<span class="text-2xl font-semibold"> € ${data.progettoLordo || "0"}</span></p>`);

  // sottoscrizioni
  const sottoscrizioniRows = Array.isArray(data.accounts)
    ? data.accounts.map((account, index) => {
        const a = account.fields || {};
        const bg = index % 2 === 1 ? "" : "bg-slate-100";
        return `
          <tr class="${bg}">
            <td class="px-4 py-2 text-sm font-bold">${a.servizio || "N/A"}</td>
            <td class="px-4 py-2 text-xs uppercase">${a.tipologia || "N/A"}</td>
            <td class="px-4 py-2 text-sm">${a.descrizione || "N/A"}</td>
            <td class="px-4 py-2 text-lg text-sm font-semibold">€ ${a["importo annuale"] || "N/A"}</td>
          </tr>`;
      }).join("")
    : "<tr><td colspan='4' class='px-4 py-2 text-sm'>Nessuna sottoscrizione disponibile</td></tr>";
  html = html.replace("{{sottoscrizioniCorpo}}", sottoscrizioniRows);
  html = html.replace("{{sottoscrizioniSubtotale}}", `<p class="text-base px-4">SUBTOTALE:<span class="text-2xl font-semibold">  € ${data.costiAnnuali || "0"}</span></p>`);

  // print styles
  const printStyles = `
    <style>
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      /* Niente paginazione: una sola pagina */
      @page { size: auto; margin: 0; }
      html, body { width: 210mm; margin: 0; padding: 0; }
      #container { width: 210mm; page-break-inside: avoid !important; }
      .no-break { page-break-inside: avoid !important; }
    </style>`;
  html = html.replace("</head>", `${printStyles}</head>`);
  html = html.replace('<div id="container"', '<div id="container" class="no-break"');

  return html;
}

// -----------------------------
// Builder HTML per la Function
// -----------------------------
async function buildPreventivoHtml(textDomain) {
  const projectData = await getProjectByTextDomain(textDomain);
  if (!projectData.records?.length) throw new Error(`Nessun progetto con text domain: ${textDomain}`);

  const personals = await getAllRecords("personal");
  const project = projectData.records[0];
  const f = project.fields || {};

  const clients = await getRecordsByIds("clienti", Array.isArray(f.cliente) ? f.cliente : []);
  const tasks = await getRecordsByIds("tasks", Array.isArray(f.tasks) ? f.tasks : []);
  const accounts = await getRecordsByIds("accounts", Array.isArray(f.accounts) ? f.accounts : []);
  const projectPersonals = await getRecordsByIds("personal", Array.isArray(f.personal) ? f.personal : []);

  const personalData = projectPersonals.length ? projectPersonals[0].fields : personals.length ? personals[0].fields : {};
  const c = clients.length ? clients[0].fields : {};

  const templateData = {
    personalData,
    nomeCliente: c["Nome e cognome / Ragione sociale"] || "N/A",
    indirizzo: c["indirizzo"] || "N/A",
    civico: c["civico"] || "N/A",
    cap: c["CAP"] || "N/A",
    comune: c["comune"] || "N/A",
    provincia: c["provincia"] || "N/A",
    piva: c["p. IVA"] || "N/A",
    progetto: f["progetto"] || "N/A",
    oggetto: f["oggetto"] || "N/A",
    progettoLordo: f["lordo"] || "0",
    tempiDiConsegna: f["tempi di consegna"] || "N/A",
    condizioniDiPagamento: f["condizioni di pagamento"] || "N/A",
    lordoCosti: f["lordo + costi"] || "0",
    costiAnnuali: f["costi annuali"] || "0",
    migliorPrezzo: f["miglior prezzo"] || "0",
    scontistica: f["scontistica"] || "0",
    anticipoPerc: f["anticipo perc"] || "0",
    anticipo: f["anticipo"] || "0",
    tasks, accounts
  };

  if (DEBUG.saveTemplateData) DEBUG.saveToFile(`${textDomain}_template_data.json`, templateData, true);

  const template = loadTemplate();
  const html = populateTemplate(template, templateData);
  if (DEBUG.saveHtml) DEBUG.saveToFile(`${textDomain}.html`, html);

  const filename = `preventivo_${f["text domain"] || textDomain}`;
  return { html, filename, projectData: { progetto: templateData.progetto, nomeCliente: templateData.nomeCliente, textDomain } };
}

module.exports = { buildPreventivoHtml };
