#!/usr/bin/env python3
"""fork-lineage: which Claude Code session was forked from which.

Read only over Claude Code's transcripts. Follows the claude-forks contract v1
(CONTRACT.md next to this plugin's README): parent from the transcript's own
forkedFrom.sessionId when present, else from a link file written by a launcher,
else from shared message uuids (the older session holding the most of this
one's message uuids; on equal counts the longer shared prefix, then the
oldest). A count first, because a rewound or compacted parent holds the uuids
in another order; the prefix then splits a fork of a fresh fork from its
grandparent, which holds the same uuids. Titles are read live, never stored.

It also reads and writes the contract's files under the forks dir, atomically
(a .tmp file renamed over the target) and keeping fields it does not know:

  lineage.py show <configDir> <forksDir> <sessionId>
      self, parent, children and the whole family, as one JSON object
  lineage.py handback <forksDir> <childId> <parentId> <configDir> <cwd> <deliveredBy|->
      report text on stdin: writes the report, the parent's inbox entry
      (delivered when deliveredBy is given) and the child's link
  lineage.py not-needed <forksDir> <childId> <parentId> <configDir> <cwd>
  lineage.py waiting <forksDir> <sessionId>
      undelivered inbox entries for this session, without claiming them
  lineage.py claim <forksDir> <sessionId>
      claims each undelivered entry (deliveredAt written first), prints the reports
  lineage.py prune <forksDir> <configDir>
      deletes what belongs to sessions whose transcript is gone (Claude Code
      removes transcripts after cleanupPeriodDays): their links, delivered inbox
      entries and reports; and any inbox entry delivered over 30 days ago. An
      undelivered entry and its report are never deleted.
"""

import datetime
import glob
import json
import os
import sys

CONTRACT_V = 1
DELIVERED_KEEP_DAYS = 30
COPY_WINDOW_S = 5
RANK = {"forkedFrom": 3, "launch": 2, "uuid": 1}


def birth(path):
    st = os.stat(path)
    return getattr(st, "st_birthtime", st.st_mtime)


def first_uuid(path):
    """The first user or assistant message uuid, read from the top of the file."""
    with open(path, "rb") as fh:
        for raw in fh:
            if b'"type":"user"' not in raw and b'"type":"assistant"' not in raw:
                continue
            try:
                d = json.loads(raw)
            except ValueError:
                continue
            if d.get("type") in ("user", "assistant") and d.get("uuid"):
                return d["uuid"]
    return None


def holds(path, uuid):
    """Whether the transcript holds this message uuid anywhere (a fork of a
    compacted session starts mid-way, so its first uuid is not the parent's first)."""
    needle = ('"uuid":"' + uuid + '"').encode()
    with open(path, "rb") as fh:
        return needle in fh.read()


# Bounds on the own-prompt list sent to the report briefing
PROMPT_LIMIT = 150
PROMPT_CHARS = 200


def scan(path):
    """Message uuids in order, prompts the user typed, forkedFrom, title."""
    uuids, stamps, prompts, forked, custom, ai, first_text = [], [], [], None, None, None, None
    with open(path, "rb") as fh:
        for raw in fh:
            try:
                d = json.loads(raw)
            except ValueError:
                continue
            t = d.get("type")
            if t == "custom-title":
                custom = d.get("customTitle") or custom
            elif t == "ai-title":
                ai = d.get("aiTitle") or ai
            elif t in ("user", "assistant") and d.get("uuid"):
                uuids.append(d["uuid"])
                stamps.append(d.get("timestamp") or "")
                if t == "user" and not d.get("isMeta") and not d.get("isSidechain"):
                    text = prompt_text(d.get("message"))
                    if text is not None:
                        prompts.append((d["uuid"], d.get("timestamp"), text))
                        first_text = first_text or text
            f = d.get("forkedFrom")
            if forked is None and isinstance(f, dict) and f.get("sessionId"):
                forked = f["sessionId"]
    title = custom or ai or (first_text or "")[:60] or None
    return {"uuids": uuids, "stamps": stamps, "prompts": prompts, "forkedFrom": forked, "title": title}


