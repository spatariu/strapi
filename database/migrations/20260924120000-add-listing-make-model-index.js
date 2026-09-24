'use strict';

/**
 * Index (make, model) on the listings table.
 *
 * The read API's primary filters are make/model (see spec issue #1, user
 * stories 1-2), so this pair is looked up far more often than it's written.
 * Guarded so it's a no-op on a DB that doesn't have the table/columns yet
 * (e.g. a fresh clone where user migrations run before Strapi has synced
 * the listing content type's own schema).
 */
module.exports = {
  async up(knex) {
    const hasTable = await knex.schema.hasTable('listings');
    if (!hasTable) return;

    const hasMake = await knex.schema.hasColumn('listings', 'make');
    const hasModel = await knex.schema.hasColumn('listings', 'model');
    if (!hasMake || !hasModel) return;

    const hasIndex = await knex.schema.hasIndex?.('listings', 'listings_make_model_index');
    if (hasIndex) return;

    await knex.schema.alterTable('listings', (table) => {
      table.index(['make', 'model'], 'listings_make_model_index');
    });
  },

  async down(knex) {
    const hasTable = await knex.schema.hasTable('listings');
    if (!hasTable) return;

    await knex.schema.alterTable('listings', (table) => {
      table.dropIndex(['make', 'model'], 'listings_make_model_index');
    });
  },
};
