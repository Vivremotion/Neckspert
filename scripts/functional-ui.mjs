/**
 * Functional checks for the screens served under /dev, in a real browser.
 * Not a unit test: it loads the dev servers and drives the pages.
 *
 * Start the dev servers from the checkout under test, on the ports it expects
 * (5201 serves /dev/rhythm; override with RHYTHM_URL):
 *   for port in 5191 5180 5193 5201; do
 *     npx vite dev --port $port --strictPort --host 127.0.0.1 &
 *   done
 *
 *   node scripts/functional-ui.mjs
 *
 * Behavior failures and text under 16px both exit 1.
 * Chrome is launched headless on its own debugging port; nothing is added
 * to package.json.
 */
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const CHROME =
	process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.CDP_PORT ?? 9333);
const MIN_PX = 16;

const chrome = spawn(
	CHROME,
	[
		'--headless=new',
		`--remote-debugging-port=${PORT}`,
		`--user-data-dir=/tmp/neckspert-functional-chrome-${PORT}`,
		'--no-first-run',
		'--disable-gpu',
		'about:blank'
	],
	{ stdio: 'ignore' }
);

let ws;
const pending = new Map();
let seq = 0;

function send(method, params = {}, sessionId) {
	const id = ++seq;
	const message = { id, method, params };
	if (sessionId) message.sessionId = sessionId;
	return new Promise((resolve, reject) => {
		pending.set(id, { resolve, reject });
		ws.send(JSON.stringify(message));
	});
}

async function connect() {
	for (let i = 0; i < 40; i++) {
		try {
			const version = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json());
			ws = new WebSocket(version.webSocketDebuggerUrl);
			await new Promise((resolve, reject) => {
				ws.addEventListener('open', resolve, { once: true });
				ws.addEventListener('error', reject, { once: true });
			});
			ws.addEventListener('message', (event) => {
				const message = JSON.parse(event.data);
				if (message.id && pending.has(message.id)) {
					const { resolve, reject } = pending.get(message.id);
					pending.delete(message.id);
					if (message.error) reject(new Error(message.error.message));
					else resolve(message.result);
				}
			});
			return;
		} catch {
			await delay(150);
		}
	}
	throw new Error('Chrome debugging port did not open');
}

async function open(url) {
	const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
	const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
	const call = (method, params = {}) => send(method, params, sessionId);
	await call('Page.enable');
	await call('Runtime.enable');
	await call('Page.navigate', { url });
	await delay(700);
	return call;
}

async function evaluate(call, expression) {
	const result = await call('Runtime.evaluate', {
		expression: `(${expression})()`,
		awaitPromise: true,
		returnByValue: true
	});
	if (result.exceptionDetails) {
		throw new Error(result.exceptionDetails.text || 'page exception');
	}
	return result.result.value;
}

function assert(condition, message) {
	return condition ? { ok: true, message } : { ok: false, message };
}

const behavior = [];
const tiny = [];

function check(result) {
	behavior.push(result);
	const mark = result.ok ? 'ok' : 'FAIL';
	console.log(`  ${mark}  ${result.message}`);
}

function noteTiny(page, rows) {
	for (const row of rows) {
		const px = Number.parseFloat(row.fontSize);
		if (px < MIN_PX) tiny.push({ page, ...row, px });
	}
}

