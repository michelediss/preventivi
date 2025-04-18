// Load environment variables from .env file
require('dotenv').config();

const Airtable = require("airtable");
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

// ===================================================
// DEBUG CONFIGURATION SECTION - EASY TO TOGGLE ON/OFF
// ===================================================
const DEBUG = {
  enabled: process.env.DEBUG_ENABLED === 'true' || true,              // Master switch to enable/disable all debugging
  saveFiles: process.env.DEBUG_SAVE_FILES === 'true' || true,            // Save debug files to disk
  saveResponses: process.env.DEBUG_SAVE_RESPONSES === 'true' || true,        // Save API responses
  saveTemplateData: process.env.DEBUG_SAVE_TEMPLATE_DATA === 'true' || true,     // Save template data
  saveHtml: process.env.DEBUG_SAVE_HTML === 'true' || true,             // Save generated HTML
  screenshot: process.env.DEBUG_SCREENSHOT === 'true' || true,           // Take screenshot during PDF generation
  verboseLogging: process.env.DEBUG_VERBOSE_LOGGING === 'true' || true,       // Enable verbose console logging
  
  // Debug directory configuration
  directory: path.join(__dirname, "debug_output"),
  
  // Initialize debug environment
  init() {
    if (!this.enabled) return;
    
    // Create debug directory if it doesn't exist
    if (this.saveFiles && !fs.existsSync(this.directory)) {
      fs.mkdirSync(this.directory, { recursive: true });
      this.log(`Debug directory created: ${this.directory}`);
    }
  },
  
  // Logging function
  log(message) {
    if (!this.enabled || !this.verboseLogging) return;
    console.log(`[DEBUG] ${message}`);
  },
  
  // Error logging
  error(message, error) {
    if (!this.enabled) return;
    console.error(`[ERROR] ${message}`, error);
    
    if (this.saveFiles) {
      this.saveToFile("error_log.json", {
        timestamp: new Date().toISOString(),
        message: message,
        error: {
          message: error.message,
          stack: error.stack,
        },
      }, true);
    }
  },
  
  // Save content to file
  saveToFile(filename, content, isJson = false) {
    if (!this.enabled || !this.saveFiles) return false;
    
    const filePath = path.join(this.directory, filename);
    try {
      if (isJson) {
        fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
      } else {
        fs.writeFileSync(filePath, content);
      }
      this.log(`File saved: ${filePath}`);
      return true;
    } catch (error) {
      console.error(`Error saving file ${filename}:`, error);
      return false;
    }
  },
  
  // Take screenshot during PDF generation
  async takeScreenshot(page, baseFilename) {
    if (!this.enabled || !this.screenshot) return;
    
    try {
      await page.screenshot({
        path: path.join(this.directory, `${baseFilename}_screenshot.png`),
        fullPage: true,
      });
      this.log(`Screenshot saved: ${baseFilename}_screenshot.png`);
    } catch (error) {
      this.error(`Failed to take screenshot for ${baseFilename}`, error);
    }
  },
  
  // Save API response
  saveResponse(name, data) {
    if (!this.enabled || !this.saveResponses) return;
    this.saveToFile(`${name}.json`, data, true);
  },
  
  // Log page dimensions
  logDimensions(dimensions) {
    if (!this.enabled || !this.verboseLogging) return;
    this.log(`Page dimensions: ${dimensions.width}x${dimensions.height}`);
  }
};

// Initialize debug environment
DEBUG.init();

// Leggi il template HTML dal file
const templateHtml = fs.readFileSync("template.html", "utf8");

// Configurazione API Airtable usando variabili d'ambiente
const BASE_ID = process.env.AIRTABLE_BASE_ID || "appI4MDJQWhoZd8EA";
const TOKEN = process.env.AIRTABLE_API_KEY || "patJApgGRy7CIodkT.058cabd6e2f225b589887a20fba5d6735dccb1151f160142b73d401a5253b9fd";

// Inizializza Airtable
Airtable.configure({ apiKey: TOKEN });
const base = Airtable.base(BASE_ID);

// ===================================================
// API FUNCTIONS
// ===================================================

async function getProjectByTextDomain(textDomain) {
  DEBUG.log(`Fetching project with text domain: ${textDomain}`);
  
  try {
    // Airtable.js .all() method returns a Promise that resolves to all records
    const records = await base('progetti')
      .select({
        filterByFormula: `{text domain}='${textDomain}'`
      })
      .all();
    
    // Transform to match the previous format expected by the rest of the code
    const formattedRecords = records.map(record => {
      return {
        id: record.id,
        fields: record.fields
      };
    });
    
    const result = { records: formattedRecords };
    DEBUG.saveResponse(`project_${textDomain}`, result);
    return result;
  } catch (error) {
    DEBUG.error(`Error fetching project: ${textDomain}`, error);
    return null;
  }
}

