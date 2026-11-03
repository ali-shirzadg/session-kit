import type { EngineInterface } from 'claude-code'

/**
 * The plugin data folder Claude Code keeps for this plugin when it is installed
 * from the session-kit marketplace: `${CLAUDE_PLUGIN_DATA}` is this folder. It
 * stays across plugin updates, unlike the plugin's own folder, and is removed
 * when the plugin is uninstalled for the last time.
 *
 * The same rule is spelled in idle-compact/hooks/register.ts and in
 * session-board/tools/board-set.py and session-board/tools/view.py; change
 * all four together.
 */
export const DATA_ID = 'session-board-session-kit'
export const BOARD_FILE = 'board.json'

/** `$CLAUDE_CONFIG_DIR`, else `$HOME/.claude`. */
export async function configDir($: EngineInterface): Promise<string> {
  const dir = await $.env.get('CLAUDE_CONFIG_DIR')
  if (dir !== undefined && dir !== '') return dir.replace(/\/+$/, '')
  const home = (await $.env.get('HOME')) ?? ''

  return `${home}/.claude`
}

/** Where the board lives: `<config dir>/plugins/data/session-board-session-kit/board.json`. */
export async function boardPath($: EngineInterface): Promise<string> {
  return `${await configDir($)}/plugins/data/${DATA_ID}/${BOARD_FILE}`
}

/** Where versions before 0.1.0 kept the board: inside the plugin's own folder. */
export function legacyPath($: EngineInterface): string {
  return `${$.plugin.root}/data/board.json`
}

export function templatePath($: EngineInterface): string {
  return `${$.plugin.root}/data/board.template.json`
}

/**
 * Makes sure the board file exists: left alone when it is there, otherwise
 * copied once from the old in-plugin location, otherwise seeded from the
 * template. Answers which of the three happened.
 */
export async function ensureBoard(
  $: EngineInterface,
  path: string,
): Promise<'kept' | 'migrated' | 'seeded'> {
  if (await $.fs.exists(path)) return 'kept'
  const legacy = legacyPath($)
  if (await $.fs.exists(legacy)) {
    await $.fs.write(path, await $.fs.read(legacy))

    return 'migrated'
  }
  await $.fs.write(path, await $.fs.read(templatePath($)))

  return 'seeded'
}

/** The current local time as `YYYY-MM-DD HH:MM`, in the machine's own time zone. */
export function localStamp(date = new Date()): string {
  return date.toLocaleString('sv-SE').slice(0, 16)
}
