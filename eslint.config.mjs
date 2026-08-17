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
];
