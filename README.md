# Netflix's Scoot

Sliding-block puzzle editor and minimum-move solver, written in TypeScript.

Website: https://nahiphog.github.io/NetflixScoot/

The application source is in `scoot/`. See [the application guide](scoot/README.md) for editing, solving, and playback controls.

## Development

```sh
cd scoot
npm ci
npm run dev
```

## GitHub Pages

Pushes to `main` run `.github/workflows/pages.yml`: install locked dependencies, run the test suite, build with the `/NetflixScoot/` base path, and publish the build to GitHub Pages. The workflow can also be run manually from GitHub Actions.

To reproduce the Pages build locally, run `npm run build:pages` in `scoot/`. The output is `scoot/dist/`. The ordinary `npm run build` retains a root base path for other hosts.

The prior Sites deployment remains independent. Its local Git metadata is preserved in the ignored `.sites-local/scoot-git-history/` folder; the GitHub repository now tracks the application files directly.
