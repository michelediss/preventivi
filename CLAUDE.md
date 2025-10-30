# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Preventivi Generator** - a Node.js serverless application deployed on Vercel that generates customized PDF quotations (preventivi) from Airtable data using Puppeteer and Chromium.

The application fetches project, client, task, and subscription data from Airtable, populates an HTML template, and renders it as a single-page PDF document.

## Key Commands

### Development
```bash
npm run dev          # Start local Vercel development server
```

### Deployment
- Deployment is automatic via Vercel when pushing to the repository
- The build command is intentionally skipped (`npm run build` outputs "skip")

### Environment Setup
```bash
cp .env.example .env  # Create environment file
```

## Architecture

### Deployment Model
This is a **Vercel serverless function** application (not a traditional Express server):
- Main logic: `app.js` - Contains HTML builder and Airtable data fetching
- Serverless function: `api/generate-pdf.js` - Vercel function handler that uses Puppeteer to render PDFs
- Configuration: `vercel.json` - Defines function settings (1024MB memory, 60s timeout)
- Static files: `public/index.html` - Simple web interface for PDF generation
- Template: `template.html` - HTML template for PDF rendering (included via `vercel.json`)

### Core Flow
1. User accesses `/generate-pdf?domain=<text-domain>` or submits form on landing page
2. `api/generate-pdf.js` handler is invoked
3. Calls `buildPreventivoHtml(domain)` from `app.js` to:
   - Query Airtable for project by `text domain` field
   - Fetch related records: clients, tasks, accounts, personal info
   - Populate `template.html` with data
   - Return populated HTML
4. Launch headless Chromium via `@sparticuz/chromium` and `puppeteer-core`
5. Render HTML to single-page PDF with dynamic height
6. Return PDF as inline response

### Airtable Schema
The application uses multiple interconnected Airtable tables (see `schema.json`):
- **progetti** (projects): Main project records with text domain, pricing, delivery terms
- **clienti** (clients): Client information (name, address, VAT number)
- **tasks**: Work items with descriptions and pricing
- **accounts**: Recurring subscriptions/services (hosting, domains, plugins)
- **personal**: Personal/business information of the service provider

Key fields referenced in code:
- Projects use `text domain` field as unique identifier
- Projects link to multiple `tasks` and `accounts` via record links
- Pricing fields: `lordo` (gross), `costi annuali` (annual costs), `scontistica` (discount), `anticipo` (deposit)

### PDF Generation Strategy
The app generates **single continuous-page PDFs** rather than multi-page documents:
- Dynamic height calculation based on content
- Width fixed at 210mm (A4 width)
- Max height capped at ~196 inches to avoid Chrome rendering limits
- Uses `pageRanges: "1"` to ensure single page output
- Print styles injected to prevent page breaks

## Important Implementation Details

### Airtable Connection
- Credentials via environment variables: `AIRTABLE_BASE_ID`, `AIRTABLE_API_KEY`
- Lazy initialization pattern for base connection
- Filter by formula syntax: `{text domain}='value'`
- Record links resolved by fetching linked record IDs

### Template Population
- Simple string replacement approach using `{{placeholder}}` syntax
- Date formatting in Italian: "31 Gennaio 2025"
- Automatic date calculation: issue date = today, valid until = today + 30 days
- Special handling for percentage formatting
- Tables populated by generating HTML rows for tasks and accounts

### Debug System
The app includes a comprehensive debug system controlled by environment variables:
- `DEBUG_ENABLED`: Master switch
- `DEBUG_SAVE_FILES`: Save debug output to `debug_output/` directory
- `DEBUG_SAVE_RESPONSES`: Save Airtable API responses
- `DEBUG_SAVE_TEMPLATE_DATA`: Save template data JSON
- `DEBUG_SAVE_HTML`: Save populated HTML before PDF rendering
- `DEBUG_VERBOSE_LOGGING`: Enable verbose console logs

### File Path Handling
Template loading tries multiple paths to support both local and Vercel environments:
1. `__dirname + template.html`
2. `process.cwd() + template.html`
3. `./template.html`

The `vercel.json` config includes `"includeFiles": "template.html"` to ensure the template is bundled with the function.

## Common Development Patterns

### Adding New Data Fields
When adding new fields from Airtable to the PDF:
1. Add field reference in `app.js` `buildPreventivoHtml()` function
2. Add to `templateData` object
3. Add `{{placeholder}}` in `template.html`
4. Add replacement logic in `populateTemplate()` function

### Modifying PDF Layout
- Edit `template.html` for content/structure changes
- Styles are in `<style>` tag in template (uses Tailwind CSS via CDN)
- Print-specific styles injected by `populateTemplate()` function
- Test with debug mode enabled to save HTML before PDF rendering

### Chromium Configuration
Uses `@sparticuz/chromium` (optimized for serverless):
- Pre-configured args, viewport, and executable path
- Font loading with `document.fonts.ready` check
- `networkidle0` wait strategy for complete page load
- Screen media emulation (not print) for better styling control

## Node.js Version
- **Requires Node.js 22.x** (specified in `package.json` engines)
- Uses newer JavaScript features (optional chaining, nullish coalescing)
