# REQ-NFR-019 — Template v2.0.0 e backlog su file

**State:** Active

Il progetto deve adottare il template `agile-project-template` v2.0.0: il backlog è conservato in `backlog/`, un file per record, e si legge e si modifica solo con la CLI `.agents/tools/backlog.py`, che richiede Python 3.10 o successivo con la sola libreria standard; `BACKLOG.md` e `STATUS.md` sono rimossi e lo stato del progetto è calcolato su richiesta. La migrazione deve conservare versioni, epic, item, stati, esiti, cambi di scope, note e item non assegnati, con conteggi verificati rispetto al file di origine. Il riferimento adottato e le divergenze sono registrati secondo REQ-NFR-013; restano validi REQ-NFR-002, REQ-NFR-007, REQ-NFR-008 e REQ-NFR-014–018, e il visualizzatore Pi resta di sola lettura. Le idee non assegnate su una riga e i metadati epic nel corpo degli item, previsti come personalizzazioni del visualizzatore, sono sostituiti dagli item senza versione dello store.
