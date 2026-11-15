import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits } from 'discord.js';
import {
  hasAdminAccess,
  assertAdmin,
  canModerate,
  assertModerationTarget,
  resolveAdminRole,
} from '../src/utils/permissions.js';

const ROLE_ID = '123456789012345678';

function mockMember({ id = '200000000000000001', position = 5, permissions = new Set(), roles = [], ownerId = '999999999999999999' } = {}) {
  const guild = {
    ownerId,
    roles: { cache: new Map(roles.map((role) => [role.id, role])) },
  };
  return {
    id,
    guild,
    permissions: { has: (permission) => permissions.has(permission) },
    roles: {
      cache: new Map(roles.map((role) => [role.id, role])),
      highest: { position },
    },
  };
}

test('admin access is granted by owner, Administrator, ManageGuild or configured role', () => {
  const adminRole = { id: ROLE_ID, name: 'Cyber Admins' };
  assert.equal(hasAdminAccess(mockMember({ ownerId: '200000000000000001' }), ROLE_ID), true);
  assert.equal(
    hasAdminAccess(mockMember({ permissions: new Set([PermissionFlagsBits.Administrator]) }), ROLE_ID),
    true,
  );
  assert.equal(
    hasAdminAccess(mockMember({ permissions: new Set([PermissionFlagsBits.ManageGuild]) }), ROLE_ID),
    true,
  );
  assert.equal(hasAdminAccess(mockMember({ roles: [adminRole] }), ROLE_ID), true);
  assert.equal(hasAdminAccess(mockMember({ roles: [{ id: '111111111111111111' }] }), ROLE_ID), false);
  assert.throws(() => assertAdmin(mockMember(), ROLE_ID), /Administrator access required/);
});

test('configured admin role must be a valid snowflake and present in the guild', () => {
  const guild = { roles: { cache: new Map([[ROLE_ID, { id: ROLE_ID }]]) } };
  assert.ok(resolveAdminRole(guild, ROLE_ID));
  assert.equal(resolveAdminRole(guild, 'not-a-snowflake'), null);
  assert.equal(resolveAdminRole(guild, '111111111111111111'), null);
});

test('moderation hierarchy prevents equal/higher targets and protects owners/bots/self', () => {
  const moderator = mockMember({ id: '200000000000000001', position: 5 });
  const lower = mockMember({ id: '200000000000000002', position: 4 });
  const equal = mockMember({ id: '200000000000000003', position: 5 });
  assert.equal(canModerate(moderator, lower), true);
  assert.equal(canModerate(moderator, equal), false);
  assert.doesNotThrow(() => assertModerationTarget(moderator, lower));
  assert.throws(() => assertModerationTarget(moderator, equal), /hierarchy/i);
  assert.throws(() => assertModerationTarget(moderator, moderator), /yourself/i);
  const bot = mockMember({ id: '200000000000000004', position: 1 });
  bot.user = { bot: true };
  assert.throws(() => assertModerationTarget(moderator, bot), /Bots cannot/i);
  const owner = mockMember({ id: '999999999999999999', position: 10, ownerId: '999999999999999999' });
  assert.throws(() => assertModerationTarget(moderator, owner), /owner/i);
});
