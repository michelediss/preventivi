# Preventivi Generator

A Node.js application that generates customized preventivi (quotations/estimates) from Airtable data using Puppeteer.

## Features

- Fetches data from Airtable using the Airtable API
- Generates PDFs using HTML templates with Puppeteer
- Includes a web server for viewing and generating PDFs
- Configurable debug options for development and troubleshooting

## Prerequisites

- Node.js 16+ 
- NPM or Yarn
- An Airtable account with proper base structure

## Installation

1. Clone the repository
```bash
git clone https://github.com/yourusername/your-repo-name.git
cd your-repo-name
```

2. Install dependencies
```bash
npm install
```

3. Create a `.env` file (copy from `.env.example`)
```bash
cp .env.example .env
```

4. Update the `.env` file with your Airtable credentials

## Usage

### Starting the Server

```bash
npm start
```

This will start the server at http://localhost:3000 (or the port specified in your .env file).

### Generating a PDF

Visit http://localhost:3000 and click on "Generate PDF" to create a quotation based on the default template.

## Project Structure

- `app.js` - Main application logic for generating PDFs
- `server.js` - Express server for web interface
- `template.html` - HTML template for the quotations
- `debug_output/` - Directory for debug files (if enabled)

## Development

The project follows a standard Git workflow:

- `dev` branch for development work
- `master` branch for production code

All changes should be made on feature branches from `dev` and merged back via pull requests.

## Deployment

This project uses GitHub Actions for automated deployment to cPanel. When changes are merged from `dev` to `master`, the application is automatically deployed to the production server.

For manual deployment, upload the files to your server and ensure the necessary dependencies are installed.

## Configuration

The application can be configured using environment variables. See `.env.example` for available options.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request against the `dev` branch