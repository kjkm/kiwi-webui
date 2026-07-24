import { createServer, type Server } from 'node:http';
import { createSign, generateKeyPairSync } from 'node:crypto';
import Database from 'better-sqlite3';
import { expect, test } from '@playwright/test';

const IDP_PORT = 43210;
const LLM_PORT = 43211;
const issuer = `http://127.0.0.1:${IDP_PORT}`;
const clientId = 'kiwi-e2e';
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const codes = new Map<string, string>();
let counter = 0;
let completionModel = '';
let idp: Server;
let llm: Server;

function json(response: import('node:http').ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(value));
}

function readBody(request: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function jwt(nonce: string): string {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const head = encode({ alg: 'RS256', typ: 'JWT', kid: 'e2e-key' });
  const body = encode({
    iss: issuer,
    aud: clientId,
    sub: 'e2e-subject',
    preferred_username: 'e2e-user',
    email: 'e2e@example.com',
    nonce,
    iat: now,
    exp: now + 300
  });
  const signature = createSign('RSA-SHA256')
    .update(`${head}.${body}`)
    .end()
    .sign(privateKey)
    .toString('base64url');
  return `${head}.${body}.${signature}`;
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

test.beforeAll(async () => {
  const db = new Database('./data/e2e.db');
  db.pragma('foreign_keys = ON');
  db.prepare('DELETE FROM sessions').run();
  db.prepare('DELETE FROM users').run();
  db.close();

  idp = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', issuer);
      if (request.method === 'GET' && url.pathname === '/.well-known/openid-configuration') {
        return json(response, 200, {
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/jwks`,
          response_types_supported: ['code'],
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256']
        });
      }
      if (request.method === 'GET' && url.pathname === '/jwks') {
        return json(response, 200, {
          keys: [
            {
              ...(publicKey.export({ format: 'jwk' }) as object),
              kid: 'e2e-key',
              alg: 'RS256',
              use: 'sig'
            }
          ]
        });
      }
      if (request.method === 'GET' && url.pathname === '/authorize') {
        const code = `e2e-code-${++counter}`;
        codes.set(code, url.searchParams.get('nonce') ?? '');
        const callback = new URL(url.searchParams.get('redirect_uri')!);
        callback.searchParams.set('code', code);
        callback.searchParams.set('state', url.searchParams.get('state')!);
        response.writeHead(302, { location: callback.href });
        return response.end();
      }
      if (request.method === 'POST' && url.pathname === '/token') {
        const params = new URLSearchParams(await readBody(request));
        const nonce = codes.get(params.get('code') ?? '');
        if (nonce === undefined) return json(response, 400, { error: 'invalid_grant' });
        codes.delete(params.get('code')!);
        return json(response, 200, {
          access_token: 'e2e-token',
          token_type: 'Bearer',
          expires_in: 300,
          id_token: jwt(nonce)
        });
      }
      return json(response, 404, { error: 'not_found' });
    })();
  });

  llm = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', `http://127.0.0.1:${LLM_PORT}`);
      if (request.method === 'GET' && url.pathname === '/v1/models') {
        return json(response, 200, {
          data: [
            { id: 'e2e-model', name: 'E2E Model', owned_by: 'test' },
            { id: 'alternate-model', name: 'Alternate Model', owned_by: 'test' }
          ]
        });
      }
      const payload = JSON.parse(await readBody(request)) as { model?: string };
      completionModel = payload.model ?? '';
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.write('data: {"choices":[{"delta":{"content":"Hello **world**. "}}]}\n\n');
      response.write(
        'data: {"choices":[{"delta":{"content":"<script>window.pwned=true</script>"}}]}\n\n'
      );
      response.end('data: [DONE]\n\n');
    })();
  });

  await Promise.all([listen(idp, IDP_PORT), listen(llm, LLM_PORT)]);
});

test.afterAll(async () => {
  await Promise.all([close(idp), close(llm)]);
});

test('OIDC login, persistent streamed chat, CSRF protection, and logout', async ({ page }) => {
  await page.goto('/signin');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /\/kiwi-wireframe\.svg$/);
  await expect(page.locator('.signin-card')).toBeVisible();
  const signinCard = await page.locator('.signin-card').boundingBox();
  const signinLogo = await page.locator('.signin-card .brand-mark').boundingBox();
  expect(signinLogo).toMatchObject({ width: 48, height: 48 });
  expect(signinLogo!.x + signinLogo!.width / 2).toBe(signinCard!.x + signinCard!.width / 2);
  await expect(page.locator('.signin-card .muted')).toHaveCount(0);
  await expect
    .poll(() =>
      page
        .getByRole('heading', { name: 'Welcome back' })
        .evaluate((element) => getComputedStyle(element).textAlign)
    )
    .toBe('center');
  await expect
    .poll(() =>
      page
        .getByRole('link', { name: 'Continue with SSO' })
        .evaluate((element) => getComputedStyle(element).display)
    )
    .toBe('inline-flex');
  await page.getByRole('link', { name: 'Continue with SSO' }).click();
  await expect(page).toHaveURL('/');

  const emptyConversationPosition = await page.getByText('No conversations yet').boundingBox();
  const expandedLogo = await page.locator('.brand-logo').boundingBox();
  const expandedNewChat = await page.locator('.new-chat > svg').boundingBox();
  await page.getByRole('button', { name: 'Close Sidebar' }).click();
  await page.waitForTimeout(50);
  const collapsingWidth = await page
    .locator('.sidebar-stage')
    .evaluate((element) => element.getBoundingClientRect().width);
  expect(collapsingWidth).toBeGreaterThan(0);
  expect(collapsingWidth).toBeLessThan(260);
  await expect(page.getByRole('button', { name: 'Open Sidebar' })).toBeVisible();
  await page.waitForTimeout(250);
  const collapsedLogo = await page.locator('.rail-brand img').boundingBox();
  const collapsedNewChat = await page
    .locator('.sidebar-rail > .sidebar-control:nth-child(2) > svg')
    .boundingBox();
  expect(expandedLogo).not.toBeNull();
  expect(expandedNewChat).not.toBeNull();
  expect(collapsedLogo).not.toBeNull();
  expect(collapsedNewChat).not.toBeNull();
  expect(
    collapsedLogo!.x + collapsedLogo!.width / 2 - (expandedLogo!.x + expandedLogo!.width / 2)
  ).toBeCloseTo(0, 1);
  expect(
    collapsedLogo!.y + collapsedLogo!.height / 2 - (expandedLogo!.y + expandedLogo!.height / 2)
  ).toBeCloseTo(0, 1);
  expect(
    collapsedNewChat!.x +
      collapsedNewChat!.width / 2 -
      (expandedNewChat!.x + expandedNewChat!.width / 2)
  ).toBeCloseTo(0, 1);
  expect(
    collapsedNewChat!.y +
      collapsedNewChat!.height / 2 -
      (expandedNewChat!.y + expandedNewChat!.height / 2)
  ).toBeCloseTo(0, 1);
  await page.getByRole('button', { name: 'Open Sidebar' }).click();
  await page.waitForTimeout(50);
  const expandingWidth = await page
    .locator('.sidebar-stage')
    .evaluate((element) => element.getBoundingClientRect().width);
  expect(expandingWidth).toBeGreaterThan(52);
  expect(expandingWidth).toBeLessThan(260);
  const expandingLogo = await page.locator('.rail-brand img').boundingBox();
  const expandingNewChat = await page
    .locator('.sidebar-rail .sidebar-control')
    .nth(1)
    .boundingBox();
  expect(
    expandingLogo!.x + expandingLogo!.width / 2 - (collapsedLogo!.x + collapsedLogo!.width / 2)
  ).toBeCloseTo(0, 1);
  expect(
    expandingLogo!.y + expandingLogo!.height / 2 - (collapsedLogo!.y + collapsedLogo!.height / 2)
  ).toBeCloseTo(0, 1);
  expect(
    expandingNewChat!.x +
      expandingNewChat!.width / 2 -
      (collapsedNewChat!.x + collapsedNewChat!.width / 2)
  ).toBeCloseTo(0, 1);
  expect(
    expandingNewChat!.y +
      expandingNewChat!.height / 2 -
      (collapsedNewChat!.y + collapsedNewChat!.height / 2)
  ).toBeCloseTo(0, 1);
  await page.waitForTimeout(170);

  const centeredComposer = page.locator('.new-chat-composer');
  await expect(centeredComposer).toBeVisible();
  const composerBox = await centeredComposer.boundingBox();
  expect(composerBox?.y).toBeLessThan(550);
  const sendButtonBox = await page.getByRole('button', { name: 'Send message' }).boundingBox();
  expect(sendButtonBox).toMatchObject({ width: 32, height: 32 });

  const entryBar = page.locator('.new-chat-composer .composer');
  const initialEntryBar = await entryBar.boundingBox();
  const growingComposer = page.getByRole('textbox', { name: 'Message' });
  await growingComposer.fill(Array.from({ length: 20 }, (_, index) => `Line ${index}`).join('\n'));
  const expandedEntryBar = await entryBar.boundingBox();
  expect(expandedEntryBar!.height).toBeGreaterThan(initialEntryBar!.height);
  expect(expandedEntryBar!.height).toBeLessThanOrEqual(initialEntryBar!.height * 2.5);
  await expect
    .poll(() => growingComposer.evaluate((element) => getComputedStyle(element).overflowY))
    .toBe('auto');
  await growingComposer.fill('');
  await expect
    .poll(() => entryBar.evaluate((element) => element.getBoundingClientRect().height))
    .toBe(initialEntryBar!.height);
  await growingComposer.fill('Desktop line');
  await growingComposer.press('Shift+Enter');
  await expect(growingComposer).toHaveValue('Desktop line\n');
  await growingComposer.fill('');

  const temporaryToggle = page.getByRole('button', { name: 'Temporary Chat' });
  await page.setViewportSize({ width: 700, height: 800 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await growingComposer.fill('Mobile line');
  await growingComposer.press('Enter');
  await expect(growingComposer).toHaveValue('Mobile line\n');
  expect(new URL(page.url()).pathname).toBe('/');
  await growingComposer.fill('');
  await expect(temporaryToggle).toBeVisible();
  await temporaryToggle.focus();
  await expect(temporaryToggle).toBeFocused();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ colorScheme: 'light' });
  await temporaryToggle.click();
  await expect(temporaryToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Incognito' })).toBeVisible();
  await expect(page.getByText('Temporary Chat', { exact: true })).toHaveCount(0);
  await expect(page.locator('.temporary-brand-mark')).toBeVisible();
  await expect(page.locator('.new-chat-heading img')).toHaveCount(0);
  await expect
    .poll(() =>
      page
        .locator('.new-chat-composer .composer')
        .evaluate((element) => getComputedStyle(element).borderTopStyle)
    )
    .toBe('dashed');

  const temporaryComposer = page.getByRole('textbox', { name: 'Message' });
  await temporaryComposer.fill('Do not retain');
  await temporaryComposer.press('Enter');
  await expect(page.getByText('Hello world.')).toBeVisible();
  await expect(temporaryComposer).toBeFocused();
  expect(new URL(page.url()).pathname).toBe('/');
  await expect(page.getByRole('button', { name: 'Save temporary chat' })).toBeVisible();
  expect(
    await page.evaluate(async () => {
      const request = indexedDB.open('kiwi-webui-chats', 1);
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = database.transaction(['chats', 'messages']);
      const counts = await Promise.all([
        new Promise<number>((resolve, reject) => {
          const count = transaction.objectStore('chats').count();
          count.onsuccess = () => resolve(count.result);
          count.onerror = () => reject(count.error);
        }),
        new Promise<number>((resolve, reject) => {
          const count = transaction.objectStore('messages').count();
          count.onsuccess = () => resolve(count.result);
          count.onerror = () => reject(count.error);
        })
      ]);
      database.close();
      return counts;
    })
  ).toEqual([0, 0]);

  await page.reload();
  await expect(page.getByText('Do not retain')).toHaveCount(0);
  await expect(page.locator('.temporary-brand-mark')).toHaveCount(0);
  await expect(page.locator('.new-chat-heading img')).toBeVisible();
  await expect(page.getByRole('heading', { name: "Hi, I'm Kiwi!" })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Temporary Chat' })).toHaveAttribute(
    'aria-pressed',
    'false'
  );

  await page.getByRole('button', { name: 'Temporary Chat' }).click();
  await page.getByRole('textbox', { name: 'Message' }).fill('Discard on navigation');
  await page.getByRole('textbox', { name: 'Message' }).press('Enter');
  await expect(page.getByText('Discard on navigation')).toBeVisible();
  await page.locator('.brand').click();
  await expect(page.getByText('Discard on navigation')).toHaveCount(0);

  await page.getByRole('button', { name: 'Temporary Chat' }).click();
  await page.getByRole('textbox', { name: 'Message' }).fill('Save temporary');
  await page.getByRole('textbox', { name: 'Message' }).press('Enter');
  await expect(page.getByText('Hello world.')).toBeVisible();
  await page.getByRole('button', { name: 'Save temporary chat' }).click();
  await expect(page).toHaveURL(/\/c\//);
  await expect(page.getByRole('link', { name: 'Save temporary' })).toBeVisible();
  const firstConversationPosition = await page.locator('.chat-row').first().boundingBox();
  expect(firstConversationPosition?.y).toBe(emptyConversationPosition?.y);

  await page.getByRole('button', { name: 'New Chat', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('button', { name: 'Temporary Chat' })).toBeVisible();
  await page.getByRole('button', { name: 'E2E Model' }).click();
  await page.getByRole('option', { name: /Alternate Model/ }).click();

  const composer = page.getByRole('textbox', { name: 'Message' });
  await composer.fill('Say hello');
  await composer.press('Enter');
  await expect(page).toHaveURL(/\/c\//);
  await expect(page.getByText('Hello world.')).toBeVisible();
  await expect(composer).toBeFocused();
  await expect.poll(() => completionModel).toBe('alternate-model');
  await expect
    .poll(() => page.evaluate(() => (window as Window & { pwned?: boolean }).pwned))
    .not.toBe(true);
  await expect(page.locator('.message.assistant script')).toHaveCount(0);

  const conversationUrl = page.url();
  await composer.fill('Follow up');
  await composer.press('Enter');
  await expect(page.getByText('Follow up')).toBeVisible();
  await expect(page.locator('.message.assistant').filter({ hasText: 'Hello world.' })).toHaveCount(
    2
  );
  expect(page.url()).toBe(conversationUrl);

  await page.reload();
  await expect(page.getByText('Say hello')).toBeVisible();
  await expect(page.getByText('Follow up')).toBeVisible();
  await expect(page.locator('.message.assistant').filter({ hasText: 'Hello world.' })).toHaveCount(
    2
  );

  await page.getByRole('link', { name: 'New chat', exact: true }).hover();
  await page.getByRole('button', { name: 'More options for New chat' }).click();
  page.once('dialog', (dialog) => dialog.accept('Renamed chat'));
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Renamed chat' })).toBeVisible();

  await page.evaluate(() => {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('kiwi-webui-chats', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction('chats', 'readwrite');
        transaction.objectStore('chats').put({
          key: 'other-user:00000000-0000-4000-8000-000000000099',
          id: '00000000-0000-4000-8000-000000000099',
          userId: 'other-user',
          title: 'Other user chat',
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  });
  await page.reload();
  await expect(page.getByText('Other user chat')).toHaveCount(0);

  await page.goto('/c/00000000-0000-4000-8000-000000000098');
  await expect(page.getByRole('heading', { name: 'Chat not found' })).toBeVisible();
  await page.getByRole('link', { name: 'Renamed chat' }).click();

  await page.getByLabel('User menu').click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('/signin');
  await page.getByRole('link', { name: 'Continue with SSO' }).click();
  await expect(page.getByRole('link', { name: 'Renamed chat' })).toBeVisible();
  await page.getByRole('link', { name: 'Renamed chat' }).click();
  await expect(page.locator('.message.assistant').filter({ hasText: 'Hello world.' })).toHaveCount(
    2
  );

  const csrf = await page.request.post('/api/generate', {
    headers: { origin: 'http://evil.example' },
    data: {}
  });
  expect(csrf.status()).toBe(403);

  await page.getByRole('link', { name: 'Renamed chat' }).hover();
  await page.getByRole('button', { name: 'More options for Renamed chat' }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page).toHaveURL('/');

  await page.getByLabel('User menu').click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('/signin');
});
