import type { Task } from '../../lib/types/index.ts';
import { ORIGIN, resetFixture, submissions, toolsInStockTotal, topRatedId } from './fixture.ts';
import { fail, ok } from '../../lib/testkit.ts';


export const tasks: Task[] = [
  {
    id: 'catalog-sum',
    seeded: false,
    prompt:
      `Open ${ORIGIN}/catalog in the browser. It lists 150 products with category, price and stock. ` +
      "What is the total price, in dollars, of all in-stock products in the category 'Tools'? " +
      'Reply with one short sentence that contains the amount.',
    async prepare() {
      resetFixture();
    },
    async verify(answer) {
      const nums = [...answer.replace(/,/g, '').matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]);
      return nums.some((n) => Number(n) === Number(toolsInStockTotal))
        ? ok
        : fail(`answer lacks ${toolsInStockTotal}: ${answer.slice(0, 100)}`);
    },
  },
  {
    id: 'form',
    seeded: false,
    prompt:
      `Open ${ORIGIN}/form. Fill in the name Ada Lovelace, the email ada@example.com, choose the plan Pro, tick the agreement checkbox, ` +
      'and submit the form. Reply with one short sentence.',
    async prepare() {
      resetFixture();
    },
    async verify() {
      const s = submissions[submissions.length - 1];
      if (!s) return fail('no submission recorded');
      if (submissions.length !== 1) return fail(`${submissions.length} submissions, expected 1`);
      if (s.name !== 'Ada Lovelace') return fail(`name ${JSON.stringify(s.name)}`);
      if (s.email !== 'ada@example.com') return fail(`email ${JSON.stringify(s.email)}`);
      if (s.plan !== 'Pro') return fail(`plan ${JSON.stringify(s.plan)}`);
      return s.agree ? ok : fail('agreement not ticked');
    },
  },
  {
    id: 'top-rated',
    seeded: false,
    prompt:
      `The site at ${ORIGIN}/list?page=1 shows rated items across 6 pages, with a "Next page" link on each. ` +
      'Go through all the pages, find the item with the highest rating, and reply with one short sentence that gives its id.',
    async prepare() {
      resetFixture();
    },
    async verify(answer) {
      return answer.includes(topRatedId) ? ok : fail(`answer lacks ${topRatedId}: ${answer.slice(0, 100)}`);
    },
  },
];
