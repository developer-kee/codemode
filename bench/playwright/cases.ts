import type { CallCase, CallDef } from '../lib/types.ts';
import { ORIGIN, resetFixture } from './fixture.ts';

const nav = (path: string): NonNullable<CallCase['before']> => [{ tool: 'browser_navigate', args: { url: `${ORIGIN}${path}` } }];

const cases: CallCase[] = [
  {
    id: 'browser_navigate',
    tool: 'browser_navigate',
    args: { url: `${ORIGIN}/form` },
    prompt: `Open ${ORIGIN}/form in the browser and tell me the page heading in one short sentence.`,
    expect: /sign-?up form/i,
  },
  {
    id: 'browser_snapshot',
    tool: 'browser_snapshot',
    args: {},
    before: nav('/form'),
    prompt: `Open ${ORIGIN}/form, take a snapshot of the page, and list the labels of its form fields in one short sentence.`,
    expect: /name[\s\S]*email[\s\S]*plan/i,
  },
  {
    id: 'browser_find',
    tool: 'browser_find',
    args: { text: 'Email' },
    before: nav('/form'),
  },
  {
    id: 'browser_evaluate',
    tool: 'browser_evaluate',
    args: { function: '() => document.title' },
    before: nav('/form'),
    prompt: `Open ${ORIGIN}/counter and evaluate JavaScript in the page to read document.title, then tell me exactly what it returned.`,
    expect: /counter/i,
  },
  {
    id: 'browser_click',
    tool: 'browser_click',
    args: { target: '#inc' },
    before: nav('/counter'),
  },
  {
    id: 'browser_type',
    tool: 'browser_type',
    args: { target: '#name', text: 'Ada' },
    before: nav('/form'),
  },
  {
    id: 'browser_select_option',
    tool: 'browser_select_option',
    args: { target: '#plan', values: ['Pro'] },
    before: nav('/form'),
  },
  { id: 'browser_hover', tool: 'browser_hover', args: { target: '#inc' }, before: nav('/counter') },
  { id: 'browser_press_key', tool: 'browser_press_key', args: { key: 'Tab' }, before: nav('/form') },
  { id: 'browser_take_screenshot', tool: 'browser_take_screenshot', args: { scale: 'css' }, before: nav('/form') },
  { id: 'browser_console_messages', tool: 'browser_console_messages', args: { level: 'info' }, before: nav('/form') },
  { id: 'browser_network_requests', tool: 'browser_network_requests', args: { static: false }, before: nav('/form') },
  { id: 'browser_tabs', tool: 'browser_tabs', args: { action: 'list' }, before: nav('/form') },
  { id: 'browser_resize', tool: 'browser_resize', args: { width: 1000, height: 700 }, before: nav('/form') },
  { id: 'browser_wait_for', tool: 'browser_wait_for', args: { time: 0.1 }, before: nav('/form') },
  { id: 'browser_navigate_back', tool: 'browser_navigate_back', args: {}, before: [...nav('/form'), ...nav('/counter')] },
];

const covered = new Set(cases.map((c) => c.tool));
const skipReasons: Record<string, string> = {
  browser_close: 'Closes the browser; every later case would have nothing to talk to.',
  browser_handle_dialog: 'Needs a JavaScript dialog to be open.',
  browser_emulate_media: 'Changes browser-wide rendering state that would carry into later cases.',
  browser_file_upload: 'Needs a file chooser to be open and a file on disk.',
  browser_drop: 'Needs a drop target and files or data.',
  browser_fill_form: 'Takes a structured array of fields; covered by the form task instead.',
  browser_network_request: 'Needs an index from a prior network listing.',
  browser_run_code_unsafe: 'Runs arbitrary Playwright code on this PC; deliberately not exercised.',
  browser_drag: 'Needs two live element references.',
};

export const playwrightCalls: CallDef = {
  async reset() {
    resetFixture();
  },
  cases,
  // Everything the server offers that has no case is listed with its reason (unknown tools get a generic note).
  skipped: Object.keys(skipReasons)
    .filter((t) => !covered.has(t))
    .map((tool) => ({ tool, reason: skipReasons[tool] ?? 'Not benchmarked.' })),
};
