/* Isola · lingue
 * L'interfaccia nasce in italiano. Quando Home Assistant non è in italiano (o con `language: en`),
 * i testi delle card vengono tradotti in inglese mentre compaiono sullo schermo.
 */
let LANG = 'it';
const roots = new Set();

// frasi e parole (dalla più lunga alla più corta: vince sempre la più lunga)
const D = {
  // ---------------------------------------------------------------- casa, persone, frasi
  'Il sole copre tutta la casa.': 'The sun covers the whole house.',
  'Il sole copre il': 'The sun covers', '% di casa.': '% of the house.',
  'Il sole è a riposo.': 'The sun is resting.',
  'Il sole produce': 'The sun is producing', 'kW più di quanto usa la casa': 'kW more than the house is using',
  'e la batteria è al': 'and the battery is at', 'e la batteria è piena': 'and the battery is full',
  'è energia tua.': 'it’s your own energy.', '. Fino alle': '. Until', 'Fino alle': 'Until',
  'La casa va a batteria.': 'The house is running on battery.', 'La batteria copre la casa': 'The battery is powering the house',
  'Tutto in ordine.': 'All good.', 'Tutto tranquillo.': 'All quiet.', 'Tutto chiuso.': 'All closed.', 'Tutto spento.': 'All off.',
  'Tutto al suo posto': 'Everything in place',
  'Finestra cucina aperta.': 'Kitchen window open.',
  'Finestre aperte:': 'Open windows:', 'Finestra aperta:': 'Open window:', 'Aperte:': 'Open:',
  'finestre aperte.': 'windows open.', 'finestre aperte': 'windows open', 'finestra aperta': 'window open',
  'Finestra aperta · luci spente': 'Window open · lights off', 'Luci spente · finestra aperta': 'Lights off · window open',
  'Luci spente · clima acceso': 'Lights off · AC on',
  'Porte e finestre chiuse': 'Doors and windows closed', 'Porte e finestre': 'Doors and windows',
  'portone chiuso a chiave': 'front door locked', 'Portone aperto.': 'Front door open.', 'portone aperto': 'front door open',
  'Serratura bloccata.': 'Lock jammed.', 'Chiuso a chiave': 'Locked',
  'allarme disinserito': 'alarm disarmed', 'allarme inserito in casa': 'alarm armed (home)', 'allarme inserito': 'alarm armed',
  'allarme notte': 'night alarm', 'allarme vacanza': 'vacation alarm', 'allarme in attesa': 'alarm pending', 'allarme in attivazione': 'alarm arming',
  'Allarme disinserito': 'Alarm disarmed', 'Allarme inserito': 'Alarm armed', 'Allarme scattato': 'Alarm triggered', 'ALLARME SCATTATO': 'ALARM TRIGGERED',
  'Allarme!': 'Alarm!', 'ALLARME': 'ALARM', 'Allarme': 'Alarm', 'Allerta meteo': 'Weather alert', 'Allerta': 'Alert',
  'Inserito, siete fuori.': 'Armed, you’re away.', 'Inserito per la notte.': 'Armed for the night.', 'Inserito in casa.': 'Armed (home).', 'Inserito in casa': 'Armed (home)',
  'Inserito (casa)': 'Armed (home)', 'Inserito (fuori)': 'Armed (away)', 'Inserito (notte)': 'Armed (night)', 'Inserito': 'Armed',
  'Disinserito.': 'Disarmed.', 'Disinserito': 'Disarmed', 'Disinserisci': 'Disarm', 'Inserisci': 'Arm',
  'Disinserisco l’allarme?': 'Disarm the alarm?', 'Inserisco in casa?': 'Arm in home mode?', 'Inserisco per la notte?': 'Arm for the night?',
  'Faccio suonare la sirena?': 'Sound the siren?', 'Sirena spenta': 'Siren off',
  'Con conferma Face ID': 'With Face ID confirmation', 'Conferma con Face ID dalla notifica': 'Confirm with Face ID from the notification',
  'Apro il portone?': 'Open the front door?', 'il portone': 'the front door', 'la porta': 'the door', 'Apro': 'Open',
  'Robi e Lavatrice al lavoro, allarme disinserito.': 'Robi and the washer are working, alarm disarmed.',
  'Tutti i dispositivi sono a riposo': 'All devices are idle', 'nessun dispositivo in funzione': 'no devices running',
  'Chi c’è in casa': 'Who’s home', 'Chi c\'è': 'Who’s home', 'Come va la casa': 'How the house is doing',
  'Fuori casa': 'Away', 'fuori casa': 'away', 'A casa': 'Home', 'a casa tra': 'home in', 'In casa': 'At home', 'Al lavoro': 'At work', 'al lavoro': 'working',
  'Lavatrice al lavoro': 'Washer working', 'min da casa': 'min from home',
  'Sono a casa': 'I’m home', 'Esco di casa': 'Leaving home', 'Esco: fatto': 'Leaving: done', 'Notte: fatto': 'Night: done',
  'Buonanotte': 'Good night', 'Buongiorno': 'Good morning', 'Esco': 'Leaving', 'Notte': 'Night',
  'Nessuno': 'Nobody', 'nessuno': 'nobody', 'Assente': 'Away', 'Presente': 'Present', 'Presenza': 'Presence',
  // ---------------------------------------------------------------- luci, clima, tv
  'luce accesa': 'light on', 'luci accese': 'lights on', 'luci spente': 'lights off', 'Luci spente': 'Lights off',
  'Luce e meteo: simula ora e tempo': 'Light and weather: simulate time and sky',
  'Luminosità': 'Brightness', 'La luce non risponde': 'The light is not responding',
  'Accesa · auto': 'On · auto', 'Spenta · auto': 'Off · auto', 'Accesa · ': 'On · ', 'Accesa ·': 'On ·',
  'Accesa': 'On', 'Spenta': 'Off', 'Acceso da': 'On for', 'Acceso': 'On', 'Spento': 'Off', 'appena acceso': 'just switched on',
  'Accendi': 'Turn on', 'Spegni': 'Turn off', 'Accendo': 'Turning on', 'Spengo': 'Turning off', 'Premi quando lo accendi': 'Press when you switch it on',
  'TV accesa': 'TV on', 'TV spenta': 'TV off', 'In riproduzione': 'Playing',
  'clima acceso': 'AC on', 'clima spento': 'AC off', 'Condizionatore non trovato': 'Air conditioner not found', 'Condizionatori': 'Air conditioners',
  'Temperatura impostata': 'Target temperature', 'Ambiente e impostata': 'Room and target', 'Temperatura': 'Temperature', 'Impostata': 'Target',
  'In stanza': 'In the room', 'come fuori': 'same as outside', 'più caldo': 'warmer', 'più fresco': 'cooler', 'di fuori (': 'than outside (',
  'Ora → obiettivo': 'Now → target', 'Raffresca': 'Cool', 'Raffreddamento': 'Cooling', 'Riscalda': 'Heat', 'Deumidifica': 'Dry', 'Deumid.': 'Dry',
  'Ventola': 'Fan', 'Ventila': 'Fan', 'Ventilazione': 'Ventilation', 'Alette': 'Vanes', 'Orizzontale': 'Horizontal', 'Verticale': 'Vertical', 'Entrambe': 'Both',
  'Modalità vacanza.': 'Vacation mode.', 'Modalità': 'Mode', 'Preset': 'Preset', 'Comfort': 'Comfort', 'Boost': 'Boost', 'Eco': 'Eco',
  'Filtro clima': 'AC filter', 'Filtro condizionatore': 'Air conditioner filter', 'Abbassa': 'Lower', 'Alza': 'Raise', 'Caldo': 'Hot', 'Freddo': 'Cold',
  'Silenziosa': 'Quiet', 'Silenzio': 'Silent', 'Automatica': 'Automatic', 'automatico': 'automatic', 'Auto': 'Auto',
  // ---------------------------------------------------------------- energia
  'Flussi di energia adesso': 'Energy flows right now', 'Energia · adesso': 'Energy · now', 'Energia · oggi': 'Energy · today', 'Energia · storico': 'Energy · history', 'Energia · bolletta': 'Energy · bill',
  'Sezioni energia': 'Energy sections', 'Pannello Energia': 'Energy dashboard', 'I grafici ufficiali di Home Assistant': 'Home Assistant’s official charts',
  'Sole e consumi nelle ultime 24 ore': 'Sun and usage over the last 24 hours', 'Sole e consumi · 24 ore': 'Sun and usage · 24 hours', 'Sole e consumi': 'Sun and usage',
  'Quanto vale il sole': 'What the sun is worth', 'Il sole oggi': 'The sun today', 'Il sole': 'The sun', 'Oggi il sole ha dato': 'Today the sun gave',
  'Previsti oggi': 'Expected today', 'già prodotti': 'already produced', 'Prima del tramonto ne arrivano altri': 'Before sunset another',
  'domani ne sono previsti': 'tomorrow’s forecast is', 'del previsto.': 'of the forecast.', '% del previsto': '% of the forecast',
  'giorni hai prodotto in media il': 'days you produced on average', 'Negli ultimi': 'Over the last',
  'Previsione corretta al': 'Forecast adjusted to', 'Previsione corretta': 'Adjusted forecast', 'Previsione': 'Forecast',
  'Non trovo sensori di previsione. Con l\'integrazione Forecast.Solar la sezione si compila da sola.': 'No forecast sensors found. With the Forecast.Solar integration this section fills itself in.',
  'kWh dal sole nel': 'kWh from the sun in', 'kWh dal sole': 'kWh from the sun', 'kW dal sole': 'kW from the sun', ', finora.': ', so far.',
  'dal fotovoltaico, adesso': 'from solar, right now', 'Circa': 'About', '€ di valore e': '€ in value and', 'kg di CO₂ evitata.': 'kg of CO₂ avoided.', 'kg di CO₂ evitata': 'kg of CO₂ avoided',
  'Valgono circa': 'Worth about', '€ al prezzo di acquisto': '€ at the purchase price', 'Senza il sole sarebbero': 'Without the sun it would be',
  'Dall’installazione': 'Since installation', 'Da gennaio': 'Since January', 'Produzione mensile': 'Monthly production', 'Produzione': 'Production',
  'Mese migliore:': 'Best month:', '· media': '· average', '. Il mese in corso (a righe) è parziale.': '. The current month (striped) is partial.',
  'Consumi tracciati:': 'Tracked usage:', 'Nessun consumo registrato': 'No usage recorded', 'consumi coperti dal sole': 'of usage covered by the sun',
  'Per dispositivo': 'By device', 'Potenza adesso': 'Power now', 'Potenza ora': 'Power now', 'Potenza': 'Power', 'Consumo': 'Usage',
  'Batteria casa': 'Home battery', 'Batteria scarica': 'Battery low', 'Batteria al': 'Battery at', 'Batterie': 'Batteries', '🔋 Batteria': '🔋 Battery', '· batteria': '· battery', 'Batteria': 'Battery',
  'si carica': 'charging', 'si scarica': 'discharging', 'è scarica': 'is empty', 'carica': 'charging', 'Carica': 'Charge', 'Scarica': 'Discharge', 'In carica': 'Charging', 'in carica': 'charging', 'Piena alle': 'Full at',
  'verso la rete': 'to the grid', 'dalla rete': 'from the grid', 'Dalla rete': 'From the grid', 'Dal sole': 'From the sun', 'Con il sole': 'With the sun', 'Rete': 'Grid',
  'Fotovoltaico e batteria': 'Solar and battery', 'Fotovoltaico': 'Solar', 'Impianto': 'System', 'Stringa': 'String', 'Efficienza': 'Efficiency', 'Autosufficienza': 'Self-sufficiency', 'Quota autoconsumata': 'Self-consumed share',
  'Bolletta stimata': 'Estimated bill', 'Bolletta': 'Bill', 'Verifica con la bolletta': 'Check against the bill', 'Dati della bolletta': 'Bill details', 'Tariffe e stime': 'Rates and estimates',
  'Inserisci totale e kWh della bolletta qui sotto: confronto la stima con il dato reale e ti propongo le correzioni.': 'Enter the bill total and kWh below: I’ll compare the estimate with the real figures and suggest corrections.',
  'Con una sola bolletta correggi un parametro alla volta. Importo reale = totale meno altre voci (': 'With a single bill, correct one parameter at a time. Real amount = total minus other items (',
  'Periodo non ancora concluso: i dati reali si inseriscono a bolletta emessa.': 'Period not over yet: enter the real figures once the bill is issued.',
  'Nessuna correzione possibile con questo periodo.': 'No correction possible with this period.', 'Primo calcolo in corso.': 'First calculation in progress.',
  'Totale da pagare (€)': 'Total to pay (€)', 'Energia prelevata (kWh)': 'Energy drawn (kWh)', 'Accredito GSE del periodo (€)': 'Feed-in credit for the period (€)',
  'Energia immessa €/kWh': 'Exported energy €/kWh', 'Prezzo energia immessa': 'Export price', 'Prezzo acquisto': 'Purchase price', 'Prelievo mensile di base': 'Base monthly draw',
  'Prelievo stimato': 'Estimated draw', 'Prelievo': 'Drawn', 'Immessi': 'Exported', 'Costi fissi': 'Fixed costs', 'Costo medio': 'Average cost', 'Costo': 'Cost', 'Risparmi': 'Savings',
  'Maturato': 'Accrued', 'Correggi al': 'Correct to', 'Parametro aggiornato': 'Parameter updated', ', da pagare a': ', due on', 'a fine bimestre.': 'at the end of the billing period.',
  'nel bimestre': 'in the billing period', 'Bimestre': 'Billing period', 'Nel periodo': 'In the period', 'al GSE': 'to the grid operator', 'Importo': 'Amount', 'Reale': 'Actual', 'Stima': 'Estimate',
  'Carico le statistiche…': 'Loading statistics…', 'Aggiorno le statistiche…': 'Updating statistics…', 'Statistiche non disponibili al momento': 'Statistics unavailable right now',
  'Manca sensor.bolletta_stimata_bimestre: controlla il pacchetto energia_calcoli.yaml.': 'sensor.bolletta_stimata_bimestre is missing: check the energia_calcoli.yaml package.',
  'Buon momento per la lavastoviglie': 'Good time for the dishwasher', 'Buon momento per': 'Good time for', 'la lavastoviglie': 'the dishwasher', 'lavatrice o lavastoviglie': 'washer or dishwasher',
  'Energia oggi': 'Energy today', 'Energia': 'Energy', 'kWh oggi': 'kWh today', 'kWh in totale': 'kWh in total', 'in tutto': 'in total', 'Totali': 'Totals', 'Totale': 'Total',
  'tocca il grafico': 'tap the chart', 'Produzione 2026': 'Production 2026', 'Mese': 'Month', 'Ultimo': 'Last',
  // ---------------------------------------------------------------- meteo
  'Poco nuvoloso': 'Partly cloudy', 'Nuvoloso': 'Cloudy', 'Sereno': 'Clear', 'Pioggia forte': 'Heavy rain', 'Pioggia': 'Rain', 'Temporale': 'Thunderstorm', 'Neve': 'Snow', 'Nevischio': 'Sleet',
  'Nebbia': 'Fog', 'Grandine': 'Hail', 'Ventoso': 'Windy', 'Vento': 'Wind', 'Eccezionale': 'Exceptional', 'Meteo': 'Weather', 'meteo non trovato': 'weather not found',
  'Pioggia in arrivo verso le': 'Rain expected around', 'Pioggia per il resto della giornata': 'Rain for the rest of the day', 'Possibile pioggia più tardi': 'Possible rain later',
  'Niente pioggia nei prossimi': 'No rain in the next', 'Niente pioggia fino a': 'No rain until', 'Dovrebbe smettere verso le': 'Should stop around', 'Dura fino alle': 'Lasts until',
  'Pioggia rilevata': 'Rain detected', 'pioggia rilevata': 'rain detected', 'per tutta la notte': 'all night', 'Stanotte': 'Tonight', 'Sole a': 'Sun at', 'azimut': 'azimuth', 'Sole': 'Sun',
  'Anteprima: non cambia nulla in casa. Tocca Live per tornare al cielo reale.': 'Preview only: nothing changes at home. Tap Live to go back to the real sky.',
  'Live · tocca per fermare': 'Live · tap to stop',
  // ---------------------------------------------------------------- sicurezza
  'Sicurezza · allarme non trovato': 'Security · alarm not found', 'Sicurezza': 'Security', 'Telecamere': 'Cameras', 'Controlla le telecamere': 'Check the cameras', 'Guarda live': 'Watch live',
  'Ultimi eventi · 48 ore': 'Latest events · 48 hours', 'Nessun evento nelle ultime 48 ore': 'No events in the last 48 hours', 'Nessun evento nelle ultime': 'No events in the last',
  'Ultimi movimenti': 'Latest motion', 'Ultimo movimento': 'Last motion', 'Movimento adesso': 'Motion now', 'Movimento ora': 'Motion now', 'Movimenti': 'Motion', 'Movimento': 'Motion',
  'Accessi': 'Access', 'Portone': 'Front door', 'Porta d’ingresso': 'Front door', 'Cancelletto': 'Gate', 'Suonano alla porta': 'Someone’s at the door', 'Manomesso': 'Tampered',
  'Bloccato': 'Locked', 'Sbloccato': 'Unlocked', 'Chiuso': 'Closed', 'Chiusa': 'Closed', 'Aperta · ': 'Open · ', 'Aperta': 'Open', 'Aperto': 'Open', 'Scattato': 'Triggered', 'Pericolo': 'Danger',
  'Live con allarme inserito': 'Live with alarm armed', 'Tocca per confermare': 'Tap to confirm', 'Finestre': 'Windows', 'Finestra': 'Window', '🪟 Finestra': '🪟 Window', 'Porta': 'Door',
  // ---------------------------------------------------------------- robot ed elettrodomestici
  'Taglia il prato': 'Mow the lawn', 'taglia il prato': 'mows the lawn', 'Taglia l’erba': 'Mowing', 'Taglio in corso': 'Mowing in progress', 'Avvia taglio': 'Start mowing',
  'Sta pulendo': 'Cleaning', 'Pulizia in corso': 'Cleaning in progress', 'In pulizia': 'Cleaning', 'Pulisci tutto': 'Clean everything', 'Pulizia per stanza': 'Clean by room',
  'Riprendi la pulizia': 'Resume cleaning', 'Riprendi': 'Resume', 'Torna alla base': 'Return to dock', 'Rientro alla base': 'Returning to dock', 'Rientra': 'Returning', 'Alla base': 'Docked', 'alla base': 'docked', 'In base': 'Docked',
  'In partenza': 'Starting', 'Il robot parte': 'The robot starts', 'In attesa': 'Waiting', 'in attesa': 'waiting', 'In pausa': 'Paused', 'Pausa': 'Pause', 'Fermo': 'Idle', 'Ferma': 'Stopped', 'Stop risciacquo': 'Rinse hold', 'Stop': 'Stop',
  'Avvia': 'Start', 'Avviato': 'Started', 'Trova': 'Locate', 'Avviso': 'Notice', 'Errore nel caricamento:': 'Loading error:', 'Errore': 'Error', 'Problema': 'Problem', 'Da controllare': 'Needs checking', 'da controllare.': 'needs checking.',
  'Metodo di pulizia': 'Cleaning method', 'Modalità di pulizia': 'Cleaning mode', 'Potenza di aspirazione': 'Suction power', 'Aspirazione': 'Vacuum', 'Aspira e lava': 'Vacuum and mop', 'Prima aspira, poi lava': 'Vacuum first, then mop',
  'Lavaggio approfondito': 'Deep mopping', 'Lavaggio ad aria': 'Air wash', 'Lavaggio': 'Mopping', 'Quantità d’acqua': 'Water amount', 'Umidità del panno': 'Mop wetness', 'Spinta sui tappeti': 'Carpet boost', 'Passaggi stanza': 'Room passes',
  'Area totale pulita': 'Total area cleaned', 'Area pulita': 'Area cleaned', 'Tempo totale di pulizia': 'Total cleaning time', 'Tempo di pulizia': 'Cleaning time', 'Numero di pulizie': 'Number of cleanings',
  'Ultima pulizia': 'Last cleaning', 'Prima pulizia': 'First cleaning', 'h dall\'ultima pulizia': 'h since the last cleaning', 'Autopulizia': 'Self-cleaning', 'Svuotamento automatico': 'Auto-empty', 'Asciugatura': 'Drying',
  'Spazzola principale, ore residue': 'Main brush, hours left', 'Spazzola laterale, ore residue': 'Side brush, hours left', 'Filtro, ore residue': 'Filter, hours left',
  'Spazzola principale residua': 'Main brush left', 'Spazzola laterale residua': 'Side brush left', 'Filtro residuo': 'Filter left', 'Panno residuo': 'Mop left', 'Detergente residuo': 'Detergent left',
  'Azzera spazzola principale': 'Reset main brush', 'Azzera spazzola laterale': 'Reset side brush', 'Azzera filtro': 'Reset filter', 'Azzera panno': 'Reset mop',
  'Serbatoio acqua': 'Water tank', 'Acqua pulita': 'Clean water', 'Acqua sporca': 'Dirty water', 'Panno': 'Mop', 'Stanza attuale': 'Current room', 'Mappa di': 'Map of', 'Mappa': 'Map',
  'Blocco bambini': 'Child lock', 'Non disturbare': 'Do not disturb', 'Inizio non disturbare': 'Do not disturb from', 'Fine non disturbare': 'Do not disturb until', 'Volume': 'Volume', 'Suono': 'Sound', 'Suona adesso': 'Ring now', 'Suona': 'Ring',
  'Velocità': 'Speed', 'Veloce': 'Fast', 'Lenta': 'Slow', 'Normale': 'Normal', 'Standard': 'Standard', 'Turbo': 'Turbo', 'Massima': 'Max', 'Alta': 'High', 'Media': 'Medium', 'Bassa': 'Low', 'Basso': 'Low', 'Min': 'Min',
  'Forte': 'Strong', 'Diffusa': 'Wide', 'Concentrata': 'Focused', 'Personalizzata': 'Custom', 'Asciutto': 'Dry', 'Bagnato': 'Wet', 'Pieno': 'Full', 'Vuoto': 'Empty',
  'Dettagli': 'Details', 'Tutti i comandi': 'All controls', 'Tutte le funzioni': 'All functions', 'Comandi': 'Controls', 'Controlli': 'Controls', 'Controllo remoto': 'Remote control',
  'Lavatrice': 'Washer', 'Stato macchina': 'Machine state', 'Fase': 'Phase', 'Fine prevista': 'Expected end', 'Acqua consumata': 'Water used', 'Energia ultimo ciclo': 'Energy last cycle', 'Energia risparmiata': 'Energy saved',
  'Programma': 'Program', 'Prelavaggio': 'Pre-wash', 'Ammollo a bolle': 'Bubble soak', 'Ammollo': 'Soak', 'Risciacqui': 'Rinses', 'Risciacquo': 'Rinse', 'Senza centrifuga': 'No spin', 'Centrifuga': 'Spin', 'Senza': 'None',
  'Partenza ritardata': 'Delayed start', 'Pesatura': 'Weighing', 'Finito': 'Finished', 'In funzione · ': 'Running · ', 'In funzione': 'Running', 'finisce alle': 'ends at', '· fine': '· end', '· in corso': '· in progress',
  'Fredda': 'Cold', 'Carico': 'Load', 'Scarto': 'Deviation', 'Vibrazione': 'Vibration', 'Acceso · ': 'On · ', 'Robot': 'Robots',
  // ---------------------------------------------------------------- stanze e pagine
  'Torna alle stanze': 'Back to rooms', 'Stanze': 'Rooms', 'Stanza': 'Room', 'Dispositivi': 'Devices', 'Dispositivo': 'Device', 'Sensori e consumi': 'Sensors and usage', 'Sensori': 'Sensors',
  'Scene': 'Scenes', 'Automazioni': 'Automations', 'Script': 'Scripts', 'Clima': 'Climate', 'Luci': 'Lights', 'Luce': 'Light', 'Casa': 'Home',
  'Sistema molto caldo': 'System running very hot', 'Sistema': 'System', 'Aggiornamenti': 'Updates', 'Impostazioni › Aggiornamenti': 'Settings › Updates', 'Ultimo backup': 'Last backup', 'Backup automatico in ritardo': 'Automatic backup overdue',
  'Disco quasi pieno': 'Disk almost full', 'Memoria quasi esaurita': 'Memory almost full', 'Memoria': 'Memory', 'Disco': 'Disk', 'Versione': 'Version', 'Connessione': 'Connection',
  'Collegato': 'Connected', 'Scollegato': 'Disconnected', 'Online': 'Online', 'Offline': 'Offline', 'In linea · ': 'Online · ', 'Disponibile': 'Available', 'da installare': 'to install', 'da cambiare': 'to replace',
  'entità non disponibili': 'entities unavailable', 'Non disponibile': 'Unavailable', 'non disponibile': 'unavailable', 'Non disp.': 'N/A', '· non disp.': '· N/A', 'Non trovata': 'Not found', 'non trovata': 'not found', 'non trovato': 'not found',
  'Entità non configurata': 'Entity not configured', 'nella configurazione della card': 'in the card configuration', 'Valore non valido': 'Invalid value',
  'Storico attività': 'Activity history', 'Storico non disponibile al momento': 'History unavailable right now', 'Storico non disponibile': 'History unavailable', 'Storico': 'History',
  'Registro non disponibile': 'Log unavailable', 'Carico il registro…': 'Loading the log…', 'Carico lo storico…': 'Loading history…', 'Nessun dato nelle ultime 24 ore': 'No data in the last 24 hours', 'Nessun dato': 'No data',
  'Attività': 'Activity', 'Avvisi': 'Alerts', 'Consiglio': 'Tip', 'Chiudi il consiglio': 'Close the tip', 'Navigazione': 'Navigation', 'Menu di Home Assistant': 'Home Assistant menu',
  'Assist, parla con la casa': 'Assist, talk to your home', 'Comando vocale': 'Voice command', 'Tutte le impostazioni': 'All settings', 'Impostazioni dell\'app': 'App settings', 'Impostazioni': 'Settings',
  'Mostra tutti (': 'Show all (', 'Mostra altri': 'Show more', 'Mostra l’altro': 'Show the other one', 'Mostra meno': 'Show less', 'e altri': 'and others',
  'Raccolta di oggi': 'Today’s collection', 'Raccolta di domani': 'Tomorrow’s collection', 'Raccolta oggi:': 'Collection today:', 'Da esporre domani dalle': 'Put out tomorrow from', 'Da esporre dalle': 'Put out from',
  'Esponi entro le': 'Put out by', '♻️ Esponi ora:': '♻️ Put out now:', '♻️ Domani:': '♻️ Tomorrow:', '♻️ Stasera:': '♻️ Tonight:',
  'Aggiungi la foto della casa in Isola Live': 'Add the photo of your home in Isola Live', 'Aggiungi la foto della casa:': 'Add the photo of your home:', 'Foto casa': 'Home photo',
  'Piano terra · tocca per aprire': 'Ground floor · tap to open', 'Piano terra': 'Ground floor', 'Primo piano': 'First floor', 'Piano non disponibile:': 'Floor unavailable:',
  'Apri Isola Live': 'Open Isola Live', 'Isola Live non è installata (risorsa isola-live.js)': 'Isola Live is not installed (isola-live.js resource)', 'Isola Live non si apre': 'Isola Live won’t open',
  'Caricamento della casa 3D…': 'Loading the 3D house…', 'Caricamento della casa…': 'Loading the house…', 'Preparo il rendering…': 'Preparing the rendering…',
  'Rendering non supportato su questo dispositivo': 'Rendering not supported on this device', '– passo al 3D': '– switching to 3D', 'Vista foto non disponibile:': 'Photo view unavailable:',
  'foto della casa non trovata (': 'home photo not found (', 'immagine del render non trovata': 'render image not found', 'Foto pronta · tocca 📷 per tornare alla vista animata': 'Photo ready · tap 📷 to go back to the animated view',
  'La casa vista dall\'alto': 'The house from above', 'Vista dall\'alto': 'Top view', 'Cambia vista: foto / 3D': 'Switch view: photo / 3D', 'Foto realistica': 'Realistic photo', 'Pareti basse': 'Low walls',
  'Etichette': 'Labels', 'Schermo intero': 'Full screen', 'Interno': 'Inside', 'Giardino': 'Garden', 'Alto': 'Top', 'Foto': 'Photo', 'Vista': 'View',
  // ---------------------------------------------------------------- tempo
  'Ancora oggi': 'Later today', 'Oggi': 'Today', 'oggi': 'today', 'Domani': 'Tomorrow', '· domani': '· tomorrow', 'domani': 'tomorrow', 'ieri': 'yesterday', 'Adesso': 'Now', 'adesso': 'now', 'Ora:': 'Now:', 'Ora': 'Now', 'ora': 'now',
  'giorni fa': 'days ago', 'min fa': 'min ago', 'fino alle': 'until', '· alle': '· at', 'in arrivo': 'coming', 'Giorno': 'Day', '24 ore': '24 hours', '6 ore': '6 hours', '2 giorni': '2 days', '7 giorni': '7 days',
  'lunedì': 'Monday', 'martedì': 'Tuesday', 'mercoledì': 'Wednesday', 'giovedì': 'Thursday', 'venerdì': 'Friday', 'sabato': 'Saturday', 'domenica': 'Sunday',
  // ---------------------------------------------------------------- generici
  'Annulla il salvataggio': 'Undo the save', 'Annullato': 'Undone', 'Annulla': 'Cancel', 'Applica': 'Apply', 'Conferma': 'Confirm', 'Confermi?': 'Confirm?', 'Chiudi': 'Close', 'Apri': 'Open', 'Indietro': 'Back',
  'Aggiornato': 'Updated', 'aggiornato': 'updated', 'Non riuscito:': 'Failed:', ': non riuscito': ': failed', 'Sì': 'Yes', 'No': 'No', 'Ok': 'OK', 'Attiva': 'Active', 'Stato': 'Status', 'Dettagli ': 'Details ',
  'Ingrandisci': 'Zoom in', 'Riduci': 'Zoom out', 'Adatta': 'Fit', 'Elenco': 'List', 'Fatto': 'Done', 'fatto': 'done', 'Salva': 'Save', 'Salvato': 'Saved', 'Prossimo': 'Next', 'Resta': 'Stay', 'Rifai': 'Redo', 'Scala': 'Scale',
  'Isola Live usa già le nuove posizioni. La configurazione precedente è stata tenuta da parte.': 'Isola Live is already using the new positions. The previous configuration has been kept aside.',
  // ---------------------------------------------------------------- configuratore
  'Posiziona gli elementi sulla foto': 'Place items on the photo', 'Posiziona gli elementi': 'Place items', 'Posiziona': 'Place',
  'Scegli un elemento e toccalo sulla foto. I segnaposto si trascinano.': 'Pick an item and tap it on the photo. Markers can be dragged.',
  'Scegli un passo qui a lato.': 'Pick a step on the side.', 'Completo. Trascina il segnaposto per spostarlo.': 'Done. Drag the marker to move it.',
  'Da mettere sulla foto': 'To place on the photo', 'Cerca per nome o stanza': 'Search by name or room', 'Nessun elemento trovato': 'No items found', 'Tutti gli elementi': 'All items',
  'da mettere': 'to place', 'a metà': 'half done', 'Porte e finestre ': 'Doors and windows ', 'Sulla foto · trascina per spostare': 'On the photo · drag to move', 'Non ancora sulla foto': 'Not on the photo yet',
  'Facoltativa, ma la luce resta dentro i muri': 'Optional, but keeps the light inside the walls', 'Dove si muove mentre lavora': 'Where it moves while working', 'Verso dove scorre l’energia': 'Where the energy flows to',
  'Zona di lavoro': 'Working area', 'Punto della casa': 'House point', 'Posizione': 'Position', 'Messo sulla foto': 'Placed on the photo', 'Messo': 'Placed', 'Riquadro messo': 'Box placed', 'Spostato': 'Moved', 'Tolto dalla foto': 'Removed from the photo',
  'Tocca la foto nel punto in cui si trova.': 'Tap the photo where it is.', 'Tocca la foto dove sta la base di ricarica.': 'Tap the photo where the charging dock is.',
  'Tocca la foto dove vuoi il riquadro del fotovoltaico.': 'Tap the photo where you want the solar box.', 'Tocca il punto della casa verso cui scorre l’energia.': 'Tap the point of the house the energy flows to.',
  'Tocca il punto della stanza dove compaiono le persone quando c’è movimento.': 'Tap the spot in the room where people appear when there is motion.',
  'Tocca gli angoli della stanza, uno dopo l’altro: la luce resterà dentro i muri.': 'Tap the room corners one after another: the light will stay inside the walls.',
  'Trascina sulla foto per disegnare il rettangolo in cui si muove. Puoi aggiungerne più di uno.': 'Drag on the photo to draw the rectangle it moves in. You can add more than one.',
  'Trascina per disegnare la zona · due dita per spostare la foto': 'Drag to draw the area · two fingers to move the photo', 'Trascina da un angolo all’angolo opposto': 'Drag from one corner to the opposite one',
  'Tocca il primo angolo della stanza': 'Tap the first corner of the room', 'Tocca l’angolo successivo': 'Tap the next corner', 'Tocca il primo punto (bianco) per chiudere la stanza': 'Tap the first (white) point to close the room',
  'Tocca un’estremità di un muro di cui conosci la lunghezza': 'Tap one end of a wall whose length you know', 'Ora tocca l’altra estremità': 'Now tap the other end',
  'Togli l’ultimo angolo': 'Remove the last corner', 'Chiudi la stanza': 'Close the room', 'Rettangolo: trascina da angolo ad angolo': 'Rectangle: drag corner to corner', 'Torna agli angoli': 'Back to corners',
  'Togli la stanza': 'Remove the room', 'Togli l’ultima zona': 'Remove the last area', 'Togli tutte le zone': 'Remove all areas', 'Rimettilo in un altro punto': 'Put it somewhere else', 'Togli dalla foto': 'Remove from the photo',
  'Grandezza della luce': 'Light size', 'Stanza fatta': 'Room done', 'Stanza copiata': 'Room copied', 'Zona aggiunta': 'Area added',
  'Misura la scala': 'Measure the scale', 'Scala della foto': 'Photo scale', 'Pixel per metro': 'Pixels per metre', 'pixel per metro': 'pixels per metre',
  'Serve per la grandezza delle luci e la velocità dei robot. Tocca le due estremità di un muro, poi scrivi quanto è lungo.': 'Used for light size and robot speed. Tap both ends of a wall, then type how long it is.',
  'Quanto è lungo?': 'How long is it?', 'Hai misurato': 'You measured', 'pixel. Scrivi la lunghezza vera in metri (per esempio la parete della cucina).': 'pixels. Type the real length in metres (for example the kitchen wall).',
  'Usa questa misura': 'Use this measurement', 'es. 4,5': 'e.g. 4.5',
  'Uscire senza salvare?': 'Leave without saving?', 'Le modifiche fatte qui andranno perse.': 'Changes made here will be lost.', 'Esci senza salvare': 'Leave without saving',
  'Salvare la posizione degli elementi?': 'Save the item positions?', 'Viene aggiornata solo la configurazione di questa card: il resto della dashboard non si tocca.': 'Only this card’s configuration is updated: the rest of the dashboard is left untouched.',
  'Salvato nella dashboard': 'Saved to the dashboard', 'Salva nella dashboard': 'Save to dashboard', 'Copia YAML': 'Copy YAML', 'Continua a modificare': 'Keep editing', 'YAML copiato': 'YAML copied', 'Seleziona il testo e copialo': 'Select the text and copy it',
  'Prima di salvare viene tenuta una copia della configurazione precedente: si torna indietro con un tocco.': 'Before saving, a copy of the previous configuration is kept: you can go back with one tap.',
  'C’è una copia della configurazione salvata il': 'There is a copy of the configuration saved on', 'Ripristina quella versione': 'Restore that version', 'Versione precedente ripristinata': 'Previous version restored',
  'La card è tornata com’era prima del salvataggio.': 'The card is back to how it was before saving.', 'La card è cambiata nel frattempo: non posso ripristinare in automatico.': 'The card has changed in the meantime: I can’t restore it automatically.',
  'Solo un amministratore di Home Assistant può salvare nella dashboard. Puoi copiare lo YAML.': 'Only a Home Assistant administrator can save to the dashboard. You can copy the YAML.',
  'Quale card aggiorno?': 'Which card should I update?', 'In questa dashboard ci sono più card': 'This dashboard has several cards of type',
  'Non trovo questa card nella dashboard aperta. Copia lo YAML e incollalo nella card.': 'I can’t find this card in the open dashboard. Copy the YAML and paste it into the card.',
  'Questa dashboard è scritta in YAML: copia lo YAML e incollalo nel file della dashboard.': 'This dashboard is written in YAML: copy the YAML and paste it into the dashboard file.',
  'Questa dashboard è generata da Home Assistant: per salvare, prima prendine il controllo (matita › Prendi il controllo), oppure copia lo YAML.': 'This dashboard is generated by Home Assistant: to save, first take control of it (pencil › Take control), or copy the YAML.',
  'Questa dashboard non si può modificare da qui (è scritta in YAML o non hai i permessi). Copia lo YAML e incollalo a mano.': 'This dashboard can’t be edited from here (it is written in YAML or you lack permission). Copy the YAML and paste it by hand.',
  'Dashboard non trovata: apri il configuratore dalla dashboard in cui si trova la card.': 'Dashboard not found: open the configurator from the dashboard that contains the card.',
  'Salvataggio non riuscito:': 'Saving failed:', 'Home Assistant non raggiungibile': 'Home Assistant unreachable', 'Configuratore non trovato (isola-live-editor.js)': 'Configurator not found (isola-live-editor.js)',
  'Foto della casa non trovata:': 'Home photo not found:', 'luci (': 'lights (', 'con stanza)': 'with room)', 'sensori e movimento': 'sensors and motion', 'robot': 'robots',
  'Luci giardino al tramonto': 'Garden lights at sunset',
  'Casa usa': 'House uses', 'Disegno la casa 3D dalle tue stanze…': 'Drawing your 3D home from your rooms…',
  'Non riesco a disegnare la casa 3D su questo dispositivo: aggiungi la foto della casa (': 'I can’t draw the 3D home on this device: add a photo of your home (', ') nella configurazione della card': ') to the card configuration',
  'Scambia stanze': 'Swap rooms', 'Scambia': 'Swap', 'Rigenera la casa': 'Regenerate the home', 'Rigenera': 'Regenerate', 'Ridisegno la casa…': 'Redrawing the home…',
  'Pochi secondi: il modello 3D viene ricostruito con la nuova disposizione.': 'A few seconds: the 3D model is being rebuilt with the new layout.',
  'Stanze scambiate': 'Rooms swapped', 'Nuova disposizione': 'New layout', 'Non riesco a ridisegnare la casa': 'I can’t redraw the home', 'Tocca una stanza': 'Tap a room',
  'Ora tocca la stanza con cui scambiarla': 'Now tap the room to swap it with', 'Tocca la prima stanza da spostare': 'Tap the first room to move',
  'Tocca due stanze sulla foto: si scambiano di posto e la casa si ridisegna. Le luci e i sensori le seguono.': 'Tap two rooms on the photo: they swap places and the home is redrawn. Lights and sensors follow them.',
  'Annulla tutti gli scambi': 'Undo all swaps', 'Prova un\'altra disposizione': 'Try another layout', 'Fuori': 'Away',
  // ---------------------------------------------------------------- beta.7: colori delle luci, campanello, editor visivo
  'Colore cambiato': 'Colour changed', 'Bianco caldo': 'Warm white', 'Bianco freddo': 'Cool white', 'Bianco neutro': 'Neutral white', 'Colore': 'Colour', 'Bianco': 'White',
  'Parla': 'Talk', 'Campanello': 'Doorbell', 'Nessuna telecamera collegata al campanello': 'No camera linked to the doorbell',
  'aperta': 'open', 'aperto': 'open', 'aperte': 'open', 'chiusa': 'closed', 'chiuso': 'closed', 'accesa': 'on', 'acceso': 'on', 'spenta': 'off', 'spento': 'off',
};
// frasi con numeri o nomi in mezzo
const P = [
  [/(\d+) di (\d+) elementi completi/g, '$1 of $2 items done'],
  [/(\d+) angoli\b/g, '$1 corners'], [/\b1 zona\b/g, '1 area'], [/(\d+) zone\b/g, '$1 areas'],
  [/Usa la stanza di (.+)/g, 'Use the same room as $1'],
  [/^Dettagli (.+)$/g, '$1 · details'],
  [/^(.+?) e (.+?) al lavoro/g, '$1 and $2 working'],
  [/(\d+) luci\b(?! acces| spent)/g, '$1 lights'], [/\b1 luce\b(?! acces| spent)/g, '1 light'],
  [/\bFinestra (.+?) aperta/g, (m, n, off) => { const r = (/window|door|finestra/i.test(n) ? n : 'Window ' + n) + ' open'; return off === 0 ? r[0].toUpperCase() + r.slice(1) : r; }],
  [/(\d+) min\b(?! fa)/g, '$1 min'],
];

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let RX = null;
// i bordi di parola valgono solo dove la frase inizia o finisce con una lettera o un numero
const W = /[\p{L}\p{N}_]/u;
const rx = () => RX || (RX = new RegExp(Object.keys(D).sort((a, b) => b.length - a.length)
  .map(k => (W.test(k[0]) ? '(?<![\\p{L}\\p{N}_])' : '') + esc(k) + (W.test(k[k.length - 1]) ? '(?![\\p{L}\\p{N}_])' : '')).join('|'), 'gu'));

