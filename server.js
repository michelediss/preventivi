const http = require('http');
const path = require('path');
const fs = require('fs');
const url = require('url');
const { exec } = require('child_process');

// Import the PDF generation functionality
const pdfGenerator = require('./app.js');

// Create HTTP server
const server = http.createServer((req, res) => {
  // Parse the URL to get query parameters
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const queryParams = parsedUrl.query;
  
  // Check if there's a textDomain in the URL query (e.g. /?casawa)
  const textDomain = Object.keys(queryParams)[0] || '';
  
  // Basic routing
  if (pathname === '/' || pathname === '/index.html') {
    // If there's a textDomain in the URL, generate the PDF automatically
    if (textDomain && textDomain !== 'favicon.ico') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      
      // Run the PDF generation with the provided textDomain
      pdfGenerator.generatePreventivo(textDomain)
        .then(result => {
          res.end(`<html><body>
            <h2>PDF Generation ${result.success ? 'Successful' : 'Failed'}</h2>
            <p>${result.message}</p>
            ${result.success ? `<p><a href="/debug_output/${result.filename}.pdf" target="_blank">View PDF</a></p>` : ''}
            <p><a href="/">Back to Home</a></p>
          </body></html>`);
        })
        .catch(error => {
          res.end(`<html><body>
            <h2>PDF Generation Failed</h2>
            <p>Error: ${error.message}</p>
            <p><a href="/">Back to Home</a></p>
          </body></html>`);
        });
    } else {
      // Main page - offer options to generate a PDF
      res.writeHead(200, { 'Content-Type': 'text/html' });
      fs.readFile(path.join(__dirname, 'index.html'), (err, content) => {
        if (err) {
          res.writeHead(500);
          res.end(`Error loading index.html: ${err.message}`);
          return;
        }
        res.end(content);
      });
    }
  } else if (pathname === '/generate-pdf') {
    // For simple form submissions or direct API calls
    res.writeHead(200, { 'Content-Type': 'text/html' });
    
    // Get the textDomain from the form, or use default
    const domainToGenerate = queryParams.domain || 'casawa';
    
    // Run the PDF generation
    pdfGenerator.generatePreventivo(domainToGenerate)
      .then(result => {
        res.end(`<html><body>
          <h2>PDF Generation ${result.success ? 'Successful' : 'Failed'}</h2>
          <p>${result.message}</p>
          ${result.success ? `<p><a href="/debug_output/${result.filename}.pdf" target="_blank">View PDF</a></p>` : ''}
          <p><a href="/">Back to Home</a></p>
        </body></html>`);
      })
      .catch(error => {
        res.end(`<html><body>
          <h2>PDF Generation Failed</h2>
          <p>Error: ${error.message}</p>
          <p><a href="/">Back to Home</a></p>
        </body></html>`);
      });
  } else if (pathname.startsWith('/debug_output/')) {
    // Serve generated PDFs and debug files
    const filePath = path.join(__dirname, pathname);
    const extname = path.extname(filePath);
    
    // Set content type based on file extension
    let contentType = 'text/html';
    switch (extname) {
      case '.pdf':
        contentType = 'application/pdf';
        break;
      case '.png':
        contentType = 'image/png';
        break;
      case '.json':
        contentType = 'application/json';
        break;
    }
    
    // Read and serve the file
    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404);
        res.end(`File not found: ${filePath}`);
        return;
      }
      
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  } else {
    // 404 for everything else
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end('<html><body><h1>404 Not Found</h1><p><a href="/">Back to Home</a></p></body></html>');
  }
});

// Set the port to listen on (use environment port or default to 3000)
const PORT = process.env.PORT || 3000;

// Start the server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});