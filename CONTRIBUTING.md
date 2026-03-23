# Contributing to Mira

Thanks for considering contributing!

We welcome contributions of all sizes, from fixing typos to adding new features.

---

## How to Contribute

1. Fork the repository
2. Create a new branch:
   ```bash
   git checkout -b feature/my-feature
   ```
3. Make your changes
4. Run formatting and lint checks (see below)
5. Open a pull request

## Development Setup

**Prerequisites:** Node.js 25+ and npm

If you don't have Node.js installed, you can run the install script:

**Windows:** 
```bash
powershell -ExecutionPolicy Bypass -File scripts\install-node.ps1
```

**macOS/Linux:** 
```bash
bash scripts/install-node.sh
```

Then run
```bash
npm install # For dependencies
```

For desktop app instructions, see [`apps/desktop/README.md`](apps/desktop/README.md).


## Guidelines

- Keep code clean and consistent
- Follow the existing style and folder structure
- Format your code with Prettier before committing:
  ```bash
  npm run format
  or enable auto-format
- Check for linting issues before committing:
  ```bash
  npm run lint
  ```
- Explain your changes clearly in PR descriptions
- Small, focused PRs are easier to review and merge

## Reporting Issues

- Check existing issues before opening a new one
- Describe steps to reproduce clearly
- Include OS and version info

## Additional Notes

- All contributions must respect the LICENSE
- By contributing, you agree to license your code under the same license as Mira
- Only submit code that you have the rights to
- Be kind and patient
