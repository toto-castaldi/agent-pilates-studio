// Pure deterministic management policy. No I/O, clock or random source here.
import { normalizeIdentityName as name, normalizeInternationalPhone as phone } from './teacher-identity.ts';

export interface ManagementPerson {
  id: string; first_name: string; last_name: string; phone: string | null;
  access_enabled: boolean; identity_revision: string; legacy_identity: boolean;
}
export interface ManagementState {
  step: string; expires: number; operation?: string; target?: ManagementPerson;
  firstName?: string; lastName?: string; phone?: string; code?: string;
}
export interface ManagementInput {
  text: string; now: number; code: string; manager: boolean; actor: ManagementPerson | null;
  people: ManagementPerson[]; state: ManagementState | null; managerPhone: string;
}
export interface ManagementResult {
  handled: boolean; reply: string; state: ManagementState | null; save?: ManagementState;
}
export const MANAGEMENT_TTL = 600_000;
export function managementReserved(text: string): boolean {
  return /^\/(anagrafica|annulla|conferma)(?:\s|$)/iu.test(text.trim());
}
export function managementTransition(input: ManagementInput): ManagementResult {
  const { text: raw, now, actor, people } = input;
  const text = raw.trim();
  const reserved = managementReserved(text);
  const result = (reply: string, state: ManagementState | null = null): ManagementResult => ({ handled: true, reply, state });
  if (!input.manager) return reserved || input.state ? result('Gestione riservata al gestore.') : { handled: false, reply: '', state: null };
  if (actor && !actor.access_enabled) return result('Accesso gestionale non abilitato.');
  if (/^\/annulla$/iu.test(text)) return result('Procedura annullata. Nessun salvataggio.');
  let state = input.state;
  if (state && state.expires <= now && text.toLowerCase() !== '/anagrafica') return result('Procedura scaduta. Riparti con /anagrafica.');
  const menu = 'Anagrafica: elenco, nuovo, completa ID, correggi ID, numero ID, revoca ID, abilita ID. /annulla per uscire.';
  if (/^\/anagrafica$/iu.test(text) || (!actor && !state)) {
    state = { step: actor ? 'menu' : 'firstName', expires: now + MANAGEMENT_TTL, operation: actor ? undefined : 'bootstrap' };
    return result(actor ? menu : 'Censimento iniziale obbligatorio del gestore. Inserisci il nome; il numero sarà quello autenticato.', state);
  }
  if (!state) return reserved ? result('Nessuna conferma attiva. Riparti con /anagrafica.') : { handled: false, reply: '', state: null };
  const next = { ...state };
  const confirm = (): ManagementResult => {
    next.step = 'confirm'; next.code = input.code;
    return result(`Riepilogo ${next.operation}: ${next.target ? `ID ${next.target.id}, ${next.target.first_name} ${next.target.last_name}` : ''} ${next.firstName ?? ''} ${next.lastName ?? ''} ${next.phone ?? ''}. Salva con /conferma ${next.code}; /annulla per annullare.`, next);
  };
  try {
    if (next.step === 'menu') {
      if (text.toLowerCase() === 'elenco') return result(people.map((p) => `${p.id}: ${p.first_name} ${p.last_name}, ${p.phone ?? 'da completare'}, accesso ${p.access_enabled ? 'abilitato' : 'revocato'}`).join('\n') || 'Anagrafica vuota.', next);
      if (text.toLowerCase() === 'nuovo') { next.operation = 'enroll'; next.step = 'firstName'; return result('Nome?', next); }
      const match = /^(completa|correggi|numero|revoca|abilita) ([1-9][0-9]*)$/iu.exec(text);
      const target = people.find((p) => p.id === match?.[2]);
      if (!match || !target) return result(menu, next);
      const operations: Record<string, string> = { completa: 'complete', correggi: 'correct', numero: 'change_phone', revoca: 'revoke', abilita: 'enable' };
      next.operation = operations[match[1].toLowerCase()]; next.target = target;
      if (target.id === actor?.id && ['revoke', 'change_phone'].includes(next.operation)) return result('Non puoi revocare te stesso o cambiare il tuo numero.', state);
      if (next.operation === 'correct') { next.step = 'firstName'; return result('Nome corretto?', next); }
      if (['complete', 'change_phone'].includes(next.operation)) { next.step = 'phone'; return result('Telefono con prefisso internazionale (+ o 00)?', next); }
      return confirm();
    }
    if (next.step === 'firstName') { next.firstName = name(raw); next.step = 'lastName'; return result('Cognome?', next); }
    if (next.step === 'lastName') {
      next.lastName = name(raw);
      if (next.operation === 'bootstrap') { next.phone = input.managerPhone; return confirm(); }
      if (next.operation === 'correct') return confirm();
      next.step = 'phone'; return result('Telefono con prefisso internazionale (+ o 00)?', next);
    }
    if (next.step === 'phone') { next.phone = phone(raw); return confirm(); }
    if (next.step === 'confirm') {
      if (text !== `/conferma ${next.code}`) return result('Conferma non valida: procedura chiusa senza salvare. Riparti con /anagrafica.');
      return { ...result('Operazione salvata.'), save: next };
    }
  } catch { return result('Dato non valido. Procedura chiusa senza salvare. Riparti con /anagrafica.'); }
  return result('Procedura interrotta. Riparti con /anagrafica.');
}
