/**
 * Functional checks for the wave-2 screens, in a real browser.
 * Not a unit test: it loads the dev servers and drives the pages.
 *
 * Start the three worktrees first:
 *   .worktrees/plan-i1-accueil     → 5191
 *   .worktrees/plan-i2-reponse     → 5180
 *   .worktrees/plan-i3-calibration → 5193
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
				const buttons = [...document.querySelectorAll('button')].map((b) => ({
					text: b.textContent.trim(),
					disabled: b.disabled
				}));
				const texts = [...document.querySelectorAll('body *')]
					.filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
					.map((el) => ({ text: el.textContent.trim().slice(0, 60), fontSize: getComputedStyle(el).fontSize }));
				return { buttons, texts };
			}`
		);
		const byText = Object.fromEntries(page.buttons.map((b) => [b.text, b.disabled]));
		check(assert(byText['Session du jour'] === false, 'le bouton Session du jour est actif'));
		check(assert(byText['Positionnement'] === false, 'le bouton Positionnement est actif'));
		check(assert(byText['Dans 2 h'] === true, 'le bouton d’attente « Dans 2 h » est désactivé'));
		check(
			assert(
				page.texts.some((t) => t.text.includes('1,18 s')),
				'la médiane 1,18 s est affichée'
			)
		);
		check(
			assert(
				page.texts.some((t) => t.text === 'en baisse'),
				'la tendance « en baisse » est affichée'
			)
		);
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
		check(assert(summary.includes('positions apprises'), 'les positions apprises sont affichées'));
		check(assert(summary.includes('pas de fatigue'), 'l’absence de fatigue est affichée'));
		check(assert(summary.includes('prochaine session'), 'la prochaine session est affichée'));
		check(assert(summary.includes('dans 2 h'), 'l’heure conseillée est « Dans 2 h »'));
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
		check(assert(page.count === 72, `la carte a 72 cases (${page.count})`));
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
				const buttons = [...document.querySelectorAll('button')].filter((b) => /[A-G]/.test(b.textContent));
				return {
					labels: buttons.map((b) => b.textContent.trim()),
					status: document.querySelector('.play')?.getAttribute('data-status'),
					lane: Boolean(document.querySelector('.lane')),
					prompt: document.body.innerText.includes('case 8')
				};
			}`
		);
		check(assert(before.labels.length === 12, `le pavé a 12 boutons (${before.labels.length})`));
		check(assert(before.labels[0] === 'C', `l’ordre commence par C (${before.labels[0]})`));
		check(
			assert(
				before.labels.some((l) => l.includes('F# / Gb')),
				'les altérations affichent dièse et bémol'
			)
		);
		check(assert(before.lane === false, 'la piste est absente en mode 2'));
		check(assert(before.prompt, 'la consigne « case 8 » est visible'));
		const after = await evaluate(
			call,
			`async () => {
				const buttons = () => [...document.querySelectorAll('button')].filter((b) => /[A-G]/.test(b.textContent));
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
				`le premier toucher verrouille les 12 boutons (${after.disabled})`
			)
		);
		check(
			assert(
				/parfait|en retard|mauvaise|en avance/.test(after.text.toLocaleLowerCase('fr')),
				'un verdict s’affiche après le toucher'
			)
		);
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
				const progress = document.body.innerText.includes('4') && document.body.innerText.includes('10');
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
		check(assert(run.progress, 'Calibrer affiche la progression 4/10'));
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
