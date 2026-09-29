# D — Stockage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter dans IndexedDB (Dexie) les quatre dépôts et la sauvegarde définis par P0, interchangeables avec les doublures en mémoire, plus l'export et l'import de fichier.

**Architecture:** Adaptateurs d'infrastructure de l'architecture hexagonale : chaque classe `Dexie…` implémente un port de `$lib/application/ports` au-dessus d'une seule base `NeckspertDb` (schéma version 1). Le comportement de chaque dépôt est écrit une seule fois, sous forme de suite de tests de contrat, puis exécuté contre la doublure en mémoire de P0 et contre l'implémentation Dexie : les deux restent interchangeables par construction. La sauvegarde lit tout dans une transaction en lecture, et l'import valide d'abord le fichier, puis remplace toutes les tables dans une seule transaction en écriture.

**Tech Stack:** Dexie 4.4 (`EntityTable`), `fake-indexeddb` 6 pour les tests en Node, Vitest (projets `server` en Node et `client` en jsdom), TypeScript.

## Global Constraints

- Svelte 5, runes uniquement : `$state`, `$derived`, `$effect`, `$props`. Pas de stores Svelte 4 (`writable`), pas de `export let`.
- SvelteKit en site statique : adapter-static avec `fallback: 'index.html'`, `ssr = false` dans `src/routes/+layout.ts`.
- Toute la temporisation audio est calée sur `AudioContext.currentTime` (secondes). Jamais `setInterval`, jamais `performance.now()` pour mesurer un temps musical. Les horodatages de stockage sont en millisecondes epoch (`Date.now()` ou `AudioClockPort.toEpochMs`).
- CSS natif avec variables ; pas de bibliothèque de composants ni de Tailwind.
- Tests Vitest : fichiers `*.spec.ts` (Node) ; tests de composants dans `*.svelte.spec.ts` (jsdom).
- Noms de notes toujours en lettres (C, D, E…), dièses canoniques en interne (`C#`), bémols seulement à l'affichage.
- Interface bilingue français et anglais ; français par défaut.
- Données uniquement en local (IndexedDB), sans compte.
- Prettier : tabulations, guillemets simples, pas de virgule finale, largeur 100 (configuration générée par `sv`).
- Node : version de `.nvmrc` (22.23.3).

### Contraintes propres à ce plan

