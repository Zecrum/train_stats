import js from "@eslint/js";
import pluginVue from "eslint-plugin-vue";
import globals from "globals";

export default [
  js.configs.recommended,
  // "essential" attrape les vraies erreurs de template (bugs) sans imposer de style
  // de formatage — le projet n'a pas été écrit selon les règles stylistiques de
  // "flat/recommended", donc les activer noierait les vrais problèmes sous du bruit.
  ...pluginVue.configs["flat/essential"],
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, __APP_VERSION__: "readonly" },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "vue/multi-word-component-names": "off",
    },
  },
  {
    ignores: ["dist/**"],
  },
];
