import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { renderCard } from "./card.ts";
import { mergeUsage, parseLedger, serializeLedger, summarizeByWeek } from "./ledger.ts";
import type { Ledger } from "./ledger.ts";
import { summarizeModels } from "./model-share.ts";
import { collectUsage } from "./transcripts.ts";

export type Environment = { homeDirectory: string; hostname: string; repositoryRoot: string; now: Date };

const windowWeeks = 4;

const sourceOf = (machine: string): string => createHash("sha256").update(machine).digest("hex").slice(0, 8);

const transcriptPaths = (configDirectory: string): string[] => {
  const projects = join(configDirectory, "projects");
  if (!existsSync(projects)) {
    throw new Error(`No Claude Code transcripts found: ${projects} does not exist.`);
  }

  const paths = readdirSync(projects, { recursive: true, encoding: "utf8" })
    .filter((entry) => entry.endsWith(".jsonl"))
    .map((entry) => join(projects, entry));
  if (paths.length === 0) {
    throw new Error(`No Claude Code transcripts found under ${projects}.`);
  }

  return paths;
};

function* linesOf(paths: readonly string[]): Generator<string> {
  for (const path of paths) {
    yield* readFileSync(path, "utf8").split("\n");
  }
}

const readLedger = (path: string): Ledger => (existsSync(path) ? parseLedger(readFileSync(path, "utf8")) : { version: 1, sources: {} });

const writeFile = (path: string, content: string): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
};

export const run = (argv: readonly string[], environment: Environment): string => {
  const { values } = parseArgs({
    args: [...argv],
    options: { "config-dir": { type: "string", multiple: true }, source: { type: "string" } },
    strict: true,
  });
  const configDirectories = values["config-dir"] ?? [join(environment.homeDirectory, ".claude")];
  const source = values.source ?? sourceOf(environment.hostname);
  const ledgerPath = join(environment.repositoryRoot, "data", "claude-usage.json");
  const cardPath = join(environment.repositoryRoot, "assets", "claude-models.svg");

  const transcripts = configDirectories.flatMap(transcriptPaths);
  const usage = summarizeByWeek(collectUsage(linesOf(transcripts)));
  const ledger = mergeUsage(readLedger(ledgerPath), source, usage);
  const summary = summarizeModels(ledger, { now: environment.now, weeks: windowWeeks });

  writeFile(ledgerPath, serializeLedger(ledger));
  writeFile(cardPath, renderCard(summary));

  return `Read ${transcripts.length} transcripts as source ${source}. Wrote ${ledgerPath} and ${cardPath}.`;
};

if (import.meta.main) {
  console.log(
    run(process.argv.slice(2), {
      homeDirectory: homedir(),
      hostname: hostname(),
      repositoryRoot: resolve(import.meta.dirname, "..", ".."),
      now: new Date(),
    }),
  );
}
