# Infrastructure

Rules for the adapters, kept out of the root `CLAUDE.md` because they only matter here.

- **Diagnostic journal** (spec `docs/superpowers/specs/2026-10-07-journal-diagnostic-design.md`): kept apart from learning data, in its own IndexedDB (`neckspert-play-diagnostics`), never in the backup. Only adapters write to it (`DiagnosticSink`: `WebAudioInput`, `DiagnosticAudioRecorder` at 16 kHz, `NnlsChordVerifier` with expectations, full reports and spectra); the core and the mechanics never see it. A take runs from the input's opening to its closing; joins with attempts are made by time at analysis. `Settings.diagnostics` (`enabled: null` = on in dev builds, off in published ones; budget in MB, oldest closed takes pruned). Export: a STORE zip built take by take (`exportArchive.ts`). `ChordReport` carries no spectrum: attempts stay small.
- **Audio input** is opened raw (no echo cancellation / noise suppression / AGC), except the Firefox-on-macOS built-in mic workaround in `WebAudioNoteDetector`. The metronome click is pitchless filtered noise so the detector ignores it; verdict cues are < 150 ms and play after the answer.
