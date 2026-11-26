import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";
import type { Ledger } from "./ledger.ts";
import { run } from "./main.ts";
import type { Environment } from "./main.ts";
import { transcriptLine } from "./transcript-fixture.ts";

type Sandbox = { environment: Environment; home: string; repository: string };

const sandbox = (context: TestContext, hostname = "workstation"): Sandbox => {
  const root = mkdtempSync(join(tmpdir(), "claude-usage-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));

  const home = join(root, "home");
  const repository = join(root, "repository");
  mkdirSync(home, { recursive: true });
  mkdirSync(repository, { recursive: true });

  return { home, repository, environment: { homeDirectory: home, hostname, repositoryRoot: repository, now: new Date("2026-11-24T12:00:00.000Z") } };
};

const writeTranscript = (configDirectory: string, relativePath: string, lines: string[]): string => {
  const path = join(configDirectory, "projects", relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${lines.join("\n")}\n`);
  return path;
};

const response = (messageId: string, model: string, outputTokens: number): string =>
  transcriptLine({ messageId, requestId: `req_${messageId}`, model, usage: { input_tokens: 1, output_tokens: outputTokens } });

const readLedger = (repository: string): Ledger => JSON.parse(readFileSync(join(repository, "data", "claude-usage.json"), "utf8"));

const readCard = (repository: string): string => readFileSync(join(repository, "assets", "claude-models.svg"), "utf8");

const onlySource = (ledger: Ledger): string => {
  const sources = Object.keys(ledger.sources);
  assert.equal(sources.length, 1);
  return sources[0];
};

// Equivalence Class: transcripts of a session and of its subagents in the default config directory — both counted in the ledger and drawn on the card
test("counts session and subagent transcripts from the default config directory", (context) => {
  const { environment, home, repository } = sandbox(context);
  writeTranscript(join(home, ".claude"), "-home-me/session.jsonl", [
    response("msg_1", "claude-opus-5-5", 100),
    response("msg_2", "claude-opus-5-5", 200),
  ]);
  writeTranscript(join(home, ".claude"), "-home-me/session/subagents/agent.jsonl", [response("msg_3", "claude-haiku-5-5", 50)]);

  run([], environment);

  const ledger = readLedger(repository);
  const week = ledger.sources[onlySource(ledger)]["2026-11-23"];
  assert.equal(week["claude-opus-5-5"].outputTokens, 300);
  assert.equal(week["claude-opus-5-5"].requests, 2);
  assert.equal(week["claude-haiku-5-5"].outputTokens, 50);
  assert.match(readCard(repository), /Opus 5\.5 85\.71%/);
  assert.match(readCard(repository), /Haiku 5\.5 14\.29%/);
});

// Equivalence Class: transcript deleted between two runs — ledger and card keep the earlier totals
test("keeps earlier totals after a transcript has been cleaned up", (context) => {
  const { environment, home, repository } = sandbox(context);
  const transcript = writeTranscript(join(home, ".claude"), "-home-me/old.jsonl", [response("msg_1", "claude-opus-5-5", 700)]);
  writeTranscript(join(home, ".claude"), "-home-me/new.jsonl", [response("msg_2", "claude-fable-5-2", 300)]);
  run([], environment);

  rmSync(transcript);
  run([], environment);

  const ledger = readLedger(repository);
  assert.equal(ledger.sources[onlySource(ledger)]["2026-11-23"]["claude-opus-5-5"].outputTokens, 700);
  assert.match(readCard(repository), /Opus 5\.5 70\.00%/);
});

// Equivalence Class: one response recorded in two transcript files — counted once
test("counts a response once when a resumed session repeats it in another file", (context) => {
  const { environment, home, repository } = sandbox(context);
  writeTranscript(join(home, ".claude"), "-home-me/first.jsonl", [response("msg_1", "claude-opus-5-5", 100)]);
  writeTranscript(join(home, ".claude"), "-home-me/resumed.jsonl", [response("msg_1", "claude-opus-5-5", 100)]);

  run([], environment);

  const ledger = readLedger(repository);
  assert.equal(ledger.sources[onlySource(ledger)]["2026-11-23"]["claude-opus-5-5"].outputTokens, 100);
});

// Equivalence Class: explicit config directories — only those are read, not the default one
test("reads only the config directories it is given", (context) => {
  const { environment, home, repository } = sandbox(context);
  writeTranscript(join(home, ".claude"), "-home-me/default.jsonl", [response("msg_1", "claude-opus-5-5", 1000)]);
  writeTranscript(join(home, "first"), "-home-me/a.jsonl", [response("msg_2", "claude-opus-5-5", 10)]);
  writeTranscript(join(home, "second"), "-home-me/b.jsonl", [response("msg_3", "claude-opus-5-5", 5)]);

  run(["--config-dir", join(home, "first"), "--config-dir", join(home, "second")], environment);

  const ledger = readLedger(repository);
  assert.equal(ledger.sources[onlySource(ledger)]["2026-11-23"]["claude-opus-5-5"].outputTokens, 15);
});

// Equivalence Class: CLAUDE_CONFIG_DIR pointing at another profile — not read
test("does not pick up another profile from CLAUDE_CONFIG_DIR", (context) => {
  const { environment, home, repository } = sandbox(context);
  writeTranscript(join(home, ".claude"), "-home-me/personal.jsonl", [response("msg_1", "claude-opus-5-5", 10)]);
  writeTranscript(join(home, "work-profile"), "-home-me/work.jsonl", [response("msg_2", "claude-opus-5-5", 9000)]);
  const previous = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = join(home, "work-profile");
  context.after(() => {
    if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = previous;
  });

  run([], environment);

  const ledger = readLedger(repository);
  assert.equal(ledger.sources[onlySource(ledger)]["2026-11-23"]["claude-opus-5-5"].outputTokens, 10);
});

// Equivalence Class: explicit source name — usage stored under that name
test("stores usage under the source name it is given", (context) => {
  const { environment, home, repository } = sandbox(context);
  writeTranscript(join(home, ".claude"), "-home-me/session.jsonl", [response("msg_1", "claude-opus-5-5", 10)]);

  run(["--source", "desk"], environment);

  assert.deepEqual(Object.keys(readLedger(repository).sources), ["desk"]);
});

// Equivalence Class: no source name on two machines — each machine gets its own source, and neither name reveals the hostname
test("derives a separate source per machine without exposing the hostname", (context) => {
  const first = sandbox(context, "alpha-laptop");
  const second = sandbox(context, "beta-desktop");
  for (const { home } of [first, second]) {
    writeTranscript(join(home, ".claude"), "-home-me/session.jsonl", [response("msg_1", "claude-opus-5-5", 10)]);
  }

  run([], first.environment);
  run([], second.environment);

  const firstSource = onlySource(readLedger(first.repository));
  const secondSource = onlySource(readLedger(second.repository));
  assert.notEqual(firstSource, secondSource);
  assert.ok(!firstSource.includes("alpha"));
  assert.ok(!secondSource.includes("beta"));
});

// Equivalence Class: second machine writing to a ledger that already holds another machine — both machines add up on the card
test("adds a second machine to the ledger of the first", (context) => {
  const { environment, home, repository } = sandbox(context, "alpha-laptop");
  writeTranscript(join(home, ".claude"), "-home-me/session.jsonl", [response("msg_1", "claude-opus-5-5", 300)]);
  run([], environment);
  rmSync(join(home, ".claude"), { recursive: true });
  writeTranscript(join(home, ".claude"), "-home-me/session.jsonl", [response("msg_2", "claude-fable-5-2", 100)]);

  run([], { ...environment, hostname: "beta-desktop" });

  assert.equal(Object.keys(readLedger(repository).sources).length, 2);
  assert.match(readCard(repository), /Opus 5\.5 75\.00%/);
  assert.match(readCard(repository), /Fable 5\.2 25\.00%/);
});

// Equivalence Class: config directory without a projects folder — rejected and nothing written
test("refuses a config directory that holds no transcripts", (context) => {
  const { environment, home, repository } = sandbox(context);

  assert.throws(() => run(["--config-dir", join(home, "missing")], environment), /missing/);
  assert.equal(existsSync(join(repository, "data", "claude-usage.json")), false);
});

// Equivalence Class: projects folder without any transcript file — rejected and nothing written
test("refuses a projects folder without transcript files", (context) => {
  const { environment, home, repository } = sandbox(context);
  mkdirSync(join(home, ".claude", "projects", "-home-me"), { recursive: true });

  assert.throws(() => run([], environment), /transcripts/i);
  assert.equal(existsSync(join(repository, "data", "claude-usage.json")), false);
});

// Equivalence Class: existing ledger that cannot be read — rejected and left as it was
test("leaves an unreadable ledger untouched", (context) => {
  const { environment, home, repository } = sandbox(context);
  writeTranscript(join(home, ".claude"), "-home-me/session.jsonl", [response("msg_1", "claude-opus-5-5", 10)]);
  mkdirSync(join(repository, "data"), { recursive: true });
  writeFileSync(join(repository, "data", "claude-usage.json"), "{ broken");

  assert.throws(() => run([], environment), /ledger/i);
  assert.equal(readFileSync(join(repository, "data", "claude-usage.json"), "utf8"), "{ broken");
});

// Equivalence Class: option the script does not know — rejected
test("rejects an unknown option", (context) => {
  const { environment } = sandbox(context);

  assert.throws(() => run(["--confg-dir", "typo"], environment));
});
