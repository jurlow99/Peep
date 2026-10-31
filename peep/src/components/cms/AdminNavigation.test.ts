// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import AdminNavigation from './AdminNavigation';
import { ADMIN_NAV, activeAdminLocation } from './adminSections';
it('routes internal shortcuts into the correct group without duplicate destinations', () => {
  const targets = ADMIN_NAV.flatMap(g => g.sections.map(p => JSON.stringify(p.target)));
  expect(new Set(targets).size).toBe(targets.length);
  expect(activeAdminLocation({tab:'creators',creatorsTab:'payouts'}).group.key).toBe('monetization');
  expect(activeAdminLocation({tab:'content',videoSubTab:'episodes'}).group.key).toBe('content');
  expect(activeAdminLocation({tab:'content',videoSubTab:'carousels'}).group.key).toBe('curation');
  expect(activeAdminLocation({tab:'content',videoSubTab:'multiview'}).group.key).toBe('live');
});
it('opens every group and tool with the correct active navigation', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  let state: Record<string,string> = {tab:'content',videoSubTab:'shorts'};
  const render = () => root.render(createElement(AdminNavigation, {state,pendingReports:3,onNavigate:(target:Record<string,string>) => {state={...state,...target};render();}}));
  try {
    await act(async () => render());
    for (const group of ADMIN_NAV) {
      const top = [...host.querySelectorAll<HTMLButtonElement>('nav[aria-label="Admin sections"] button')].find(b => b.textContent?.startsWith(group.label))!;
      await act(async () => top.click());
      const tools = [...host.querySelectorAll<HTMLButtonElement>(`nav[aria-label="${group.label} tools"] button`)];
      expect(tools).toHaveLength(group.sections.length);
      for (let index=0;index<tools.length;index++) {
        await act(async () => tools[index].click());
        expect(activeAdminLocation(state).page.key).toBe(group.sections[index].key);
        expect(host.querySelector('[aria-current="page"]')?.textContent).toContain(group.sections[index].label);
      }
    }
  } finally { await act(async () => root.unmount());host.remove(); }
});
