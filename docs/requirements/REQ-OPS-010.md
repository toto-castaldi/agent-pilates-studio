# REQ-OPS-010 — Backup a caldo pianificato della produzione

**State:** Active

Su `jarvis` il backup a caldo di REQ-OPS-008 deve essere eseguito automaticamente due volte al giorno, alle 14:30 e alle 22:30 ora locale (Europe/Rome), tramite la crontab dell'utente operatore. La riga crontab invoca uno script shell versionato, installato a mano nella home come il launcher di REQ-OPS-009, che usa soltanto il commit registrato come in esercizio, senza sceglierne altri, non richiede checkout né credenziali GitHub e non duplica dump, checksum e marcatori di REQ-OPS-008. Se manca un'installazione o il backup fallisce, l'esecuzione termina con errore e lo lascia nel log locale dello script, senza credenziali, messaggi o numeri di telefono (REQ-NFR-002); due esecuzioni non si sovrappongono.

Dopo un backup riuscito sono conservati i backup a caldo pianificati completi degli ultimi 30 giorni; quelli più vecchi sono eliminati. La rotazione non tocca backup manuali, quiescenti o incompleti. Installare o sostituire lo script e la riga crontab non aggiorna né riavvia i servizi; la procedura spiega installazione, verifica e disattivazione. Le copie restano solo sul server: la copia fuori sede è fuori scope.
