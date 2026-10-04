# <Project Name>: Folder Context

<One paragraph: what this folder tracks, and for whom. Fixed context lives in this file, current
state in `STATUS.md`.>

**To see where things stand, read `STATUS.md` first.**

## Why this folder is separate

<Only if it is not obvious. The test is lifespan: a folder should live exactly as long as the
obligation or the work it holds. If this project outlives, or dies before, a neighbouring one, say
so here with the dates that prove it. Delete this section if the project is self-evidently its own
thing.>

## Folder layout

The tracked tree holds **notes, records, summaries and code**. <If the project has an assets folder:>
The documents themselves live under `assets/`, that is, in <storage label>, and never enter git.

| Folder | Contents |
|---|---|
| `<folder>/` | <what belongs here> |

Subfolders under `assets/` mirror these names exactly, see `setup-assets.sh`.

### The assets/ symlink

<Delete this section if the project has no assets folder.>

`assets` is a symlink to `<project>/assets` in <storage label>. It is machine-specific, so it is in
`.gitignore`. After cloning on a new machine:

```bash
./setup-assets.sh
```

<Name the sensitive material here: bank details, tax references, correspondence, contracts,
credentials.> lives **only** there. Do not write it into tracked files; reference the file under
`assets/` instead.

## Who and what

| Item | Value |
|---|---|
| <party, reference, number, date> | <value, or **unknown** with a note on where the real value comes from> |

## <Recurring obligations or working cycle>

<Rates, deadlines and thresholds change. Do not treat a table here as authoritative: name the
source and say it must be confirmed there each cycle.>

| Item | Period | Due |
|---|---|---|

## Working rules

- **Do not invent a figure, rate, reference or deadline.** Write "unknown" and say where the real
  value comes from.
- Update `STATUS.md` after any material change, with the date.
- Absolute dates only, never "last month".
- Document filenames: `YYYY-MM-DD-short-description.pdf`.
- <Project-specific rules: what this folder decides, and what it defers to someone else.>
