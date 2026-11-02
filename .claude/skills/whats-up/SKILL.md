---
name: whats-up
description: Use when the author resumes work on Neckspert and asks where things stand — "What's up Claude?", « on en est où ? », « quoi de neuf ? », « qu’est-ce qui m’attend ? » — or wants to know what progressed, what waits on them, or what to start next.
---

# What's up

The author does not read code or follow sessions; this answer is how they pick the project back up. Everything it says comes from what is written on GitHub and in git (`docs/flux-de-travail.md`), never from memory or guesses.

## Gather

```bash
node .claude/skills/whats-up/gather.mjs
```

One JSON: `since` (the last checkpoint, else 7 days; `sinceSource` says which), commits on `main`, merged and open PRs, closed issues, the open board items (`rank` = board order, status, track, labels, open blockers, parent epic, `epic` for an issue with sub-issues), issues labeled `attend-auteur` with their body and last comment, comments since then (`handover: true` marks a « ## Passation »), worktrees (`mergedIntoMain`). `--since <ISO date>` when the author names another moment.

When `mcp__ccd_session_mgmt__list_sessions` is available, also list the sessions that are running or waiting for an answer. Epics are containers: never report or propose one as an item.

## Answer

In French, these sections in this order, each omitted when empty except the first:

1. **Depuis le <date>** — one sentence: the period and where its start comes from (`checkpoint`: « ta dernière demande » ; `default`: « les 7 derniers jours » ; `argument`: « la date demandée »).
2. **Avancé** — what was merged or closed, each as what the player or the author now has, with its issue or PR link (a commit with neither: the outcome alone). Group by track; what has none goes under « Projet ».
3. **À toi de décider** — every `attend-auteur` issue and every open question in a recent comment: the question in one line, the options, the one the agent recommended. When no comment asks it, the question is in the issue body: state it, and say no option has been proposed yet. Link the issue.
4. **À toi de tester** — every « À tester » item: what to play (from its last handover's protocol) and the preview command from that handover.
5. **Bloqué** — items « En cours » or « Prêt » with open blockers, and why.
6. **En cours** — items « En cours », with the session or worktree working on them and the last handover's « Reste »; then the running or waiting sessions no item names.
7. **Je propose de lancer** — per track with nothing « En cours », the « Prêt » item of lowest `rank` with no open blocker and no `attend-auteur`. If the track has none, name its « À trier » item of lowest `rank` with no open blocker and no `attend-auteur` as a candidate, and what it lacks to be ready (Definition of Ready, `docs/flux-de-travail.md`).
8. **Ménage** — worktrees other than `main` whose branch is `mergedIntoMain` (can go) or has no open PR (say its work is not merged: to look at before removing).

Links as `[#n](https://github.com/Vivremotion/Neckspert/issues/n)`. No code details, no commit hashes: the author reads outcomes.

## Then

```bash
node .claude/skills/whats-up/gather.mjs --mark
```

Mark only after answering, and not when the author asked with `--since` for another moment. Starting a proposed item is the author's call: offer it, do not start it.

## Common mistakes

| Mistake                                          | Instead                                                                                                     |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Guessing « since last time » from recent commits | Use `since` from the script and say where it comes from                                                     |
| Listing board items without their column         | Sort them into the sections above; « À trier » items appear only as a candidate in « Je propose de lancer » |
| Recommending from a title or from memory         | Recommend from status, blockers, `attend-auteur` and the roadmap                                            |
| Answering a question in `attend-auteur` yourself | Show it with the recommendation; the author decides                                                         |