- Ce plan ne crée et ne modifie que des fichiers sous `src/lib/infrastructure/storage/**`. Il ne touche ni `package.json`, ni `package-lock.json`, ni `vite.config.ts`, ni les fichiers du socle.
- Imports autorisés : `$lib/domain/types`, `$lib/application/ports`, `$lib/testing/fakes` (tests seulement), `dexie`, `fake-indexeddb` (tests seulement), `vitest`. Rien d'un autre plan de la vague 1.
- Dexie 4.4 : `import Dexie, { type EntityTable } from 'dexie';`. Schéma version 1, exactement : `attempts: '++id, cardKey, sessionId, promptedAt'`, `cards: 'key'`, `sessions: 'id, startedAt'`, `settings: 'id'`.
- Chaque test qui touche IndexedDB commence par `import 'fake-indexeddb/auto';` en **première ligne** : Dexie lit `globalThis.indexedDB` au chargement de son module. Chaque test ouvre sa propre base : `createDatabase(crypto.randomUUID())`.
- Ordre des listes : plus ancien d'abord, par `promptedAt` (tentatives) ou `startedAt` (sessions). À `promptedAt` égal, ordre d'insertion. `CardStateRepositoryPort.all()` n'a pas d'ordre garanti ; les tests trient par clé.
- `AttemptRepositoryPort.add` ignore un `id` déjà présent sur la tentative et en attribue toujours un nouveau, comme `InMemoryAttemptRepository`. Seul l'import de sauvegarde conserve les `id` du fichier.
- Réglages : une seule ligne, de clé `id: 'settings'`, qui ne contient que les champs modifiés. La lecture renvoie `{ ...DEFAULT_SETTINGS, ...champs stockés }`, sans `id`.
- Messages d'erreur en anglais dans le code ; l'interface (plan I3) les traduit.
- Chaque tâche formate ses fichiers avant de committer (`npx prettier --write src/lib/infrastructure/storage`, inclus dans l'étape de vérification des types).
- Les suites de contrat vivent dans `src/lib/infrastructure/storage/testing/` : ce sont des fichiers `.ts` (pas `.spec.ts`) importés par les tests, jamais par le code de l'application.
- Les tests de contrat s'exécutent contre la doublure de P0 **et** contre Dexie. Si un test de contrat échoue contre la doublure, c'est le contrat qui est faux : on corrige le contrat, jamais `src/lib/testing/fakes.ts`.

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `src/lib/infrastructure/storage/db.ts` | `NeckspertDb` (schéma v1), `createDatabase`, `SETTINGS_ROW_ID`, type `SettingsRow` |
| `src/lib/infrastructure/storage/DexieAttemptRepository.ts` | Tentatives : ajout, listes par carte, par session, depuis une date, toutes |
| `src/lib/infrastructure/storage/DexieCardStateRepository.ts` | États de carte par clé |
| `src/lib/infrastructure/storage/DexieSessionRepository.ts` | Enregistrements de session |
| `src/lib/infrastructure/storage/DexieSettingsRepository.ts` | Ligne unique de réglages, fusionnée sur `DEFAULT_SETTINGS` |
| `src/lib/infrastructure/storage/validateBackup.ts` | Vérification de forme et de version d'un fichier importé |
| `src/lib/infrastructure/storage/DexieBackup.ts` | `exportAll` et `importAll` |
| `src/lib/infrastructure/storage/backupFile.ts` | Aides navigateur : nom du fichier, téléchargement, lecture et analyse JSON |
| `src/lib/infrastructure/storage/index.ts` | Point d'entrée public du module (signatures du README) |
| `src/lib/infrastructure/storage/testing/fixtures.ts` | Constructeurs de données de test |
| `src/lib/infrastructure/storage/testing/*RepositoryContract.ts` | Suites de contrat, une par port de dépôt |
| `src/lib/infrastructure/storage/*.spec.ts` | Tests Node (avec `fake-indexeddb`) |
| `src/lib/infrastructure/storage/downloadBackup.svelte.spec.ts` | Test jsdom du téléchargement |

---

### Task 1: Base de données et schéma

**Files:**
- Create: `src/lib/infrastructure/storage/db.ts`
- Test: `src/lib/infrastructure/storage/db.spec.ts`

**Interfaces:**
- Consumes: `Attempt`, `CardState`, `SessionRecord`, `Settings` de `$lib/domain/types` (P0).
- Produces:
  - `class NeckspertDb extends Dexie` avec `attempts: EntityTable<Attempt, 'id'>`, `cards: EntityTable<CardState, 'key'>`, `sessions: EntityTable<SessionRecord, 'id'>`, `settings: EntityTable<SettingsRow, 'id'>` ; `constructor(name: string)`.
  - `createDatabase(name?: string): NeckspertDb`, nom par défaut `'neckspert-play'` (`DEFAULT_DATABASE_NAME`).
  - `SETTINGS_ROW_ID = 'settings'` et `interface SettingsRow extends Partial<Settings> { id: 'settings' }`.

- [ ] **Step 1: Écrire le test**

Créer `src/lib/infrastructure/storage/db.spec.ts` :

```ts
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { NeckspertDb, createDatabase } from './db';

describe('createDatabase', () => {
	it('uses the app name by default', () => {
		const db = createDatabase();
		expect(db).toBeInstanceOf(NeckspertDb);
		expect(db.name).toBe('neckspert-play');
	});

	it('declares the four tables with their keys and indexes', () => {
		const db = createDatabase(crypto.randomUUID());
		expect(db.tables.map((table) => table.name).sort()).toEqual([
			'attempts',
			'cards',
			'sessions',
			'settings'
		]);
		expect(db.attempts.schema.primKey.keyPath).toBe('id');
		expect(db.attempts.schema.primKey.auto).toBe(true);
		expect(db.attempts.schema.indexes.map((index) => index.name).sort()).toEqual([
			'cardKey',
			'promptedAt',
			'sessionId'
		]);
		expect(db.cards.schema.primKey.keyPath).toBe('key');
		expect(db.sessions.schema.primKey.keyPath).toBe('id');
		expect(db.sessions.schema.indexes.map((index) => index.name)).toEqual(['startedAt']);
		expect(db.settings.schema.primKey.keyPath).toBe('id');
	});

	it('opens at version 1 and stores rows', async () => {
		const db = createDatabase(crypto.randomUUID());
		await db.open();
		expect(db.verno).toBe(1);
		await db.settings.put({ id: 'settings', tempoBpm: 96 });
		expect(await db.settings.get('settings')).toEqual({ id: 'settings', tempoBpm: 96 });
		db.close();
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/infrastructure/storage/db.spec.ts`
Expected: FAIL, « Failed to resolve import "./db" ».

- [ ] **Step 3: Écrire la base**

Créer `src/lib/infrastructure/storage/db.ts` :

```ts
import Dexie, { type EntityTable } from 'dexie';
import type { Attempt, CardState, SessionRecord, Settings } from '$lib/domain/types';

export const DEFAULT_DATABASE_NAME = 'neckspert-play';

export const SETTINGS_ROW_ID = 'settings';

/** The single settings row: only the fields changed from DEFAULT_SETTINGS. */
export interface SettingsRow extends Partial<Settings> {
	id: typeof SETTINGS_ROW_ID;
}

export class NeckspertDb extends Dexie {
	attempts!: EntityTable<Attempt, 'id'>;
	cards!: EntityTable<CardState, 'key'>;
	sessions!: EntityTable<SessionRecord, 'id'>;
	settings!: EntityTable<SettingsRow, 'id'>;

	constructor(name: string) {
		super(name);
		this.version(1).stores({
			attempts: '++id, cardKey, sessionId, promptedAt',
			cards: 'key',
			sessions: 'id, startedAt',
			settings: 'id'
		});
	}
}

export function createDatabase(name: string = DEFAULT_DATABASE_NAME): NeckspertDb {
	return new NeckspertDb(name);
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/infrastructure/storage/db.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Formater et vérifier les types**

Run: `npx prettier --write src/lib/infrastructure/storage && npm run check`
Expected: `svelte-check found 0 errors`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/infrastructure/storage/db.ts src/lib/infrastructure/storage/db.spec.ts
git commit -m "feat: add Dexie database schema"
```

---

### Task 2: Dépôt des tentatives

**Files:**
- Create: `src/lib/infrastructure/storage/testing/fixtures.ts`
- Create: `src/lib/infrastructure/storage/testing/attemptRepositoryContract.ts`
- Create: `src/lib/infrastructure/storage/DexieAttemptRepository.ts`
- Test: `src/lib/infrastructure/storage/DexieAttemptRepository.spec.ts`

**Interfaces:**
- Consumes: `NeckspertDb`, `createDatabase` (Task 1) ; `AttemptRepositoryPort` de `$lib/application/ports` ; `InMemoryAttemptRepository` de `$lib/testing/fakes` ; `cardKey`, `DEFAULT_SETTINGS` et les types de `$lib/domain/types`.
- Produces:
  - `LOCATE_TARGET: LocateTarget` (`locate:2:F`), `IDENTIFY_TARGET: IdentifyTarget` (`identify:5:8`).
  - `makeAttempt(overrides?: Partial<Attempt>): Attempt` : révision à froid du mode 1 ; `cardKey` suit `target` sauf s'il est fourni.
  - `makeCard(overrides?: Partial<CardState>): CardState` : `key` suit `target` sauf s'il est fourni.
  - `makeSession(overrides?: Partial<SessionRecord>): SessionRecord` (`id: 's1'`, `startedAt: 1000`).
  - `makeBackup(overrides?: Partial<BackupFile>): BackupFile` (une carte, une tentative d'`id` 1, une session, réglages par défaut, `exportedAt: 5000`).
  - `attemptRepositoryContract(name: string, create: () => AttemptRepositoryPort): void`.
  - `class DexieAttemptRepository implements AttemptRepositoryPort { constructor(db: NeckspertDb) }`.

- [ ] **Step 1: Écrire les constructeurs de données de test**

Créer `src/lib/infrastructure/storage/testing/fixtures.ts` :

```ts
import {
	DEFAULT_SETTINGS,
	cardKey,
	type Attempt,
	type BackupFile,
	type CardState,
	type IdentifyTarget,
	type LocateTarget,
	type SessionRecord,
	type Target
} from '$lib/domain/types';

export const LOCATE_TARGET: LocateTarget = { direction: 'locate', string: 2, pitch: 'F' };

export const IDENTIFY_TARGET: IdentifyTarget = { direction: 'identify', string: 5, fret: 8 };

export function makeAttempt(overrides: Partial<Attempt> = {}): Attempt {
	const target: Target = overrides.target ?? LOCATE_TARGET;
	return {
		sessionId: 's1',
		cardKey: cardKey(target),
		target,
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		leadBeats: 2,
		promptedAt: 1000,
		answer: { kind: 'note', midi: 65 },
		correct: true,
		verdict: 'perfect',
		timingOffsetMs: 10,
		reactionMs: 900,
		confusion: null,
		...overrides
	};
}

export function makeCard(overrides: Partial<CardState> = {}): CardState {
	const target: Target = overrides.target ?? LOCATE_TARGET;
	return {
		key: cardKey(target),
		target,
		introducedAt: 1000,
		introducedInSession: 's1',
		leadBeats: 8,
		scheduling: {
			due: 3_601_000,
			stability: 0,
			difficulty: 0,
			elapsedDays: 0,
			scheduledDays: 0,
			learningSteps: 0,
			reps: 0,
			lapses: 0,
			state: 0,
			lastReview: null
		},
		acquiredAt: null,
		masteredAt: null,
		...overrides
	};
}

export function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
	return {
		id: 's1',
		kind: 'daily',
		startedAt: 1000,
		endedAt: 2000,
		fatigueDetected: false,
		...overrides
	};
}

export function makeBackup(overrides: Partial<BackupFile> = {}): BackupFile {
	return {
		app: 'neckspert-play',
		version: 1,
		exportedAt: 5000,
		settings: { ...DEFAULT_SETTINGS },
		cards: [makeCard()],
		attempts: [makeAttempt({ id: 1 })],
		sessions: [makeSession()],
		...overrides
	};
}
```

- [ ] **Step 2: Écrire la suite de contrat**

Créer `src/lib/infrastructure/storage/testing/attemptRepositoryContract.ts` :

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { AttemptRepositoryPort } from '$lib/application/ports';
import { IDENTIFY_TARGET, makeAttempt } from './fixtures';

/** Behaviour shared by every AttemptRepositoryPort implementation. */
export function attemptRepositoryContract(
	name: string,
	create: () => AttemptRepositoryPort
): void {
	describe(`${name} honours AttemptRepositoryPort`, () => {
		let repo: AttemptRepositoryPort;

		beforeEach(() => {
			repo = create();
		});

		it('returns an empty list when nothing is stored', async () => {
			expect(await repo.all()).toEqual([]);
		});

		it('stores an attempt and returns its id', async () => {
			const attempt = makeAttempt();
			const id = await repo.add(attempt);
			expect(await repo.all()).toEqual([{ ...attempt, id }]);
		});

		it('assigns increasing ids', async () => {
			const first = await repo.add(makeAttempt());
			const second = await repo.add(makeAttempt({ promptedAt: 2000 }));
			expect(first).toBeGreaterThan(0);
			expect(second).toBeGreaterThan(first);
		});

		it('does not mutate the given attempt', async () => {
			const attempt = makeAttempt();
			await repo.add(attempt);
			expect(attempt).not.toHaveProperty('id');
		});

		it('stores a new attempt when the given one already has an id', async () => {
			const first = await repo.add(makeAttempt());
			const [stored] = await repo.all();
			const second = await repo.add({ ...stored, promptedAt: 2000 });
			expect(second).not.toBe(first);
			expect((await repo.all()).map((a) => a.id)).toEqual([first, second]);
		});

		it("lists a card's attempts, oldest first", async () => {
			await repo.add(makeAttempt({ promptedAt: 3000 }));
			await repo.add(makeAttempt({ promptedAt: 1000 }));
			await repo.add(makeAttempt({ target: IDENTIFY_TARGET, promptedAt: 2000 }));
			expect((await repo.listByCard('locate:2:F')).map((a) => a.promptedAt)).toEqual([
				1000, 3000
			]);
			expect((await repo.listByCard('identify:5:8')).map((a) => a.promptedAt)).toEqual([2000]);
			expect(await repo.listByCard('identify:1:0')).toEqual([]);
		});

		it("lists a session's attempts, oldest first", async () => {
			await repo.add(makeAttempt({ sessionId: 's2', promptedAt: 3000 }));
			await repo.add(makeAttempt({ sessionId: 's1', promptedAt: 1000 }));
			await repo.add(makeAttempt({ sessionId: 's2', promptedAt: 2000 }));
			expect((await repo.listBySession('s2')).map((a) => a.promptedAt)).toEqual([2000, 3000]);
			expect(await repo.listBySession('unknown')).toEqual([]);
		});

		it('lists attempts prompted at or after a time, oldest first', async () => {
			await repo.add(makeAttempt({ promptedAt: 3000 }));
			await repo.add(makeAttempt({ promptedAt: 1000 }));
			await repo.add(makeAttempt({ promptedAt: 2000 }));
			expect((await repo.listSince(2000)).map((a) => a.promptedAt)).toEqual([2000, 3000]);
			expect(await repo.listSince(4000)).toEqual([]);
		});

		it('lists every attempt oldest first, in insertion order for equal times', async () => {
			const late = await repo.add(makeAttempt({ promptedAt: 2000 }));
			const early = await repo.add(makeAttempt({ promptedAt: 1000 }));
			const tied = await repo.add(makeAttempt({ promptedAt: 2000 }));
			expect((await repo.all()).map((a) => a.id)).toEqual([early, late, tied]);
		});
	});
}
```

- [ ] **Step 3: Vérifier le contrat contre la doublure de P0**

Créer `src/lib/infrastructure/storage/DexieAttemptRepository.spec.ts` :

```ts
import 'fake-indexeddb/auto';
import { InMemoryAttemptRepository } from '$lib/testing/fakes';
import { attemptRepositoryContract } from './testing/attemptRepositoryContract';

attemptRepositoryContract('InMemoryAttemptRepository', () => new InMemoryAttemptRepository());
```

Run: `npx vitest run src/lib/infrastructure/storage/DexieAttemptRepository.spec.ts`
Expected: PASS (9 tests). Le contrat décrit bien la doublure. En cas d'échec, corriger le contrat, pas la doublure.

- [ ] **Step 4: Ajouter l'implémentation Dexie au test**

Remplacer `src/lib/infrastructure/storage/DexieAttemptRepository.spec.ts` par :

```ts
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { InMemoryAttemptRepository } from '$lib/testing/fakes';
import { createDatabase } from './db';
import { DexieAttemptRepository } from './DexieAttemptRepository';
import { attemptRepositoryContract } from './testing/attemptRepositoryContract';
import { makeAttempt } from './testing/fixtures';

attemptRepositoryContract('InMemoryAttemptRepository', () => new InMemoryAttemptRepository());
attemptRepositoryContract(
	'DexieAttemptRepository',
	() => new DexieAttemptRepository(createDatabase(crypto.randomUUID()))
);

describe('DexieAttemptRepository', () => {
	it('keeps attempts when the database is reopened', async () => {
		const name = crypto.randomUUID();
		const first = createDatabase(name);
		const id = await new DexieAttemptRepository(first).add(makeAttempt());
		first.close();

		const reopened = createDatabase(name);
		expect((await new DexieAttemptRepository(reopened).all()).map((a) => a.id)).toEqual([id]);
		reopened.close();
	});
});
```

- [ ] **Step 5: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/infrastructure/storage/DexieAttemptRepository.spec.ts`
Expected: FAIL, « Failed to resolve import "./DexieAttemptRepository" ».

- [ ] **Step 6: Écrire le dépôt**

Créer `src/lib/infrastructure/storage/DexieAttemptRepository.ts` :

```ts
import type { AttemptRepositoryPort } from '$lib/application/ports';
import type { Attempt, CardKey } from '$lib/domain/types';
import type { NeckspertDb } from './db';

export class DexieAttemptRepository implements AttemptRepositoryPort {
	constructor(private readonly db: NeckspertDb) {}

	async add(attempt: Attempt): Promise<number> {
		const record: Attempt = { ...attempt };
		delete record.id;
		return (await this.db.attempts.add(record)) as number;
	}

	listByCard(key: CardKey): Promise<Attempt[]> {
		return this.db.attempts.where('cardKey').equals(key).sortBy('promptedAt');
	}

	listBySession(sessionId: string): Promise<Attempt[]> {
		return this.db.attempts.where('sessionId').equals(sessionId).sortBy('promptedAt');
	}

	listSince(epochMs: number): Promise<Attempt[]> {
		return this.db.attempts.where('promptedAt').aboveOrEqual(epochMs).toArray();
	}

	all(): Promise<Attempt[]> {
		return this.db.attempts.orderBy('promptedAt').toArray();
	}
}
```

Notes pour l'implémenteur :
- `delete record.id` laisse IndexedDB attribuer la clé (`++id`) et ne modifie pas l'objet reçu.
- `EntityTable<Attempt, 'id'>` type la clé en `number | undefined` parce que `Attempt.id` est optionnel ; avec `++id`, la clé renvoyée est toujours un nombre, d'où le `as number`.
- L'index `promptedAt` est trié par valeur puis par clé primaire : à temps égal, l'ordre d'insertion est conservé. `sortBy` trie en mémoire avec un tri stable, sur des lignes déjà rangées par clé primaire.

- [ ] **Step 7: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/infrastructure/storage/DexieAttemptRepository.spec.ts`
Expected: PASS (19 tests).

- [ ] **Step 8: Formater et vérifier les types**

Run: `npx prettier --write src/lib/infrastructure/storage && npm run check`
Expected: `svelte-check found 0 errors`.

- [ ] **Step 9: Commit**

```bash
git add src/lib/infrastructure/storage/testing src/lib/infrastructure/storage/DexieAttemptRepository.ts src/lib/infrastructure/storage/DexieAttemptRepository.spec.ts
git commit -m "feat: add Dexie attempt repository with shared contract tests"
```

---

### Task 3: Dépôt des états de carte

**Files:**
- Create: `src/lib/infrastructure/storage/testing/cardStateRepositoryContract.ts`
- Create: `src/lib/infrastructure/storage/DexieCardStateRepository.ts`
- Test: `src/lib/infrastructure/storage/DexieCardStateRepository.spec.ts`

**Interfaces:**
- Consumes: `NeckspertDb`, `createDatabase` (Task 1) ; `makeCard`, `IDENTIFY_TARGET` (Task 2) ; `CardStateRepositoryPort` ; `InMemoryCardStateRepository`.
- Produces:
  - `cardStateRepositoryContract(name: string, create: () => CardStateRepositoryPort): void`.
  - `class DexieCardStateRepository implements CardStateRepositoryPort { constructor(db: NeckspertDb) }`.

- [ ] **Step 1: Écrire la suite de contrat**

Créer `src/lib/infrastructure/storage/testing/cardStateRepositoryContract.ts` :

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { CardStateRepositoryPort } from '$lib/application/ports';
import type { CardState } from '$lib/domain/types';
import { IDENTIFY_TARGET, makeCard } from './fixtures';

function byKey(a: CardState, b: CardState): number {
	return a.key.localeCompare(b.key);
}

/** Behaviour shared by every CardStateRepositoryPort implementation. `all()` has no guaranteed order. */
export function cardStateRepositoryContract(
	name: string,
	create: () => CardStateRepositoryPort
): void {
	describe(`${name} honours CardStateRepositoryPort`, () => {
		let repo: CardStateRepositoryPort;

		beforeEach(() => {
			repo = create();
		});

		it('returns an empty list when nothing is stored', async () => {
			expect(await repo.all()).toEqual([]);
		});

		it('returns undefined for an unknown key', async () => {
			expect(await repo.get('locate:2:F')).toBeUndefined();
		});

		it('stores a card and reads it by key', async () => {
			const card = makeCard();
			await repo.put(card);
			expect(await repo.get(card.key)).toEqual(card);
		});

		it('replaces the card stored under the same key', async () => {
			await repo.put(makeCard());
			const updated = makeCard({ leadBeats: 4, acquiredAt: 9000 });
			await repo.put(updated);
			expect(await repo.get(updated.key)).toEqual(updated);
			expect(await repo.all()).toHaveLength(1);
		});

		it('stores many cards at once', async () => {
			const cards = [makeCard(), makeCard({ target: IDENTIFY_TARGET, leadBeats: 1 })];
			await repo.putMany(cards);
			expect((await repo.all()).sort(byKey)).toEqual([...cards].sort(byKey));
		});

		it('replaces existing cards when storing many', async () => {
			await repo.put(makeCard());
			const updated = makeCard({ masteredAt: 9000 });
			await repo.putMany([updated, makeCard({ target: IDENTIFY_TARGET })]);
			expect(await repo.get(updated.key)).toEqual(updated);
			expect(await repo.all()).toHaveLength(2);
		});
	});
}
```

- [ ] **Step 2: Vérifier le contrat contre la doublure de P0**

Créer `src/lib/infrastructure/storage/DexieCardStateRepository.spec.ts` :

```ts
import 'fake-indexeddb/auto';
import { InMemoryCardStateRepository } from '$lib/testing/fakes';
import { cardStateRepositoryContract } from './testing/cardStateRepositoryContract';

cardStateRepositoryContract('InMemoryCardStateRepository', () => new InMemoryCardStateRepository());
```

Run: `npx vitest run src/lib/infrastructure/storage/DexieCardStateRepository.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 3: Ajouter l'implémentation Dexie au test**

Remplacer `src/lib/infrastructure/storage/DexieCardStateRepository.spec.ts` par :

```ts
import 'fake-indexeddb/auto';
import { InMemoryCardStateRepository } from '$lib/testing/fakes';
import { createDatabase } from './db';
import { DexieCardStateRepository } from './DexieCardStateRepository';
import { cardStateRepositoryContract } from './testing/cardStateRepositoryContract';

cardStateRepositoryContract('InMemoryCardStateRepository', () => new InMemoryCardStateRepository());
cardStateRepositoryContract(
	'DexieCardStateRepository',
	() => new DexieCardStateRepository(createDatabase(crypto.randomUUID()))
);
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/infrastructure/storage/DexieCardStateRepository.spec.ts`
Expected: FAIL, « Failed to resolve import "./DexieCardStateRepository" ».

- [ ] **Step 5: Écrire le dépôt**

Créer `src/lib/infrastructure/storage/DexieCardStateRepository.ts` :

```ts
import type { CardStateRepositoryPort } from '$lib/application/ports';
import type { CardKey, CardState } from '$lib/domain/types';
import type { NeckspertDb } from './db';

export class DexieCardStateRepository implements CardStateRepositoryPort {
	constructor(private readonly db: NeckspertDb) {}

	get(key: CardKey): Promise<CardState | undefined> {
		return this.db.cards.get(key);
	}

	async put(state: CardState): Promise<void> {
		await this.db.cards.put(state);
	}

	async putMany(states: CardState[]): Promise<void> {
		await this.db.cards.bulkPut(states);
	}

	all(): Promise<CardState[]> {
		return this.db.cards.toArray();
	}
}
```

- [ ] **Step 6: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/infrastructure/storage/DexieCardStateRepository.spec.ts`
Expected: PASS (12 tests).

- [ ] **Step 7: Formater et vérifier les types**

Run: `npx prettier --write src/lib/infrastructure/storage && npm run check`
Expected: `svelte-check found 0 errors`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/infrastructure/storage/testing/cardStateRepositoryContract.ts src/lib/infrastructure/storage/DexieCardStateRepository.ts src/lib/infrastructure/storage/DexieCardStateRepository.spec.ts
git commit -m "feat: add Dexie card state repository"
```

---

### Task 4: Dépôt des sessions

**Files:**
- Create: `src/lib/infrastructure/storage/testing/sessionRepositoryContract.ts`
- Create: `src/lib/infrastructure/storage/DexieSessionRepository.ts`
- Test: `src/lib/infrastructure/storage/DexieSessionRepository.spec.ts`

**Interfaces:**
- Consumes: `NeckspertDb`, `createDatabase` (Task 1) ; `makeSession` (Task 2) ; `SessionRepositoryPort` ; `InMemorySessionRepository`.
- Produces:
  - `sessionRepositoryContract(name: string, create: () => SessionRepositoryPort): void`.
  - `class DexieSessionRepository implements SessionRepositoryPort { constructor(db: NeckspertDb) }`.

À `startedAt` égal, la doublure garde l'ordre d'insertion et Dexie l'ordre des `id` : le contrat n'utilise que des heures de début distinctes.

- [ ] **Step 1: Écrire la suite de contrat**

Créer `src/lib/infrastructure/storage/testing/sessionRepositoryContract.ts` :

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { SessionRepositoryPort } from '$lib/application/ports';
import { makeSession } from './fixtures';

/** Behaviour shared by every SessionRepositoryPort implementation. */
export function sessionRepositoryContract(
	name: string,
	create: () => SessionRepositoryPort
): void {
	describe(`${name} honours SessionRepositoryPort`, () => {
		let repo: SessionRepositoryPort;

		beforeEach(() => {
			repo = create();
		});

		it('returns an empty list when nothing is stored', async () => {
			expect(await repo.list()).toEqual([]);
		});

		it('returns undefined for an unknown id', async () => {
			expect(await repo.get('unknown')).toBeUndefined();
		});

		it('stores a record and reads it by id', async () => {
			const record = makeSession();
			await repo.put(record);
			expect(await repo.get(record.id)).toEqual(record);
		});

		it('replaces the record stored under the same id', async () => {
			await repo.put(makeSession({ endedAt: null }));
			const ended = makeSession({ endedAt: 4000, fatigueDetected: true });
			await repo.put(ended);
			expect(await repo.get(ended.id)).toEqual(ended);
			expect(await repo.list()).toHaveLength(1);
		});

		it('lists records oldest first by start time', async () => {
			await repo.put(makeSession({ id: 'c', startedAt: 3000 }));
			await repo.put(makeSession({ id: 'a', startedAt: 1000 }));
			await repo.put(makeSession({ id: 'b', startedAt: 2000 }));
			expect((await repo.list()).map((record) => record.id)).toEqual(['a', 'b', 'c']);
		});
	});
}
```

- [ ] **Step 2: Vérifier le contrat contre la doublure de P0**

Créer `src/lib/infrastructure/storage/DexieSessionRepository.spec.ts` :

```ts
import 'fake-indexeddb/auto';
import { InMemorySessionRepository } from '$lib/testing/fakes';
import { sessionRepositoryContract } from './testing/sessionRepositoryContract';

sessionRepositoryContract('InMemorySessionRepository', () => new InMemorySessionRepository());
```

Run: `npx vitest run src/lib/infrastructure/storage/DexieSessionRepository.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 3: Ajouter l'implémentation Dexie au test**

Remplacer `src/lib/infrastructure/storage/DexieSessionRepository.spec.ts` par :

```ts
import 'fake-indexeddb/auto';
import { InMemorySessionRepository } from '$lib/testing/fakes';
import { createDatabase } from './db';
import { DexieSessionRepository } from './DexieSessionRepository';
import { sessionRepositoryContract } from './testing/sessionRepositoryContract';

sessionRepositoryContract('InMemorySessionRepository', () => new InMemorySessionRepository());
sessionRepositoryContract(
	'DexieSessionRepository',
	() => new DexieSessionRepository(createDatabase(crypto.randomUUID()))
);
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/infrastructure/storage/DexieSessionRepository.spec.ts`
Expected: FAIL, « Failed to resolve import "./DexieSessionRepository" ».

- [ ] **Step 5: Écrire le dépôt**

Créer `src/lib/infrastructure/storage/DexieSessionRepository.ts` :

```ts
import type { SessionRepositoryPort } from '$lib/application/ports';
import type { SessionRecord } from '$lib/domain/types';
import type { NeckspertDb } from './db';

export class DexieSessionRepository implements SessionRepositoryPort {
	constructor(private readonly db: NeckspertDb) {}

	async put(record: SessionRecord): Promise<void> {
		await this.db.sessions.put(record);
	}

	get(id: string): Promise<SessionRecord | undefined> {
		return this.db.sessions.get(id);
	}

	list(): Promise<SessionRecord[]> {
		return this.db.sessions.orderBy('startedAt').toArray();
	}
}
```

- [ ] **Step 6: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/infrastructure/storage/DexieSessionRepository.spec.ts`
Expected: PASS (10 tests).

- [ ] **Step 7: Formater et vérifier les types**

Run: `npx prettier --write src/lib/infrastructure/storage && npm run check`
Expected: `svelte-check found 0 errors`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/infrastructure/storage/testing/sessionRepositoryContract.ts src/lib/infrastructure/storage/DexieSessionRepository.ts src/lib/infrastructure/storage/DexieSessionRepository.spec.ts
git commit -m "feat: add Dexie session repository"
```

---

### Task 5: Dépôt des réglages

**Files:**
- Create: `src/lib/infrastructure/storage/testing/settingsRepositoryContract.ts`
- Create: `src/lib/infrastructure/storage/DexieSettingsRepository.ts`
- Test: `src/lib/infrastructure/storage/DexieSettingsRepository.spec.ts`

**Interfaces:**
- Consumes: `NeckspertDb`, `createDatabase`, `SETTINGS_ROW_ID`, `SettingsRow` (Task 1) ; `SettingsRepositoryPort` ; `InMemorySettingsRepository` ; `DEFAULT_SETTINGS`.
- Produces:
  - `settingsRepositoryContract(name: string, create: () => SettingsRepositoryPort): void`.
  - `class DexieSettingsRepository implements SettingsRepositoryPort { constructor(db: NeckspertDb) }`. La ligne `settings` ne garde que les champs modifiés : une nouvelle valeur par défaut dans `DEFAULT_SETTINGS` s'applique aux champs jamais modifiés.

- [ ] **Step 1: Écrire la suite de contrat**

Créer `src/lib/infrastructure/storage/testing/settingsRepositoryContract.ts` :

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { SettingsRepositoryPort } from '$lib/application/ports';
import { DEFAULT_SETTINGS } from '$lib/domain/types';

/** Behaviour shared by every SettingsRepositoryPort implementation. */
export function settingsRepositoryContract(
	name: string,
	create: () => SettingsRepositoryPort
): void {
	describe(`${name} honours SettingsRepositoryPort`, () => {
		let repo: SettingsRepositoryPort;

		beforeEach(() => {
			repo = create();
		});

		it('returns the defaults when nothing is stored', async () => {
			expect(await repo.get()).toEqual(DEFAULT_SETTINGS);
		});

		it('returns the defaults merged with an update', async () => {
			const expected = { ...DEFAULT_SETTINGS, tempoBpm: 96 };
			expect(await repo.update({ tempoBpm: 96 })).toEqual(expected);
			expect(await repo.get()).toEqual(expected);
		});

		it('keeps earlier updates', async () => {
			await repo.update({ tempoBpm: 96 });
			await repo.update({ locale: 'en', inputDeviceId: 'usb-1' });
			expect(await repo.get()).toEqual({
				...DEFAULT_SETTINGS,
				tempoBpm: 96,
				locale: 'en',
				inputDeviceId: 'usb-1'
			});
		});

		it('clears a field set back to null', async () => {
			await repo.update({ calibrationOffsetMs: 42 });
			await repo.update({ calibrationOffsetMs: null });
			expect((await repo.get()).calibrationOffsetMs).toBeNull();
		});
	});
}
```

- [ ] **Step 2: Vérifier le contrat contre la doublure de P0**

Créer `src/lib/infrastructure/storage/DexieSettingsRepository.spec.ts` :

```ts
import 'fake-indexeddb/auto';
import { InMemorySettingsRepository } from '$lib/testing/fakes';
import { settingsRepositoryContract } from './testing/settingsRepositoryContract';

settingsRepositoryContract('InMemorySettingsRepository', () => new InMemorySettingsRepository());
```

Run: `npx vitest run src/lib/infrastructure/storage/DexieSettingsRepository.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 3: Ajouter l'implémentation Dexie au test**

Remplacer `src/lib/infrastructure/storage/DexieSettingsRepository.spec.ts` par :

```ts
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '$lib/domain/types';
import { InMemorySettingsRepository } from '$lib/testing/fakes';
import { createDatabase } from './db';
import { DexieSettingsRepository } from './DexieSettingsRepository';
import { settingsRepositoryContract } from './testing/settingsRepositoryContract';

settingsRepositoryContract('InMemorySettingsRepository', () => new InMemorySettingsRepository());
settingsRepositoryContract(
	'DexieSettingsRepository',
	() => new DexieSettingsRepository(createDatabase(crypto.randomUUID()))
);

describe('DexieSettingsRepository', () => {
	it('stores a single row holding only the changed fields', async () => {
		const db = createDatabase(crypto.randomUUID());
		const repo = new DexieSettingsRepository(db);
		await repo.update({ tempoBpm: 96 });
		await repo.update({ locale: 'en' });
		expect(await db.settings.count()).toBe(1);
		expect(await db.settings.get('settings')).toEqual({
			id: 'settings',
			tempoBpm: 96,
			locale: 'en'
		});
	});

	it('reads settings saved through another repository on the same database', async () => {
		const db = createDatabase(crypto.randomUUID());
		await new DexieSettingsRepository(db).update({ placementDoneAt: 7000 });
		expect(await new DexieSettingsRepository(db).get()).toEqual({
			...DEFAULT_SETTINGS,
			placementDoneAt: 7000
		});
	});
});
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/infrastructure/storage/DexieSettingsRepository.spec.ts`
Expected: FAIL, « Failed to resolve import "./DexieSettingsRepository" ».

- [ ] **Step 5: Écrire le dépôt**

Créer `src/lib/infrastructure/storage/DexieSettingsRepository.ts` :

```ts
import type { SettingsRepositoryPort } from '$lib/application/ports';
import { DEFAULT_SETTINGS, type Settings } from '$lib/domain/types';
import { SETTINGS_ROW_ID, type NeckspertDb, type SettingsRow } from './db';

function withoutId(row: SettingsRow): Partial<Settings> {
	const stored: Partial<SettingsRow> = { ...row };
	delete stored.id;
	return stored;
}

export class DexieSettingsRepository implements SettingsRepositoryPort {
	constructor(private readonly db: NeckspertDb) {}

	async get(): Promise<Settings> {
		return { ...DEFAULT_SETTINGS, ...(await this.stored()) };
	}

	update(patch: Partial<Settings>): Promise<Settings> {
		return this.db.transaction('rw', this.db.settings, async () => {
			const stored = { ...(await this.stored()), ...patch };
			await this.db.settings.put({ ...stored, id: SETTINGS_ROW_ID });
			return { ...DEFAULT_SETTINGS, ...stored };
		});
	}

	private async stored(): Promise<Partial<Settings>> {
		const row = await this.db.settings.get(SETTINGS_ROW_ID);
		return row ? withoutId(row) : {};
	}
}
```

La lecture et l'écriture de `update` se font dans une même transaction : deux mises à jour lancées en même temps ne s'écrasent pas.

- [ ] **Step 6: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/infrastructure/storage/DexieSettingsRepository.spec.ts`
Expected: PASS (10 tests).

- [ ] **Step 7: Formater et vérifier les types**

Run: `npx prettier --write src/lib/infrastructure/storage && npm run check`
Expected: `svelte-check found 0 errors`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/infrastructure/storage/testing/settingsRepositoryContract.ts src/lib/infrastructure/storage/DexieSettingsRepository.ts src/lib/infrastructure/storage/DexieSettingsRepository.spec.ts
git commit -m "feat: add Dexie settings repository"
```

---

### Task 6: Validation des sauvegardes

**Files:**
- Create: `src/lib/infrastructure/storage/validateBackup.ts`
- Test: `src/lib/infrastructure/storage/validateBackup.spec.ts`

**Interfaces:**
- Consumes: `makeBackup`, `makeCard`, `makeAttempt`, `makeSession` (Task 2) ; `BackupFile`, `LEAD_STEPS`, `parseCardKey` et les types de `$lib/domain/types`.
- Produces: `validateBackup(file: unknown): BackupFile`. Renvoie le même objet, typé, ou lève une `Error` au message anglais lisible.

Ce qui est vérifié : l'en-tête (`app`, `version: 1`, `exportedAt`), tous les champs des réglages, et, pour chaque entrée des tables, les champs dont le domaine se sert pour décider (clé et cible cohérentes, dates, verdict, température, statut de session). Les objets imbriqués `answer`, `confusion` et le détail de `scheduling` (hors `due` et `state`) ne sont pas inspectés. Les `id` en double ne sont pas détectés ici : l'import échoue alors dans sa transaction sans rien modifier (Task 7).

Formats des messages :
- en-tête : `Backup file is not a JSON object`, `Not a Neckspert Play backup`, `Unsupported backup version: <version>`, `Backup exportedAt must be a number` ;
- réglages : `Backup settings must be an object`, `Invalid backup settings: <problème>` ;
- tables : `Backup field "<table>" must be an array`, `Invalid <table> entry at index <i>: <problème>`.

- [ ] **Step 1: Écrire le test**

Créer `src/lib/infrastructure/storage/validateBackup.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { makeAttempt, makeBackup, makeCard, makeSession } from './testing/fixtures';
import { validateBackup } from './validateBackup';

describe('validateBackup', () => {
	it('returns a valid backup unchanged', () => {
		const file = makeBackup();
		expect(validateBackup(file)).toBe(file);
	});

	it('accepts a backup read back from JSON', () => {
		const file = makeBackup();
		expect(validateBackup(JSON.parse(JSON.stringify(file)))).toEqual(file);
	});

	it('accepts attempts without an id', () => {
		expect(() => validateBackup(makeBackup({ attempts: [makeAttempt()] }))).not.toThrow();
	});

	it('rejects values that are not objects', () => {
		for (const value of [null, [], 'backup', 42]) {
			expect(() => validateBackup(value)).toThrow('Backup file is not a JSON object');
		}
	});

	it('rejects files from another app', () => {
		expect(() => validateBackup({ ...makeBackup(), app: 'neckspert' })).toThrow(
			'Not a Neckspert Play backup'
		);
	});

	it('rejects unsupported versions', () => {
		expect(() => validateBackup({ ...makeBackup(), version: 2 })).toThrow(
			'Unsupported backup version: 2'
		);
		expect(() => validateBackup({ ...makeBackup(), version: undefined })).toThrow(
			'Unsupported backup version: undefined'
		);
	});

	it('rejects a missing export date', () => {
		expect(() => validateBackup({ ...makeBackup(), exportedAt: 'today' })).toThrow(
			'Backup exportedAt must be a number'
		);
	});

	it('rejects missing or invalid settings', () => {
		const file = makeBackup();
		expect(() => validateBackup({ ...file, settings: undefined })).toThrow(
			'Backup settings must be an object'
		);
		expect(() => validateBackup({ ...file, settings: { ...file.settings, locale: 'de' } })).toThrow(
			'Invalid backup settings: locale must be "fr" or "en"'
		);
		expect(() => validateBackup({ ...file, settings: { ...file.settings, tempoBpm: 0 } })).toThrow(
			'Invalid backup settings: tempoBpm must be a positive number'
		);
	});

	it('rejects a table that is not an array', () => {
		expect(() => validateBackup({ ...makeBackup(), cards: {} })).toThrow(
			'Backup field "cards" must be an array'
		);
		expect(() => validateBackup({ ...makeBackup(), sessions: undefined })).toThrow(
			'Backup field "sessions" must be an array'
		);
	});

	it('rejects an invalid card and names its index', () => {
		expect(() =>
			validateBackup({ ...makeBackup(), cards: [makeCard(), { ...makeCard(), leadBeats: 3 }] })
		).toThrow('Invalid cards entry at index 1: leadBeats must be 8, 4, 2 or 1');
		expect(() => validateBackup({ ...makeBackup(), cards: ['card'] })).toThrow(
			'Invalid cards entry at index 0: not an object'
		);
	});

	it('rejects a card whose key is invalid or does not match its target', () => {
		expect(() => validateBackup({ ...makeBackup(), cards: [{ ...makeCard(), key: 'locate:7:F' }] })).toThrow(
			'Invalid cards entry at index 0: key is not a valid card key'
		);
		expect(() => validateBackup({ ...makeBackup(), cards: [{ ...makeCard(), key: 'locate:3:F' }] })).toThrow(
			'Invalid cards entry at index 0: target does not match key'
		);
	});

	it('rejects an invalid attempt', () => {
		expect(() =>
			validateBackup({ ...makeBackup(), attempts: [{ ...makeAttempt(), verdict: 'great' }] })
		).toThrow('Invalid attempts entry at index 0: verdict must be perfect, early, late or wrong');
		expect(() => validateBackup(makeBackup({ attempts: [makeAttempt({ id: 0 })] }))).toThrow(
			'Invalid attempts entry at index 0: id must be a positive integer'
		);
		expect(() =>
			validateBackup({ ...makeBackup(), attempts: [{ ...makeAttempt(), cardKey: 'locate:2:G' }] })
		).toThrow('Invalid attempts entry at index 0: target does not match cardKey');
	});

	it('rejects an invalid session', () => {
		expect(() =>
			validateBackup({ ...makeBackup(), sessions: [{ ...makeSession(), kind: 'weekly' }] })
		).toThrow('Invalid sessions entry at index 0: kind must be placement, daily or free');
		expect(() =>
			validateBackup({ ...makeBackup(), sessions: [{ ...makeSession(), fatigueDetected: 'no' }] })
		).toThrow('Invalid sessions entry at index 0: fatigueDetected must be a boolean');
	});
});
```

Les cas invalides sont construits par décomposition (`{ ...makeBackup(), champ: valeurInvalide }`) : les constructeurs typés n'acceptent pas de valeur invalide, et `validateBackup` reçoit `unknown`.

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/infrastructure/storage/validateBackup.spec.ts`
Expected: FAIL, « Failed to resolve import "./validateBackup" ».

- [ ] **Step 3: Écrire la validation**

Créer `src/lib/infrastructure/storage/validateBackup.ts` :

```ts
import {
	LEAD_STEPS,
	parseCardKey,
	type BackupFile,
	type ItemPhase,
	type Locale,
	type SessionKind,
	type Target,
	type Temperature,
	type Verdict
} from '$lib/domain/types';

type Fields = Record<string, unknown>;

const LOCALES: readonly Locale[] = ['fr', 'en'];
const VERDICTS: readonly Verdict[] = ['perfect', 'early', 'late', 'wrong'];
const TEMPERATURES: readonly Temperature[] = ['cold', 'hot'];
const ITEM_PHASES: readonly ItemPhase[] = ['placement', 'review', 'learning', 'free'];
const SESSION_KINDS: readonly SessionKind[] = ['placement', 'daily', 'free'];
const SCHEDULING_STATES: readonly number[] = [0, 1, 2, 3];

function isFields(value: unknown): value is Fields {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function isNullableNumber(value: unknown): boolean {
	return value === null || isFiniteNumber(value);
}

function isOneOf(value: unknown, allowed: readonly unknown[]): boolean {
	return allowed.includes(value);
}

function parseKey(key: unknown): Target | null {
	if (typeof key !== 'string') return null;
	try {
		return parseCardKey(key);
	} catch {
		return null;
	}
}

function sameTarget(expected: Target, target: Fields): boolean {
	return expected.direction === 'locate'
		? target.direction === 'locate' &&
				target.string === expected.string &&
				target.pitch === expected.pitch
		: target.direction === 'identify' &&
				target.string === expected.string &&
				target.fret === expected.fret;
}

function checkTarget(key: unknown, target: unknown, keyField: string): string | null {
	const expected = parseKey(key);
	if (!expected) return `${keyField} is not a valid card key`;
	if (!isFields(target) || !sameTarget(expected, target)) return `target does not match ${keyField}`;
	return null;
}

function checkSettings(settings: Fields): string | null {
	if (!isOneOf(settings.locale, LOCALES)) return 'locale must be "fr" or "en"';
	if (!isFiniteNumber(settings.tempoBpm) || settings.tempoBpm <= 0) {
		return 'tempoBpm must be a positive number';
	}
	if (!isNullableNumber(settings.calibrationOffsetMs)) {
		return 'calibrationOffsetMs must be a number or null';
	}
	if (settings.inputDeviceId !== null && typeof settings.inputDeviceId !== 'string') {
		return 'inputDeviceId must be a string or null';
	}
	if (!isNullableNumber(settings.placementDoneAt)) return 'placementDoneAt must be a number or null';
	return null;
}

function checkCard(card: Fields): string | null {
	const targetProblem = checkTarget(card.key, card.target, 'key');
	if (targetProblem) return targetProblem;
	if (!isFiniteNumber(card.introducedAt)) return 'introducedAt must be a number';
	if (typeof card.introducedInSession !== 'string') return 'introducedInSession must be a string';
	if (!isOneOf(card.leadBeats, LEAD_STEPS)) return 'leadBeats must be 8, 4, 2 or 1';
	const scheduling = card.scheduling;
	if (!isFields(scheduling) || !isFiniteNumber(scheduling.due)) {
		return 'scheduling.due must be a number';
	}
	if (!isOneOf(scheduling.state, SCHEDULING_STATES)) return 'scheduling.state must be 0, 1, 2 or 3';
	if (!isNullableNumber(card.acquiredAt)) return 'acquiredAt must be a number or null';
	if (!isNullableNumber(card.masteredAt)) return 'masteredAt must be a number or null';
	return null;
}

function checkAttempt(attempt: Fields): string | null {
	if (attempt.id !== undefined && !(Number.isInteger(attempt.id) && Number(attempt.id) > 0)) {
		return 'id must be a positive integer';
	}
	if (typeof attempt.sessionId !== 'string') return 'sessionId must be a string';
	const targetProblem = checkTarget(attempt.cardKey, attempt.target, 'cardKey');
	if (targetProblem) return targetProblem;
	if (!isOneOf(attempt.phase, ITEM_PHASES)) return 'phase must be placement, review, learning or free';
	if (!isOneOf(attempt.temperature, TEMPERATURES)) return 'temperature must be cold or hot';
	if (!isFiniteNumber(attempt.promptedAt)) return 'promptedAt must be a number';
	if (typeof attempt.correct !== 'boolean') return 'correct must be a boolean';
	if (!isOneOf(attempt.verdict, VERDICTS)) return 'verdict must be perfect, early, late or wrong';
	if (!isNullableNumber(attempt.reactionMs)) return 'reactionMs must be a number or null';
	return null;
}

function checkSession(session: Fields): string | null {
	if (typeof session.id !== 'string' || session.id === '') return 'id must be a non-empty string';
	if (!isOneOf(session.kind, SESSION_KINDS)) return 'kind must be placement, daily or free';
	if (!isFiniteNumber(session.startedAt)) return 'startedAt must be a number';
	if (!isNullableNumber(session.endedAt)) return 'endedAt must be a number or null';
	if (typeof session.fatigueDetected !== 'boolean') return 'fatigueDetected must be a boolean';
	return null;
}

function checkEntries(
	value: unknown,
	field: string,
	check: (entry: Fields) => string | null
): void {
	if (!Array.isArray(value)) throw new Error(`Backup field "${field}" must be an array`);
	value.forEach((entry: unknown, index) => {
		const problem = isFields(entry) ? check(entry) : 'not an object';
		if (problem) throw new Error(`Invalid ${field} entry at index ${index}: ${problem}`);
	});
}

export function validateBackup(file: unknown): BackupFile {
	if (!isFields(file)) throw new Error('Backup file is not a JSON object');
	if (file.app !== 'neckspert-play') throw new Error('Not a Neckspert Play backup');
	if (file.version !== 1) throw new Error(`Unsupported backup version: ${String(file.version)}`);
	if (!isFiniteNumber(file.exportedAt)) throw new Error('Backup exportedAt must be a number');
	if (!isFields(file.settings)) throw new Error('Backup settings must be an object');
	const settingsProblem = checkSettings(file.settings);
	if (settingsProblem) throw new Error(`Invalid backup settings: ${settingsProblem}`);
	checkEntries(file.cards, 'cards', checkCard);
	checkEntries(file.attempts, 'attempts', checkAttempt);
	checkEntries(file.sessions, 'sessions', checkSession);
	return file as unknown as BackupFile;
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/infrastructure/storage/validateBackup.spec.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Formater et vérifier les types**

Run: `npx prettier --write src/lib/infrastructure/storage && npm run check`
Expected: `svelte-check found 0 errors`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/infrastructure/storage/validateBackup.ts src/lib/infrastructure/storage/validateBackup.spec.ts
git commit -m "feat: validate backup files"
```

---

### Task 7: Export et import

**Files:**
- Create: `src/lib/infrastructure/storage/DexieBackup.ts`
- Test: `src/lib/infrastructure/storage/DexieBackup.spec.ts`

**Interfaces:**
- Consumes: `NeckspertDb`, `createDatabase`, `SETTINGS_ROW_ID` (Task 1) ; `DexieAttemptRepository` (Task 2) ; `DexieCardStateRepository` (Task 3) ; `DexieSessionRepository` (Task 4) ; `DexieSettingsRepository` (Task 5) ; `validateBackup` (Task 6) ; `makeAttempt`, `makeBackup`, `makeCard`, `makeSession`, `IDENTIFY_TARGET` (Task 2) ; `BackupPort`.
- Produces: `class DexieBackup implements BackupPort { constructor(db: NeckspertDb, now?: () => number) }`.
  - `exportAll()` : `{ app: 'neckspert-play', version: 1, exportedAt: now(), settings, cards, attempts, sessions }`, lu dans une transaction en lecture sur les quatre tables. `settings` est complet (fusionné sur `DEFAULT_SETTINGS`), `attempts` et `sessions` sont triés du plus ancien au plus récent, les tentatives gardent leur `id`.
  - `importAll(file)` : `validateBackup(file)` d'abord ; puis, dans une seule transaction `'rw'` sur les quatre tables, vide chaque table et écrit le contenu du fichier. Toute erreur annule la transaction : les données précédentes restent intactes. Après un import, la ligne de réglages contient tous les champs du fichier.

- [ ] **Step 1: Écrire le test**

Créer `src/lib/infrastructure/storage/DexieBackup.spec.ts` :

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '$lib/domain/types';
import { createDatabase, type NeckspertDb } from './db';
import { DexieAttemptRepository } from './DexieAttemptRepository';
import { DexieBackup } from './DexieBackup';
import { DexieCardStateRepository } from './DexieCardStateRepository';
import { DexieSessionRepository } from './DexieSessionRepository';
import { DexieSettingsRepository } from './DexieSettingsRepository';
import {
	IDENTIFY_TARGET,
	makeAttempt,
	makeBackup,
	makeCard,
	makeSession
} from './testing/fixtures';
import { validateBackup } from './validateBackup';

/** Two cards, three attempts, two sessions, two changed settings. */
async function seed(db: NeckspertDb): Promise<void> {
	await new DexieSettingsRepository(db).update({ tempoBpm: 96, calibrationOffsetMs: 42 });
	await new DexieCardStateRepository(db).putMany([
		makeCard(),
		makeCard({ target: IDENTIFY_TARGET, leadBeats: 1 })
	]);
	const attempts = new DexieAttemptRepository(db);
	await attempts.add(makeAttempt({ promptedAt: 3000, verdict: 'late', reactionMs: 1800 }));
	await attempts.add(makeAttempt({ promptedAt: 1000 }));
	await attempts.add(
		makeAttempt({
			target: IDENTIFY_TARGET,
			promptedAt: 2000,
			leadBeats: null,
			answer: { kind: 'name', pitch: 'F' },
			timingOffsetMs: null
		})
	);
	const sessions = new DexieSessionRepository(db);
	await sessions.put(makeSession({ id: 's2', startedAt: 2500, endedAt: null }));
	await sessions.put(makeSession({ id: 's1', startedAt: 500 }));
}

describe('DexieBackup', () => {
	let db: NeckspertDb;

	beforeEach(() => {
		db = createDatabase(crypto.randomUUID());
	});

	describe('exportAll', () => {
		it('exports every table with the app header', async () => {
			await seed(db);
			const file = await new DexieBackup(db, () => 123).exportAll();
			expect(file.app).toBe('neckspert-play');
			expect(file.version).toBe(1);
			expect(file.exportedAt).toBe(123);
			expect(file.settings).toEqual({ ...DEFAULT_SETTINGS, tempoBpm: 96, calibrationOffsetMs: 42 });
			expect(file.cards.map((card) => card.key).sort()).toEqual(['identify:5:8', 'locate:2:F']);
			expect(file.attempts.map((attempt) => attempt.promptedAt)).toEqual([1000, 2000, 3000]);
			expect(file.attempts.every((attempt) => typeof attempt.id === 'number')).toBe(true);
			expect(file.sessions.map((session) => session.id)).toEqual(['s1', 's2']);
		});

		it('exports an empty database with the default settings', async () => {
			expect(await new DexieBackup(db, () => 5).exportAll()).toEqual({
				app: 'neckspert-play',
				version: 1,
				exportedAt: 5,
				settings: DEFAULT_SETTINGS,
				cards: [],
				attempts: [],
				sessions: []
			});
		});

		it('stamps the current time by default', async () => {
			const before = Date.now();
			const file = await new DexieBackup(db).exportAll();
			expect(file.exportedAt).toBeGreaterThanOrEqual(before);
			expect(file.exportedAt).toBeLessThanOrEqual(Date.now());
		});

		it('produces a file that passes validation after JSON', async () => {
			await seed(db);
			const file = await new DexieBackup(db, () => 123).exportAll();
			expect(validateBackup(JSON.parse(JSON.stringify(file)))).toEqual(file);
		});
	});

	describe('importAll', () => {
		it('replaces all stored data with the file', async () => {
			await seed(db);
			const file = makeBackup({
				settings: { ...DEFAULT_SETTINGS, locale: 'en' },
				sessions: [makeSession({ id: 'imported' })]
			});

			await new DexieBackup(db).importAll(file);

			expect(await new DexieSettingsRepository(db).get()).toEqual(file.settings);
			expect(await new DexieCardStateRepository(db).all()).toEqual(file.cards);
			expect(await new DexieAttemptRepository(db).all()).toEqual(file.attempts);
			expect(await new DexieSessionRepository(db).list()).toEqual(file.sessions);
		});

		it('rejects an invalid file and keeps the stored data', async () => {
			await seed(db);
			await expect(new DexieBackup(db).importAll({ app: 'other' })).rejects.toThrow(
				'Not a Neckspert Play backup'
			);
			expect(await db.attempts.count()).toBe(3);
			expect(await db.cards.count()).toBe(2);
			expect(await db.sessions.count()).toBe(2);
		});

		it('keeps the stored data when writing fails midway', async () => {
			await seed(db);
			const broken = makeBackup({
				attempts: [makeAttempt({ id: 1 }), makeAttempt({ id: 1, promptedAt: 2000 })]
			});

			await expect(new DexieBackup(db).importAll(broken)).rejects.toThrow();

			expect(await db.attempts.count()).toBe(3);
			expect(await db.cards.count()).toBe(2);
			expect((await new DexieSessionRepository(db).list()).map((s) => s.id)).toEqual(['s1', 's2']);
			expect((await new DexieSettingsRepository(db).get()).tempoBpm).toBe(96);
		});
	});

	it('round-trips through a fresh database', async () => {
		await seed(db);
		const first = await new DexieBackup(db, () => 1000).exportAll();

		const fresh = createDatabase(crypto.randomUUID());
		await new DexieBackup(fresh, () => 0).importAll(JSON.parse(JSON.stringify(first)));
		const second = await new DexieBackup(fresh, () => 2000).exportAll();

		expect(second.exportedAt).toBe(2000);
		expect({ ...second, exportedAt: first.exportedAt }).toEqual(first);
	});
});
```

Le test « writing fails midway » passe un fichier valide en forme dont deux tentatives portent le même `id` : `bulkAdd` échoue sur la table `attempts`, après avoir déjà vidé et réécrit `cards` et `settings`. La transaction unique doit tout annuler.

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/infrastructure/storage/DexieBackup.spec.ts`
Expected: FAIL, « Failed to resolve import "./DexieBackup" ».

- [ ] **Step 3: Écrire la sauvegarde**

Créer `src/lib/infrastructure/storage/DexieBackup.ts` :

```ts
import type { BackupPort } from '$lib/application/ports';
import type { BackupFile } from '$lib/domain/types';
import { SETTINGS_ROW_ID, type NeckspertDb } from './db';
import { DexieAttemptRepository } from './DexieAttemptRepository';
import { DexieSessionRepository } from './DexieSessionRepository';
import { DexieSettingsRepository } from './DexieSettingsRepository';
import { validateBackup } from './validateBackup';

export class DexieBackup implements BackupPort {
	constructor(
		private readonly db: NeckspertDb,
		private readonly now: () => number = () => Date.now()
	) {}

	exportAll(): Promise<BackupFile> {
		const { db } = this;
		return db.transaction(
			'r',
			[db.attempts, db.cards, db.sessions, db.settings],
			async (): Promise<BackupFile> => ({
				app: 'neckspert-play',
				version: 1,
				exportedAt: this.now(),
				settings: await new DexieSettingsRepository(db).get(),
				cards: await db.cards.toArray(),
				attempts: await new DexieAttemptRepository(db).all(),
				sessions: await new DexieSessionRepository(db).list()
			})
		);
	}

	async importAll(file: unknown): Promise<void> {
		const backup = validateBackup(file);
		const { db } = this;
		await db.transaction('rw', [db.attempts, db.cards, db.sessions, db.settings], async () => {
			await db.attempts.clear();
			await db.cards.clear();
			await db.sessions.clear();
			await db.settings.clear();
			await db.settings.put({ ...backup.settings, id: SETTINGS_ROW_ID });
			await db.cards.bulkAdd(backup.cards);
			await db.attempts.bulkAdd(backup.attempts);
			await db.sessions.bulkAdd(backup.sessions);
		});
	}
}
```

Notes pour l'implémenteur :
- Les écritures de la transaction sont enchaînées avec `await`, sans `Promise.all`, pour rester dans la zone de transaction de Dexie.
- `bulkAdd` (et non `bulkPut`) : une clé en double dans le fichier rejette la promesse, ce qui annule toute la transaction au lieu d'écraser une ligne en silence.
- Les tentatives gardent leur `id` : `++id` accepte une clé explicite, et les ajouts suivants continuent après le plus grand `id` importé.

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/infrastructure/storage/DexieBackup.spec.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Formater et vérifier les types**

Run: `npx prettier --write src/lib/infrastructure/storage && npm run check`
Expected: `svelte-check found 0 errors`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/infrastructure/storage/DexieBackup.ts src/lib/infrastructure/storage/DexieBackup.spec.ts
git commit -m "feat: export and import backups in one transaction"
```

---

### Task 8: Fichier de sauvegarde dans le navigateur

**Files:**
- Create: `src/lib/infrastructure/storage/backupFile.ts`
- Test: `src/lib/infrastructure/storage/backupFile.spec.ts` (Node)
- Test: `src/lib/infrastructure/storage/downloadBackup.svelte.spec.ts` (jsdom)

**Interfaces:**
- Consumes: `BackupFile` ; `makeBackup` (Task 2).
- Produces:
  - `backupFileName(exportedAt: number): string` → `neckspert-play-YYYY-MM-DD.json`, date locale de `exportedAt`.
  - `parseBackupJson(text: string): unknown` → lève `Error('Backup file is not valid JSON')`.
  - `readBackupFile(file: File): Promise<unknown>` → `parseBackupJson(await file.text())`. Ne valide pas : `BackupPort.importAll` s'en charge.
  - `downloadBackup(file: BackupFile): void` → JSON indenté dans un `Blob` `application/json`, lien temporaire cliqué puis retiré, URL révoquée 1 s plus tard.

`readBackupFile` se teste en Node : Node 22 fournit `File` et `File.text()`. Seul `downloadBackup` a besoin du DOM ; son test suit le motif jsdom (`*.svelte.spec.ts`). jsdom n'a pas `URL.createObjectURL` : le test le définit. Le `setTimeout` de révocation n'a rien de musical ; la contrainte sur les minuteurs ne s'applique pas.

- [ ] **Step 1: Écrire le test Node**

Créer `src/lib/infrastructure/storage/backupFile.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { backupFileName, parseBackupJson, readBackupFile } from './backupFile';

describe('backupFileName', () => {
	it('names the file after the local export date', () => {
		expect(backupFileName(new Date(2026, 0, 5, 12).getTime())).toBe(
			'neckspert-play-2026-01-05.json'
		);
		expect(backupFileName(new Date(2026, 11, 31, 23, 30).getTime())).toBe(
			'neckspert-play-2026-12-31.json'
		);
	});
});

describe('parseBackupJson', () => {
	it('parses JSON text', () => {
		expect(parseBackupJson('{"app":"neckspert-play"}')).toEqual({ app: 'neckspert-play' });
	});

	it('rejects text that is not JSON', () => {
		expect(() => parseBackupJson('not json')).toThrow('Backup file is not valid JSON');
	});
});

describe('readBackupFile', () => {
	it('reads and parses a file', async () => {
		const file = new File(['{"version":1}'], 'backup.json', { type: 'application/json' });
		expect(await readBackupFile(file)).toEqual({ version: 1 });
	});

	it('rejects a file that is not JSON', async () => {
		await expect(readBackupFile(new File(['oops'], 'backup.json'))).rejects.toThrow(
			'Backup file is not valid JSON'
		);
	});
});
```

- [ ] **Step 2: Écrire le test jsdom**

Créer `src/lib/infrastructure/storage/downloadBackup.svelte.spec.ts` :

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadBackup } from './backupFile';
import { makeBackup } from './testing/fixtures';

const OBJECT_URL = 'blob:neckspert-backup';
const createObjectURL = vi.fn<(blob: Blob) => string>(() => OBJECT_URL);
const revokeObjectURL = vi.fn<(url: string) => void>();

describe('downloadBackup', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		Object.defineProperty(URL, 'createObjectURL', {
			value: createObjectURL,
			configurable: true,
			writable: true
		});
		Object.defineProperty(URL, 'revokeObjectURL', {
			value: revokeObjectURL,
			configurable: true,
			writable: true
		});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		createObjectURL.mockClear();
		revokeObjectURL.mockClear();
	});

	it('clicks a temporary link to a dated JSON file', async () => {
		const clicks: { href: string; download: string }[] = [];
		vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
			const link = document.querySelector('a');
			if (link) clicks.push({ href: link.href, download: link.download });
		});
		const file = makeBackup({ exportedAt: new Date(2026, 8, 30, 12).getTime() });

		downloadBackup(file);

		expect(clicks).toEqual([{ href: OBJECT_URL, download: 'neckspert-play-2026-09-30.json' }]);
		expect(document.querySelector('a')).toBeNull();
		const blob = createObjectURL.mock.calls[0][0];
		expect(blob.type).toBe('application/json');
		expect(JSON.parse(await blob.text())).toEqual(file);
	});

	it('revokes the object URL once the download has started', () => {
		vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

		downloadBackup(makeBackup());

		expect(revokeObjectURL).not.toHaveBeenCalled();
		vi.runAllTimers();
		expect(revokeObjectURL).toHaveBeenCalledWith(OBJECT_URL);
	});
});
```

- [ ] **Step 3: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run src/lib/infrastructure/storage/backupFile.spec.ts src/lib/infrastructure/storage/downloadBackup.svelte.spec.ts`
Expected: FAIL, « Failed to resolve import "./backupFile" » dans les deux fichiers.

- [ ] **Step 4: Écrire les aides**

Créer `src/lib/infrastructure/storage/backupFile.ts` :

```ts
import type { BackupFile } from '$lib/domain/types';

/** Revoking the object URL right after the click can cancel the download in some browsers. */
const REVOKE_DELAY_MS = 1000;

export function backupFileName(exportedAt: number): string {
	const date = new Date(exportedAt);
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `neckspert-play-${date.getFullYear()}-${month}-${day}.json`;
}

export function parseBackupJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		throw new Error('Backup file is not valid JSON');
	}
}

