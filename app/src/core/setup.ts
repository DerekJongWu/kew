// Vault setup: plans and creates the folders, templates and schema a Kew vault needs.
//
// setupVault (and generateSample, which builds on it) write into the vault directly,
// not through the write path. This is the one sanctioned exception to "only the write
// path writes": it runs before a Vault (and its history) exists, and it only ever
// creates files that don't exist yet (exclusive create), so it can't change a user's file.
import { promises as fsp } from 'node:fs'
import { dirname, join } from 'node:path'
import companyTemplate from './templates/Company.md?raw'
import personTemplate from './templates/Person.md?raw'
import meetingTemplate from './templates/Meeting.md?raw'
import themeTemplate from './templates/Theme.md?raw'
import researchTemplate from './templates/Research.md?raw'
import { DEFAULT_SCHEMA } from './schema/defaults'
import { loadSchema, serializeSchema } from './schema/load'
import { RECORD_TYPES } from './index/indexer'
import type { Schema } from './schema/types'
import type { RecordType, SetupPlan } from '../shared/api'

export const SCHEMA_PATH = '.kew/schema.yaml'

export const BUILTIN_TEMPLATES: Record<RecordType, string> = {
  company: companyTemplate,
  person: personTemplate,
  meeting: meetingTemplate,
  theme: themeTemplate,
  research: researchTemplate
}

async function exists(p: string): Promise<boolean> {
  try {
    await fsp.stat(p)
    return true
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw e
  }
}

/** The vault's own schema when it has a valid one (its folders win), else the default. */
async function schemaFor(root: string): Promise<Schema> {
  try {
    const loaded = loadSchema(await fsp.readFile(join(root, SCHEMA_PATH), 'utf8'), null)
    return loaded.error ? DEFAULT_SCHEMA : loaded.schema
  } catch {
    return DEFAULT_SCHEMA
  }
}

/** Every .md file in the folder, skipping dot-files and dot-directories. */
async function countNotes(dir: string): Promise<number> {
  let n = 0
  for (const d of await fsp.readdir(dir, { withFileTypes: true })) {
    if (d.name.startsWith('.')) continue
    if (d.isDirectory()) n += await countNotes(join(dir, d.name))
    else if (d.isFile() && /\.md$/i.test(d.name)) n++
  }
  return n
}

/** Folders end in "/". Order: folders, templates, schema. */
async function missing(root: string): Promise<string[]> {
  const schema = await schemaFor(root)
  const wanted = [
    ...RECORD_TYPES.map((t) => schema.types[t].folder + '/'),
    ...RECORD_TYPES.map((t) => schema.types[t].template),
    SCHEMA_PATH
  ]
  const out: string[] = []
  for (const rel of wanted) if (!(await exists(join(root, rel)))) out.push(rel)
  return out
}

export async function planSetup(root: string): Promise<SetupPlan> {
  return { root, willCreate: await missing(root), existingNotes: await countNotes(root) }
}

/** Creates a file only if it doesn't exist. Returns false when it already did. */
export async function createOnly(root: string, rel: string, text: string): Promise<boolean> {
  const file = join(root, rel)
  await fsp.mkdir(dirname(file), { recursive: true })
  try {
    await fsp.writeFile(file, text, { flag: 'wx' })
    return true
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return false
    throw e
  }
}

export async function setupVault(root: string): Promise<void> {
  const schema = await schemaFor(root)
  for (const rel of await missing(root)) {
    if (rel.endsWith('/')) await fsp.mkdir(join(root, rel), { recursive: true })
    else if (rel === SCHEMA_PATH) await createOnly(root, rel, serializeSchema(DEFAULT_SCHEMA))
    else {
      const type = RECORD_TYPES.find((t) => schema.types[t].template === rel)!
      await createOnly(root, rel, BUILTIN_TEMPLATES[type])
    }
  }
}
