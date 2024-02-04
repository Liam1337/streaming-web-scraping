const puppeteer = require('puppeteer');
const chalk = require('chalk');
const fs = require('fs');
const express = require('express');

const app = express();
let configData = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const urls = configData.urls;
const intervalInSeconds = configData.intervalInSeconds;
const port = configData.port || 3000;
const redirect = configData.redirect;

function logMessage(message, type = 'INFO') {
    const timestamp = new Date().toLocaleString();
    switch (type) {
        case 'ERROR':
            console.log(chalk.red(`[${timestamp}] [${type}] ${message}`));
            break;
        case 'SUCCESS':
            console.log(chalk.green(`[${timestamp}] [${type}] ${message}`));
            break;
        default:
            console.log(`[${timestamp}] [${type}] ${message}`);
    }
}

async function fetchM3U8Url(page, url) {
    try {
        const requests = [];
        page.on('request', request => {
            if (request.url().includes('index.m3u8')) { // scrape für die Index Datei
                requests.push(request.url());
            }
        });

        await page.goto(url, { waitUntil: 'networkidle2' });

        if (requests.length > 0) {
            return requests[0];
        } else {
            return null;
        }
    } catch (error) { // nix gut
        logMessage(`Fehler beim Abrufen der URL ${url}: ${error.message}`, 'ERROR');
        return null;
    }
}

async function fetchM3U8Urls(urls) {
    logMessage('Starte Browser-Engine...', 'INFO');
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'] // sandnox error wegen browser dings
    });

    const page = await browser.newPage();
    let m3u8Urls = {};

    for (let url of urls) {
        logMessage(`Suche nach M3U8 URL in: ${url}`);
        const m3u8Url = await fetchM3U8Url(page, url);
        const channel = url.match(/\/([^\/]+)\/$/)[1]; // fix
        if (m3u8Url) {
            m3u8Urls[channel] = m3u8Url;
            logMessage(`Gefunden: ${m3u8Url}`, 'SUCCESS');
        } else {
            logMessage(`Keine M3U8 URL gefunden für: ${url}`, 'ERROR');
        }
    }

    await browser.close();
    return m3u8Urls;
}

function setupRoutes() {
    // Spezifische Route für jeden Kanal
    Object.keys(configData.foundUrls || {}).forEach(channel => {
        app.get(`/${channel}`, (req, res) => {
            if (redirect && configData.foundUrls[channel]) {
                res.redirect(configData.foundUrls[channel]);
            } else {
                res.json({ [channel]: configData.foundUrls[channel] || 'Nicht gefunden' });
            }
        });
    });
}

function startInterval() {
    fetchM3U8Urls(urls).then(foundUrls => {
        logMessage('Should work', 'INFO');
        logMessage(`Gefunden: ${Object.keys(foundUrls).length} von ${urls.length}`, 'INFO');
        configData.foundUrls = foundUrls;
        fs.writeFileSync('config.json', JSON.stringify(configData, null, 2));
        setupRoutes();
    });

    setTimeout(startInterval, intervalInSeconds * 1000);
}

// Express-Server zum Anzeigen der URLs
app.get('/', (req, res) => {
    res.json(configData.foundUrls || {});
});

app.listen(port, () => {
    logMessage(`Server läuft auf Port ${port}`, 'INFO');
});

logMessage('Starte script...', 'INFO');
startInterval();