# Flop Checker

`Flop Checker` est une petite application Node.js qui surveille la page d'accueil du musée des Arts et Metiers afin de detecter la reouverture de la billetterie.

L'idee est simple :

- l'application charge `https://www.arts-et-metiers.net/`
- elle repere le bouton `Billetterie`
- elle lit l'URL cible de ce bouton
- tant que le lien pointe vers la page d'indisponibilite, rien ne se passe
- si le lien change, un email d'alerte est envoye

URL actuellement consideree comme "billetterie fermee" :

`https://www.arts-et-metiers.net/musee/billetterie-en-ligne-temporairement-indisponible`

## Fonctionnement

Le script :

- verifie periodiquement la page du site
- compare le lien detecte avec l'URL attendue
- envoie un email si le lien du bouton `Billetterie` change
- memorise le dernier etat dans `flop-state.json` pour eviter d'envoyer plusieurs fois la meme alerte
- reautorise une future alerte si le lien revient ensuite a l'URL d'indisponibilite

## Configuration

L'application utilise un fichier `.env`.

Variables principales :

- `SMTP_HOST` : serveur SMTP
- `SMTP_PORT` : port SMTP, par defaut `587`
- `SMTP_SECURE` : `true` pour SMTPS, sinon `false`
- `SMTP_USER` : utilisateur ou adresse d'envoi
- `SMTP_PASS` : mot de passe ou mot de passe applicatif
- `EMAIL_TO` : adresse qui recoit les alertes
- `CHECK_INTERVAL_MINUTES` : frequence de verification, `60` par defaut
- `SITE_PAGE_URL` : URL de la page a surveiller, par defaut `https://www.arts-et-metiers.net/`
- `EXPECTED_BILLETTERIE_URL` : URL attendue tant que la billetterie est fermee
- `RUN_ONCE` : `true` pour executer une seule verification puis quitter

Exemple :

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=mon-adresse@example.com
SMTP_PASS=mon-mot-de-passe-app
EMAIL_TO=destinataire@example.com
CHECK_INTERVAL_MINUTES=60
```

## Lancement

Installer les dependances :

```bash
npm install
```

Lancer la surveillance :

```bash
npm start
```

Lancer une verification unique :

```bash
RUN_ONCE=true node index.js
```

Sous PowerShell :

```powershell
$env:RUN_ONCE='true'
node index.js
```

## Cas d'usage

Ce depot sert a etre prevenu automatiquement quand la billetterie du musee des Arts et Metiers semble de nouveau accessible via le bouton `Billetterie` du site officiel.
