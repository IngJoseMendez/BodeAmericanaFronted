// ── EL LINTER, CALIBRADO PARA LO QUE DE VERDAD ROMPE ──────────────
//
// Esto se monta por tres errores de un mismo día, todos míos y todos invisibles
// para el build y para las pruebas:
//
//   · `totalVenta` leía `gruposElegidos`, declarado 150 líneas más abajo. Un
//     const en zona muerta. La pantalla de Ventas reventó en producción con
//     «Cannot access 'te' before initialization».        -> no-use-before-define
//   · `FileText` usado en un botón y nunca importado. El build no dice nada:
//     eso revienta al PINTARSE, no al construir.                   -> no-undef
//   · un corte de parche se llevó `ventasFiltradas` y un `</div>`. El segundo
//     lo cazó el build; el primero no.                   -> no-undef otra vez
//
// Rollup no comprueba orden de inicialización ni identificadores libres, y las
// pruebas de este proyecto son de las librerías, no de las pantallas. Entre el
// commit y el despliegue no había nada que pudiera verlos.
//
// LA REGLA DE CALIBRACIÓN: aquí sólo es ERROR lo que rompe la pantalla.
//
// Un linter que escupe doscientos avisos de estilo sobre un código que ya
// existe no se usa: se aprende a ignorar, y entonces deja de avisar también de
// lo que importa. Todo lo estilístico queda apagado a propósito. Si algún día
// se quiere formato, eso es trabajo de un formateador, no de esto.

import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    // `fixtures` lleva un error A PROPÓSITO: es el archivo con el que se
    // demuestra que la comprobación de orden de render salta. Si el linter lo
    // mirara, su aviso se leería como un problema del proyecto.
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'tests/fixtures/**'],
  },

  // ── El código de la aplicación ──────────────────────────────────
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...js.configs.recommended.rules,

      // ── LO QUE ROMPE LA PANTALLA: error ────────────────────────
      //
      // Un identificador que no existe. Es el que habría cazado `FileText`.
      'no-undef': 'error',

      // ── POR QUÉ ESTA VA EN AVISO Y NO EN ERROR ─────────────────
      //
      // Es la regla que ve el crash de Ventas, pero ve además otras noventa
      // referencias que NO rompen nada: en este código los efectos van arriba
      // y las funciones de carga abajo, así que `useEffect(() => loadVentas())`
      // referencia un `const` declarado después y es perfectamente seguro —el
      // callback corre cuando ya existe—. Con noventa errores, el que importa
      // no se ve, y un linter que no se puede leer no se usa.
      //
      // El subconjunto MORTAL —un const cuyo inicializador, que se evalúa en el
      // momento, lee otro const de más abajo— lo caza
      // `tests/orden-de-render.check.mjs`, que corre con las pruebas y tiene
      // cero falsos positivos. Se demuestra que salta con
      // `tests/fixtures/PantallaRota.jsx`, que reproduce el error de verdad.
      'no-use-before-define': ['warn', {
        functions: false,
        classes: false,
        variables: true,
        allowNamedExports: true,
      }],

      // JSX usa los identificadores de forma que `no-unused-vars` no ve: sin
      // esto, cada icono importado parecería sin usar y el aviso real se
      // perdería entre cien falsos.
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'off',   // React 18, sin import obligatorio
      'react/react-in-jsx-scope': 'off',

      // Un hook dentro de un if o de un bucle rompe React de formas que no se
      // entienden mirando la pantalla. Esto no es estilo.
      'react-hooks/rules-of-hooks': 'error',

      // ── LO QUE CONVIENE SABER: aviso ───────────────────────────
      //
      // Las dependencias de los efectos. Va en AVISO y no en error a
      // propósito: este código las incumple en sitios donde está razonado y
      // escrito, con su `eslint-disable-next-line` al lado. Ponerlo en error
      // obligaría a mentirle al linter o a romper esos razonamientos.
      'react-hooks/exhaustive-deps': 'warn',

      // Variables y argumentos sin usar. Útil -una función muerta es una pista
      // falsa para quien lea- pero no rompe nada, así que aviso. Los argumentos
      // que se ignoran a propósito se nombran con `_`.
      'no-unused-vars': ['warn', {
        args: 'after-used',
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',   // los catch vacíos de este código son adrede
      }],

      // ── LO QUE NO ES ASUNTO SUYO: apagado ──────────────────────
      'no-empty': 'off',           // hay catch vacíos razonados
      'no-console': 'off',         // console.error es el log de este servidor
      'react/prop-types': 'off',   // no hay PropTypes en el proyecto
      'react/display-name': 'off',
      'react/no-unescaped-entities': 'off',
    },
  },

  // ── Las comprobaciones, que corren en Node ──────────────────────
  {
    files: ['tests/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': 'warn',
      'no-empty': 'off',
    },
  },

  // ── Los archivos de configuración ───────────────────────────────
  {
    files: ['*.config.js', '*.config.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
];
