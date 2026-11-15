import test from 'node:test';
import assert from 'node:assert/strict';
import { LeaderboardService } from '../src/services/leaderboardService.js';
import { AnnouncementService } from '../src/services/announcementService.js';
import { startAnnouncementScheduler } from '../src/handlers/announcementScheduler.js';
import { TIPS, tipForDate } from '../src/constants/tips.js';
import { createTestEnv, silentLogger } from './helpers.js';

const WEB_URL = 'https://terminal.example.com';

function makeLeaderboardService(storage) {
  return new LeaderboardService({
    usersRepo: storage.usersRepo,
    submissionsRepo: storage.submissionsRepo,
    economyRepo: storage.economyRepo,
    logger: silentLogger,
  });
}

/** A channel double that records what was posted. */
function makeChannel() {
  const sent = [];
  return {
    sent,
    isTextBased: () => true,
    async send(payload) {
      sent.push(payload);
      return { id: `MSG-${sent.length}` };
    },
  };
}

function makeClient(channel) {
  const channels = new Map();
  if (channel) channels.set('channel-1', channel);
  const guild = { channels: { cache: new Map(channels) } };
  return {
    channels: { cache: new Map(channels) },
    guilds: { cache: new Map([['guild-1', guild]]) },
    isReady: () => true,
    user: { id: 'bot-1' },
  };
}

function makeAnnouncementService(storage, channel, overrides = {}) {
  const client = makeClient(channel);
  const leaderboardService = makeLeaderboardService(storage);
  const service = new AnnouncementService({
    client,
    config: {
      GUILD_ID: 'guild-1',
      CHALLENGE_CHANNEL_ID: 'channel-1',
      WEB_PUBLIC_URL: WEB_URL,
      ...overrides.config,
    },
    logger: silentLogger,
    leaderboardService,
    challengeService: overrides.challengeService ?? { get: async () => null },
    playerService: overrides.playerService ?? {},
  });
  return { service, client, leaderboardService };
}

/* ------------------------------------------------------------- leaderboard */

test('the leaderboard ranks operators by challenges solved', async () => {
  const env = await createTestEnv();
  const { storage } = env;
  try {
    const leaderboard = makeLeaderboardService(storage);

    await storage.usersRepo.ensure('1', 'alpha');
    await storage.usersRepo.ensure('2', 'beta');
    await storage.usersRepo.ensure('3', 'gamma');

    await storage.submissionsRepo.add({ userId: '1', challengeId: 'HC-001', correct: true });
    await storage.submissionsRepo.add({ userId: '1', challengeId: 'HC-002', correct: true });
    await storage.submissionsRepo.add({ userId: '2', challengeId: 'HC-001', correct: true });
    await storage.submissionsRepo.add({ userId: '2', challengeId: 'HC-002', correct: false });

    await storage.economyRepo.ensure('1');
    await storage.economyRepo.update('1', (account) => {
      account.coins = 120;
      return account;
    });

    const rows = await leaderboard.entries(10);
    assert.equal(rows[0].userId, '1');
    assert.equal(rows[0].solves, 2);
    assert.equal(rows[0].coins, 120);
    assert.equal(rows[0].position, 1);
    assert.equal(rows[1].userId, '2');
    assert.equal(rows[1].solves, 1);
    assert.equal(rows[1].position, 2);

    const position = await leaderboard.positionOf('1');
    assert.equal(position.position, 1);
    assert.equal(position.total, 3);
    assert.equal(position.solves, 2);
  } finally {
    await env.cleanup();
  }
});

/* ------------------------------------------------------------ announcements */

test('a challenge announcement explains the challenge and links the web terminal', async () => {
  const env = await createTestEnv();
  try {
    const channel = makeChannel();
    const { service } = makeAnnouncementService(env.storage, channel);
    const challenge = {
      id: 'HC-001',
      title: 'Reading the Wire',
      description: 'A packet capture hides in plain sight.',
      objective: 'Recover the token from the capture and submit it as HC{token}.',
      category: 'Networking',
      difficulty: 'Easy',
      xp: 100,
    };

    const payload = service.challengeAnnouncement(challenge);
    const rendered = JSON.stringify(payload.embeds[0].data);
    assert.match(rendered, /Reading the Wire/);
    assert.match(rendered, /Recover the token/);
    assert.ok(rendered.includes(`${WEB_URL}/terminal?challenge=HC-001`));

    await service.announceChallenge(challenge);
    assert.equal(channel.sent.length, 1);
  } finally {
    await env.cleanup();
  }
});

