# LUMI — sculpturale designlampen

Webshop voor sculpturale designlampen die op bestelling in de gekozen kleur worden gemaakt.
Lichte, minimalistische webshop (HTML/CSS/JS) met een kleine Node.js-server en een beveiligd adminpaneel.
Lettertypen staan lokaal in `public/assets/fonts/` (geen Google Fonts — prettig voor de AVG/GDPR).

## Functies

- **Dag/nacht-modus** — overdag een lichte site met foto's van de lamp uit; 's avonds (19:00–07:00, of via de knop Dag/Nacht) een donkere site met foto's waarop de lampen branden.
- **Kleurkeuze uit tien vaste kleuren** — via de kleurenrij boven de collectie (toont alle lampen in die kleur), per productkaart of in het productvenster.
- **Productfoto's per kleur, voor dag én nacht** (zie hieronder). Zolang er geen foto is, wordt de lamp getoond als een effen kleurvlak (dat 's nachts zacht gloeit).
- **Maten** S / M / L met eigen prijs en afmetingen.
- **Adres via postcode**: bij Nederlandse adressen worden straat en plaats automatisch ingevuld op basis van postcode + huisnummer (gratis [PDOK Locatieserver](https://api.pdok.nl/bzk/locatieserver/search/v3_1/ui/), BAG-data, geen API-sleutel). Beschikbare toevoegingen worden als suggestie getoond.
- **10% korting op de eerste bestelling**: aangekondigd in een welkomstvenster (één keer per bezoeker), automatisch verrekend zonder code, per e-mailadres.
- **Cookiemelding** met keuze *Akkoord* / *Alleen noodzakelijk* (opgeslagen als `lumi.consent`; de winkel gebruikt nu alleen functionele opslag).
- **Gratis verzending in Nederland**; vaste tarieven voor BE, DE, LU, FR, AT (aan te passen in het adminpaneel).
- **Drie talen**: Nederlands (standaard), Engels, Oekraïens.
- Winkelmand blijft bewaard (localStorage), responsive tot mobiel.

## Adminpaneel

Op `/admin` beheer je producten, prijzen, foto's, verzendkosten en zie je bestellingen.

**Foto's toevoegen:** open een product → *Фото* → upload per kleur (of *Основне* voor alle kleuren) een **dag**-foto (lamp uit) en een **nacht**-foto (lamp aan). Staand formaat 5:6 werkt het mooist.

**Beveiliging**
- Wachtwoord wordt alleen als scrypt-hash opgeslagen (in `.env` / omgevingsvariabelen), nooit in git.
- Sessie via `HttpOnly`, `SameSite=Strict` cookie (en `Secure` + `__Host-` in productie); uitloggen na 2 uur inactiviteit, maximaal 12 uur.
- Bescherming tegen brute force: 5 foute pogingen per IP → 15 minuten geblokkeerd; 30 foute pogingen in totaal → alle logins 15 minuten geblokkeerd.
- CSRF-token + Origin-controle op elke wijziging; strikte Content-Security-Policy en andere security-headers.
- Alle invoer wordt op de server gevalideerd; uploads alleen echte JPG/PNG/WebP (gecontroleerd op inhoud), max. 8 MB, willekeurige bestandsnaam.
- Bij elke wijziging wordt een back-up van de catalogus bewaard in `data/backups/` (laatste 200). Alle acties staan in `data/audit.log`.
- Prijzen en de eerste-bestelling-korting worden bij een bestelling altijd op de server berekend.

**Login instellen of wijzigen**

```bash
npm run set-admin
```

Dit vraagt om gebruikersnaam en wachtwoord, schrijft `ADMIN_USER` en `ADMIN_PASSWORD_HASH` naar `.env` en toont de waarden om bij je hosting in te stellen.

Alternatief bij hosting: zet `ADMIN_USER` en `ADMIN_PASSWORD` (min. 12 tekens) als omgevingsvariabelen.
Het wachtwoord wordt bij het starten in het geheugen gehasht en nergens opgeslagen of gelogd.

## Lokaal starten

Vereist Node.js 20.12 of nieuwer.

```bash
npm install
npm run set-admin   # eenmalig
npm start
```

Winkel: http://localhost:8080 · Admin: http://localhost:8080/admin

## Publiceren

De site heeft nu een (kleine) Node.js-server nodig — GitHub Pages volstaat niet meer.
Geschikt: Render, Railway, Fly.io, een VPS (bijv. Hetzner) enz.

**Render (eenvoudigst):** in Render → *New* → *Blueprint* → kies deze repository. `render.yaml` regelt de rest
(Node, permanente schijf voor `data/`, HTTPS). Vul bij het aanmaken `ADMIN_USER` en `ADMIN_PASSWORD` in.

Belangrijk:
- **Altijd via HTTPS** en met `NODE_ENV=production`.
- Stel de omgevingsvariabelen `ADMIN_USER` en `ADMIN_PASSWORD_HASH` in (uit `npm run set-admin`).
- Gebruik **permanente opslag** voor de map `data/` (of zet `DATA_DIR` naar een permanent volume), anders gaan producten, foto's en bestellingen verloren bij een herstart.
- Achter een proxy/loadbalancer: `TRUST_PROXY=1` (standaard in productie).

## Structuur

```
server/server.js        webserver, API en beveiliging
server/auth.js          wachtwoord-hash, sessies, brute-force-bescherming
server/store.js         opslag (JSON) met back-ups
server/validate.js      invoercontrole en prijsberekening
server/seed-catalog.json   startcatalogus (eerste start)
scripts/set-admin.js    login instellen
public/                 de winkel (HTML/CSS/JS) en public/admin/ (adminpaneel)
data/                   (niet in git) catalogus, bestellingen, foto's, back-ups, logboek
```

## Nog te doen voor echte verkoop

1. **Betalen** — koppel bijvoorbeeld [Mollie](https://www.mollie.com/) (iDEAL, kaart, Bancontact).
2. **Bevestigingsmail** naar klant en naar jezelf.
3. Echte contactgegevens in de footer (`hello@lumi.example`), algemene voorwaarden en privacyverklaring.