export function i18nT(s) {
  if (LANG === 'it' || !s || !/\p{L}/u.test(s)) return s;
  let o = s;
  for (const [r, x] of P) o = o.replace(r, x);
  return o.replace(rx(), m => D[m] ?? m);
}
export function i18nLang(h, forced) {
  const want = forced && forced !== 'auto' ? forced : (h && ((h.locale && h.locale.language) || h.language)) || 'it';
  const nl = /^it/i.test(want) ? 'it' : 'en';
  if (nl === LANG) return;
  LANG = nl;
  if (LANG !== 'it') roots.forEach(r => tr(r));
}
export const i18nLang0 = () => LANG;
export const i18nLoc = () => LANG === 'it' ? 'it-IT' : (typeof navigator !== 'undefined' && /^en/i.test(navigator.language || '') ? navigator.language : 'en-GB');

// ---------------------------------------------------------------- traduzione del DOM
const ATTR = ['title', 'placeholder', 'aria-label', 'alt'];
const done = new WeakMap();   // nodo -> ultimo testo tradotto (per non tradurre due volte)
function tr(n) {
  if (!n) return;
  if (n.nodeType === 3) {
    const v = n.nodeValue;
    if (!v || done.get(n) === v || !/\p{L}/u.test(v)) return;
    const t = i18nT(v); done.set(n, t);
    if (t !== v) n.nodeValue = t;
    return;
  }
  if (n.nodeType === 1) {
    if (/^(STYLE|SCRIPT|TEXTAREA)$/.test(n.tagName) || n.hasAttribute('data-noi18n')) return;
    for (const a of ATTR) {
      const v = n.getAttribute(a);
      if (v && /\p{L}/u.test(v)) { const k = '\u0001' + a, last = n[k]; if (last !== v) { const t = i18nT(v); n[k] = t; if (t !== v) n.setAttribute(a, t); } }
    }
  }
  if (n.nodeType === 1 || n.nodeType === 11) for (let c = n.firstChild; c; c = c.nextSibling) tr(c);
}
export function i18nAttach(root) {
  if (!root || roots.has(root)) return;
  roots.add(root);
  const mo = new MutationObserver(ms => {
    if (LANG === 'it') return;
    for (const m of ms) {
      if (m.type === 'characterData' || m.type === 'attributes') tr(m.target);
      else m.addedNodes.forEach(tr);
    }
  });
  mo.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTR });
  if (LANG !== 'it') tr(root);
}

