# ComicVault

App Android per leggere fumetti e manga digitali, **privata e 100% offline**: nessun account, nessun server.
I fumetti restano nella memoria dell'app sul telefono.

## Cosa fa
- **Formati**: CBZ, CBR (anche RAR5), CB7, CBT, ZIP, RAR, 7Z. L'apertura degli archivi è fatta da un modulo nativo (`modules/comic-archive`, libreria libarchive).
- **Importazione**: dal pulsante **+** (anche più file insieme), da **Condividi → ComicVault** o da **Apri con → ComicVault** in un file manager.
- **Libreria**: "Continua a leggere", filtri (In lettura, Da leggere, Letti, Preferiti), ricerca, ordinamento, 2 o 3 copertine per riga.
- **Lettore**:
  - modalità **Fumetto** (sinistra→destra), **Manga** (destra→sinistra) e **Webtoon** (scorrimento verticale), anche per singolo fumetto;
  - zoom con due dita o doppio tocco;
  - tocco sui bordi per girare pagina, barra per saltare a una pagina;
  - schermo sempre acceso; riprende da dove eri rimasto.
- **Privacy**:
  - PIN (4-8 cifre, salvato cifrato) e sblocco con impronta;
  - blocco quando torni nell'app;
  - schermo protetto (niente screenshot, contenuto nascosto nelle app recenti);
  - **pulsante antipanico** (icona con l'occhio) che blocca o chiude l'app all'istante.
- **Backup**:
  - cartella con un .cbz per fumetto più titoli, preferiti e pagine lette;
  - ripristino anche su un telefono nuovo;
  - esportazione di un singolo fumetto come .cbz.

## Struttura
```
src/
├── app/                  schermate (Expo Router)
│   ├── _layout.tsx       avvio: tema, blocco, libreria, file ricevuti da altre app
│   ├── index.tsx         libreria
│   ├── reader/[id].tsx   lettore
│   ├── comic/[id].tsx    scheda del fumetto
│   ├── settings.tsx      impostazioni
│   ├── backup.tsx        backup e ripristino
│   ├── pin-setup.tsx     imposta / cambia / disattiva PIN
│   └── +native-intent.tsx  "Apri con" da altre app
├── components/           copertine, tastierino PIN, lettore (zoom, barra pagine)...
├── lib/                  database SQLite, importazione, backup, sicurezza, formattazione
├── store/                stato (libreria, impostazioni, blocco, importazioni)
└── hooks/                azioni sui fumetti, avvio, blocco automatico
modules/comic-archive/    modulo nativo Kotlin: estrazione pagine e creazione .cbz
plugins/                  impostazioni di compilazione Android (memoria Gradle, solo arm64)
```

## Creare l'APK su Windows
Si usano gli stessi strumenti della To Do List: Node.js, Android Studio e Java 17 con `JAVA_HOME` impostato.

1. Metti il progetto in una cartella **corta**, per esempio `C:\cv`. Con percorsi lunghi la compilazione fallisce con "Filename longer than 260 characters".
2. Apri PowerShell in `C:\cv` e lancia un comando alla volta:
   ```powershell
   npm install
   npx expo prebuild -p android
   cd android
   .\gradlew assembleRelease
   ```
3. Alla fine (`BUILD SUCCESSFUL`) l'app è in `C:\cv\android\app\build\outputs\apk\release\app-release.apk`: mandala al telefono e installala.

Per aggiornare l'app dopo una modifica al codice, rilancia `.\gradlew assembleRelease` nella cartella `android` e installa il nuovo APK sopra il vecchio: i fumetti restano.
Se hai cambiato `app.json` o aggiunto librerie, prima rifai `npx expo prebuild -p android`.

> ComicVault usa codice nativo proprio, quindi **non funziona in Expo Go**: va sempre compilata come APK.

## Note
- Se dimentichi il PIN non c'è modo di recuperarlo: bisogna reinstallare l'app e i fumetti si perdono. Fai un backup ogni tanto.
- L'APK è compilato solo per telefoni a 64 bit (arm64), cioè praticamente tutti quelli degli ultimi anni.