try {
	await connect();

	console.log('\nAccueil /dev/home');
	{
		const call = await open('http://127.0.0.1:5191/dev/home');
		const page = await evaluate(
			call,
			`() => {
				const buttons = [...document.querySelectorAll('button')].map((b) => b.textContent.trim());
				const links = [...document.querySelectorAll('a')].map((a) => a.textContent.trim());
				const texts = [...document.querySelectorAll('body *')]
					.filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
					.map((el) => ({ text: el.textContent.trim().slice(0, 60), fontSize: getComputedStyle(el).fontSize }));
				return { buttons, links, texts, text: document.body.innerText };
			}`
		);
		const count = (label) => page.buttons.filter((b) => b === label).length;
		const body = page.text.toLocaleLowerCase('fr');
		check(assert(count('Apprentissage') > 0, 'le bouton Apprentissage est présent'));
		check(assert(count('Triades') > 0, 'le bouton Triades est présent'));
		check(assert(count('Rythme') > 0, 'le bouton Rythme est présent'));
		check(
			assert(
				page.links.join('|') === 'Accueil|Jeu libre|Carte|Réglages',
				`la navigation a ses quatre liens (${page.links.join('|')})`
			)
		);
		check(assert(body.includes('6 révisions dues'), 'les révisions dues sont comptées'));
		check(assert(body.includes('dans 2 h'), 'la prochaine révision est « Dans 2 h »'));
		check(assert(body.includes('40 ms'), 'l’écart au temps de 40 ms est affiché'));
		check(assert(body.includes('plus près'), 'la tendance « Plus près » est affichée'));
		noteTiny('home', page.texts);
	}

	console.log('\nBilan /dev/summary');
	{
		const call = await open('http://127.0.0.1:5191/dev/summary');
		const page = await evaluate(
			call,
			`() => ({
				text: document.body.innerText,
				texts: [...document.querySelectorAll('body *')]
					.filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
					.map((el) => ({ text: el.textContent.trim().slice(0, 60), fontSize: getComputedStyle(el).fontSize }))
			})`
		);
		const summary = page.text.toLocaleLowerCase('fr');
		check(assert(summary.includes('notes apprises'), 'les notes apprises sont affichées'));
		check(assert(summary.includes('triades apprises'), 'les triades apprises sont affichées'));
		check(assert(summary.includes('pas de fatigue'), 'l’absence de fatigue est affichée'));
		check(
			assert(summary.includes('prochaines révisions'), 'les prochaines révisions sont affichées')
		);
		check(assert(summary.includes('dans 2 h'), 'l’heure conseillée est « Dans 2 h »'));
		check(assert(summary.includes('niveau atteint'), 'le niveau atteint du rythme est affiché'));
		noteTiny('summary', page.texts);
	}

	console.log('\nCarte /dev/map');
	{
		const call = await open('http://127.0.0.1:5191/dev/map');
		const page = await evaluate(
			call,
			`() => {
				const cells = [...document.querySelectorAll('[role="gridcell"]')];
				const rows = [...document.querySelectorAll('[role="row"]')];
				return {
					count: cells.length,
					rowCount: rows.length,
					first: cells[0]?.getAttribute('aria-label') ?? '',
					lastRowFirst: rows.at(-1)?.querySelector('[role="gridcell"]')?.getAttribute('aria-label') ?? '',
					texts: [...document.querySelectorAll('.pitch, .dirs span')].map((el) => ({
						text: el.textContent.trim().slice(0, 40),
						fontSize: getComputedStyle(el).fontSize
					}))
				};
			}`
		);
		check(assert(page.count === 66, `la carte a 66 cases (${page.count})`));
		check(assert(page.rowCount === 6, `la carte a 6 cordes (${page.rowCount})`));
		check(
			assert(
				page.first.includes('6') && page.first.includes('0'),
				`corde 6, case 0 en haut (${page.first})`
			)
		);
		check(
			assert(
				page.lastRowFirst.includes('1'),
				`la dernière corde est la corde 1 (${page.lastRowFirst})`
			)
		);
		noteTiny('map', page.texts);
	}

	console.log('\nMode 2 /dev/identify');
	{
		const call = await open('http://127.0.0.1:5180/dev/identify');
		await delay(400);
		const before = await evaluate(
			call,
			`() => {
				const buttons = [...document.querySelectorAll('[role="group"] button')];
				return {
					labels: buttons.map((b) => b.getAttribute('aria-label')),
					group: document.querySelector('[role="group"]')?.getAttribute('aria-label'),
					status: document.querySelector('.play')?.getAttribute('data-status'),
					lane: Boolean(document.querySelector('.lane')),
					prompt: document.body.innerText.includes('case 8')
				};
			}`
		);
		check(assert(before.labels.length === 12, `le clavier a 12 touches (${before.labels.length})`));
		check(assert(before.group === 'Nom de la note', `le clavier est nommé (${before.group})`));
		check(assert(before.labels[0] === 'C', `l’ordre commence par C (${before.labels[0]})`));
		check(
			assert(
				before.labels.some((l) => l === 'F# / Gb'),
				'les altérations affichent dièse et bémol'
			)
		);
		check(assert(before.lane === false, 'la piste est absente en mode 2'));
		check(assert(before.prompt, 'la consigne « case 8 » est visible'));
		const after = await evaluate(
			call,
			`async () => {
				const buttons = () => [...document.querySelectorAll('[role="group"] button')];
				buttons()[0].click();
				buttons()[1].click();
				await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
				const pad = buttons();
				return {
					disabled: pad.filter((b) => b.disabled).length,
					text: document.body.innerText
				};
			}`
		);
		check(
			assert(
				after.disabled === 12,
				`le premier toucher verrouille les 12 touches (${after.disabled})`
			)
		);
		check(assert(after.text.includes('C joué'), 'la note jouée s’affiche après le toucher'));
	}

	console.log('\nMode 1 /session/demo');
	{
		const call = await open('http://127.0.0.1:5180/session/demo');
		const page = await evaluate(
			call,
			`() => ({
				status: document.querySelector('.play')?.getAttribute('data-status') ?? 'absent',
				lane: Boolean(document.querySelector('.lane')),
				pad: [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'C').length
			})`
		);
		check(
			assert(
				['count-in', 'awaiting', 'verdict'].includes(page.status),
				`la démo du mode 1 tourne (${page.status}), sans bouton Commencer : elle démarre seule`
			)
		);
		check(assert(page.lane, 'la piste du mode 1 est présente'));
		check(assert(page.pad === 0, 'le pavé du mode 2 n’est pas affiché'));
	}

	console.log('\nCalibration /dev/calibration');
	{
		const call = await open('http://127.0.0.1:5193/dev/calibration');
		const run = await evaluate(
			call,
			`async () => {
				const click = (label) => {
					const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes(label));
					button?.click();
				};
				const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
				const has = (s) => document.body.innerText.toLocaleLowerCase('fr').includes(s);
				const headphone = has('porte un casque');
				click('Calibrer');
				await frame();
				const progress = /4\\s*\\/\\s*16/.test(document.body.innerText);
				click('Annuler');
				await frame();
				const cancelled = has('annulée');
				click('Réessayer');
				await frame();
				const idle = has('calibrer') && !has('annulée');
				const texts = [...document.querySelectorAll('body *')]
					.filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
					.map((el) => ({ text: el.textContent.trim().slice(0, 60), fontSize: getComputedStyle(el).fontSize }));
				return { headphone, progress, cancelled, idle, texts, sample: document.body.innerText.slice(0, 300) };
			}`
		);
		if (!run.headphone || !run.progress || !run.cancelled || !run.idle) {
			console.log('  …', run.sample.replace(/\\s+/g, ' '));
		}
		check(assert(run.headphone, 'le micro intégré recommande un casque'));
		check(assert(run.progress, 'Calibrer affiche la progression 4 / 16'));
		check(assert(run.cancelled, 'Annuler affiche l’annulation'));
		check(assert(run.idle, 'Réessayer revient à l’état initial'));
		noteTiny('calibration', run.texts);
	}

	console.log('\nRéglages /dev/settings');
	{
		const call = await open('http://127.0.0.1:5193/dev/settings');
		const run = await evaluate(
			call,
			`async () => {
				const click = (label) =>
					[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label)?.click();
				const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
				click('EN');
				await frame();
				const english = document.body.innerText.toLocaleLowerCase('fr').includes('settings') && document.body.innerText.toLocaleLowerCase('fr').includes('language');
				click('FR');
				await frame();
				const french = document.body.innerText.toLocaleLowerCase('fr').includes('réglages');
				const link = document.querySelector('a.calibration-link')?.getAttribute('href');
				const input = document.querySelector('input[type="file"]');
				const file = new File(['{}'], 'backup.json', { type: 'application/json' });
				const transfer = new DataTransfer();
				transfer.items.add(file);
				input.files = transfer.files;
				input.dispatchEvent(new Event('change', { bubbles: true }));
				await frame();
				const confirm = document.body.innerText.toLocaleLowerCase('fr').includes('remplacer les données actuelles');
				const texts = [...document.querySelectorAll('body *')]
					.filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
					.map((el) => ({ text: el.textContent.trim().slice(0, 60), fontSize: getComputedStyle(el).fontSize }));
				return { english, french, link, confirm, texts, sample: document.body.innerText.slice(0, 400) };
			}`
		);
		if (!run.english || !run.french || !run.confirm) {
			console.log('  …', run.sample.replace(/\\s+/g, ' '));
		}
		check(assert(run.english, 'English bascule les libellés tout de suite'));
		check(assert(run.french, 'Français revient aux libellés français'));
		check(assert(run.link === '/calibration', 'le lien ouvre /calibration'));
		check(assert(run.confirm, 'l’import demande confirmation avant remplacement'));
		noteTiny('settings', run.texts);
	}

	// The rhythm view (`/dev/rhythm`, a still model in the play frame): the embedded Bravura font
	// is loaded and draws, the run played and the next figure are engraved at the breath, and the
	// cursor shows on a clicked bar but never on a muted one.
	const RHYTHM_URL = process.env.RHYTHM_URL ?? 'http://localhost:5201/dev/rhythm';
	const texts = `[...document.querySelectorAll('body *')]
		.filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
		.map((el) => ({ text: el.textContent.trim().slice(0, 60), fontSize: getComputedStyle(el).fontSize }))`;
	const settle = `async () => {
		await document.fonts.ready;
		for (let i = 0; i < 40 && !document.querySelector('svg'); i++) {
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
	}`;

	console.log('\nRythme /dev/rhythm (respiration)');
	{
		const call = await open(RHYTHM_URL);
		const run = await evaluate(
			call,
			`async () => {
				await (${settle})();
				await new Promise((resolve) => setTimeout(resolve, 200));
				const head = document.querySelector('.vf-notehead path, .vf-notehead');
				const box = head?.getBBox?.();
				const faces = [...document.fonts].filter((face) => face.family.replaceAll('"', '') === 'Bravura');
				const played = document.querySelector('[data-testid="rhythm-played"]');
				const next = document.querySelector('[data-testid="rhythm-next"]');
				return {
					check: document.fonts.check('30px Bravura'),
					loaded: faces.length > 0 && faces.every((face) => face.status === 'loaded'),
					head: box ? box.width : 0,
					svgs: document.querySelectorAll('svg').length,
					order: Boolean(played && next && played.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING),
					marks: document.querySelectorAll('[data-testid="rhythm-mark"]').length,
					texts: ${texts}
				};
			}`
		);
		check(assert(run.check, 'document.fonts.check(« 30px Bravura ») est vrai'));
		check(assert(run.loaded, 'la police Bravura embarquée est chargée'));
		check(assert(run.head > 0, `la tête de note a une largeur (${run.head})`));
		check(assert(run.svgs >= 2, `la suite jouée et la figure à jouer sont gravées (${run.svgs})`));
		check(assert(run.order, 'la suite jouée précède la figure à jouer'));
		check(assert(run.marks > 0, `les marques de la suite sont dessinées (${run.marks})`));
		noteTiny('rhythm-breath', run.texts);
	}

	for (const [phase, shown] of [
		['play', true],
		['muted', false]
	]) {
		console.log(`\nRythme /dev/rhythm?phase=${phase}`);
		const call = await open(`${RHYTHM_URL}?phase=${phase}`);
		const run = await evaluate(
			call,
			`async () => {
				await (${settle})();
				await new Promise((resolve) => setTimeout(resolve, 200));
				return {
					svgs: document.querySelectorAll('svg').length,
					cursor: document.querySelector('[data-testid="rhythm-cursor"]') !== null,
					// The time signature: its digits' baselines, the staff line and the row, in the
					// engraving's own units (one line here, so the view box is the row).
					signature: (() => {
						const svg = document.querySelector('svg');
						if (!svg) return null;
						const digits = [...svg.querySelectorAll('.vf-timesignature text')].map((t) => Number(t.getAttribute('y')));
						const line = svg.querySelector('.vf-stave')?.getBBox().y ?? null;
						const row = Number((svg.getAttribute('viewBox') ?? '').split(' ')[3]);
						return { digits, line, row };
					})(),
					texts: ${texts}
				};
			}`
		);
		check(assert(run.svgs >= 1, `la figure est gravée (${run.svgs})`));
		check(
			assert(
				run.cursor === shown,
				shown ? 'le curseur suit une mesure avec clic' : 'aucun curseur pendant une mesure muette'
			)
		);
		if (phase === 'play') {
			const sig = run.signature;
			const [top, bottom] = sig?.digits ?? [];
			const half = (bottom - top) / 2;
			check(
				assert(
					sig?.digits.length === 2 && Math.abs((top + bottom) / 2 - sig.line) <= 1,
					`le chiffrage est centré sur la ligne (${sig?.digits} autour de ${sig?.line})`
				)
			);
			check(
				assert(
					top - half >= 0 && bottom + half <= sig.row,
					`le chiffrage tient dans sa rangée (${top - half} à ${bottom + half} sur ${sig?.row})`
				)
			);
		}
		noteTiny(`rhythm-${phase}`, run.texts);
	}

	console.log('\nRythme /dev/rhythm?phase=shift');
	{
		const call = await open(`${RHYTHM_URL}?phase=shift`);
		const run = await evaluate(
			call,
			`async () => {
				await (${settle})();
				await new Promise((resolve) => setTimeout(resolve, 300));
				const label = document.querySelector('[data-testid="rhythm-shift"]');
				const strip = label?.closest('.strip');
				const box = label?.getBoundingClientRect();
				const stripBox = strip?.getBoundingClientRect();
				return {
					text: label?.textContent ?? null,
					fontSize: label ? parseFloat(getComputedStyle(label).fontSize) : 0,
					inside: Boolean(box && stripBox && box.left >= stripBox.left - 1 && box.right <= stripBox.right + 1),
					texts: ${texts}
				};
			}`
		);
		check(
			assert(run.text === 'temps perdu', `« temps perdu » est écrit sur sa mesure (${run.text})`)
		);
		check(assert(run.fontSize >= 16, `« temps perdu » fait au moins 16 px (${run.fontSize})`));
		check(assert(run.inside, '« temps perdu » tient dans la largeur de la suite'));
		noteTiny('rhythm-shift', run.texts);
	}

	console.log('\nRythme /dev/rhythm?phase=along');
	{
		const call = await open(`${RHYTHM_URL}?phase=along`);
		const run = await evaluate(
			call,
			`async () => {
				await (${settle})();
				return { status: document.querySelector('[role="status"]')?.textContent ?? null, texts: ${texts} };
			}`
		);
		check(
			assert(run.status === 'On la joue ensemble', `l’aide en cours est annoncée (${run.status})`)
		);
		noteTiny('rhythm-along', run.texts);
	}

	console.log('\nTextes sous 16 px');
	const seen = new Set();
	for (const row of tiny) {
		const key = `${row.page}|${row.px}|${row.text}`;
		if (seen.has(key)) continue;
		seen.add(key);
		console.log(`  FAIL  ${row.page}: ${row.px}px « ${row.text} »`);
	}
	if (seen.size === 0) console.log('  ok  aucun texte sous 16 px');

	const behaviorFailed = behavior.filter((item) => !item.ok).length;
	console.log(`\nComportement: ${behavior.length - behaviorFailed}/${behavior.length}`);
	console.log(`Lisibilité: ${seen.size} texte(s) sous ${MIN_PX}px`);
	if (behaviorFailed || seen.size) process.exitCode = 1;
} finally {
	chrome.kill();
	ws?.close();
}
