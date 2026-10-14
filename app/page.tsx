"use client";

import { useMemo, useState } from "react";
import {
  runQuery,
  simulateLogin,
  type LoginResult,
  type QueryResult,
} from "@/lib/sqlEngine";

type AttackKey = "bypass" | "union" | "comment";

type AttackDef = {
  title: string;
  subtitle: string;
  // SQL vulnerable completa que verá el alumno en el textarea
  vulnerableSql: string;
  // Versión segura equivalente (solo cambia concat por placeholders)
  safeSql: string;
  // Nota explicativa
  explain: { title: string; body: string[] };
};

const ATTACKS: Record<AttackKey, AttackDef> = {
  bypass: {
    title: "1. Bypass de autenticación (login bypass)",
    subtitle:
      "El caso clásico: cerrar la comilla, añadir una tautología y comentar la verificación de password.",
    vulnerableSql:
      "SELECT * FROM users WHERE username = '' OR 1=1 --' AND password = 'lo_que_sea';",
    safeSql:
      "SELECT * FROM users WHERE username = ? AND password = ?;",
    explain: {
      title: "¿Por qué funciona el ataque?",
      body: [
        "La query vulnerable termina así:",
        "…WHERE username = '' OR 1=1 --' AND password = 'lo_que_sea'",
        "El ' -- ' comenta todo lo que viene después (incluida la comprobación de password).",
        "Como 1=1 siempre es verdadero y OR se evalúa con la primera condición verdadera, la SELECT devuelve TODAS las filas.",
        "El código del backend toma la primera fila como «usuario autenticado» y concede acceso.",
        "La versión con placeholders trata '' OR 1=1 -- como un único string literal: ese username no existe, no hay fila, login falla.",
      ],
    },
  },
  union: {
    title: "2. Exfiltración con UNION SELECT",
    subtitle:
      "Apilar otra SELECT para robar datos de otra tabla o enumerar columnas.",
    vulnerableSql:
      "SELECT id, name FROM products WHERE name = 'X' UNION SELECT username, password FROM users --';",
    safeSql:
      "SELECT id, name FROM products WHERE name = ?;",
    explain: {
      title: "¿Por qué funciona el ataque?",
      body: [
        "UNION pega los resultados de una segunda SELECT al final de la primera.",
        "La condición es que ambas devuelvan el mismo número y tipo de columnas.",
        "Aquí el atacante pide (username, password) — dos columnas, igual que la SELECT padre (id, name).",
        "Resultado: el frontend muestra nombres de usuario y contraseñas reales.",
        "Con placeholders la cadena entera se trata como literal y nunca alcanza al parser SQL.",
      ],
    },
  },
  comment: {
    title: "3. Comentario '--' para mutilar la consulta",
    subtitle:
      "Acabar la lógica original y descartar la parte que verifica credenciales.",
    vulnerableSql:
      "SELECT * FROM users WHERE username = 'admin'-- AND password = 'lo_que_sea';",
    safeSql:
      "SELECT * FROM users WHERE username = ? AND password = ?;",
    explain: {
      title: "¿Por qué funciona el ataque?",
      body: [
        "Cerrar la comilla con 'admin' y añadir -- trunca la consulta original.",
        "El resto (AND password = '…') está comentado y se ignora.",
        "El atacante entra como admin sin proporcionar la contraseña.",
        "Con placeholders la cadena completa se evalúa como un único string: si no existe un usuario llamado literalmente 'admin'--, no hay login.",
      ],
    },
  },
};

const PRESETS = [
  { label: "Producto barato (price < 30)", sql: "SELECT id, name, price FROM products WHERE price < 30;" },
  { label: "Usuarios admin",              sql: "SELECT id, username, role FROM users WHERE role = 'admin';" },
  { label: "Todos los usuarios",          sql: "SELECT id, username, role, email FROM users;" },
];

export default function Page() {
  const [tab, setTab] = useState<"lab" | "login" | "queries">("lab");

  return (
    <main>
      <Header />
      <Nav tab={tab} setTab={setTab} />

      {tab === "lab"     && <LabSection />}
      {tab === "login"   && <LoginSection />}
      {tab === "queries" && <FreeQuerySection />}

      <Footer />
    </main>
  );
}

/* ─────────────────────────── Header / Nav ─────────────────────────── */

function Header() {
  return (
    <header className="hero">
      <div className="hero-inner">
        <div className="badge">Clase 1 · Seguridad en Aplicaciones Web</div>
        <h1>
          SQL Injection: <span className="hero-accent">del fallo al fix</span>
        </h1>
        <p className="lede">
          Una demo interactiva para mostrar <strong>cómo se rompe</strong> una
          consulta SQL mal construida y <strong>cómo se cierra el agujero</strong> con
          consultas parametrizadas. Todo corre en tu navegador: no hay base de
          datos real, no se envía nada al servidor.
        </p>
        <ul className="hero-pills">
          <li>🧪 3 vectores de ataque</li>
          <li>🛡️  Misma consulta en versión segura</li>
          <li>🔍 Query final resaltada para que veas el daño</li>
        </ul>
      </div>
    </header>
  );
}

