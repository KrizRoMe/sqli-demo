// Mini-motor SQL de juguete, SOLO para fines educativos en el navegador.
// NO es un motor SQL real, NO debe usarse en producción. Implementa lo mínimo
// para que las inyecciones que enseñamos en clase se ejecuten de verdad:
//
//   • SELECT ... FROM tabla [WHERE col = valor]
//   • UNION SELECT ...        (mismo nº y tipos de columnas que la 1ª SELECT)
//   • Comentarios '--'        (ignora el resto de la línea)
//
// Toda la lógica es un parser naïf por regex, ejecutada 100% en el cliente.
// La "base de datos" es un array estático declarado abajo.

export type Row = Record<string, string | number>;
export type QueryResult = { rows: Row[]; columns: string[]; error?: string };

const DB: Record<string, Row[]> = {
  users: [
    { id: 1, username: "admin",  password: "S3cr3t!Admin",  role: "admin",  email: "admin@uni.edu" },
    { id: 2, username: "maria",  password: "maria2026",    role: "editor", email: "maria@uni.edu" },
    { id: 3, username: "carlos", password: "carlos_pwd",   role: "viewer", email: "carlos@uni.edu" },
    { id: 4, username: "kriz",   password: "kriz_dev",     role: "admin",  email: "kriz@uni.edu" },
  ],
  products: [
    { id: 1, name: "Laptop X1",   price: 1200, stock: 8 },
    { id: 2, name: "Mouse Óptico", price: 25,   stock: 120 },
    { id: 3, name: "Teclado Mec",  price: 95,   stock: 30 },
  ],
};

// --- Helpers -----------------------------------------------------------------

const stripComments = (sql: string): string =>
  sql.replace(/--.*$/gm, "").trim();

const splitTopLevel = (sql: string, sep: string): string[] => {
  // Divide por `sep` solo cuando está fuera de comillas. Suficiente para UNION.
  const out: string[] = [];
  let depth = 0, inStr: string | null = null, buf = "";
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (inStr) {
      buf += c;
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === "'" || c === '"') { inStr = c; buf += c; continue; }
    if (c === "(") depth++;
    else if (c === ")") depth--;
    if (depth === 0 && sql.slice(i, i + sep.length).toUpperCase() === sep.toUpperCase()) {
      out.push(buf); buf = ""; i += sep.length - 1; continue;
    }
    buf += c;
  }
  out.push(buf);
  return out.map((s) => s.trim()).filter(Boolean);
};

