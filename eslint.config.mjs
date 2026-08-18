import react from "@leogeison/eslint-config/react";
import node from "@leogeison/eslint-config/node";

export default [
  {
    ignores: [
      "**/dist",
      "**/node_modules",
      "**/coverage",
      "**/.next",
      "**/out",
      "**/next-env.d.ts",
    ],
  },
  ...react,
  {
    files: ["scripts/**/*.mjs", "packages/*/tokens/**/*.mjs"],
    ...node[node.length - 1],
  },
  {
    // `react/prop-types` (regra legada pré-TypeScript, herdada de
    // `reactPlugin.configs.recommended` via `@leogeison/eslint-config/react`)
    // resolve tipos de props por casamento de padrão na AST, não por
    // checagem de tipos real. Ela só reconhece `React.HTMLAttributes`,
    // `React.HTMLElement` e `React.HTMLProps` como "seguros" — qualquer
    // variante mais específica de `*HTMLAttributes<T>` (ex.:
    // `ButtonHTMLAttributes`, usado em packages/ui/src/components/button.tsx)
    // não é resolvida, gerando falso positivo em props reais (`type`,
    // `className`) que o TypeScript já valida integralmente em tempo de
    // compilação (`strict: true`). Desligar aqui é a recomendação oficial do
    // próprio eslint-plugin-react para bases 100% TypeScript — escopo restrito
    // a `packages/ui`, sem tocar `@leogeison/eslint-config` nem nenhum outro
    // app/pacote do monorepo.
    files: ["packages/ui/**/*.{ts,tsx}"],
    rules: {
      "react/prop-types": "off",
    },
  },
];