function Nav({ tab, setTab }: { tab: string; setTab: (t: any) => void }) {
  const items = [
    { id: "lab",     label: "Laboratorio" },
    { id: "login",   label: "Login bypass" },
    { id: "queries", label: "Consultas libres" },
  ] as const;
  return (
    <nav className="tabs">
      {items.map((i) => (
        <button
          key={i.id}
          className={`tab ${tab === i.id ? "active" : ""}`}
          onClick={() => setTab(i.id)}
        >
          {i.label}
        </button>
      ))}
    </nav>
  );
}

/* ─────────────────────────── Lab (3 ataques lado a lado) ─────────────────────────── */

function LabSection() {
  const [vector, setVector] = useState<AttackKey>("bypass");
  const atk = ATTACKS[vector];

  return (
    <section className="container">
      <h2 className="section-title">Laboratorio de inyección</h2>
      <p className="section-sub">
        Cada pestaña muestra <strong>el mismo input</strong> en una versión
        <span className="vuln-pill"> vulnerable</span> y otra
        <span className="safe-pill"> segura</span>. Pulsa en cualquier celda
        para editar y ver el resultado al instante.
      </p>

      <div className="vector-picker">
        {(Object.keys(ATTACKS) as AttackKey[]).map((k) => (
          <button
            key={k}
            className={`vector-btn ${vector === k ? "active" : ""}`}
            onClick={() => setVector(k)}
          >
            {ATTACKS[k].title}
          </button>
        ))}
      </div>

      <div className="vector-head">
        <h3>{atk.title}</h3>
        <p>{atk.subtitle}</p>
      </div>

      <div className="split">
        <SqlBlock
          variant="vulnerable"
          title="❌ Versión vulnerable"
          subtitle="Concatena el input directamente en la query."
          initialSql={atk.vulnerableSql}
        />
        <SqlBlock
          variant="safe"
          title="✅ Versión segura"
          subtitle="Usa placeholders (?) y vincula los valores por separado."
          initialSql={atk.safeSql}
          placeholder="(los valores se enlazan fuera de la SQL — no se concatenan)"
        />
      </div>

      <ExplainBlock vector={vector} />
    </section>
  );
}

