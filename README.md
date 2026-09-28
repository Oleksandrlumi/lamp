# LUMI — 3D-geprinte designlampen

Webshop voor sculpturale lampen die op bestelling 3D-geprint worden.
Statische site (HTML/CSS/JS, geen build-stap) met een realtime 3D-weergave van elke lamp.

## Functies

- **Realtime 3D-configurator** (three.js): elke lampvorm is parametrisch gegenereerd, met zichtbare printlagen. Draaien met muis/vinger, licht aan/uit.
- **Kleurkeuze**: 10 filamentkleuren + eigen kleur (kleurkiezer). De 3D-lamp, productfoto's en gloed passen zich direct aan.
- **Maten** S / M / L met eigen prijs en afmetingen.
- **Adres via postcode**: bij Nederlandse adressen worden straat en plaats automatisch ingevuld op basis van postcode + huisnummer (gratis [PDOK Locatieserver](https://api.pdok.nl/bzk/locatieserver/search/v3_1/ui/), BAG-data, geen API-sleutel). Beschikbare toevoegingen worden als suggestie getoond.
- **10% korting op de eerste bestelling**: automatisch verrekend, zonder code, per e-mailadres.
- **Gratis verzending in Nederland**; vaste tarieven voor BE, DE, LU, FR, AT (`SHIPPING` in `assets/js/cart.js`).
- **Drie talen**: Nederlands (standaard), Engels, Oekraïens.
- Winkelmand blijft bewaard (localStorage), responsive tot mobiel.

## Lokaal starten

ES-modules werken niet via `file://`, dus start een lokale webserver:

```bash
npx http-server -p 8080
# of: python3 -m http.server 8080
```

Open daarna http://localhost:8080.

## Publiceren

Alles is statisch, dus werkt direct op GitHub Pages, Netlify, Vercel of elke andere hosting.
three.js staat in `vendor/three/` zodat er geen externe CDN nodig is.

## Structuur

```
index.html              pagina-opbouw
assets/css/style.css    vormgeving
assets/js/catalog.js    producten, kleuren, maten, prijzen (+ 3D-vormformules)
assets/js/lamp3d.js     three.js-renderer en thumbnails
assets/js/cart.js       winkelmand, korting, verzendkosten, bestelling
assets/js/postcode.js   adres opzoeken via PDOK
assets/js/i18n.js       vertalingen NL / EN / UA
assets/js/main.js       koppelt alles aan de interface
```

Een product toevoegen of een prijs wijzigen: pas `PRODUCTS` in `assets/js/catalog.js` aan.
De vorm van een lamp wordt bepaald door de functie `radius(theta, v)`.

## Voordat je live gaat

Dit is de volledige front-end. Voor echte verkoop ontbreekt nog een kleine back-end:

1. **Betalen** — koppel bijvoorbeeld [Mollie](https://www.mollie.com/) (iDEAL, kaart, Bancontact) of Stripe. Nu wordt een bestelling alleen lokaal opgeslagen en wordt een bevestiging getoond.
2. **Eerste-bestelling-korting controleren op de server** — de site onthoudt eerdere bestellingen alleen in de browser van de klant. Controleer bij het aanmaken van de betaling op de server of het e-mailadres al eerder heeft besteld, en bereken daar ook het eindbedrag.
3. **Bestelbevestiging per e-mail** en een overzicht van bestellingen voor jezelf.
4. Echte contactgegevens in de footer (`hello@lumi.example` is een placeholder), algemene voorwaarden en privacyverklaring.
