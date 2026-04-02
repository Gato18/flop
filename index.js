import fs from 'fs';
import path from 'path';
import http from 'http';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const SITE_PAGE_URL = process.env.SITE_PAGE_URL || 'https://www.arts-et-metiers.net/';
const EXPECTED_BILLETTERIE_URL = normalizeUrl(
    process.env.EXPECTED_BILLETTERIE_URL ||
    'https://www.arts-et-metiers.net/musee/billetterie-en-ligne-temporairement-indisponible'
);
const STATE_FILE = process.env.STATE_FILE || './flop-state.json';
const PORT = process.env.PORT || 3000;
const RUN_ONCE = process.env.RUN_ONCE === 'true';
const CHECK_INTERVAL_MS = getCheckIntervalMs();
const REQUEST_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36'
};
const MISSING_BUTTON_SENTINEL = '__missing_billetterie_button__';

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

function getCheckIntervalMs() {
    const minutes = Number(process.env.CHECK_INTERVAL_MINUTES || 60);

    if (!Number.isFinite(minutes) || minutes <= 0) {
        return 60 * 60 * 1000;
    }

    return minutes * 60 * 1000;
}

function normalizeUrl(rawUrl) {
    try {
        const url = new URL(rawUrl, SITE_PAGE_URL);
        url.hash = '';
        return url.toString();
    } catch {
        return String(rawUrl || '').trim();
    }
}

function loadState() {
    try {
        if (!fs.existsSync(STATE_FILE)) {
            return {
                lastSeenHref: null,
                lastAlertedHref: null
            };
        }

        const rawState = fs.readFileSync(STATE_FILE, 'utf8');
        const parsedState = JSON.parse(rawState);

        return {
            lastSeenHref: parsedState.lastSeenHref || null,
            lastAlertedHref: parsedState.lastAlertedHref || null
        };
    } catch (error) {
        console.error(`[⚠️ AVERTISSEMENT] Impossible de lire ${STATE_FILE} :`, error.message);
        return {
            lastSeenHref: null,
            lastAlertedHref: null
        };
    }
}

function saveState(state) {
    try {
        const directory = path.dirname(STATE_FILE);
        if (directory && directory !== '.') {
            fs.mkdirSync(directory, { recursive: true });
        }

        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    } catch (error) {
        console.error(`[⚠️ AVERTISSEMENT] Impossible d'écrire ${STATE_FILE} :`, error.message);
    }
}

function extractBilletterieHref(html) {
    const anchors = html.matchAll(/<a\b([^>]*)>\s*Billetterie\s*<\/a>/gi);

    for (const anchor of anchors) {
        const attributes = anchor[1] || '';
        const hrefMatch = attributes.match(/\bhref="([^"]+)"/i);

        if (!hrefMatch?.[1]) {
            continue;
        }

        const classValue = attributes.match(/\bclass="([^"]+)"/i)?.[1] || '';

        if (!classValue || classValue.includes('header-billetterie-link')) {
            return normalizeUrl(hrefMatch[1]);
        }
    }

    return null;
}

async function sendAlertEmail(subject, text) {
    if (!process.env.EMAIL_TO || !process.env.SMTP_USER) {
        console.log(`[⚠️ AVERTISSEMENT] Configuration email manquante (EMAIL_TO ou SMTP_USER), email non envoyé.`);
        return false;
    }

    try {
        await transporter.sendMail({
            from: `"Flop Checker" <${process.env.SMTP_USER}>`,
            to: process.env.EMAIL_TO,
            subject,
            text,
        });
        console.log(`[📧 SUCCÈS] Email d'alerte envoyé vers ${process.env.EMAIL_TO}`);
        return true;
    } catch (error) {
        console.error(`[📧 ERREUR] Échec de l'envoi de l'email :`, error.message);
        return false;
    }
}

async function sendAlertSummary(timestamp, alertReasons) {
    if (alertReasons.length === 0) {
        return false;
    }

    console.log(`\n[🚨 ALERTE] Au moins une condition est remplie. Envoi d'un email...`);
    const subject = `[ALERTE] Billetterie Arts et Métiers : lien modifié`;
    const body = `Bonjour,\n\nUn changement a été détecté lors de la vérification du ${timestamp} :\n\n- ${alertReasons.join('\n- ')}\n\nVérifiez la billetterie du musée.\n\nL'application Flop Checker.`;

    return sendAlertEmail(subject, body);
}

