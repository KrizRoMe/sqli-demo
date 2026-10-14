# SQL Injection — Demo Educativa

Una página web estática, **construida con Next.js + TypeScript**, que
muestra de manera controlada cómo funciona **SQL Injection** y cómo se
cierra el agujero con **consultas parametrizadas**.

> ⚠️ Es **solo una simulación**. El "motor SQL" está implementado como un
> parser naïf en JavaScript que vive 100% en el navegador. **No hay
> base de datos real, no hay servidor, no se envía nada a la red.**

Diseñado para mostrar en clase a alumnos: cada pestaña enseña una cosa
distinta y se puede demostrar en vivo mientras se explica.

---

## Qué muestra

| Pestaña        | Qué enseña                                                                                      |
|----------------|--------------------------------------------------------------------------------------------------|
| **Laboratorio** | 3 vectores clásicos (bypass, UNION, comentario `--`) lado a lado: vulnerable vs seguro.        |
| **Login bypass** | Pantalla de login real. Introduce `' OR 1=1 --` y entra como admin sin contraseña.           |
| **Consultas libres** | Editor para que el alumno pruebe sus propias queries y payloads.                        |

Cada query vulnerable resalta exactamente la parte inyectada en la
SQL final ejecutada, para que el alumno vea **dónde** muere el código
cuando concatena strings.

---

## Stack

- **Next.js 15** (App Router) en modo `output: "export"` → sitio estático.
- **TypeScript** estricto.
- **CSS plano** (sin frameworks). Tema oscuro permanente, alto contraste.
- **Sin backend.** Cero dependencias de runtime adicionales más allá de Next.

---

## Cómo correrlo localmente

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # genera ./out (sitio estático listo para Pages)
```

---

## Despliegue

El proyecto ya está configurado para **GitHub Pages** bajo
`/sqli-demo/`. La rama `gh-pages` se publica automáticamente.

URL en producción: <https://krizrome.github.io/sqli-demo/>

---

## Aviso de uso

Este código existe **únicamente con fines pedagógicos**. No usar
ninguna de las técnicas aquí mostradas contra sistemas sin autorización
expresa del propietario.