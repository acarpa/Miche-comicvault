# ComicVault

App Android per leggere fumetti, manga e webtoon, **privata e 100% offline**: nessun account, nessun server.
Fumetti, GIF e video restano nella memoria dell'app sul telefono.

## Cosa fa
- **Importazione solida**
  - formati: CBZ, CBR (anche RAR5), CB7, CBT, ZIP, RAR, 7Z e PDF;
  - il tipo di file si riconosce dal contenuto, non dall'estensione. Per gli ZIP/CBZ, se il primo lettore non ce la fa, c'è un secondo tentativo;
  - si possono importare anche **cartelle intere**:
    - i fumetti dentro la cartella vengono importati uno per uno;
    - le immagini sciolte diventano un fumetto;
    - le sottocartelle di immagini diventano i capitoli di una serie;
  - le strisce webtoon lunghissime vengono tagliate in pezzi invisibili, così il telefono non si blocca;
  - si importa dal pulsante **+**, da **Condividi → ComicVault** o da **Apri con → ComicVault**.
- **Libreria**
  - ricerca istantanea per titolo, serie, autore e #tag;
  - filtri (In lettura, Da leggere, Letti, Preferiti), per tag e per autore;
  - ordinamento (recenti, aggiunti, A-Z, serie e capitolo);
  - "Continua a leggere".
- **Serie e capitoli**
  - serie e numero di capitolo si ricavano dal nome del file ("One Piece 1045.cbz", "Naruto v01 c003.cbr", "Cap. 12") e si possono correggere a mano;
  - ogni serie ha la sua pagina con i capitoli in ordine e "Continua";
  - a fine lettura compare il **capitolo successivo**.
- **Lettore ibrido**
  - Fumetto (sinistra→destra), Manga (destra→sinistra) e Webtoon (scorrimento verticale continuo, senza stacchi);
  - zoom con due dita o doppio tocco;
  - zone di tocco invisibili: bordi = pagina precedente/successiva, centro = comandi;
  - barra di avanzamento flottante e minimale;
  - schermo sempre acceso.
- **Media personali**: GIF, foto e video salvati solo in ComicVault, con visualizzatore a schermo intero, zoom, lettore video e preferiti.
- **Backup vero in un solo file `.comicvault`** (ZIP con dentro l'indice `comicvault.json` e tutti i file):
  - si salva in una cartella o si invia (PC, Drive, Telegram...) e si apre su un altro telefono o sul PC;
  - "Unisci" aggiunge ciò che manca e aggiorna i progressi, "Sostituisci" rende la libreria identica al backup;
  - "Solo progressi": file piccolissimo con pagine lette, preferiti, serie e tag;
  - si ripristinano anche i vecchi backup a cartella della versione 1.
- **Privacy**
  - PIN (4-8 cifre, salvato cifrato) e sblocco con impronta, blocco quando torni nell'app;
  - schermo protetto: niente screenshot e contenuto nascosto nelle app recenti;
  - **pulsante antipanico** (icona con l'occhio): schermo nero all'istante (tieni premuto 2 secondi per tornare), oppure blocco o uscita.
- **Interfaccia**
  - tema scuro #130c1f con accenti viola, rosa e azzurro;
  - schede in basso animate;
  - la copertina si ingrandisce quando apri un fumetto;
  - vibrazioni leggere (disattivabili) e segnaposto animati durante i caricamenti.

## Struttura
```
src/
├── app/                       schermate (Expo Router)
│   ├── _layout.tsx            avvio: tema, blocco, antipanico, animazione copertina, file da altre app
│   ├── (tabs)/                le quattro schede: Libreria, Serie, Media, Impostazioni
│   ├── reader/[id].tsx        lettore
│   ├── comic/[id].tsx         scheda del fumetto (serie, capitolo, autore, tag)
│   ├── series/[name].tsx      pagina della serie
│   ├── media/[id].tsx         visualizzatore di GIF, foto e video
│   ├── backup.tsx             backup .comicvault e ripristino
│   └── pin-setup.tsx          imposta / cambia / disattiva PIN
├── components/                copertine, scheletri, barra schede, lettore, editor dei tag...
├── lib/                       database SQLite, importazione, serie, media, backup (vault.ts), sicurezza
├── store/                     stato (libreria, media, impostazioni, blocco, importazioni, interfaccia)
└── hooks/                     azioni, avvio, blocco automatico
modules/comic-archive/         modulo nativo Kotlin: archivi, PDF, cartelle, media, ZIP del backup
plugins/                       impostazioni di compilazione Android (memoria Gradle, solo arm64)
```

## Formato del backup `.comicvault`
È un normale file ZIP, pensato per essere letto anche dalla versione per PC:
```
comicvault.json            indice: { app: "comicvault", format: 2, kind: "full" | "progress", comics: [...], media: [...] }
comics/<id>/0001.jpg ...   pagine e copertina di ogni fumetto
media/<file>               GIF, foto e video
media/thumbs/<file>        miniature dei media
```
`comicvault.json` è sempre il primo file dello ZIP.

## Creare l'APK su Windows
Servono gli stessi strumenti di prima: Node.js, Android Studio e Java 17 con `JAVA_HOME` impostato.

1. Metti il progetto in una cartella **corta**, ad esempio `C:\cv`. Con percorsi lunghi la compilazione fallisce ("Filename longer than 260 characters").
2. Apri PowerShell in `C:\cv` e lancia un comando alla volta:
   ```powershell
   npm install
   npx expo prebuild -p android --clean
   cd android
   .\gradlew assembleRelease
   ```
3. Alla fine compare `BUILD SUCCESSFUL`. L'app è in `C:\cv\android\app\build\outputs\apk\release\app-release.apk`: mandala al telefono e installala sopra la vecchia. Fumetti e progressi restano.

> Non lanciare `npm audit fix`: cambierebbe le versioni delle librerie e la compilazione si romperebbe.
> ComicVault usa codice nativo proprio, quindi **non funziona in Expo Go**: va sempre compilata come APK.

## Note
- Se dimentichi il PIN non c'è modo di recuperarlo: bisogna reinstallare l'app e i fumetti si perdono. Fai un backup ogni tanto.
- L'APK è compilato solo per telefoni a 64 bit (arm64), cioè praticamente tutti quelli degli ultimi anni.