async function getRecordsByIds(table, recordIds) {
  // Check if recordIds is an array and not empty
  if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
    DEBUG.log(`No valid record IDs provided for table: ${table}`);
    return [];
  }
  
  DEBUG.log(`Fetching ${recordIds.length} records from '${table}'`);
  
  try {
    // Alternative approach: Use filterByFormula instead of individual finds
    // This is more efficient for multiple records
    const formulaParts = recordIds.map(id => `RECORD_ID()='${id}'`);
    const formula = formulaParts.length > 1 ? `OR(${formulaParts.join(",")})` : formulaParts[0];
    
    DEBUG.log(`Using formula: ${formula}`);
    
    const records = await base(table)
      .select({
        filterByFormula: formula
      })
      .all();
    
    // Format records to match expected structure
    const validRecords = records.map(record => ({
      id: record.id,
      fields: record.fields
    }));
    
    DEBUG.log(`Successfully fetched ${validRecords.length} records from '${table}'`);
    DEBUG.saveResponse(`${table}_records`, validRecords);
    return validRecords;
  } catch (error) {
    DEBUG.error(`Error fetching records from ${table}`, error);
    return [];
  }
}

async function getAllRecords(table) {
  DEBUG.log(`Fetching all records from '${table}'`);
  
  try {
    const records = await base(table).select().all();
    
    // Format records to match expected structure
    const formattedRecords = records.map(record => ({
      id: record.id,
      fields: record.fields
    }));
    
    DEBUG.saveResponse(`all_${table}`, formattedRecords);
    return formattedRecords;
  } catch (error) {
    DEBUG.error(`Error fetching all records from ${table}`, error);
    return [];
  }
}

// ===================================================
// TEMPLATE POPULATION FUNCTIONS
// ===================================================

function formatPercentage(value) {
  // Se il valore è "N/A", restituiscilo così com'è
  if (value === "N/A") return value;
  
  // Prova a convertire il valore in un numero
  const num = parseFloat(value);
  
  // Se non è un numero valido, restituisci il valore originale
  if (isNaN(num)) return value;
  
  // Se il valore è già formattato come percentuale (es. "25%"), restituiscilo così com'è
  if (typeof value === 'string' && value.includes('%')) return value;
  
  // Se il valore è minore di 1, è probabile che sia già in formato decimale (es. 0.25)
  if (num < 1) {
    // Converti in percentuale moltiplicando per 100
    return Math.round(num * 100) + '%';
  } else {
    // Se è già un numero intero o maggiore di 1, presumiamo che sia già una percentuale
    return Math.round(num) + '%';
  }
}

