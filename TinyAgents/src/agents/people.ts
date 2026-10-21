import { hash } from '../render/pixel';
import { Appearance, randomAppearance } from './appearance';
import { Profession } from './professions';

export interface Person {
  name: string;
  look: Appearance;
}

const STORAGE_KEY = 'tiny-agents.people.v1';

const NAMES = [
  'Ada', 'Bea', 'Cleo', 'Dot', 'Eli', 'Finn', 'Gus', 'Hana', 'Ivy', 'Jun', 'Kit', 'Lev', 'Mika', 'Nia', 'Oto',
  'Pip', 'Quin', 'Rae', 'Sol', 'Tam', 'Uma', 'Vik', 'Wren', 'Xan', 'Yui', 'Zed', 'Alba', 'Bo', 'Cy', 'Dara',
  'Emi', 'Fox', 'Gil', 'Hal', 'Isa', 'Joss', 'Kai', 'Lou', 'Moss', 'Nell', 'Oz', 'Pia', 'Remy', 'Sage', 'Teo',
  'Vera', 'Wade', 'Yara', 'Zoe', 'Ari', 'Bram', 'Cass', 'Dex', 'Esme', 'Ford', 'Gem', 'Huck', 'Iris', 'Jem',
];

function loadAll(): Record<string, Person> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

/** The default person for a seat. Demo staff pass their fixed name. */
export function generatedPerson(slot: string, profession: Profession, name?: string): Person {
  const h = hash(slot);
  return {
    name: name ?? NAMES[h % NAMES.length],
    look: randomAppearance(h, profession.look),
  };
}

export function personFor(slot: string, profession: Profession, name?: string): Person {
  return loadAll()[slot] ?? generatedPerson(slot, profession, name);
}

export function savePerson(slot: string, person: Person): void {
  const all = loadAll();
  all[slot] = person;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // storage unavailable: customization lasts for this session
  }
}

export function forgetPerson(slot: string): void {
  const all = loadAll();
  delete all[slot];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // storage unavailable
  }
}
