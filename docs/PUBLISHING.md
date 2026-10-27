# Publish to GitHub

The project is prepared as a Git repository. To publish your own copy, authenticate the GitHub CLI and create a repository from this directory.

Run these commands from the InsightPilot project directory:

```bash
gh auth login --hostname github.com --git-protocol https --web
gh auth status
gh repo create insightpilot --public --source=. --remote=origin --push --description "Customer review intelligence with React, TypeScript, FastAPI, SQLite, and optional AI research briefs."
```

The browser login asks you to authorize the GitHub CLI. The create command publishes the committed project to the authenticated account as a public repository. Choose `--private` instead of `--public` if you prefer a private repository.

Open the repository:

```bash
gh repo view --web
```

Check the Actions tab for the automated verification workflow. Once it passes, add the repository URL to your portfolio. GitHub hosts the source; it does not automatically run the FastAPI application. Use the local app for the interview demo.

If a repository named `insightpilot` already exists on your account, choose another name in the create command. If a remote named `origin` already exists, inspect it with `git remote -v` before changing it.

For later updates:

```bash
git add README.md backend frontend docs scripts sample-data .github .gitignore .env.example
git commit -m "Describe the improvement in plain English"
git push
```

The ignore rules exclude API keys, imported databases, dependency folders, and local build output. Review `git diff --cached` before each commit when you add your own data.
