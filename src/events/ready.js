import { GatewayIntentBits } from 'discord.js';
import { setPresence } from '../client.js';
import { resolveAdminRole } from '../utils/permissions.js';

/**
 * Privileged intent flags that Discord reports on the application object.
 *
 * Discord publishes two bits per intent: the `...` variant for applications in
 * 100 or more guilds and the `...Limited` variant for applications in fewer.
 * A bot is moved to the limited variant automatically when it is still small,
 * so both bits have to be accepted.
 */
const APPLICATION_FLAG_GUILD_MEMBERS = 1 << 14;
const APPLICATION_FLAG_GUILD_MEMBERS_LIMITED = 1 << 15;
const APPLICATION_FLAG_MESSAGE_CONTENT = 1 << 18;
const APPLICATION_FLAG_MESSAGE_CONTENT_LIMITED = 1 << 19;

const hasFlag = (flags, bit, limited) => Boolean(flags & (bit | limited));

export default {
  name: 'ready',
  once: true,
  async execute(client, ctx) {
    ctx.logger.info('Gateway connected', {
      user: client.user?.tag,
      guilds: client.guilds.cache.size,
    });
    setPresence(client);

    const flags = client.application?.flags ?? 0;
    if (
      !client.options.intents.has(GatewayIntentBits.MessageContent) ||
      !hasFlag(flags, APPLICATION_FLAG_MESSAGE_CONTENT, APPLICATION_FLAG_MESSAGE_CONTENT_LIMITED)
    ) {
      ctx.logger.warn(
        'Message Content intent is not enabled in the Discord developer portal; message text is not delivered, so keyword detection and duplicate detection stay inactive.',
        { stage: 'intents', flags },
      );
    }
    if (
      client.options.intents.has(GatewayIntentBits.GuildMembers) &&
      !hasFlag(flags, APPLICATION_FLAG_GUILD_MEMBERS, APPLICATION_FLAG_GUILD_MEMBERS_LIMITED)
    ) {
      ctx.logger.warn(
        'Server Members intent is not enabled in the Discord developer portal; member join events will not be delivered.',
        { stage: 'intents', flags },
      );
    }

    if (ctx.config.ADMIN_ROLE_ID && ctx.config.GUILD_ID) {
      const guild = client.guilds.cache.get(ctx.config.GUILD_ID);
      const role = guild ? resolveAdminRole(guild, ctx.config.ADMIN_ROLE_ID) : null;
      if (!role) {
        ctx.logger.warn('Configured ADMIN_ROLE_ID was not found in the guild; role-based admin access is unavailable.', {
          guildId: ctx.config.GUILD_ID,
        });
      } else {
        ctx.logger.info('Administrator role validated', { role: role.name, guild: guild.name });
      }
    }
  },
};
