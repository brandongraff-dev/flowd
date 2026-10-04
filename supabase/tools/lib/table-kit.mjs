// Tiny builders for the table-config files.

/** A named CHECK constraint. */
export const chk = (name, expr) => ({ name, expr });

/**
 * A unique index. `cols` is a list of column names; `expr` is a raw column/expression list (for expression indexes).
 * Options: where (partial), nullsNotDistinct (PG15+).
 */
export const uq = (name, opts) => ({ name, ...opts });

/** A plain index. `def` is everything after the table name: "(cols) where ..." or "using gin (col)". */
export const ix = (name, def) => ({ name, def });

/** A raw column for local tables. */
export const col = (name, sql, opts = {}) => ({ name, sql, ...opts });