function ExplainBlock({ vector }: { vector: AttackKey }) {
  const atk = ATTACKS[vector];
  return (
    <aside className="explain">
      <h4>{atk.explain.title}</h4>
      <ul>
        {atk.explain.body.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>
    </aside>
  );
}

/* ─────────────────────────── Bloque SQL (lado a lado) ─────────────────────────── */

function SqlBlock({
  variant,
  title,
  subtitle,
  initialSql,
  placeholder,
}: {
  variant: "vulnerable" | "safe";
  title: string;
  subtitle: string;
  initialSql: string;
  placeholder?: string;
}) {
  const [sql, setSql] = useState(initialSql);
  const result = useMemo(() => runQuery(sql), [sql]);

  return (
    <div className={`sql-card ${variant}`}>
      <div className="sql-card-head">
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>

      <textarea
        spellCheck={false}
        rows={5}
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        placeholder={placeholder ?? "SELECT … FROM …"}
        className="sql-input"
      />

      <div className="sql-output-label">
        <span>Query ejecutada</span>
        <span className={`tag ${variant}`}>{variant === "vulnerable" ? "riesgosa" : "parametrizada"}</span>
      </div>
      <pre className="sql-output"><Highlighted sql={sql} /></pre>

      <ResultTable result={result} />
    </div>
  );
}

function Highlighted({ sql }: { sql: string }) {
  // Resaltado mínimo: palabras clave + strings + comentarios.
  const tokens = sql.split(/('(?:[^']|'')*'|--.*$)/gm);
  return (
    <>
      {tokens.map((t, i) => {
        if (/^'.*'$/.test(t))      return <span key={i} className="tok-string">{t}</span>;
        if (/^--/.test(t))          return <span key={i} className="tok-comment">{t}</span>;
        return (
          <span key={i}>
            {t.split(/\b(SELECT|FROM|WHERE|UNION|AND|OR|ORDER BY|ASC|DESC|NULL|TRUE|FALSE)\b/g).map((w, j) =>
              /^(SELECT|FROM|WHERE|UNION|AND|OR|ORDER BY|ASC|DESC|NULL|TRUE|FALSE)$/i.test(w)
                ? <span key={`${i}-${j}`} className="tok-kw">{w}</span>
                : <span key={`${i}-${j}`}>{w}</span>
            )}
          </span>
        );
      })}
    </>
  );
}

function ResultTable({ result }: { result: QueryResult }) {
  if (result.error) {
    return <div className="result-error">⚠ {result.error}</div>;
  }
  if (!result.rows.length) {
    return <div className="result-empty">(sin filas)</div>;
  }
  return (
    <div className="result-wrap">
      <table className="result-table">
        <thead>
          <tr>{result.columns.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {result.rows.map((r, i) => (
            <tr key={i}>
              {result.columns.map((c) => <td key={c}>{String(r[c] ?? "")}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="result-meta">{result.rows.length} fila(s)</div>
    </div>
  );
}

/* ─────────────────────────── Login bypass ─────────────────────────── */

function LoginSection() {
  const [mode, setMode] = useState<"vulnerable" | "safe">("vulnerable");
  const [user, setUser] = useState("");
  const [pwd, setPwd] = useState("");
  const [result, setResult] = useState<LoginResult | null>(null);

  const presets = [
    { label: "admin real",      payload: { u: "admin",  p: "S3cr3t!Admin" } },
    { label: "Bypass (inyección)", payload: { u: "admin' --", p: "cualquiera" } },
    { label: "Tautología",        payload: { u: "' OR 1=1 --",   p: "" } },
  ];

  const tryLogin = (u?: string, p?: string) => {
    const _u = u ?? user;
    const _p = p ?? pwd;
    if (u !== undefined) setUser(u);
    if (p !== undefined) setPwd(p);
    setResult(simulateLogin(_u, _p, mode));
  };

  return (
    <section className="container">
      <h2 className="section-title">Login bypass</h2>
      <p className="section-sub">
        El ejemplo más didáctico: pantalla de login real donde el campo
        <em> username </em> se inyecta en una SELECT.
      </p>

      <div className="mode-toggle">
        <button
          className={`mode-btn ${mode === "vulnerable" ? "active" : ""}`}
          onClick={() => { setMode("vulnerable"); setResult(null); }}
        >
          ❌ Versión vulnerable
        </button>
        <button
          className={`mode-btn ${mode === "safe" ? "active" : ""}`}
          onClick={() => { setMode("safe"); setResult(null); }}
        >
          ✅ Versión parametrizada
        </button>
      </div>

      <div className="login-grid">
        <form
          className="login-form"
          onSubmit={(e) => { e.preventDefault(); tryLogin(); }}
        >
          <label>
            Usuario
            <input
              type="text"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="admin"
            />
          </label>
          <label>
            Contraseña
            <input
              type="text"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              placeholder="S3cr3t!Admin"
            />
          </label>
          <button type="submit" className="primary">Entrar</button>

          <div className="presets">
            <small>Pruebas rápidas:</small>
            {presets.map((p) => (
              <button
                type="button"
                key={p.label}
                className="preset"
                onClick={() => tryLogin(p.payload.u, p.payload.p)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </form>

        <div className="login-result">
          <div className="sql-output-label">
            <span>Query generada</span>
            <span className={`tag ${mode}`}>
              {mode === "vulnerable" ? "concatenación" : "parametrizada"}
            </span>
          </div>
          <pre className="sql-output">
            {result ? <Highlighted sql={result.query} /> : <em style={{ opacity: 0.5 }}>— pulsa Entrar —</em>}
          </pre>

          {result && (
            <>
              <div className={`banner ${result.authenticated ? (mode === "vulnerable" ? "bad" : "good") : "neutral"}`}>
                {result.authenticated
                  ? mode === "vulnerable"
                    ? "🚨 Acceso concedido sin contraseña (vulnerable)"
                    : "✅ Acceso concedido con credenciales válidas"
                  : "🔒 Acceso denegado"}
                {result.matchedUser && (
                  <div className="banner-detail">
                    Sesión iniciada como <strong>{String(result.matchedUser.username)}</strong>
                    {" "}(rol: <code>{String(result.matchedUser.role)}</code>)
                  </div>
                )}
              </div>
              <p className="result-note">{result.note}</p>
              <ResultTable result={result.result} />
            </>
          )}
        </div>
      </div>

      <div className="credentials-hint">
        <strong>Cuentas de prueba:</strong>{" "}
        <code>admin / S3cr3t!Admin</code>,{" "}
        <code>maria / maria2026</code>,{" "}
        <code>carlos / carlos_pwd</code>,{" "}
        <code>kriz / kriz_dev</code>.
      </div>
    </section>
  );
}

/* ─────────────────────────── Consultas libres ─────────────────────────── */

function FreeQuerySection() {
  const [sql, setSql] = useState(PRESETS[0].sql);
  const result = useMemo(() => runQuery(sql), [sql]);

  return (
    <section className="container">
      <h2 className="section-title">Consultas libres</h2>
      <p className="section-sub">
        Escribe tu propia SELECT. El parser acepta comentarios <code>--</code>,
        comparadores básicos y <code>UNION</code> con el mismo número de columnas.
      </p>

      <div className="presets-row">
        {PRESETS.map((p) => (
          <button key={p.label} className="preset" onClick={() => setSql(p.sql)}>
            {p.label}
          </button>
        ))}
      </div>

      <textarea
        spellCheck={false}
        rows={4}
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        className="sql-input"
      />

      <div className="sql-output-label">
        <span>Resultado</span>
      </div>
      <ResultTable result={result} />
    </section>
  );
}

/* ─────────────────────────── Footer ─────────────────────────── */

function Footer() {
  return (
    <footer className="site-footer">
      <p>
        Demo educativa · El motor SQL vive solo en tu navegador · Próxima clase:
        <strong> autenticación con roles, JWT y cookies httpOnly</strong>.
      </p>
    </footer>
  );
}