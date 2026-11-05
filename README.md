<p align="center"><b>Italiano</b> · <a href="README.en.md">English</a></p>

<p align="center"><img src="docs/hero.jpg" alt="Isola su tablet e smartphone" width="100%"></p>

<h1 align="center">Isola per Home Assistant</h1>

<p align="center">
L'interfaccia di casa che si configura da sola: elegante sul telefono, viva sul tablet.<br>
<img alt="Versione" src="https://img.shields.io/badge/versione-1.0.0--beta.3-5fd0bd?style=flat-square">
<img alt="HACS" src="https://img.shields.io/badge/HACS-repository%20personalizzato-41BDF5?style=flat-square">
<img alt="Home Assistant" src="https://img.shields.io/badge/Home%20Assistant-2024%2B-18BCF2?style=flat-square">
</p>

---

## Due volti, una casa

| | Dove si usa | Card |
|---|---|---|
| 📱 **Isola** | Smartphone (iPhone e Android, nell'app di Home Assistant) | `custom:isola-mobile` |
| 🖥️ **Isola Live** | Tablet a parete, hub fisso, schermo in salotto | `custom:isola-live` |

**Isola** è la casa in tasca. Appena installata legge le **aree** e i **dispositivi** di Home Assistant e costruisce da sola stanze, persone, meteo, energia, sicurezza, robot e scene. Ti dice in una frase cosa succede in casa ("Finestra cucina aperta.", "Il sole copre tutta la casa.") e i robot compaiono solo quando lavorano.

**Isola Live** è la casa vista dall'alto. La foto (o il render) della tua casa diventa una mappa viva: le luci si accendono davvero nelle stanze e restano dentro i muri, il sole e il meteo cambiano la luce durante il giorno, i robot si muovono, le persone entrano ed escono, il fotovoltaico scorre verso la casa. Di notte il tablet si abbassa da solo e diventa un quadro con orologio e avvisi.

Da Isola si apre Isola Live con un tocco: la stessa casa, su qualsiasi schermo.

<p align="center"><img src="docs/isola-live-day-night.jpg" alt="Isola Live di giorno e di sera" width="100%"></p>

<p align="center"><img src="docs/isola-screens.jpg" alt="Le schermate di Isola: casa, energia, sicurezza, stanze, stanza" width="100%"></p>

### Cosa fa

- **Casa:** una frase che riassume la casa, persone con stato e batteria del telefono, meteo, scorciatoia a Isola Live, avvisi e consigli.
- **Energia:** flusso sole → casa → batteria → rete in tempo reale, consumi dei dispositivi, produzione di oggi, bolletta e storico.
- **Sicurezza:** allarme in un tocco, telecamere, porte e finestre aperte, serrature.
- **Stanze:** ogni area di Home Assistant diventa una stanza con il suo ritaglio della foto, luci (con regolazione dell'intensità), clima, TV e dispositivi.
- **Robot ed elettrodomestici:** aspirapolvere, tagliaerba e lavatrice compaiono quando lavorano, con avanzamento e comandi.
- **Isola Live:** luci realistiche per stanza, ciclo giorno/notte dal sole vero, robot in movimento, presenze, fotovoltaico, modalità quadro notturna, schermo intero per tablet.
- **Configuratore visivo:** luci, stanze, robot e sensori si mettono sulla foto con un dito e si salvano nella dashboard, senza scrivere YAML.

> **Versione beta.** Funziona con i dati di qualsiasi casa, ma è giovane: se qualcosa non viene trovato o non si vede bene, apri una segnalazione (Issue) con uno screenshot.

---

## Requisiti

- Home Assistant **2024 o più recente** (consigliata l'ultima versione).
- Le stanze di casa create come **Aree** (Impostazioni › Aree, etichette e zone) e i dispositivi assegnati alle aree: è da qui che Isola capisce cosa sta dove.
- Per installare con HACS: [HACS](https://hacs.xyz) già installato.
- Per Isola Live: una **foto o un render della casa vista dall'alto** (JPG o PNG, orizzontale; va benissimo un render di Planner 5D, Sweet Home 3D o un'immagine generata).

---

## Installazione passo passo

### Passo 1 · Installa Isola con HACS (consigliato)

1. In Home Assistant apri **HACS** dalla barra laterale.
2. In alto a destra tocca il menu **⋮** › **Repository personalizzati** (*Custom repositories*).
3. Nel campo **Repository** incolla:
   ```
   https://github.com/inusoa/isola-ha
   ```
4. Come **Tipo** (*Type*) scegli **Dashboard** e tocca **Aggiungi**. Chiudi la finestra.
5. Nella ricerca di HACS scrivi **Isola**, apri il risultato e tocca **Scarica** (*Download*) in basso a destra, poi conferma.
6. Quando HACS lo chiede, **ricarica** la pagina. Se usi l'app sul telefono: Impostazioni › App complementare › Risoluzione dei problemi › **Ripristina la cache del frontend**.

HACS aggiunge da solo la risorsa `/hacsfiles/isola-ha/isola-ha.js`, che carica sia Isola sia Isola Live.

<details>
<summary><b>In alternativa: installazione a mano (senza HACS)</b></summary>

1. Scarica questo repository (pulsante verde **Code** › **Download ZIP**) ed estrailo.
2. Copia i cinque file della cartella `dist` (`isola-ha.js`, `isola-mobile.js`, `isola-live.js`, `isola-live-render.js`, `isola-live-editor.js`) in `/config/www/isola-ha/` di Home Assistant, per esempio con l'add-on **File editor**, **Studio Code Server** o **Samba**.
   Se la cartella `www` non esisteva, **riavvia Home Assistant** una volta.
3. Attiva la **Modalità avanzata**: tocca il tuo nome in basso a sinistra (Profilo) e accendi *Modalità avanzata*.
4. Vai in **Impostazioni › Dashboard**, menu **⋮** in alto a destra › **Risorse** › **Aggiungi risorsa**:
   - URL: `/local/isola-ha/isola-ha.js?v=1`
   - Tipo: **Modulo JavaScript**
5. Ricarica la pagina (sul telefono: ripristina la cache del frontend come al passo 6 sopra).

Quando aggiorni i file a mano, cambia `?v=1` in `?v=2`, `?v=3`… così i browser scaricano la versione nuova.
</details>

### Passo 2 · Controlla che sia caricato

Impostazioni › Dashboard › **⋮** › **Risorse**: deve esserci una riga con `isola-ha.js` di tipo *Modulo JavaScript*.
Se apri gli strumenti per sviluppatori del browser (console), vedi le scritte **ISOLA** e **ISOLA LIVE** con il numero di versione.

### Passo 3 · Crea la dashboard Isola per il telefono

1. **Impostazioni › Dashboard › + Aggiungi dashboard › Nuova dashboard da zero**.
2. Nome: **Isola**, icona a piacere (per esempio `mdi:island`), lascia attivo *Mostra nella barra laterale*. Tocca **Crea**.
3. Apri la nuova dashboard, tocca la **matita** (Modifica) in alto a destra, poi **⋮** › **Editor di configurazione grezza** (*Raw configuration editor*).
4. Cancella tutto e incolla:
   ```yaml
   views:
     - title: Isola
       path: isola
       type: panel
       cards:
         - type: custom:isola-mobile
   ```
5. Tocca **Salva** e chiudi l'editor.

Fatto: Isola trova da sola stanze, persone e dispositivi.
Il tipo di vista **panel** fa sì che Isola occupi tutto lo schermo del telefono.

**Per aprirla sempre all'avvio dell'app:** sul telefono tocca il tuo nome (Profilo) › **Dashboard** (nelle impostazioni del browser/dispositivo) e scegli **Isola**.

### Passo 4 · Aggiungi la foto della casa (consigliato)

1. Crea la cartella `/config/www/isola/` e copiaci la foto della casa vista dall'alto, per esempio `casa.jpg`.
   (Se la cartella `www` è nuova, riavvia Home Assistant una volta.)
2. La foto sarà raggiungibile all'indirizzo `/local/isola/casa.jpg`.
3. Torna nella configurazione grezza di Isola e aggiungi la foto alla card:
   ```yaml
       cards:
         - type: custom:isola-mobile
           image: /local/isola/casa.jpg
   ```

Per far vedere a ogni stanza il **suo pezzo di foto**, indica il rettangolo della stanza in pixel della foto (`[x sinistra, y alto, x destra, y basso]`; il nome è quello dell'area in Home Assistant):

```yaml
room_crops:
  Soggiorno: [510, 120, 900, 510]
  Cucina:    [910, 120, 1130, 510]
  Camera:    [240, 120, 500, 330]
```

> **Come trovo i pixel?** Apri la foto in un qualsiasi programma di grafica (Anteprima su Mac, Paint su Windows, Photopea online): spostando il mouse vedi le coordinate x, y. L'angolo in alto a sinistra è 0, 0.

### Passo 5 · Isola Live sul tablet

1. Crea una seconda dashboard come al passo 3, con nome **Isola Live** (o **Casa**).
2. Nella configurazione grezza incolla:
   ```yaml
   views:
     - title: Casa
       path: casa
       type: panel
       cards:
         - type: custom:isola-live
           image: /local/isola/casa.jpg
           kiosk: true        # schermo intero sul tablet
           night_dim: true    # di notte si abbassa da solo
           quadro: true       # dopo qualche minuto: orologio, meteo e avvisi
   ```
3. Salva. Vedrai la casa con la barra in basso che contiene già luci, robot e persone trovate da sole.

### Passo 5b · Metti le cose al loro posto: il configuratore 📐

Non serve scrivere coordinate. Se sei **amministratore** di Home Assistant, nella barra in alto di Isola Live trovi il pulsante **📐 Posiziona**.

<p align="center"><img src="docs/isola-live-configurator.jpg" alt="Il configuratore di Isola Live su tablet e telefono" width="100%"></p>

1. Tocca **Posiziona**: si apre il configuratore a schermo intero, con l'elenco di tutto quello che Isola ha trovato (luci, robot, porte e finestre, serrature, telecamere, movimento, fotovoltaico).
2. Scegli un elemento e **tocca la foto** nel punto in cui si trova. I segnaposto si **trascinano** per aggiustarli.
3. Per le **luci** tocca gli angoli della stanza, uno dopo l'altro, e chiudi toccando il primo punto: vedi subito la luce che resta dentro i muri. In alternativa puoi trascinare un **rettangolo**, oppure **usare la stanza di un'altra luce**. Gli angoli si agganciano a quelli delle stanze già disegnate, così le pareti in comune combaciano. Con il cursore scegli quanto è grande la luce.
4. Per i **robot** tocca la base di ricarica, poi trascina uno o più rettangoli dove lavorano. Per il **fotovoltaico** tocca il riquadro e poi il punto della casa.
5. **Scala:** tocca le due estremità di un muro di cui conosci la lunghezza e scrivi i metri. La scala si calcola da sola.
6. Tocca **Salva** › **Salva nella dashboard**.

Cosa succede quando salvi:
- Viene aggiornata **solo la configurazione di questa card**: il resto della dashboard non si tocca.
- **Prima** di salvare viene tenuta una copia della configurazione precedente. Con **Annulla il salvataggio** (o, più tardi, **Ripristina quella versione** nella finestra Salva) torni indietro con un tocco.
- Funziona su **tablet, computer e telefono**: si sposta la foto con un dito, si ingrandisce con due dita o con i pulsanti **+ / −**. **↶** annulla l'ultima modifica.
- Se apri Isola Live dal telefono (la scheda *Isola Live* di Isola), il configuratore salva dentro la card di Isola, nella chiave `casa_live`.
- Se la dashboard è scritta in **YAML** o è generata automaticamente da Home Assistant, non si può salvare da qui: tocca **Copia YAML** e incolla il testo nella card.

<details>
<summary><b>Configurazione a mano (per chi preferisce lo YAML)</b></summary>

Ogni elemento si posiziona con `px: [x, y]` (pixel della foto). Le luci e i robot si riconoscono dall'`id`, che è il nome dell'entità senza il dominio (`light.lampadario_soggiorno` → `lampadario_soggiorno`):

```yaml
         - type: custom:isola-live
           image: /local/isola/casa.jpg
           kiosk: true
           ppm: 34              # pixel per metro della foto (grandezza delle luci, velocità dei robot)
           lights:
             - id: lampadario_soggiorno
               px: [700, 230]                      # dove sta la lampada
               room: [[510,124],[900,124],[900,506],[650,506],[650,336],[510,336]]   # contorno della stanza: la luce resta dentro i muri
             - id: luce_camera
               px: [370, 225]
               room: [[244,124],[496,124],[496,326],[244,326]]
           devices:
             - id: robi                            # vacuum.robi
               px: [870, 470]                      # base di ricarica
               area_px: [[530, 360, 880, 490]]     # dove si muove mentre pulisce
           sensors:
             - { id: fin_cucina, type: window, entity: binary_sensor.finestra_cucina, name: Cucina, px: [1030, 118] }
             - { id: porta, type: lock, entity: lock.porta_ingresso, name: Porta, px: [690, 540] }
             - { id: cam_giardino, type: camera, entity: camera.giardino, name: Giardino, px: [1220, 600] }
           energy: { px: [470, 600], house_px: [700, 330] }   # riquadro fotovoltaico e punto della casa
           presence:
             binary_sensor.movimento_soggiorno: [760, 300]    # dove compare chi è in quella stanza
```

**Come calcolo `ppm`?** Misura in pixel un muro di cui conosci la lunghezza: se una parete di 10 m è lunga 340 pixel, `ppm` è 34.
</details>

**La stessa casa anche nel telefono:** in Isola (passo 3) aggiungi `casa_live:` con la stessa configurazione di Isola Live (senza `type`), oppure usa il configuratore da lì. Toccando la scheda *Isola Live* nella pagina Casa, si apre la mappa a schermo intero.

### Passo 6 · Prepara il tablet

- **App di Home Assistant** (Android, iPad) oppure **Fully Kiosk Browser** (Android, consigliato per tablet a parete).
- Apri la dashboard **Isola Live** e impostala come predefinita per quel dispositivo (Profilo › Dashboard).
- Con `kiosk: true` Isola Live nasconde le barre di Home Assistant. Per modificare la dashboard, apri l'indirizzo con `?nokiosk` alla fine, oppure usa il pulsante ⚙️ della barra in alto per tornare alle impostazioni dell'app.
- Tieni lo schermo sempre acceso (in Fully Kiosk: *Screen On*; nell'app: impostazioni dell'app complementare).

### Passo 7 · Aggiornamenti

Con HACS: quando esce una nuova versione compare in **Impostazioni › Aggiornamenti**. Installala e ricarica la pagina (sul telefono: ripristina la cache del frontend).

---

## Configurazione

Tutto quello che scrivi nella card ha la precedenza su ciò che Isola trova da sola. Per spegnere la configurazione automatica: `auto: false`.

### Isola (`custom:isola-mobile`)

| Chiave | Esempio | A cosa serve |
|---|---|---|
| `image` | `/local/isola/casa.jpg` | Foto della casa (copertina e ritagli delle stanze) |
| `room_crops` | `{ Soggiorno: [510,120,900,510] }` | Pezzo di foto per ogni stanza |
| `weather` | `weather.casa` | Meteo (se ne hai più di uno) |
| `alarm` | `alarm_control_panel.casa` | Allarme |
| `pv_power` / `pv_today` | `sensor.inverter_potenza` | Fotovoltaico: potenza attuale e produzione di oggi |
| `battery_soc` / `battery_power` | `sensor.batteria_livello` | Batteria di casa: livello (%) e potenza |
| `battery_invert` | `true` | Se la tua batteria segna la carica come negativa |
| `scenes` | vedi sotto | Pulsanti scena (Esco, Notte, …) |
| `waste` | `{ today: sensor.raccolta_oggi, tomorrow: sensor.raccolta_domani, from: 17, to: 20 }` | Promemoria della raccolta differenziata |
| `casa_live` | stessa configurazione di Isola Live | Mappa che si apre dal telefono |
| `auto` | `false` | Spegne la configurazione automatica |

Esempio di scene:

```yaml
scenes:
  out:   { name: Esco,  action: script.turn_on, target: script.esco_di_casa }
  night: { name: Notte, action: script.turn_on, target: script.buonanotte }
```

Isola riconosce da sola gli script che si chiamano come *esco*, *notte/buonanotte*, *buongiorno*, *sono a casa*.

### Isola Live (`custom:isola-live`)

| Chiave | Esempio | A cosa serve |
|---|---|---|
| `image` | `/local/isola/casa.jpg` | La foto della casa vista dall'alto |
| `ppm` | `34` | Pixel per metro della foto |
| `kiosk` | `true` | Schermo intero sul tablet |
| `night_dim` | `true` | Di notte lo schermo si abbassa |
| `quadro` / `quadro_after` | `true` / `3` | Modalità quadro dopo N minuti senza tocchi |
| `image_north` | `20` | Gradi tra il nord e l'alto della foto (luce del sole più realistica) |
| `lights` | `{ id, px, room, radius }` | Luci sulla foto e contorno della stanza |
| `devices` | `{ id, px, area_px }` | Robot: base e zona di lavoro |
| `sensors` | `{ id, type, entity, name, px }` | Finestre, porte, serrature, telecamere, movimento |
| `energy` | `{ px, house_px }` | Riquadro fotovoltaico e batteria |
| `presence` | `{ binary_sensor.x: [x, y] }` | Dove compaiono le persone in base al movimento |
| `title` | `Casa Rossi` | Titolo in alto a sinistra |

---

## Problemi comuni

| Cosa vedi | Cosa fare |
|---|---|
| *Custom element doesn't exist: isola-mobile* o *Errore di configurazione* | La risorsa non è caricata: controlla il passo 2, poi ricarica la pagina. Sul telefono ripristina la cache del frontend. |
| Dopo un aggiornamento vedo ancora la versione vecchia | Ripristina la cache del frontend nell'app, o ricarica forzando (Ctrl+Shift+R sul computer). Con l'installazione a mano cambia `?v=` nella risorsa. |
| La foto non si vede | Controlla che il file sia in `/config/www/isola/` e l'indirizzo in `/local/isola/…`. Se la cartella `www` è nuova, riavvia Home Assistant. |
| Una stanza o un dispositivo manca | Assegna il dispositivo a un'**Area** in Home Assistant. Le entità nascoste o di diagnostica vengono ignorate di proposito. |
| Il tablet resta a schermo intero e non riesco a modificare | Apri la dashboard con `?nokiosk` alla fine dell'indirizzo. |
| La luce "esce" dalla stanza | Nel configuratore apri la luce › **Stanza** e disegna il contorno (oppure aggiungi `room:` a mano). |
| Non vedo il pulsante 📐 Posiziona | Compare solo agli **amministratori** di Home Assistant e solo se la card ha la foto (`image`). |
| "Questa dashboard non si può modificare da qui" | La dashboard è in YAML o generata automaticamente: tocca **Copia YAML** e incollalo nella card, oppure prendi il controllo della dashboard. |

---

## Prova senza installare

La cartella [`demo`](demo) contiene la casa dimostrativa *Famiglia Rossi* con dati simulati: `demo.html` per Isola e `demo-live.html` per Isola Live. Si apre con un piccolo server locale, per esempio dalla cartella del repository:

```bash
python3 -m http.server 8000
# poi apri http://localhost:8000/demo/demo.html
```

Tutte le immagini di questa pagina sono state fatte con la casa dimostrativa.

---

© Isola – tutti i diritti riservati. Uso consentito solo con licenza.