function populateTemplate(template, data) {
  let populated = template;
  
  // Calcolo date per il preventivo
  const oggi = new Date();
  const dataEmissione = formatDate(oggi);
  
  // Data di validità: oggi + 30 giorni
  const dataValidita = new Date(oggi);
  dataValidita.setDate(dataValidita.getDate() + 30);
  const dataValiditaFormattata = formatDate(dataValidita);
  
  // Funzione helper per formattare la data in formato italiano
  function formatDate(date) {
    const giorno = date.getDate();
    const mesi = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 
                 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
    const mese = mesi[date.getMonth()];
    const anno = date.getFullYear();
    return `${giorno} ${mese} ${anno}`;
  }
  
  // Sostituisci i segnaposto delle date nel template
  populated = populated.replace('data di emissione</p>', `data di emissione: <span class="font-semibold">${dataEmissione}</span></p>`);
  populated = populated.replace('valido fino al</p>', `valido fino al: <span class="font-semibold">${dataValiditaFormattata}</span></p>`);
  
  // Sostituzioni per i dati del fornitore
  populated = populated.replace("{{fornitoreNome}}", data.personalData["nome e cognome"] || "N/A");
  populated = populated.replace("{{fornitoreIndirizzo}}", `${data.personalData["indirizzo (domicilio)"] || "N/A"} ${data.personalData["civico (domicilio)"] || ""}`);
  populated = populated.replace("{{fornitoreComune}}", `${data.personalData["CAP (domicilio)"] || "N/A"} - ${data.personalData["comune (domicilio)"] || "N/A"} (${data.personalData["provincia (domicilio)"] || "N/A"})`);
  populated = populated.replace("{{fornitorePiva}}", `${data.personalData["p. IVA"] || "N/A"}`);

  // Aggiunte per i tag del footer
  populated = populated.replace("{{footer-fornitoreNome}}", data.personalData["nome e cognome"] || "N/A");
  populated = populated.replace("{{footer-fornitoreIndirizzo}}", `${data.personalData["indirizzo (domicilio)"] || "N/A"} ${data.personalData["civico (domicilio)"] || ""}`);
  populated = populated.replace("{{footer-fornitoreComune}}", `${data.personalData["CAP (domicilio)"] || "N/A"} - ${data.personalData["comune (domicilio)"] || "N/A"} (${data.personalData["provincia (domicilio)"] || "N/A"})`);
  populated = populated.replace("{{footer-fornitorePaese}}", data.personalData["paese (domicilio)"] || "N/A");
  populated = populated.replace("{{footer-fornitorePiva}}", `${data.personalData["p. IVA"] || "N/A"}`);
  populated = populated.replace("{{footer-fornitoreIban}}", `${data.personalData["IBAN"] || "N/A"}`);
  populated = populated.replace("{{footer-fornitoreMail}}", `${data.personalData.email || "N/A"}`);
  populated = populated.replace("{{footer-fornitoreSitoWeb}}", `${data.personalData["sito web"] || "N/A"}`);

  populated = populated.replace("{{clienteNome}}", data.nomeCliente || "N/A");
  populated = populated.replace("{{clienteIndirizzo}}", `${data.indirizzo || "N/A"} ${data.civico || ""}`);
  populated = populated.replace("{{clienteComune}}", `${data.cap || "N/A"} ${data.comune || "N/A"} (${data.provincia || "N/A"})`);
  populated = populated.replace("{{clientePiva}}", `${data.piva || "N/A"}`);

  populated = populated.replace("{{progettoTitolo}}", data.progetto || "N/A");
  populated = populated.replace("{{progettoOggetto}}", data.oggetto || "N/A");
  populated = populated.replace("{{costoSviluppo}}", `${data.progettoLordo || "0"}`);
  populated = populated.replace("{{costoRicorrente}}", `${data.costiAnnuali || "0"}`);
  populated = populated.replace("{{costoTotale}}", `${data.lordoCosti || "0"}`);
  populated = populated.replace("{{migliorPrezzo}}", `${data.migliorPrezzo || "0"}`);
  populated = populated.replace("{{scontistica}}", `${data.scontistica || "0"}`);
  populated = populated.replace("{{tempiConsegna}}", `<span class="font-medium">Tempi di consegna:</span> ${data.tempiDiConsegna || "N/A"}`);
  populated = populated.replace("{{condizioniPagamento}}", 
    `<span class="font-medium">Condizioni di pagamento:</span> ${
      data.condizioniDiPagamento.replace(
        "__anticipo_placeholder__", 
        `<span>${formatPercentage(data.anticipoPerc)} (€ ${data.anticipo})</span>`
      ) || "N/A"
    }`
  );
  // Genera le righe della tabella per le lavorazioni con righe alternate
  const lavorazioniRows = Array.isArray(data.tasks) 
    ? data.tasks
        .map((task, index) => {
          const t = task.fields || {};
          // Prima riga (index 0) senza colore di sfondo, seconda riga (index 1) con colore, e così via
          const bgClass = index % 2 === 1 ? "" : "bg-slate-100";

          return `
          <tr class="${bgClass}">
            <td class="px-4 py-2 text-sm">
              <div class="text-base font-bold">${t.tasks || "N/A"}</div>
              <div class="text-sm">${t.descrizione || ""}</div>
            </td>
            <td class="px-4 py-2 text-lg text-sm font-semibold">€ ${t.lordo || "N/A"}</td>
          </tr>
        `;
        })
        .join("")
    : "<tr><td colspan='2' class='px-4 py-2 text-sm'>Nessuna lavorazione disponibile</td></tr>";
    
  populated = populated.replace("{{lavorazioniCorpo}}", lavorazioniRows);
  populated = populated.replace("{{lavorazioniSubtotale}}", `<p class="text-base px-4">SUBTOTALE:<span class="text-2xl font-semibold"> € ${data.progettoLordo || "0"}</span></p>`);

  // Genera le righe della tabella per le sottoscrizioni con righe alternate
  const sottoscrizioniRows = Array.isArray(data.accounts)
    ? data.accounts
        .map((account, index) => {
          const a = account.fields || {};
          // Prima riga (index 0) senza colore di sfondo, seconda riga (index 1) con colore, e così via
          const bgClass = index % 2 === 1 ? "" : "bg-slate-100";

          return `
          <tr class="${bgClass}">
            <td class="px-4 py-2 text-sm font-bold">${a.servizio || "N/A"}</td>
            <td class="px-4 py-2 text-xs uppercase">${a.tipologia || "N/A"}</td>
            <td class="px-4 py-2 text-sm">${a.descrizione || "N/A"}</td>
            <td class="px-4 py-2 text-lg text-sm font-semibold">€ ${a["importo annuale"] || "N/A"}</td>
          </tr>
        `;
        })
        .join("")
    : "<tr><td colspan='4' class='px-4 py-2 text-sm'>Nessuna sottoscrizione disponibile</td></tr>";
    
  populated = populated.replace("{{sottoscrizioniCorpo}}", sottoscrizioniRows);
  populated = populated.replace("{{sottoscrizioniSubtotale}}", `<p class="text-base px-4">SUBTOTALE:<span class="text-2xl font-semibold">  € ${data.costiAnnuali || "0"}</span></p>`);

  // Aggiunta per garantire che i colori di sfondo vengano stampati nel PDF
  const printStyles = `
    <style>
      * { 
        -webkit-print-color-adjust: exact !important; 
        print-color-adjust: exact !important;
      }
      .bg-slate-100 { 
        background-color: #f1f5f9 !important;
      }
    </style>
  `;

  // Aggiungi gli stili di stampa all'HTML
  populated = populated.replace("</head>", `${printStyles}</head>`);

  return populated;
}

