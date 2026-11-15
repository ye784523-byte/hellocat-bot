import test from 'node:test';
import assert from 'node:assert/strict';
import welcomeEvent from '../src/events/guildMemberAdd.js';
import { silentLogger } from './helpers.js';

const WEB_URL = 'https://terminal.example.com';

function makeMember({ id = '555', username = 'newbie', dmFails = false } = {}) {
  const sent = [];
  return {
    sent,
    user: { id, username, bot: false },
    guild: { id: 'guild-1', systemChannel: null },
    async send(payload) {
      if (dmFails) {
        const error = new Error('Cannot send messages to this user');
        error.code = 50007;
        throw error;
      }
      sent.push(payload);
      return payload;
    },
  };
}

function makeCtx(member, { channel = null, config = {} } = {}) {
  const channelSent = [];
  const target = channel ?? {
    isTextBased: () => true,
    async send(payload) {
      channelSent.push(payload);
      return payload;
    },
  };
  return {
    ctx: {
      config: {
        GUILD_ID: 'guild-1',
        WEB_PUBLIC_URL: WEB_URL,
        WELCOME_ENABLED: true,
        WELCOME_DM_ENABLED: true,
        ...config,
      },
      client: {
        channels: { cache: new Map(target ? [['welcome', target]] : []) },
        guilds: { cache: new Map([['guild-1', { channels: { cache: new Map() } }]]) },
      },
      logger: silentLogger,
    },
    channelSent,
  };
}

test('a new member receives the participation guide as a direct message', async () => {
  const member = makeMember();
  const { ctx } = makeCtx(member);

  await welcomeEvent.execute(member, ctx);

  assert.equal(member.sent.length, 1);
  const embed = member.sent[0].embeds[0].data;
  const rendered = JSON.stringify(embed);
  assert.match(rendered, /WELCOME TO THE HELLO CAT LABS/);
  assert.match(rendered, /HOW TO PARTICIPATE/);
  assert.match(rendered, /Pick a target/);
  assert.match(rendered, /Capture the flag/);
  assert.match(rendered, /challenge browse/);
  assert.match(rendered, /hint challenge:HC-001/);
  assert.ok(rendered.includes(WEB_URL), 'the web terminal is linked');
  assert.match(rendered, /newbie/);
});

test('the guide explains that flags are submitted in the web terminal', async () => {
  const member = makeMember();
  const { ctx } = makeCtx(member);

  await welcomeEvent.execute(member, ctx);

  const rendered = JSON.stringify(member.sent[0].embeds[0].data);
  assert.match(rendered, /web terminal/i);
  assert.match(rendered, /Captures are celebrated in the channel/);
});

test('a member with closed direct messages gets the greeting in the channel', async () => {
  const member = makeMember({ dmFails: true });
  const { ctx, channelSent } = makeCtx(member, { config: { WELCOME_CHANNEL_ID: 'welcome' } });

  await welcomeEvent.execute(member, ctx);

  assert.equal(member.sent.length, 0);
  assert.equal(channelSent.length, 1);
  const rendered = JSON.stringify(channelSent[0]);
  assert.match(rendered, /just joined the labs/);
  assert.match(rendered, /newbie/);
  assert.match(rendered, /challenge browse/);
});

test('bots and other guilds are ignored', async () => {
  const bot = makeMember({ username: 'bot' });
  bot.user.bot = true;
  const { ctx } = makeCtx(bot);
  await welcomeEvent.execute(bot, ctx);
  assert.equal(bot.sent.length, 0);

  const outsider = makeMember();
  outsider.guild = { id: 'other-guild', systemChannel: null };
  const { ctx: ctx2 } = makeCtx(outsider);
  await welcomeEvent.execute(outsider, ctx2);
  assert.equal(outsider.sent.length, 0);
});

test('the welcome can be switched off', async () => {
  const member = makeMember();
  const { ctx } = makeCtx(member, { config: { WELCOME_ENABLED: false } });
  await welcomeEvent.execute(member, ctx);
  assert.equal(member.sent.length, 0);
});
