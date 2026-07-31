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
let lastPreloadBody: unknown;
let currentIdentity = {
  sub: 'e2e-subject',
  username: 'e2e-user',
  email: 'e2e@example.com'
};
const loadedModels = new Set<string>();
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
    sub: currentIdentity.sub,
    preferred_username: currentIdentity.username,
    email: currentIdentity.email,
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
      if (request.method === 'GET' && url.pathname === '/api/ps') {
        return json(response, 200, {
          models: [...loadedModels].map((model) => ({ name: `${model}:latest` }))
        });
      }
      if (request.method === 'POST' && url.pathname === '/api/chat') {
        const payload = JSON.parse(await readBody(request)) as { model: string };
        lastPreloadBody = payload;
        await new Promise((resolve) => setTimeout(resolve, 200));
        loadedModels.add(payload.model);
        return json(response, 200, { done: true });
      }
      const payload = JSON.parse(await readBody(request)) as { model?: string };
      completionModel = payload.model ?? '';
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.flushHeaders();
      await new Promise((resolve) => setTimeout(resolve, 80));
      response.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'Hello **world**. Formula: $x^2 + ' } }] })}\n\n`
      );
      await new Promise((resolve) => setTimeout(resolve, 350));
      response.write(
        `data: ${JSON.stringify({
          choices: [
            {
              delta: {
                content: String.raw`y^2$. $$\displaystyle x_1+x_2+x_3+x_4+x_5+x_6+x_7+x_8+x_9+x_{10}+x_{11}+x_{12}=100$$ <script>window.pwned=true</script> $\href{javascript:alert(1)}{click}$`
              }
            }
          ]
        })}\n\n`
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
  currentIdentity = {
    sub: 'e2e-subject',
    username: 'e2e-user',
    email: 'e2e@example.com'
  };
  let welcomeMode: 'content' | 'missing' | 'empty' = 'content';
  let welcomeRequests = 0;
  let welcomeBody = [
    '# Welcome to Kiwi',
    '',
    'This is **operator-authored** Markdown.',
    '',
    'Formula delimiters stay literal here: $welcome$.',
    '',
    '<script>window.welcomePwned=true</script>',
    '',
    ...Array.from({ length: 24 }, (_, index) => `Welcome detail ${index + 1}.`)
  ].join('\n\n');
  await page.route('**/welcome.md', async (route) => {
    welcomeRequests += 1;
    if (welcomeMode === 'missing') return route.fulfill({ status: 503, body: 'Unavailable' });
    return route.fulfill({
      status: 200,
      contentType: 'text/markdown',
      body: welcomeMode === 'empty' ? '   \n' : welcomeBody
    });
  });

  await page.goto('/signin');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    'href',
    /\/kiwi-incognito-favicon\.svg$/
  );
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

  const welcomeDialog = page.getByRole('dialog', { name: 'Welcome message' });
  const welcomeAction = page.getByRole('button', { name: 'Cool, thanks.', exact: true });
  await expect(welcomeDialog).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Welcome to Kiwi' })).toBeVisible();
  await expect(page.locator('.welcome-dialog script')).toHaveCount(0);
  await expect(page.locator('.welcome-dialog .katex')).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as Window & { welcomePwned?: boolean }).welcomePwned)
  ).not.toBe(true);
  await expect(welcomeAction).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(welcomeDialog).toBeVisible();
  await page.mouse.click(1, 1);
  await expect(welcomeDialog).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(welcomeAction).toBeFocused();

  await page.setViewportSize({ width: 390, height: 640 });
  await expect(page.locator('.compact-account-trigger')).not.toBeVisible();
  const welcomeBox = await welcomeDialog.boundingBox();
  expect(welcomeBox!.width).toBeLessThanOrEqual(390);
  expect(welcomeBox!.height).toBeLessThanOrEqual(640);
  await expect(welcomeAction).toBeVisible();
  expect(await welcomeDialog.evaluate((element) => getComputedStyle(element).overflowY)).toBe(
    'hidden'
  );
  expect(await welcomeDialog.evaluate((element) => getComputedStyle(element).boxShadow)).toBe(
    'none'
  );
  expect(
    await page
      .locator('.welcome-dialog-content')
      .evaluate(
        (element) =>
          getComputedStyle(element).overflowY === 'auto' &&
          element.scrollHeight > element.clientHeight
      )
  ).toBe(true);
  await welcomeAction.click();
  await expect(welcomeDialog).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => key.startsWith('kiwi_welcome_ack:'))
    )
  ).toHaveLength(1);

  welcomeBody = '# Edited welcome content';
  await page.reload();
  await expect(welcomeDialog).toHaveCount(0);
  expect(welcomeRequests).toBe(1);
  await page.setViewportSize({ width: 1280, height: 720 });

  const expandedAccountMenu = page.locator('.sidebar-footer .account-menu');
  await expandedAccountMenu.getByLabel('User menu').click();
  await expect(expandedAccountMenu.getByRole('button', { name: 'Welcome message' })).toBeVisible();
  await expect(expandedAccountMenu.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expandedAccountMenu.getByRole('button', { name: 'Welcome message' }).click();
  await expect(welcomeDialog).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Edited welcome content' })).toBeVisible();
  expect(welcomeRequests).toBe(2);
  await welcomeAction.click();
  await expect(welcomeDialog).toHaveCount(0);

  const emptyConversationPosition = await page.getByText('No conversations yet').boundingBox();
  const expandedLogo = await page.locator('.brand-logo').boundingBox();
  const expandedNewChat = await page.locator('.new-chat > svg').boundingBox();
  const expandedProfile = await page.locator('.sidebar-footer .account-avatar').boundingBox();
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

  const compactAccountMenu = page.locator('.compact-account-menu');
  const compactAccountTrigger = compactAccountMenu.getByLabel('User menu');
  await expect(compactAccountTrigger).toBeVisible();
  const compactProfile = compactAccountTrigger.locator('.account-avatar');
  await expect(compactProfile).toHaveText('E');
  const compactTriggerBox = await compactAccountTrigger.boundingBox();
  const compactProfileBox = await compactProfile.boundingBox();
  expect(720 - (compactTriggerBox!.y + compactTriggerBox!.height)).toBeLessThanOrEqual(14);
  expect(
    compactProfileBox!.y +
      compactProfileBox!.height / 2 -
      (expandedProfile!.y + expandedProfile!.height / 2)
  ).toBeCloseTo(0, 1);
  await page.locator('.sidebar-rail > .sidebar-control').nth(1).focus();
  await page.keyboard.press('Tab');
  await expect(compactAccountTrigger).toBeFocused();
  expect(
    await compactAccountTrigger.evaluate((element) => getComputedStyle(element).outlineStyle)
  ).toBe('solid');
  await page.keyboard.press('Enter');
  await expect(compactAccountMenu).toHaveAttribute('open', '');
  const compactPopover = compactAccountMenu.locator('.compact-account-popover');
  await expect(compactPopover).toBeVisible();
  await expect(compactPopover.locator('.account-identity')).toContainText('e2e-user');
  await expect(compactPopover.getByRole('button', { name: 'Welcome message' })).toBeVisible();
  await expect(compactPopover.getByRole('button', { name: 'Sign out' })).toBeVisible();
  const compactPopoverBox = await compactPopover.boundingBox();
  expect(compactPopoverBox!.x).toBeGreaterThanOrEqual(52);
  expect(compactPopoverBox!.x + compactPopoverBox!.width).toBeLessThanOrEqual(1280);
  expect(compactPopoverBox!.y).toBeGreaterThanOrEqual(0);
  expect(compactPopoverBox!.y + compactPopoverBox!.height).toBeLessThanOrEqual(720);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );

  await page.getByRole('button', { name: 'Open Sidebar' }).click();
  await expect(compactAccountMenu).not.toHaveAttribute('open', '');
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
  await expect(page.getByRole('status').filter({ hasText: 'Loading model…' })).toBeVisible();
  await expect
    .poll(() => lastPreloadBody)
    .toEqual({
      model: 'e2e-model',
      messages: [],
      stream: false
    });
  const streamingMessage = page.locator('.message.streaming');
  await expect(streamingMessage).toContainText('Formula: $x^2 +');
  await expect(streamingMessage.locator('.katex')).toHaveCount(0);
  await expect(page.getByText('Hello world.')).toBeVisible();
  await expect(page.locator('.message.assistant .katex-display')).toBeVisible();
  await expect(page.locator('.message.assistant .katex math').first()).toBeAttached();
  await expect(page.locator('.message.assistant a')).toHaveCount(0);
  await expect(page.getByText('Loading model…')).toHaveCount(0);
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
  await expect(page.getByLabel('Generating response')).toBeVisible();
  await expect(page.getByText('Loading model…')).toHaveCount(0);
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

  const savedConversationUrl = page.url();
  await page.setViewportSize({ width: 390, height: 800 });
  expect(
    await page
      .locator('.message.assistant .katex-display')
      .first()
      .evaluate((element) => ({
        formulaScrolls: element.scrollWidth > element.clientWidth,
        pageContained: document.documentElement.scrollWidth <= window.innerWidth
      }))
  ).toEqual({ formulaScrolls: true, pageContained: true });
  await page.setViewportSize({ width: 700, height: 800 });
  await page.getByRole('button', { name: 'Open Sidebar' }).click();
  await page.waitForTimeout(220);
  const mobileChatActions = page.getByRole('button', {
    name: 'More options for Save temporary'
  });
  await expect(mobileChatActions).toBeVisible();
  await mobileChatActions.click();
  await expect(page.getByRole('button', { name: 'Rename', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
  expect(page.url()).toBe(savedConversationUrl);
  await page.locator('.nav-scrim').click({ position: { x: 650, y: 400 } });
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.getByRole('button', { name: 'New Chat', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('button', { name: 'Temporary Chat' })).toBeVisible();
  await page.getByRole('button', { name: 'E2E Model' }).click();
  await page.getByRole('option', { name: /Alternate Model/ }).click();

  const composer = page.getByRole('textbox', { name: 'Message' });
  await composer.fill('Say hello');
  await composer.press('Enter');
  await expect(page).toHaveURL(/\/c\//);
  await expect(page.getByRole('status').filter({ hasText: 'Loading model…' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop generation' }).click();
  await expect(page.getByText('Loading model…')).toHaveCount(0);
  await expect(page.getByText('Hello world.')).toHaveCount(0);
  await expect.poll(() => loadedModels.has('alternate-model')).toBe(true);

  await composer.fill('Say hello again');
  await composer.press('Enter');
  await expect(page.getByLabel('Generating response')).toBeVisible();
  await expect(page.getByText('Loading model…')).toHaveCount(0);
  await expect(page.getByText('Hello world.')).toBeVisible();
  await expect(composer).toBeFocused();
  await expect.poll(() => completionModel).toBe('alternate-model');
  await expect
    .poll(() => page.evaluate(() => (window as Window & { pwned?: boolean }).pwned))
    .not.toBe(true);
  await expect(page.locator('.message.assistant script')).toHaveCount(0);
  await expect(page.locator('.message.streaming')).toHaveCount(0);
  await expect(composer).toBeEnabled();

  const conversationUrl = page.url();
  await composer.fill('Follow up');
  await composer.press('Enter');
  await expect(page.getByText('Follow up')).toBeVisible();
  await expect(page.locator('.message.assistant .katex-display')).toHaveCount(2);
  await expect(composer).toBeEnabled();
  await expect(page.locator('.message.assistant').filter({ hasText: 'Hello world.' })).toHaveCount(
    2
  );
  expect(page.url()).toBe(conversationUrl);

  await page.reload();
  await expect(page.getByText('Say hello', { exact: true })).toBeVisible();
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

  const accountMenuBeforeLogout = page.locator('.sidebar-footer .account-menu');
  await accountMenuBeforeLogout.getByLabel('User menu').click();
  await accountMenuBeforeLogout.getByRole('button', { name: 'Sign out' }).click();
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

  await page.locator('.sidebar-footer .account-menu').getByLabel('User menu').click();
  await page
    .locator('.sidebar-footer .account-menu')
    .getByRole('button', { name: 'Sign out' })
    .click();
  await expect(page).toHaveURL('/signin');

  currentIdentity = {
    sub: 'e2e-second-subject',
    username: 'e2e-second-user',
    email: 'e2e-second@example.com'
  };
  await page.getByRole('link', { name: 'Continue with SSO' }).click();
  await expect(page.getByRole('heading', { name: 'Edited welcome content' })).toBeVisible();
  await page.getByRole('button', { name: 'Cool, thanks.', exact: true }).click();
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => key.startsWith('kiwi_welcome_ack:'))
    )
  ).toHaveLength(2);
  await page.locator('.sidebar-footer .account-menu').getByLabel('User menu').click();
  await page
    .locator('.sidebar-footer .account-menu')
    .getByRole('button', { name: 'Sign out' })
    .click();

  currentIdentity = {
    sub: 'e2e-subject',
    username: 'e2e-user',
    email: 'e2e@example.com'
  };
  const requestsBeforeReturningUser = welcomeRequests;
  await page.getByRole('link', { name: 'Continue with SSO' }).click();
  await expect(page.getByRole('dialog', { name: 'Welcome message' })).toHaveCount(0);
  expect(welcomeRequests).toBe(requestsBeforeReturningUser);
  await page.locator('.sidebar-footer .account-menu').getByLabel('User menu').click();
  await page
    .locator('.sidebar-footer .account-menu')
    .getByRole('button', { name: 'Sign out' })
    .click();

  welcomeMode = 'missing';
  currentIdentity = {
    sub: 'e2e-missing-subject',
    username: 'e2e-missing-user',
    email: 'e2e-missing@example.com'
  };
  await page.getByRole('link', { name: 'Continue with SSO' }).click();
  await expect(page.getByRole('dialog', { name: 'Welcome message' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();
  await page.locator('.sidebar-footer .account-menu').getByLabel('User menu').click();
  await page
    .locator('.sidebar-footer .account-menu')
    .getByRole('button', { name: 'Sign out' })
    .click();

  welcomeMode = 'empty';
  currentIdentity = {
    sub: 'e2e-empty-subject',
    username: 'e2e-empty-user',
    email: 'e2e-empty@example.com'
  };
  await page.getByRole('link', { name: 'Continue with SSO' }).click();
  await expect(page.getByRole('dialog', { name: 'Welcome message' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();
  await page.locator('.sidebar-footer .account-menu').getByLabel('User menu').click();
  await page
    .locator('.sidebar-footer .account-menu')
    .getByRole('button', { name: 'Sign out' })
    .click();

  welcomeMode = 'content';
  currentIdentity = {
    sub: 'e2e-blocked-storage-subject',
    username: 'e2e-blocked-storage-user',
    email: 'e2e-blocked-storage@example.com'
  };
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string): void {
      if (key.startsWith('kiwi_welcome_ack:')) throw new DOMException('Storage blocked');
      setItem.call(this, key, value);
    };
  });
  await page.getByRole('link', { name: 'Continue with SSO' }).click();
  await expect(page.getByRole('dialog', { name: 'Welcome message' })).toBeVisible();
  await page.getByRole('button', { name: 'Cool, thanks.', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Welcome message' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Welcome message' })).toBeVisible();
  await page.getByRole('button', { name: 'Cool, thanks.', exact: true }).click();
  await page.locator('.sidebar-footer .account-menu').getByLabel('User menu').click();
  await page
    .locator('.sidebar-footer .account-menu')
    .getByRole('button', { name: 'Sign out' })
    .click();
  await expect(page).toHaveURL('/signin');
});