// ===================================================
// PDF GENERATION FUNCTIONS
// ===================================================

async function generatePDF(htmlContent, baseFilename) {
  // Salva il file HTML originale per debug
  DEBUG.saveToFile(`${baseFilename}.html`, htmlContent);

  // Modifica l'HTML per prevenire interruzioni di pagina
  const modifiedHtml = htmlContent.replace(
    "</head>",
    `
    <style>
      @page { size: auto; margin: 0; }
      body { margin: 0; padding: 0; }
      * { -webkit-print-color-adjust: exact !important; }
      
      /* Forza l'intero contenuto a rimanere su una singola pagina */
      .no-break { page-break-inside: avoid !important; }
    </style>
  </head>
  `
  );

  // Avvolge il contenitore principale con una classe no-break
  const wrappedHtml = modifiedHtml.replace(
    '<div id="container"',
    '<div id="container" class="no-break"'
  );

  // Salva anche l'HTML modificato per debug
  DEBUG.saveToFile(`${baseFilename}_modified.html`, wrappedHtml);

  try {
    // Avvia browser con debug logs
    DEBUG.log("Starting Puppeteer browser...");
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    DEBUG.log("Creating new page...");
    const page = await browser.newPage();

    DEBUG.log("Loading HTML content...");
    await page.setContent(wrappedHtml, { waitUntil: "networkidle0" });

    DEBUG.log("Calculating content dimensions...");
    const dimensions = await page.evaluate(() => {
      return {
        width: document.documentElement.offsetWidth,
        height: document.documentElement.offsetHeight,
      };
    });

    DEBUG.logDimensions(dimensions);

    // Take screenshot for visual debugging
    await DEBUG.takeScreenshot(page, baseFilename);

    DEBUG.log("Generating PDF...");
    const pdfPath = path.join(DEBUG.directory, `${baseFilename}.pdf`);
    await page.pdf({
      path: pdfPath,
      width: "210mm",
      height: `${dimensions.height + 100}px`, // Add extra space
      printBackground: true,
    });

    DEBUG.log("Closing browser...");
    await browser.close();

    DEBUG.log(`PDF generated successfully: ${pdfPath}`);
    return true;
  } catch (error) {
    DEBUG.error("Error generating PDF", error);
    return false;
  }
}

// ===================================================
// MAIN APPLICATION FUNCTION
// ===================================================

