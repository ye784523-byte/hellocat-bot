const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_SOLVES_PER_TICK = 10;

/**
 * The solve feed of the web terminal.
 *
 * The bot and the terminal are two deployments on two hosts, so they do not
 * share a store. The terminal publishes the solves it recorded and the bot
 * picks them up here, which is what lets the channel celebrate a capture
 * that happened in the browser.
 *
 * The feed carries the leaderboard row of the operator with every solve, so
 * the announcement shows the ranking the terminal shows.
 */
export function startSolveFeedPoller(ctx) {
  let running = false;

  const base = (ctx.config.WEB_TERMINAL_URL || '').replace(/\/+$/, '');
  const token = ctx.config.WEB_BRIDGE_TOKEN || '';

  /** The moment of the newest solve that was already announced. */
  async function baseline() {
    const settings = await ctx.storage.settingsRepo.get();
    if (settings.announcements?.feedSince) return settings.announcements.feedSince;
    const now = new Date().toISOString();
    await ctx.storage.settingsRepo.update((data) => {
      data.announcements ??= {};
      data.announcements.feedSince = now;
      return data;
    });
    return now;
  }

  async function fetchSolves(since) {
    const url = `${base}/api/bridge/solves?since=${encodeURIComponent(since)}&limit=${MAX_SOLVES_PER_TICK}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`the feed answered with ${response.status}`);
      }
      const payload = await response.json();
      return Array.isArray(payload.solves) ? payload.solves : [];
    } finally {
      clearTimeout(timer);
    }
  }

  async function poll() {
    const since = await baseline();
    const solves = await fetchSolves(since);
    if (solves.length === 0) return;

    for (const solve of solves) {
      try {
        const challenge = await ctx.services.challengeService.get(solve.challengeId);
        await ctx.services.announcementService.announceSolve({
          submission: { userId: solve.userId, challengeId: solve.challengeId },
          challenge: challenge ?? { id: solve.challengeId, title: solve.challengeTitle },
          entry: {
            username: solve.username,
            position: solve.position,
            total: solve.total,
            rank: solve.rank,
            solves: solve.solves,
            coins: solve.coins,
            xp: solve.xp,
            streak: solve.streak,
          },
        });
      } catch (error) {
        ctx.logger.warn('Feed announcement failed', {
          challengeId: solve.challengeId,
          error: error.message,
        });
      }
    }

    const newest = solves[solves.length - 1].createdAt;
    await ctx.storage.settingsRepo.update((data) => {
      data.announcements ??= {};
      if (!data.announcements.feedSince || data.announcements.feedSince < newest) {
        data.announcements.feedSince = newest;
      }
      return data;
    });
  }

  async function tick() {
    if (running || !ctx.client?.isReady?.()) return;
    running = true;
    try {
      await poll();
    } catch (error) {
      ctx.logger.warn('Solve feed poll failed', { error: error.message });
    } finally {
      running = false;
    }
  }

  if (!base || !token) {
    ctx.logger.info('The solve feed of the web terminal is not configured', {
      stage: 'announcements',
      hasUrl: Boolean(base),
      hasToken: Boolean(token),
    });
    return { tick, stop: () => {} };
  }

  const interval = setInterval(tick, (ctx.config.ANNOUNCE_POLL_SECONDS ?? 15) * 1000);
  interval.unref?.();
  tick();
  return {
    tick,
    stop: () => clearInterval(interval),
  };
}