function logCheckEnd(timestamp) {
    console.log(`======================================================`);
    console.log(`[${timestamp}] Fin de la vérification.`);
    console.log(`Prochaine exécution dans ${Math.round(CHECK_INTERVAL_MS / 60000)} minute(s).`);
    console.log(`======================================================\n`);
}

async function checkBilletterieLink() {
    const timestamp = new Date().toLocaleString('fr-FR');
    const state = loadState();
    const alertReasons = [];
    let pendingAlertMarker = null;

    console.log(`\n======================================================`);
    console.log(`[${timestamp}] Début de la vérification de la billetterie`);
    console.log(`======================================================`);

    try {
        const response = await fetch(SITE_PAGE_URL, {
            headers: REQUEST_HEADERS
        });

        if (!response.ok) {
            console.error(`[❌ ERREUR] Impossible d'accéder à la page ${SITE_PAGE_URL}. Code HTTP : ${response.status}`);
            logCheckEnd(timestamp);
            return;
        }

        const html = await response.text();
        const currentHref = extractBilletterieHref(html);

        if (!currentHref) {
            console.error(`[❌ ERREUR] Impossible de retrouver le bouton Billetterie sur ${SITE_PAGE_URL}.`);

            if (state.lastAlertedHref !== MISSING_BUTTON_SENTINEL) {
                alertReasons.push(`Le bouton Billetterie est introuvable sur ${SITE_PAGE_URL}. La page a peut-être changé.`);
                pendingAlertMarker = MISSING_BUTTON_SENTINEL;
            }

            const emailSent = await sendAlertSummary(timestamp, alertReasons);
            if (emailSent && pendingAlertMarker) {
                state.lastAlertedHref = pendingAlertMarker;
            }

            saveState(state);
            logCheckEnd(timestamp);
            return;
        }

        console.log(`[🔗 INFO] Lien détecté : ${currentHref}`);

        if (state.lastSeenHref && state.lastSeenHref !== currentHref) {
            console.log(`[📝 INFO] Ancien lien détecté : ${state.lastSeenHref}`);
        }

        state.lastSeenHref = currentHref;

        if (currentHref === EXPECTED_BILLETTERIE_URL) {
            console.log(`[🔒 INFO] Le bouton Billetterie pointe toujours vers la page d'indisponibilité attendue.`);

            if (state.lastAlertedHref) {
                console.log(`[↩️ INFO] Retour à l'URL attendue. Une prochaine réouverture déclenchera un nouvel email.`);
                state.lastAlertedHref = null;
            }

            saveState(state);
            logCheckEnd(timestamp);
            return;
        }

        console.log(`[🚨 ALERTE] Le lien du bouton Billetterie a changé.`);

        if (state.lastAlertedHref !== currentHref) {
            alertReasons.push(
                `Le bouton Billetterie de ${SITE_PAGE_URL} pointe maintenant vers ${currentHref} au lieu de ${EXPECTED_BILLETTERIE_URL}.`
            );
            pendingAlertMarker = currentHref;
        } else {
            console.log(`[ℹ️ INFO] Ce nouveau lien a déjà déclenché une alerte, aucun nouvel email envoyé.`);
        }

    } catch (error) {
        console.error(`[❌ ERREUR] Exception lors de la vérification :`, error.message);
        logCheckEnd(timestamp);
        return;
    }

    const emailSent = await sendAlertSummary(timestamp, alertReasons);
    if (emailSent && pendingAlertMarker) {
        state.lastAlertedHref = pendingAlertMarker;
    }

    saveState(state);
    logCheckEnd(timestamp);
}

function startHealthServer() {
    http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.write('Flop Checker en ligne et en cours de surveillance !');
        res.end();
    }).listen(PORT, () => {
        console.log(`[🌐 INFO] Serveur web factice à l'écoute sur le port ${PORT} (requis pour Render)`);
    });
}

async function startMonitoring() {
    if (!RUN_ONCE) {
        startHealthServer();
        setInterval(checkBilletterieLink, CHECK_INTERVAL_MS);
        console.log(`L'application de surveillance est lancée !`);
        console.log(`Fréquence de vérification : toutes les ${Math.round(CHECK_INTERVAL_MS / 60000)} minute(s).`);
    }

    await checkBilletterieLink();

    if (RUN_ONCE) {
        console.log(`[🧪 INFO] Mode RUN_ONCE activé : fin du script après cette vérification.`);
    }
}

startMonitoring();