export async function readBackupFile(file: File): Promise<unknown> {
	return parseBackupJson(await file.text());
}

export function downloadBackup(file: BackupFile): void {
	const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = backupFileName(file.exportedAt);
	document.body.append(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
```

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run src/lib/infrastructure/storage/backupFile.spec.ts src/lib/infrastructure/storage/downloadBackup.svelte.spec.ts`
Expected: PASS (7 tests : 5 dans le projet `server`, 2 dans le projet `client`).

- [ ] **Step 6: Formater et vérifier les types**

Run: `npx prettier --write src/lib/infrastructure/storage && npm run check`
Expected: `svelte-check found 0 errors`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/infrastructure/storage/backupFile.ts src/lib/infrastructure/storage/backupFile.spec.ts src/lib/infrastructure/storage/downloadBackup.svelte.spec.ts
git commit -m "feat: add backup download and file reading helpers"
```

---

### Task 9: Point d'entrée du module

**Files:**
- Create: `src/lib/infrastructure/storage/index.ts`
- Test: `src/lib/infrastructure/storage/index.spec.ts`

**Interfaces:**
- Consumes: tout ce que produisent les Tasks 1 à 8.
- Produces: `$lib/infrastructure/storage` exporte exactement les signatures du README pour D : `NeckspertDb`, `createDatabase`, `DexieAttemptRepository`, `DexieCardStateRepository`, `DexieSessionRepository`, `DexieSettingsRepository`, `DexieBackup`, `validateBackup`, `downloadBackup`, `readBackupFile`. Les aides internes (`SETTINGS_ROW_ID`, `backupFileName`, `parseBackupJson`, `testing/`) restent hors du point d'entrée.

- [ ] **Step 1: Écrire le test**

Créer `src/lib/infrastructure/storage/index.spec.ts` :

```ts
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import * as storage from './index';

describe('storage module', () => {
	it('exposes exactly the roadmap signatures', () => {
		const exported = Object.entries(storage)
			.filter(([, value]) => typeof value === 'function')
			.map(([name]) => name)
			.sort();
		expect(exported).toEqual([
			'DexieAttemptRepository',
			'DexieBackup',
			'DexieCardStateRepository',
			'DexieSessionRepository',
			'DexieSettingsRepository',
			'NeckspertDb',
			'createDatabase',
			'downloadBackup',
			'readBackupFile',
			'validateBackup'
		]);
	});

	it('wires the repositories and the backup on one database', async () => {
		const db = storage.createDatabase(crypto.randomUUID());
		await new storage.DexieSettingsRepository(db).update({ locale: 'en' });
		const file = await new storage.DexieBackup(db, () => 1).exportAll();
		expect(file.settings.locale).toBe('en');
		expect(storage.validateBackup(file)).toBe(file);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/infrastructure/storage/index.spec.ts`
Expected: FAIL, « Failed to resolve import "./index" ».

- [ ] **Step 3: Écrire le point d'entrée**

Créer `src/lib/infrastructure/storage/index.ts` :

```ts
export { NeckspertDb, createDatabase } from './db';
export { DexieAttemptRepository } from './DexieAttemptRepository';
export { DexieCardStateRepository } from './DexieCardStateRepository';
export { DexieSessionRepository } from './DexieSessionRepository';
export { DexieSettingsRepository } from './DexieSettingsRepository';
export { DexieBackup } from './DexieBackup';
export { validateBackup } from './validateBackup';
export { downloadBackup, readBackupFile } from './backupFile';
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/infrastructure/storage/index.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Lancer toute la suite, le formatage et la vérification de types**

Run: `npx prettier --check src/lib/infrastructure/storage && npm test && npm run check`
Expected: « All matched files use Prettier code style! », tous les tests PASS (dont 84 dans `src/lib/infrastructure/storage/`), `svelte-check found 0 errors`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/infrastructure/storage/index.ts src/lib/infrastructure/storage/index.spec.ts
git commit -m "feat: expose storage module entry point"
```

---

## Fin du plan

À la fin de ce plan, la branche `plan/d-stockage` fournit `$lib/infrastructure/storage`. Repères pour les vagues suivantes :

- **K (intégration)** : `const db = createDatabase();` une seule fois, puis un dépôt de chaque sorte et `new DexieBackup(db)` sur cette même base.
- **I3 (réglages)** : export par `downloadBackup(await backup.exportAll())` ; import par `backup.importAll(await readBackupFile(file))`, après confirmation. Les deux lèvent une `Error` au message anglais : `Backup file is not valid JSON`, puis les messages de `validateBackup` (liste en Task 6). L'écran affiche un message traduit.
- **J (orchestration)** : les tests de J utilisent les doublures de P0 ; les suites de contrat de ce plan garantissent qu'elles se comportent comme Dexie sur tout ce que les ports décrivent.