// ------------------------------------------------------------------ nomi delle entità (Home Assistant 2026: nome del dispositivo + nome dell'entità)
// friendly_name finché c'è; altrimenti il nome composto dal registro, come fa Home Assistant
export function entName(h, id) {
  const st = h && h.states && h.states[id], a = (st && st.attributes) || {};
  if (a.friendly_name) return a.friendly_name;
  const e = h && h.entities && h.entities[id], d = e && e.device_id && h.devices ? h.devices[e.device_id] : null;
  const dn = d ? (d.name_by_user || d.name) : '', en = e ? e.name : '';
  if (dn && en) return en.toLowerCase().startsWith(dn.toLowerCase()) ? en : dn + ' ' + en;
  return en || dn || String(id).split('.').pop().replace(/_/g, ' ');
}

// ------------------------------------------------------------------ energia: i sensori di potenza scelti nel cruscotto Energia
// (Home Assistant 2025.12+ permette di indicare la potenza di fotovoltaico, batteria e rete). Letto una volta sola.
let _eR = null, _eP = null; const _eW = new Set();
const _rate = s => s.stat_rate || (s.power_config && s.power_config.stat_rate) || (Array.isArray(s.power) && s.power[0] && s.power[0].stat_rate) || '';
export function energyRates(h, done) {
  if (_eR) return _eR;
  if (done) _eW.add(done);
  if (!_eP && h && typeof h.callWS === 'function') {
    _eP = h.callWS({ type: 'energy/get_prefs' }).then(p => {
      const r = {};
      for (const s of (p && p.energy_sources) || []) { const x = _rate(s); if (!x) continue; const k = { solar: 'pv', battery: 'bat', grid: 'grid' }[s.type]; if (k && !r[k]) r[k] = x; }
      _eR = r;
    }).catch(() => { _eR = {}; }).then(() => { const w = [..._eW]; _eW.clear(); w.forEach(f => { try { f(_eR); } catch (e) { } }); });
  }
  return null;
}