test('a solve announcement reports ranking, total solves and catcoins', async () => {
  const env = await createTestEnv();
  try {
    const channel = makeChannel();
    const { service } = makeAnnouncementService(env.storage, channel);

    await env.storage.usersRepo.ensure('42', 'kgretzky');
    await env.storage.submissionsRepo.add({ userId: '42', challengeId: 'HC-007', correct: true });
    await env.storage.economyRepo.ensure('42');
    await env.storage.economyRepo.update('42', (account) => {
      account.coins = 640;
      return account;
    });

    const submission = { userId: '42', challengeId: 'HC-007', correct: true };
    const challenge = { id: 'HC-007', title: 'Forensics Drill' };

    await service.announceSolve({ submission, challenge });

    assert.equal(channel.sent.length, 1);
    const rendered = JSON.stringify(channel.sent[0].embeds[0].data);
    assert.match(rendered, /kgretzky/);
    assert.match(rendered, /RANKING/);
    assert.match(rendered, /SOLVED/);
    assert.match(rendered, /CATCOINS/);
    assert.match(rendered, /640/);
    assert.match(rendered, /#1/);
  } finally {
    await env.cleanup();
  }
});

test('the daily tip rotates deterministically and carries the leaderboard', async () => {
  const env = await createTestEnv();
  try {
    const channel = makeChannel();
    const { service } = makeAnnouncementService(env.storage, channel);

    await env.storage.usersRepo.ensure('9', 'top');
    await env.storage.submissionsRepo.add({ userId: '9', challengeId: 'HC-001', correct: true });

    await service.announceDailyTip({ date: new Date('2026-03-10T10:00:00Z') });

    assert.equal(channel.sent.length, 1);
    const rendered = JSON.stringify(channel.sent[0].embeds[0].data);
    assert.match(rendered, /TIP/);
    assert.match(rendered, /TOP OPERATORS/);

    const first = tipForDate(new Date('2026-03-10T10:00:00Z'));
    const second = tipForDate(new Date('2026-03-11T10:00:00Z'));
    assert.notEqual(first.id, second.id);
    assert.equal(tipForDate(new Date('2026-03-10T23:00:00Z')).id, first.id);
    assert.ok(TIPS.length >= 12);
  } finally {
    await env.cleanup();
  }
});

test('the announcement channel falls back to the challenge channel', async () => {
  const env = await createTestEnv();
  try {
    const channel = makeChannel();
    const { service } = makeAnnouncementService(env.storage, channel, {
      config: { ANNOUNCEMENT_CHANNEL_ID: '' },
    });
    assert.equal(service.channelId, 'channel-1');

    await env.storage.usersRepo.ensure('5', 'operator');
    await env.storage.submissionsRepo.add({ userId: '5', challengeId: 'HC-001', correct: true });

    await service.announceLeaderboard();
    assert.equal(channel.sent.length, 1);
    assert.match(JSON.stringify(channel.sent[0].embeds[0].data), /operator/);
  } finally {
    await env.cleanup();
  }
});

/* --------------------------------------------------------------- scheduler */

test('the scheduler announces solves that were recorded in the web terminal', async () => {
  const env = await createTestEnv();
  try {
    const channel = makeChannel();
    const challengeService = { get: async (id) => ({ id, title: 'Lab Drill' }) };
    const { service } = makeAnnouncementService(env.storage, channel, { challengeService });
    const client = makeClient(channel);

    const ctx = {
      config: {
        BOT_TIMEZONE: 'UTC',
        ANNOUNCE_SOLVES: true,
        DAILY_TIPS_ENABLED: false,
        ANNOUNCE_POLL_SECONDS: 3600,
      },
      storage: env.storage,
      services: { announcementService: service, challengeService },
      logger: silentLogger,
    };

    const scheduler = startAnnouncementScheduler(client, ctx);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const settings = await env.storage.settingsRepo.get();
    assert.ok(settings.announcements?.solvesSince, 'the baseline is stored');

    // A solve that happens in the web terminal after the baseline.
    await env.storage.usersRepo.ensure('77', 'solver');
    await env.storage.submissionsRepo.add({ userId: '77', challengeId: 'HC-042', correct: true });

    await scheduler.tick();
    scheduler.stop();

    assert.equal(channel.sent.length, 1);
    const rendered = JSON.stringify(channel.sent[0].embeds[0].data);
    assert.match(rendered, /solver/);
    assert.match(rendered, /HC-042/);

    // The marker moved forward, so the same solve is never announced twice.
    const after = await env.storage.settingsRepo.get();
    assert.ok(after.announcements.solvesSince >= settings.announcements.solvesSince);

    await scheduler.tick();
    assert.equal(channel.sent.length, 1, 'a solve is announced exactly once');
  } finally {
    await env.cleanup();
  }
});

test('the scheduler announces the challenge a cleared prerequisite unlocked', async () => {
  const env = await createTestEnv();
  try {
    const channel = makeChannel();
    const challengeService = {
      get: async (id) => ({ id, title: 'First Contact' }),
      unlockedBy: async () => [
        {
          id: 'HC-017',
          title: 'Second Contact',
          difficulty: 'Medium',
          xp: 150,
          objective: 'Decode the hidden session token.',
        },
      ],
    };
    const { service } = makeAnnouncementService(env.storage, channel, { challengeService });
    const client = makeClient(channel);

    const ctx = {
      config: {
        BOT_TIMEZONE: 'UTC',
        ANNOUNCE_SOLVES: true,
        DAILY_TIPS_ENABLED: false,
        ANNOUNCE_POLL_SECONDS: 3600,
      },
      storage: env.storage,
      services: { announcementService: service, challengeService },
      logger: silentLogger,
    };

    const scheduler = startAnnouncementScheduler(client, ctx);
    await new Promise((resolve) => setTimeout(resolve, 50));

    await env.storage.usersRepo.ensure('88', 'solver');
    await env.storage.submissionsRepo.add({ userId: '88', challengeId: 'HC-016', correct: true });

    await scheduler.tick();
    scheduler.stop();

    assert.equal(channel.sent.length, 2);
    const unlock = JSON.stringify(channel.sent[1]);
    assert.match(unlock, /NEW CHALLENGE UNLOCKED/);
    assert.match(unlock, /HC-017/);
    assert.match(unlock, /Second Contact/);
  } finally {
    await env.cleanup();
  }
});
