#!/usr/bin/env node

import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import { validateMapDocument } from '../../shared/dist/index.js';

const USAGE = `Usage:
  node tools/reforged-maps/map-authoring.mjs validate [--profile compatible|standard-40x24] <file-or-directory> [...]

Directories are scanned recursively for .json files in stable path order.`;

async function main(argv) {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (argv[0] !== 'validate') {
    process.stderr.write(`[MAP_TOOL_COMMAND] $: unknown command "${argv[0]}"\n${USAGE}\n`);
    return 2;
  }

  let profile = 'compatible';
  const targets = [];
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--profile') {
      profile = argv[index + 1];
      index += 1;
      continue;
    }
    targets.push(arg);
  }
  if (profile !== 'compatible' && profile !== 'standard-40x24') {
    process.stderr.write(`[MAP_TOOL_PROFILE] $: unknown profile "${profile}"\n`);
    return 2;
  }
  if (targets.length === 0) {
    process.stderr.write('[MAP_TOOL_TARGET] $: at least one file or directory is required\n');
    return 2;
  }

  const files = [];
  for (const target of targets) files.push(...(await jsonFiles(resolve(target))));
  const uniqueFiles = [...new Set(files)].sort(compareStable);
  if (uniqueFiles.length === 0) {
    process.stderr.write('[MAP_TOOL_TARGET] $: no JSON files found\n');
    return 2;
  }

  let failed = false;
  for (const file of uniqueFiles) {
    let document;
    try {
      document = JSON.parse(await readFile(file, 'utf8'));
    } catch {
      process.stderr.write(`${file}: [MAP_JSON_PARSE] $: invalid JSON document\n`);
      failed = true;
      continue;
    }
    const validation = validateMapDocument(document, profile);
    if (validation.valid) {
      process.stdout.write(`${file}: OK (${profile})\n`);
      continue;
    }
    failed = true;
    for (const error of validation.errors) process.stderr.write(`${file}: ${error}\n`);
  }
  return failed ? 1 : 0;
}

async function jsonFiles(path) {
  let info;
  try {
    info = await stat(path);
  } catch {
    process.stderr.write(`${path}: [MAP_TOOL_TARGET] $: path does not exist\n`);
    return [];
  }
  if (info.isFile()) return path.toLowerCase().endsWith('.json') ? [path] : [];
  if (!info.isDirectory()) return [];

  const entries = await readdir(path, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => compareStable(left.name, right.name))) {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) files.push(...(await jsonFiles(child)));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) files.push(child);
  }
  return files;
}

function compareStable(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

process.exitCode = await main(process.argv.slice(2));
