#!/usr/bin/env node
// Gathers what changed on the project since the last "what's up", as JSON on stdout.
//
//   node .claude/skills/whats-up/gather.mjs           since the last checkpoint (else 7 days)
//   node .claude/skills/whats-up/gather.mjs --since 2026-11-01T00:00:00Z
//   node .claude/skills/whats-up/gather.mjs --mark    write now as the checkpoint, print nothing else
//
// The checkpoint is local (.claude/whats-up.local.json, git-ignored): it is this machine's "last time".

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const OWNER = 'Vivremotion';
const REPO = 'Vivremotion/Neckspert';
const PROJECT = 1;
const CHECKPOINT = '.claude/whats-up.local.json';
const DEFAULT_LOOKBACK_DAYS = 7;
const COMMENT_EXCERPT = 600;
const HANDOVER_HEADING = '## Passation';
const AUTHOR_LABEL = 'attend-auteur';

const args = process.argv.slice(2);
const now = new Date().toISOString();

if (args.includes('--mark')) {
	writeFileSync(CHECKPOINT, JSON.stringify({ lastRun: now }, null, '\t') + '\n');
	console.log(JSON.stringify({ marked: now }));
	process.exit(0);
}

const sinceArg = args[args.indexOf('--since') + 1];
const checkpoint = existsSync(CHECKPOINT)
	? JSON.parse(readFileSync(CHECKPOINT, 'utf8')).lastRun
	: null;
const since =
	(args.includes('--since') && sinceArg) ||
	checkpoint ||
	new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 864e5).toISOString();

const sh = (command, commandArgs) =>
	execFileSync(command, commandArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const graphql = (query) => JSON.parse(sh('gh', ['api', 'graphql', '-f', `query=${query}`])).data;
const excerpt = (body) =>
	body.length > COMMENT_EXCERPT ? body.slice(0, COMMENT_EXCERPT) + '…' : body;

try {
	sh('git', ['fetch', '-q', 'origin']);
} catch {
	// Offline: report from the local refs.
}

const commits = sh('git', [
	'log',
	'origin/main',
	`--since=${since}`,
	'--first-parent',
	'--format=%h %cI %s'
])
	.split('\n')
	.filter(Boolean);

const mergedIntoMain = (branch) => {
	try {
		sh('git', ['merge-base', '--is-ancestor', branch, 'origin/main']);
		return true;
	} catch {
		return false;
	}
};

const worktrees = sh('git', ['worktree', 'list', '--porcelain'])
	.split('\n\n')
	.filter(Boolean)
	.map((block) => {
		const line = (key) =>
			block
				.split('\n')
				.find((l) => l.startsWith(key + ' '))
				?.slice(key.length + 1);
		const branch = line('branch')?.replace('refs/heads/', '') ?? null;
		return {
			path: line('worktree'),
			branch,
			mergedIntoMain: branch ? mergedIntoMain(branch) : null
		};
	});

const board = graphql(`query {
	user(login: "${OWNER}") { projectV2(number: ${PROJECT}) { items(first: 100) { nodes {
		fieldValues(first: 20) { nodes {
			... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2SingleSelectField { name } } }
			... on ProjectV2ItemFieldIterationValue { title field { ... on ProjectV2IterationField { name } } }
			... on ProjectV2ItemFieldDateValue { date field { ... on ProjectV2Field { name } } }
		} }
		content { ... on Issue {
			number title state closedAt updatedAt
			labels(first: 10) { nodes { name } }
			blockedBy(first: 10) { nodes { number state } }
			parent { number }
			subIssues { totalCount }
		} }
	} } } }
}`)
	.user.projectV2.items.nodes.filter((item) => item.content?.number)
	.map(({ fieldValues, content }, rank) => {
		const fields = Object.fromEntries(
			fieldValues.nodes
				.filter((value) => value.field)
				.map((value) => [value.field.name, value.name ?? value.title ?? value.date])
		);
		return {
			rank,
			number: content.number,
			title: content.title,
			epic: content.subIssues.totalCount > 0,
			state: content.state,
			closedAt: content.closedAt,
			status: fields.Status ?? null,
			track: fields.Piste ?? null,
			iteration: fields['Itération'] ?? null,
			labels: content.labels.nodes.map((label) => label.name),
			openBlockers: content.blockedBy.nodes.filter((b) => b.state === 'OPEN').map((b) => b.number),
			parent: content.parent?.number ?? null
		};
	});

const search = (filter) =>
	graphql(`query {
	search(type: ISSUE, first: 50, query: "repo:${REPO} ${filter}") { nodes {
		... on Issue { number title state body labels(first: 10) { nodes { name } }
			comments(last: 20) { nodes { author { login } createdAt body } } }
		... on PullRequest { number title state isDraft headRefName mergedAt url
			reviewDecision
			commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
			comments(last: 20) { nodes { author { login } createdAt body } } }
	} }
}`).search.nodes;

const recentComments = (node) =>
	node.comments.nodes
		.filter((comment) => comment.createdAt >= since)
		.map((comment) => ({
			author: comment.author?.login ?? null,
			at: comment.createdAt,
			handover: comment.body.trimStart().startsWith(HANDOVER_HEADING),
			body: excerpt(comment.body)
		}));

const day = since.slice(0, 10);
const updatedIssues = search(`is:issue updated:>=${day}`)
	.map((issue) => ({
		number: issue.number,
		title: issue.title,
		state: issue.state,
		comments: recentComments(issue)
	}))
	.filter((issue) => issue.comments.length > 0);

const waitingOnAuthor = search(`is:issue is:open label:${AUTHOR_LABEL}`).map((issue) => {
	const last = issue.comments.nodes.at(-1);
	return {
		number: issue.number,
		title: issue.title,
		body: excerpt(issue.body),
		lastComment: last
			? { author: last.author?.login ?? null, at: last.createdAt, body: excerpt(last.body) }
			: null
	};
});

const pullRequest = (pr) => ({
	number: pr.number,
	title: pr.title,
	branch: pr.headRefName,
	draft: pr.isDraft,
	checks: pr.commits.nodes[0]?.commit.statusCheckRollup?.state ?? 'none',
	review: pr.reviewDecision,
	mergedAt: pr.mergedAt,
	url: pr.url
});
const openPullRequests = search('is:pr is:open').map(pullRequest);
const mergedPullRequests = search(`is:pr is:merged merged:>=${day}`)
	.filter((pr) => pr.mergedAt >= since)
	.map(pullRequest);

console.log(
	JSON.stringify(
		{
			since,
			sinceSource: args.includes('--since') ? 'argument' : checkpoint ? 'checkpoint' : 'default',
			now,
			commitsOnMain: commits,
			mergedPullRequests,
			openPullRequests,
			closedIssues: board.filter((item) => item.closedAt && item.closedAt >= since),
			board: board.filter((item) => item.state === 'OPEN'),
			waitingOnAuthor,
			commentsSince: updatedIssues,
			worktrees
		},
		null,
		'\t'
	)
);