async function generatePreventivo(textDomain) {
  try {
    DEBUG.log(`Starting generation for text domain: ${textDomain}`);
    
    const projectData = await getProjectByTextDomain(textDomain);
    if (!projectData || !projectData.records || projectData.records.length === 0) {
      return {
        success: false,
        message: `No project found for text domain: ${textDomain}`,
        filename: null
      };
    }

    DEBUG.log("Fetching personal records...");
    const personals = await getAllRecords("personal");

    const project = projectData.records[0];
    DEBUG.log(`Processing project: ${project.id}`);
    const fields = project.fields || {};
    
    // Debug output to see the raw project fields
    DEBUG.log("Project fields:");
    DEBUG.log(JSON.stringify(fields, null, 2));
    
    // Ensure these are arrays to prevent the TypeError
    const clientIds = Array.isArray(fields.cliente) ? fields.cliente : [];
    const taskIds = Array.isArray(fields.tasks) ? fields.tasks : [];
    const accountIds = Array.isArray(fields.accounts) ? fields.accounts : [];
    
    DEBUG.log(`Account IDs: ${JSON.stringify(accountIds)}`);
    const projectPersonalIds = Array.isArray(fields.personal) ? fields.personal : [];

    DEBUG.log("Fetching client details...");
    const clients = await getRecordsByIds("clienti", clientIds);

    DEBUG.log("Fetching tasks...");
    const tasks = await getRecordsByIds("tasks", taskIds);

    DEBUG.log("Fetching accounts...");
    const accounts = await getRecordsByIds("accounts", accountIds);

    DEBUG.log("Fetching project personal data...");
    const projectPersonals = await getRecordsByIds("personal", projectPersonalIds);

    const personalData =
      projectPersonals.length > 0
        ? projectPersonals[0].fields
        : personals.length > 0
        ? personals[0].fields
        : {};

    const clientInfo = clients.length > 0 ? clients[0].fields : {};
    const nomeCliente = clientInfo["Nome e cognome / Ragione sociale"] || "N/A";
    const indirizzo = clientInfo["indirizzo"] || "N/A";
    const civico = clientInfo["civico"] || "N/A";
    const cap = clientInfo["CAP"] || "N/A";
    const comune = clientInfo["comune"] || "N/A";
    const provincia = clientInfo["provincia"] || "N/A";
    const paese = clientInfo["paese"] || "N/A";
    const piva = clientInfo["p. IVA"] || "N/A";

    const progetto = fields["progetto"] || "N/A";
    const oggetto = fields["oggetto"] || "N/A";
    const progettoLordo = fields["lordo"] || "N/A";
    const tempiDiConsegna = fields["tempi di consegna"] || "N/A";
    const condizioniDiPagamento = fields["condizioni di pagamento"] || "N/A";
    const lordoCosti = fields["lordo + costi"] || "N/A";
    const costiAnnuali = fields["costi annuali"] || "N/A";
    const migliorPrezzo = fields["miglior prezzo"] || "N/A";
    const scontistica = fields["scontistica"] || "N/A";

    const anticipoPerc = fields["anticipo perc"] || "N/A";
    const anticipo = fields["anticipo"] || "N/A";

    // Create template data object
    const templateData = {
      personalData,
      nomeCliente,
      indirizzo,
      civico,
      cap,
      comune,
      provincia,
      paese,
      piva,
      progetto,
      oggetto,
      progettoLordo,
      migliorPrezzo,
      scontistica,
      costiAnnuali,
      lordoCosti,
      tempiDiConsegna,
      condizioniDiPagamento,
      anticipoPerc,  
      anticipo,     
      tasks,
      accounts,
    };

    // Save template data for debugging
    DEBUG.saveToFile(`${textDomain}_template_data.json`, templateData, true);

    DEBUG.log("Compiling HTML template...");
    const htmlContent = populateTemplate(templateHtml, templateData);
    
    // Use a safer way to get the domain for the filename
    const baseFilename = `preventivo_${fields["text domain"] || textDomain}`;
    DEBUG.log(`Starting PDF generation: ${baseFilename}`);

    const success = await generatePDF(htmlContent, baseFilename);
    
    if (success) {
      console.log(`✅ PDF successfully generated: ${baseFilename}.pdf`);
      return {
        success: true,
        message: `PDF successfully generated: ${baseFilename}.pdf`,
        filename: baseFilename
      };
    } else {
      console.error(`❌ Error generating PDF: ${baseFilename}.pdf`);
      return {
        success: false,
        message: `Error generating PDF: ${baseFilename}.pdf`,
        filename: null
      };
    }
  } catch (error) {
    DEBUG.error("Error during execution", error);
    return {
      success: false,
      message: `Error: ${error.message}`,
      filename: null
    };
  }
}

// Function to run the application directly when executed
async function main() {
  try {
    DEBUG.log("Starting application...");
    
    const textDomain = process.env.DEFAULT_TEXT_DOMAIN || "casawa";

    const result = await generatePreventivo(textDomain);
    
    if (result.success) {
      console.log(`✅ ${result.message}`);
    } else {
      console.error(`❌ ${result.message}`);
    }

    DEBUG.log("Processing completed.");
    
    if (DEBUG.enabled) {
      console.log(`All debug files are available in: ${DEBUG.directory}`);
    }
  } catch (error) {
    DEBUG.error("Error during execution", error);
  }
}

// Run the application if executed directly
if (require.main === module) {
  main();
}

// Export functions for server.js to use
module.exports = {
  generatePreventivo
};