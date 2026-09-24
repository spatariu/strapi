/**
 * Local dev seed: populate a handful of sample public API users
 * (plugin::users-permissions.user) for testing authenticated API access.
 *
 * This is dev/testing fixture data, not tied to any shipped feature yet —
 * real user accounts are tracked separately (see issue #8, deferred).
 *
 * Uses the users-permissions plugin's own user service so passwords are
 * hashed the way the plugin expects, rather than hand-rolling bcrypt.
 *
 * Run with: node scripts/seed-users.js
 */

const { compileStrapi, createStrapi } = require('@strapi/strapi');

const SEED_USERS = [
  { username: 'alice', email: 'alice@example.com', password: 'ChangeMe123!' },
  { username: 'bob', email: 'bob@example.com', password: 'ChangeMe123!' },
  { username: 'carmen', email: 'carmen@example.com', password: 'ChangeMe123!' },
  { username: 'dan', email: 'dan@example.com', password: 'ChangeMe123!' },
  { username: 'elena', email: 'elena@example.com', password: 'ChangeMe123!' },
];

async function main() {
  console.log('Booting Strapi...');
  const appContext = await compileStrapi();
  const app = await createStrapi(appContext).load();
  app.log.level = 'error';

  const userService = app.plugin('users-permissions').service('user');

  const authenticatedRole = await app.db
    .query('plugin::users-permissions.role')
    .findOne({ where: { type: 'authenticated' } });

  if (!authenticatedRole) {
    throw new Error('Could not find the default "authenticated" role.');
  }

  let created = 0;
  let skipped = 0;

  for (const seed of SEED_USERS) {
    const existing = await app.db
      .query('plugin::users-permissions.user')
      .findOne({ where: { email: seed.email } });

    if (existing) {
      console.log(`skip (already exists): ${seed.email}`);
      skipped++;
      continue;
    }

    await userService.add({
      ...seed,
      provider: 'local',
      confirmed: true,
      blocked: false,
      role: authenticatedRole.id,
    });
    console.log(`created: ${seed.email}`);
    created++;
  }

  console.log(`\nDone. created=${created} skipped=${skipped}`);
  await app.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
