# For Fitness Club Booking App

App web per prenotazioni corsi palestra con UX mobile-first.

## Stack
- Backend: Node.js (HTTP nativo, ES modules)
- Frontend: HTML/CSS/JS vanilla
- Storage: JSON locale (`data/bookings.json`)

## Struttura progetto
- `server.js`: entrypoint
- `src/config.js`: configurazioni centralizzate (capienze, annullamento, env)
- `src/auth.js`: password hash, sessioni, ruoli
- `src/store.js`: persistenza, seed, migrazione, lock anti-race
- `src/booking-rules.js`: regole business prenotazioni
- `src/server.js`: API e routing
- `public/index.html`: area utente
- `public/admin.html`: dashboard admin

## Regole business implementate
- Login con `username/password`
- Ruoli: `user` e `admin`
- No doppia prenotazione sullo stesso corso
- No prenotazione su corso pieno
- Annullamento consentito solo fino a 2 ore prima
- Capienza rispettata anche con richieste simultanee (mutazioni serializzate)
- Tracking storico annullati (`status=cancelled`, timestamp)

## Capienze default configurabili
- `sala`: 25
- `hyrox`: 20
- `funzionale`: 20

Modificabili da `src/config.js`.

## Credenziali demo
- Utente: `martina` / `Fit12345`
- Admin: `admin` / `Asia2020$`

## Avvio
```bash
cd "/Users/mirkofusco/Desktop/Gym Booking App"
npm run dev
```

## URL
- Utente: http://localhost:3000
- Admin: http://localhost:3000/admin.html

## Flusso rapido test
1. Login utente
2. Prenota un corso da lista (1 tap)
3. Verifica badge `Prenotato` e presenza in “Le tue prenotazioni”
4. Annulla (se oltre la finestra 2h) e verifica stato aggiornato
5. Login admin e verifica prenotati/annullati nel corso
