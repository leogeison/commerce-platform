import base from "@leogeison/eslint-config";

export default [
  {
    ignores: ["**/dist", "**/node_modules", "**/coverage"],
  },
  ...base,
];
