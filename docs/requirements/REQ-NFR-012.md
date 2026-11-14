# REQ-NFR-012 — Dettato vocale Pi su server remoto

**State:** Active

Quando l'operatore usa Pi su un server remoto senza dispositivi audio, collegato via SSH da un client Linux con PipeWire o PulseAudio, il dettato del pacchetto Pi Voice deve poter acquisire il microfono del client. L'audio passa dal socket Pulse del client inoltrato via SSH come socket Unix, senza aprire porte TCP e senza modificare la configurazione di Pi Voice. Il repository documenta la procedura per server e client, con verifica e limiti, e fornisce uno script di diagnosi in sola lettura che indica i passi mancanti. Documentazione, script e output non contengono segreti, dati personali o audio, e i dati personali di Pi restano esclusi da Git (REQ-NFR-002, REQ-NFR-007). L'installazione dei pacchetti di sistema e la configurazione di `sshd` richiedono privilegi amministrativi e restano a cura dell'operatore.
