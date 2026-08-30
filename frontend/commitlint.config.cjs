// Conventional Commits ("Comilint" no AGENTS.md = commitlint).
// Rodado pelo hook commit-msg do lefthook.
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "chore", "docs", "test", "refactor", "perf", "ci", "build", "revert"],
    ],
    "subject-case": [0],
    "header-max-length": [2, "always", 100],
  },
};
