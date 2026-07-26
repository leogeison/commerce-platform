import react from "@leogeison/eslint-config/react";

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
];
