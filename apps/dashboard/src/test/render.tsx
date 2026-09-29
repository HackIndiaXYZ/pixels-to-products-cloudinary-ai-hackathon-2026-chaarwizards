import { act } from 'react';
import type { ReactElement } from 'react';
import { render, type RenderResult } from '@testing-library/react';

/**
 * Render and flush.
 *
 * React 19's concurrent renderer commits asynchronously even inside
 * Testing Library's `act` wrapper, so a synchronous `render()` followed by an
 * immediate `getBy*` can observe an un-committed tree. Awaiting an async `act`
 * drains the scheduler, so queries after `await renderView(...)` see the final
 * DOM. Use this instead of calling `render` directly in a component test.
 */
export async function renderView(ui: ReactElement): Promise<RenderResult> {
  let result!: RenderResult;
  await act(async () => {
    result = render(ui);
  });
  return result;
}
