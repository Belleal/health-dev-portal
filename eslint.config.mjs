import { defineConfig } from "eslint/config";
import globals from "globals";
import js from "@eslint/js";

export default defineConfig( [ {
    // `.superpowers` holds the design companion's working files and `.fixtures` downloaded public workbooks; neither
    // is source. The mockups under docs/ are HTML fragments, not modules.
    ignores: [ "eslint.config.mjs", ".superpowers/**", ".fixtures/**", "docs/**" ],
}, {
    extends: [ js.configs.recommended ],

    languageOptions: {
        globals: {
            ...globals.node,
        },

        ecmaVersion: "latest",
        sourceType: "commonjs",
    },

    rules: {
        "no-unused-vars": [ "warn", { "args": "after-used" } ]
    },
} ] );
