// A small, deterministic local website for the Playwright benchmark. Binds to 127.0.0.1 only.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

export const PORT = 4817;
export const ORIGIN = `http://127.0.0.1:${PORT}`;

// ---- catalog: 150 products ------------------------------------------------------------------------------------
const CATEGORIES = ['Tools', 'Garden', 'Kitchen', 'Toys', 'Books'] as const;
interface Product {
  id: number;
  name: string;
  category: (typeof CATEGORIES)[number];
  priceCents: number;
  stock: number;
}
export const products: Product[] = Array.from({ length: 150 }, (_, k) => {
  const id = k + 1;
  return {
    id,
    name: `Product ${String(id).padStart(3, '0')}`,
    category: CATEGORIES[id % CATEGORIES.length] as Product['category'],
    priceCents: 500 + ((id * 3737) % 9500),
    stock: id % 7 === 0 ? 0 : 1 + (id % 9),
  };
});
/** Answer to the catalog task: total price of in-stock Tools, in dollars. */
export const toolsInStockTotal = (
  products.filter((p) => p.category === 'Tools' && p.stock > 0).reduce((n, p) => n + p.priceCents, 0) / 100
).toFixed(2);

// ---- paginated list: 6 pages x 20 items, exactly one top rating ----------------------------------------------
interface Item {
  id: string;
  rating: number;
}
export const items: Item[] = Array.from({ length: 120 }, (_, k) => ({
  id: `item-${String(k + 1).padStart(3, '0')}`,
  rating: Math.round((1 + ((k * 7919) % 400) / 100) * 10) / 10, // 1.0 .. 4.9
}));
const TOP = 77; // index of the single highest-rated item
items[TOP] = { id: (items[TOP] as Item).id, rating: 5.0 };
export const topRatedId = (items[TOP] as Item).id;

// ---- form submissions -----------------------------------------------------------------------------------------
export interface Submission {
  name: string;
  email: string;
  plan: string;
  agree: boolean;
}
export const submissions: Submission[] = [];

export function resetFixture(): void {
  submissions.length = 0;
}

const page = (title: string, body: string): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1>${body}</body></html>`;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (d: Buffer) => (b += d.toString('utf8')));
    req.on('end', () => resolve(b));
  });
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', ORIGIN);
  const send = (status: number, body: string, type = 'text/html; charset=utf-8'): void => {
    res.writeHead(status, { 'content-type': type });
    res.end(body);
  };

  if (req.method === 'POST' && url.pathname === '/submit') {
    const p = new URLSearchParams(await readBody(req));
    const s: Submission = {
      name: p.get('name') ?? '',
      email: p.get('email') ?? '',
      plan: p.get('plan') ?? '',
      agree: p.get('agree') === 'yes',
    };
    submissions.push(s);
    return send(200, page('Thanks', `<p id="result">Thanks ${s.name}, your ${s.plan} plan is registered.</p>`));
  }
  if (url.pathname === '/api/submissions') return send(200, JSON.stringify(submissions), 'application/json');
  if (url.pathname === '/') {
    return send(200, page('Test site', '<ul><li><a href="/catalog">Catalog</a></li><li><a href="/form">Sign-up form</a></li><li><a href="/list?page=1">Ratings</a></li><li><a href="/counter">Counter</a></li></ul>'));
  }
  if (url.pathname === '/catalog') {
    const rows = products
      .map((p) => `<tr><td>${p.id}</td><td>${p.name}</td><td>${p.category}</td><td>$${(p.priceCents / 100).toFixed(2)}</td><td>${p.stock}</td></tr>`)
      .join('');
    return send(200, page('Product Catalog', `<table><thead><tr><th>ID</th><th>Name</th><th>Category</th><th>Price</th><th>In stock</th></tr></thead><tbody>${rows}</tbody></table>`));
  }
  if (url.pathname === '/form') {
    return send(
      200,
      page(
        'Sign-up form',
        `<form method="post" action="/submit">
<label for="name">Name</label> <input id="name" name="name" type="text">
<label for="email">Email</label> <input id="email" name="email" type="email">
<label for="plan">Plan</label> <select id="plan" name="plan"><option>Free</option><option>Pro</option><option>Team</option></select>
<label><input id="agree" name="agree" type="checkbox" value="yes"> I agree to the terms</label>
<button id="submit" type="submit">Submit</button></form>`,
      ),
    );
  }
  if (url.pathname === '/list') {
    const n = Math.min(6, Math.max(1, Number(url.searchParams.get('page') ?? '1')));
    const slice = items.slice((n - 1) * 20, n * 20);
    const rows = slice.map((i) => `<li>${i.id} rated ${i.rating.toFixed(1)}</li>`).join('');
    const next = n < 6 ? `<a href="/list?page=${n + 1}">Next page</a>` : '<p>Last page</p>';
    return send(200, page(`Ratings page ${n} of 6`, `<ul>${rows}</ul>${next}`));
  }
  if (url.pathname === '/counter') {
    return send(
      200,
      page('Counter', '<p id="count">Clicked: 0</p><button id="inc" onclick="var e=document.getElementById(\'count\');e.textContent=\'Clicked: \'+(Number(e.textContent.split(\': \')[1])+1)">Increment</button>'),
    );
  }
  send(404, page('Not found', '<p>No such page.</p>'));
}

/** Start the fixture server. Resolves with a function that stops it. */
export function startFixture(): Promise<() => Promise<void>> {
  const server: Server = createServer((req, res) => {
    handle(req, res).catch(() => {
      res.writeHead(500);
      res.end('error');
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => {
      resolve(() => new Promise<void>((done) => server.close(() => done())));
    });
  });
}