const evalScalar = (expr: string, row: Row): unknown => {
  const t = expr.trim();
  // número literal
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  // string literal
  if (/^['"].*['"]$/.test(t)) return t.slice(1, -1);
  // NULL
  if (/^NULL$/i.test(t)) return null;
  // referencia a columna
  if (t in row) return row[t];
  // true/false
  if (/^TRUE$/i.test(t))  return true;
  if (/^FALSE$/i.test(t)) return false;
  return undefined;
};

// Parser recursivo de precedencia (estilo Pratt) — simple y correcto para
// lo que necesitamos: columnas, números, strings, AND/OR, comparadores.
const parseOr = (tokens: string[], pos: { i: number }, row: Row): { v: boolean; pos: number } => {
  let { v, pos: p } = parseAnd(tokens, pos, row);
  while (p < tokens.length && tokens[p].toUpperCase() === "OR") {
    const right = parseAnd(tokens, { i: p + 1 }, row);
    v = v || right.v;
    p = right.pos;
  }
  return { v, pos: p };
};

const parseAnd = (tokens: string[], pos: { i: number }, row: Row): { v: boolean; pos: number } => {
  let { v, pos: p } = parseCmp(tokens, pos, row);
  while (p < tokens.length && tokens[p].toUpperCase() === "AND") {
    const right = parseCmp(tokens, { i: p + 1 }, row);
    v = v && right.v;
    p = right.pos;
  }
  return { v, pos: p };
};

const parseCmp = (tokens: string[], pos: { i: number }, row: Row): { v: boolean; pos: number } => {
  if (pos.i >= tokens.length) return { v: true, pos: pos.i };
  const left = evalScalar(tokens[pos.i], row);
  let p = pos.i + 1;
  if (p >= tokens.length) return { v: Boolean(left), pos: p };
  const op = tokens[p];
  if (!/^(=|<>|<=|>=|<|>)$/.test(op)) return { v: Boolean(left), pos: p };
  p++;
  const right = evalScalar(tokens[p] ?? "NULL", row);
  let v = false;
  switch (op) {
    case "=":  v = left == right; break;
    case "<>": v = left != right; break;
    case "<":  v = Number(left) <  Number(right); break;
    case ">":  v = Number(left) >  Number(right); break;
    case "<=": v = Number(left) <= Number(right); break;
    case ">=": v = Number(left) >= Number(right); break;
  }
  return { v, pos: p + 1 };
};

const evalWhere = (clause: string, row: Row): boolean => {
  // Tokeniza separando también los operadores de comparación que aparecen
  // sin espacios (p.ej. `1=1`, `x<5`, `a>=b`). El orden importa: `>=` antes que `>`.
  const tokens = clause
    .replace(/\(/g, " ( ")
    .replace(/\)/g, " ) ")
    .replace(/(<>|<=|>=|=|<|>)/g, " $1 ")
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) return true;
  try {
    return parseOr(tokens, { i: 0 }, row).v;
  } catch {
    return false;
  }
};

// --- API pública -------------------------------------------------------------

export function runQuery(rawSql: string): QueryResult {
  let sql = stripComments(rawSql);
  if (!sql) return { rows: [], columns: [], error: "Consulta vacía." };

  // Detectar UNION
  const selects = splitTopLevel(sql, " UNION ");
  if (selects.length > 1 && !/UNION/i.test(sql.replace(/UNION ALL/i, ""))) {
    // ok
  }
  if (selects.length > 2) {
    return { rows: [], columns: [], error: "Solo se admite una UNION." };
  }

  // Parsear la 1ª SELECT
  const firstRe = /^SELECT\s+(.+?)\s+FROM\s+([a-zA-Z_][\w]*)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER BY\s+([a-zA-Z_]\w*)(?:\s+(ASC|DESC))?)?\s*;?\s*$/i;
  const m1 = selects[0].match(firstRe);
  if (!m1) return { rows: [], columns: [], error: "Sintaxis no soportada. Use: SELECT cols FROM tabla [WHERE ...]" };

  const [, colsRaw, tableRaw, whereRaw] = m1;
  const table = tableRaw.toLowerCase();
  if (!DB[table]) return { rows: [], columns: [], error: `Tabla inexistente: ${table}` };

  const columns = colsRaw === "*"
    ? Object.keys(DB[table][0] ?? {})
    : colsRaw.split(",").map((c) => c.trim());

  const where = whereRaw ? whereRaw : "";
  const runOnTable = (tbl: string, cols: string[], wh: string): Row[] => {
    if (!DB[tbl]) return [];
    return DB[tbl].filter((row) => (wh ? evalWhere(wh, row) : true)).map((row) => {
      const out: Row = {};
      for (const c of cols) out[c] = (row as Row)[c] as string | number;
      return out;
    });
  };

  let rows = runOnTable(table, columns, where);

  // UNION
  if (selects.length === 2) {
    const m2 = selects[1].match(firstRe);
    if (!m2) return { rows: [], columns: [], error: "UNION con sintaxis no soportada." };
    const [, cols2, tbl2, wh2] = m2;
    const cols2List = cols2 === "*"
      ? Object.keys(DB[tbl2.toLowerCase()]?.[0] ?? {})
      : cols2.split(",").map((c) => c.trim());
    if (cols2List.length !== columns.length) {
      return {
        rows: [],
        columns,
        error: `UNION requiere el mismo nº de columnas: 1ª SELECT tiene ${columns.length}, UNION tiene ${cols2List.length}.`,
      };
    }
    const extra = runOnTable(tbl2.toLowerCase(), cols2List, wh2 ?? "").map((r) => {
      // Renombrar columnas al esquema de la 1ª SELECT
      const out: Row = {};
      columns.forEach((c, i) => { out[c] = r[cols2List[i]]; });
      return out;
    });
    rows = rows.concat(extra);
  }

  return { rows, columns };
}

// --- Autenticación simulada (el caso "login" es EL ejemplo clásico) -----------

export type LoginResult = {
  query: string;
  result: QueryResult;
  authenticated: boolean;
  matchedUser?: Row;
  note: string;
};

export function simulateLogin(
  username: string,
  password: string,
  mode: "vulnerable" | "safe"
): LoginResult {
  const safe = mode === "safe";
  // Concatenación directa → vulnerable; placeholder `?` + escape → parametrizada.
  const query = safe
    ? `SELECT * FROM users WHERE username = ? AND password = ?;`
    : `SELECT * FROM users WHERE username = '${username}' AND password = '${password}';`;

  if (safe) {
    // En modo parametrizado, los valores NO entran al parser SQL: se filtran como literales.
    const r = runQuery(
      `SELECT * FROM users WHERE username = '${escapeSql(username)}' AND password = '${escapeSql(password)}';`
    );
    const match = r.rows.find(
      (u) => u.username === username && u.password === password
    );
    return {
      query,
      result: r,
      authenticated: Boolean(match),
      matchedUser: match,
      note: match
        ? "✅ Credenciales válidas: la consulta devolvió exactamente 1 fila."
        : r.rows.length > 0
        ? "⚠️  La consulta devolvió filas pero ninguna coincide con las credenciales exactas: un atacante NO puede forzar el login inyectando ' OR 1=1 -- porque los valores se enlazan como literales."
        : "Sin coincidencias. La cadena inyectada se trató como un solo string literal, no como SQL.",
    };
  }

  const r = runQuery(query);
  const match = r.rows[0];
  return {
    query,
    result: r,
    authenticated: Boolean(match),
    matchedUser: match,
    note: match
      ? "🚨 VULNERABLE: la inyección cerró la comilla, comentó la verificación de password y devolvió la primera fila. ¡El atacante entra como admin sin saber la contraseña!"
      : "Sin coincidencias.",
  };
}

function escapeSql(s: string): string {
  return s.replace(/'/g, "''");
}