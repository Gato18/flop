import fs from 'fs';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

// Charger les variables d'environnement depuis le fichier .env
dotenv.config();

const URL_PAGE = "https://www.arts-et-metiers.net/musee/flops";
const TEXT_TO_CHECK = "Billetterie en ligne temporairement indisponible";
const URL_TICKET = "https://arts-et-metiers.tickeasy.com/fr-FR/accueil";

const ONE_HOUR_MS = 60 * 60 * 1000; // 1 heure en millisecondes

// Configuration du transporteur d'email
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_SECURE === 'true', // true pour 465, false pour les autres ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

async function sendAlertEmail(subject, text) {
    if (!process.env.EMAIL_TO || !process.env.SMTP_USER) {
        console.log(`[⚠️ AVERTISSEMENT] Configuration email manquante (EMAIL_TO ou SMTP_USER), email non envoyé.`);
        return;
    }

    try {
        await transporter.sendMail({
            from: `"Flop Checker" <${process.env.SMTP_USER}>`,
            to: process.env.EMAIL_TO,
            subject: subject,
            text: text,
        });
        console.log(`[📧 SUCCÈS] Email d'alerte envoyé vers ${process.env.EMAIL_TO}`);
    } catch (error) {
        console.error(`[📧 ERREUR] Échec de l'envoi de l'email :`, error.message);
    }
}

async function checkUrls() {
    const timestamp = new Date().toLocaleString('fr-FR');
    console.log(`\n======================================================`);
    console.log(`[${timestamp}] Début de la vérification des liens`);
    console.log(`======================================================`);

    let alertReasons = [];

    // 1. Vérifie si le texte est présent sur le site du musée
    try {
        const response1 = await fetch(URL_PAGE, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36"
            }
        });
        
        if (!response1.ok) {
            console.error(`[❌ ERREUR] Impossible d'accéder à la page du musée. Code HTTP: ${response1.status}`);
        } else {
            const text = await response1.text();
            if (text.includes(TEXT_TO_CHECK)) {
                console.log(`[🔒 INFO] Statut normal: le texte "${TEXT_TO_CHECK}" est bien PRÉSENT. La billetterie semble toujours indisponible.`);
            } else {
                console.log(`[🚨 ALERTE] CHANGEMENT DÉTECTÉ: Le texte "${TEXT_TO_CHECK}" N'EST PLUS PRÉSENT sur la page !`);
                alertReasons.push(`La page Musée (${URL_PAGE}) n'affiche plus le texte de billetterie indisponible.`);
            }
        }
    } catch (e) {
        console.error(`[❌ ERREUR] Exception lors de la requête vers la page du musée:`, e.message);
    }

    console.log(`------------------------------------------------------`);

    // 2. Vérifie si le site de la billetterie répond un code 200
    try {
        const response2 = await fetch(URL_TICKET, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36"
            }
        });
        
        if (response2.status === 200) {
            console.log(`[✅ INFO] Le site de la billetterie (tickeasy) répond bien avec un code 200 (En ligne).`);
            alertReasons.push(`Le site de la billetterie (${URL_TICKET}) répond avec un code HTTP 200.`);
        } else {
            console.log(`[⚠️ INFO] Le site de la billetterie répond avec un code ${response2.status} (différent de 200).`);
        }
    } catch (e) {
        console.error(`[❌ ERREUR] Exception lors de la requête vers le site de la billetterie:`, e.message);
    }
    
    // 3. Envoi de l'email si une des conditions est remplie
    if (alertReasons.length > 0) {
        console.log(`\n[🚨 ALERTE] Au moins une condition est remplie. Envoi d'un email...`);
        const subject = `[ALERTE] Mouvement sur la billetterie Arts et Métiers !`;
        const body = `Bonjour,\n\nUne ou plusieurs conditions ont été détectées lors de la vérification de ${timestamp} :\n\n- ` + alertReasons.join('\n- ') + `\n\nAllez vite vérifier !\n\nL'application Flop Checker.`;
        
        await sendAlertEmail(subject, body);
    }

    console.log(`======================================================`);
    console.log(`[${timestamp}] Fin de la vérification.`);
    console.log(`Prochaine exécution dans 1 heure.`);
    console.log(`======================================================\n`);
}

// Exécuter une première fois immédiatement
checkUrls();

// Puis programmer l'exécution toutes les heures
setInterval(checkUrls, ONE_HOUR_MS);

console.log(`L'application de surveillance est lancée !`);
console.log(`Fréquence de vérification : toutes les heures.`);

// Création d'un serveur HTTP factice pour Render
import http from 'http';
const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write('Flop Checker en ligne et en cours de surveillance !');
    res.end();
}).listen(PORT, () => {
    console.log(`[🌐 INFO] Serveur web factice à l'écoute sur le port ${PORT} (requis pour Render)`);
});