def prompt_text(message):
    """The typed text of a user message, or None for a tool result."""
    if not isinstance(message, dict):
        return None
    c = message.get("content")
    if isinstance(c, str):
        return None if c.startswith("<") else c.strip()
    if isinstance(c, list):
        texts = [b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text"]
        if any(isinstance(b, dict) and b.get("type") == "tool_result" for b in c):
            return None
        joined = " ".join(texts).strip()
        return joined if joined and not joined.startswith("<") else None
    return None


def is_older(o, s):
    """Whether o began before s. File birth time, unless the two were born within
    five seconds of each other (a copied config dir gives every file a new birth
    time): then whichever has the earlier message of its own, past what they share."""
    if abs(o["born"] - s["born"]) >= COPY_WINDOW_S:
        return o["born"] < s["born"]
    shared = set(o["uuids"]).intersection(s["uuids"])

    def first_own(x):
        return min((t for u, t in zip(x["uuids"], x["stamps"]) if u not in shared and t), default="~")

    return first_own(o) < first_own(s)


def shared_prefix(a, b):
    n = 0
    for x, y in zip(a, b):
        if x != y:
            break
        n += 1
    return n


def show(config_dir, forks_dir, sid):
    own = glob.glob(os.path.join(config_dir, "projects", "*", sid + ".jsonl"))
    if not own:
        return {"error": "transcript not found"}
    # The family: every session of this config dir that holds this session's first
    # message, in any project folder (a fork can run in another directory)
    files = glob.glob(os.path.join(config_dir, "projects", "*", "*.jsonl"))
    root = first_uuid(own[0])
    family = [f for f in files if root and holds(f, root)] or [own[0]]
    info = {}
    for f in family:
        s = scan(f)
        s["id"] = os.path.basename(f)[:-6]
        s["born"] = birth(f)
        info[s["id"]] = s

    # Each member's parent: forkedFrom, then a launcher's link, then shared uuids
    for s in info.values():
        parent, how = None, None
        if s["forkedFrom"] and s["forkedFrom"] in info:
            parent, how = s["forkedFrom"], "forkedFrom"
        link = read_json(link_path(forks_dir, s["id"]))
        if link and link.get("parentId") in info and RANK.get(link.get("detectedBy"), 0) > RANK.get(how, 0):
            parent, how = link["parentId"], link["detectedBy"]
        if parent is None:
            best, mine = (0, 0), set(s["uuids"])
            for o in sorted(info.values(), key=lambda o: o["born"]):
                if o["id"] == s["id"] or not is_older(o, s):
                    continue
                n = (len(mine.intersection(o["uuids"])), shared_prefix(s["uuids"], o["uuids"]))
                if n[0] and n > best:
                    parent, how, best = o["id"], "uuid", n
        s["parent"], s["detectedBy"] = parent, how

    def row(s):
        held = set(info[s["parent"]]["uuids"]) if s["parent"] else set()
        own_prompts = [p for p in s["prompts"] if p[0] not in held]
        link = read_json(link_path(forks_dir, s["id"])) or {}
        return {
            "id": s["id"],
            "title": s["title"],
            "parentId": s["parent"],
            "detectedBy": s["detectedBy"],
            "born": s["born"],
            "ownPrompts": len(own_prompts),
            "lastOwnPromptAt": own_prompts[-1][1] if own_prompts else None,
            "firstOwnPrompt": own_prompts[0][2][:160] if own_prompts else None,
            "state": link.get("state"),
            "handedBackAt": link.get("handedBackAt"),
            "notNeededAt": link.get("notNeededAt"),
        }

    rows = {k: row(v) for k, v in info.items()}
    me = rows[sid]
    # The fork's own prompts, for the report briefing: once a long fork is compacted, its
    # summary mixes the parent's history with the fork's work and the first own prompt no
    # longer appears word for word, so the model needs the list itself to tell them apart
    s = info[sid]
    held = set(info[s["parent"]]["uuids"]) if s["parent"] else set()
    mine = [p[2] for p in s["prompts"] if p[0] not in held]
    me["ownPromptList"] = [" ".join(t.split())[:PROMPT_CHARS] for t in mine[:PROMPT_LIMIT]]
    me["ownPromptsOmitted"] = max(0, len(mine) - PROMPT_LIMIT)
    return {
        "self": me,
        "parent": rows.get(me["parentId"]),
        "children": [r for r in rows.values() if r["parentId"] == sid],
        "family": sorted(rows.values(), key=lambda r: r["born"]),
    }


# The contract's files

def now_iso():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def stamp():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def link_path(forks_dir, child):
    return os.path.join(forks_dir, "links", child + ".json")


def read_json(path):
    try:
        with open(path) as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def write_atomic(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w") as fh:
        fh.write(text)
    os.replace(tmp, path)


def merge_json(path, fields):
    """Change only our fields, keep the rest. A newer contract version is left alone."""
    old = read_json(path) or {}
    if old.get("v", 1) > CONTRACT_V:
        return False
    old.update(fields)
    old["v"] = old.get("v", CONTRACT_V)
    write_atomic(path, json.dumps(old, indent=2) + "\n")
    return True


def link_fields(forks_dir, child, parent, config_dir, cwd):
    old = read_json(link_path(forks_dir, child)) or {}
    fields = {"childId": child, "parentId": parent, "configDir": config_dir, "cwd": cwd}
    if not old.get("createdAt"):
        fields["createdAt"] = now_iso()
    if not old.get("detectedBy"):
        fields["detectedBy"] = "uuid"
    return fields


def handback(forks_dir, child, parent, config_dir, cwd, delivered_by):
    text = sys.stdin.read()
    ts, at = stamp(), now_iso()
    report = "reports/%s-%s.md" % (child, ts)
    write_atomic(os.path.join(forks_dir, report), text)
    entry = {"childId": child, "parentId": parent, "reportPath": report, "createdAt": at,
             "deliveredAt": at if delivered_by != "-" else None,
             "deliveredBy": delivered_by if delivered_by != "-" else None}
    merge_json(os.path.join(forks_dir, "inbox", parent, "%s-%s.json" % (child, ts)), entry)
    fields = link_fields(forks_dir, child, parent, config_dir, cwd)
    fields.update({"state": "handed_back", "handedBackAt": at, "reportPath": report})
    merge_json(link_path(forks_dir, child), fields)
    return {"reportPath": report, "handedBackAt": at}


def not_needed(forks_dir, child, parent, config_dir, cwd):
    at = now_iso()
    fields = link_fields(forks_dir, child, parent, config_dir, cwd)
    fields.update({"state": "not_needed", "notNeededAt": at})
    merge_json(link_path(forks_dir, child), fields)
    return {"notNeededAt": at}


def inbox(forks_dir, sid):
    folder = os.path.join(forks_dir, "inbox", sid)
    out = []
    for path in sorted(glob.glob(os.path.join(folder, "*.json"))):
        entry = read_json(path)
        if entry and not entry.get("deliveredAt") and entry.get("v", 1) <= CONTRACT_V:
            out.append((path, entry))
    return out


def waiting(forks_dir, sid):
    return {"waiting": [e.get("childId") for _, e in inbox(forks_dir, sid)]}


def claim(forks_dir, sid):
    reports = []
    for path, entry in inbox(forks_dir, sid):
        # Claim first, so a second reader (another tool, another hook) skips it
        fresh = read_json(path) or {}
        if fresh.get("deliveredAt"):
            continue
        merge_json(path, {"deliveredAt": now_iso(), "deliveredBy": "hook"})
        try:
            with open(os.path.join(forks_dir, entry.get("reportPath", ""))) as fh:
                text = fh.read()
        except OSError:
            continue
        reports.append({"childId": entry.get("childId"), "createdAt": entry.get("createdAt"), "text": text})
    return {"reports": reports}


def transcript_exists(config_dirs, sid):
    return any(glob.glob(os.path.join(c, "projects", "*", sid + ".jsonl")) for c in config_dirs)


def prune(forks_dir, config_dir):
    links = {}
    for path in glob.glob(os.path.join(forks_dir, "links", "*.json")):
        links[os.path.basename(path)[:-5]] = (path, read_json(path) or {})
    # Every config dir any record names, so a fork in one account is not judged by another
    dirs = {config_dir} | {l.get("configDir") for _, l in links.values() if l.get("configDir")}

    known = {}

    def gone(sid):
        if sid not in known:
            known[sid] = not transcript_exists(dirs, sid)
        return known[sid]

    removed, keep_reports = [], set()
    cutoff = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=DELIVERED_KEEP_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    for path in glob.glob(os.path.join(forks_dir, "inbox", "*", "*.json")):
        entry = read_json(path)
        if not entry or entry.get("v", 1) > CONTRACT_V:
            continue
        if not entry.get("deliveredAt"):
            keep_reports.add(entry.get("reportPath"))
            continue
        if gone(entry.get("childId", "")) or gone(entry.get("parentId", "")) or entry["deliveredAt"] < cutoff:
            os.remove(path)
            removed.append(path)
    for child, (path, link) in links.items():
        if link.get("v", 1) <= CONTRACT_V and gone(child):
            os.remove(path)
            removed.append(path)
    for path in glob.glob(os.path.join(forks_dir, "reports", "*.md")):
        rel = os.path.relpath(path, forks_dir)
        child = os.path.basename(path)[:36]
        if rel not in keep_reports and gone(child):
            os.remove(path)
            removed.append(path)
    for folder in glob.glob(os.path.join(forks_dir, "inbox", "*")):
        if os.path.isdir(folder) and not os.listdir(folder):
            os.rmdir(folder)
    return {"removed": len(removed)}


def main():
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == "show":
        out = show(*args)
    else:
        out = {
            "handback": handback,
            "not-needed": not_needed,
            "waiting": waiting,
            "claim": claim,
            "prune": prune,
        }[cmd](*args)
    print(json.dumps(out))


if __name__ == "__main__":
    main()
