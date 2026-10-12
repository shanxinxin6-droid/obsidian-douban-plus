# Douban Plus

Browse your Douban collection in Obsidian using cards, a cover shelf, or a collection timeline.

[简体中文](README.md) · [Downloads](https://github.com/shanxinxin6-droid/obsidian-douban-plus/releases) · [Issues](https://github.com/shanxinxin6-droid/obsidian-douban-plus/issues)

Based on [Wanxp/obsidian-douban](https://github.com/Wanxp/obsidian-douban), independently maintained by **shanxinxin6-droid**, and distributed under GPLv3. This project handles its own support and enhancements.

**0.1.0 is a testing release.** Distribution is through GitHub Releases, BRAT, and manual installation, outside the official Obsidian community directory. GitHub's source archives are not installable plugin packages.

## Features

- Local dashboard for movies, TV series, books, music, games, stage productions, and Douban notes.
- Card, cover, and timeline layouts with saved preferences.
- Local title/tag search, type/state/rating/year filters, grouping, sorting, and result counts.
- Online Douban search and template-based imports using the globe-and-search toolbar button.
- Upstream batch collection sync for movies, TV series, books, music, and games, with progress and cancellation.
- Whole-note imports automatically receive stable `douban_` frontmatter, even if custom templates omit dashboard fields.
- Metadata refresh preserves the existing note body by default. Force overwrite regenerates the body.
- Legacy configuration import and property repair with previews, backups, and restore.

The dashboard reads local notes without a login. Remote covers need network access; local covers remain available offline. The timeline shows current collection dates rather than a history of repeated viewing or state changes.

## Installation

### BRAT

1. Install and enable [BRAT](https://github.com/TfTHacker/obsidian42-brat) from Obsidian's community plugins.
2. In BRAT settings, choose **Add a beta plugin** and enter:

   ```text
   https://github.com/shanxinxin6-droid/obsidian-douban-plus
   ```

3. Select an available release, initially `0.1.0`, and install it.
4. Enable **Douban Plus**. Use BRAT to check for updates; a frozen version must be changed explicitly to upgrade.

BRAT needs a publicly accessible GitHub Release with individual plugin assets. Source commits and draft releases alone are insufficient. UI wording varies by BRAT version.

### Manual download and updates

Download `obsidian-douban-plus-0.1.0.zip` from [Release assets](https://github.com/shanxinxin6-droid/obsidian-douban-plus/releases), not the GitHub source archive. Extract its `obsidian-douban-plus` folder into `<vault>/.obsidian/plugins/`, or your custom configuration directory. The folder must directly contain `main.js`, `manifest.json`, and `styles.css`; keep the supplied license, attribution, source, and installation files. Restart Obsidian and enable Douban Plus.

Obsidian does not import ZIP files directly. To update, disable the plugin, replace the release files, and enable it again. **Keep your existing `data.json` and `backups` folder.** Manual installs require manual updates or BRAT.

## Getting started

Configure output paths, note names, and templates in **Settings → Douban Plus**. If switching from the original plugin, use **Advanced → Import original configuration**, preview the selected/read/pasted JSON, and confirm. This imports settings, not template or note files; login credentials are excluded.

Log in within Plus to access personal collection data. Open the dashboard using the ribbon button or command, then import an item through online search or choose a batch sync scope. Use the layout menu and detailed filters to browse local records.

New Plus imports normally do not need legacy repair. Existing notes can be previewed under **Advanced → Migrate/repair note properties** before selecting any writes. Both plugins can be installed, but use one at a time for sync into shared files. Back up your vault before bulk changes.

## Data and compatibility

Plugin-managed `douban_` frontmatter contains identity, type, title, cover, ratings, state, dates, and tags. Custom fields and the body are preserved by default; YAML formatting and comments may change. Douban ratings use 0–10, personal ratings use 1–5, and unavailable values stay unknown.

Online operations and remote covers access Douban services, including `douban.com` and `doubanio.com`. Optional PicGo support uses your configured local upload service and destination. Login cookies and settings are stored in the plugin's local `data.json` without additional credential encryption; migration backups live in `backups`. Remove credentials and personal data before sharing configurations or logs.

The manifest declares Obsidian **1.4.4** as the minimum; that version has not been tested on a real installation. Basic dashboard and some migration flows were verified on **Windows desktop Obsidian 1.14.4**. Mobile and full live-account login/search/sync acceptance remain pending. Automated network tests use mock responses. This release is intended initially for desktop testing.

Douban restrictions or site changes can break network operations without removing local notes. Stage productions and notes support local display and upstream individual imports, without additional batch collection sync.

## Development

Use Node.js **24**:

```sh
npm ci
npm run typecheck
npm run test:unit
npm run package:plugin
```

`npm run dev` watches the source. `npm run deploy:dev` deploys to the separate `.dev-vault`. Packages are in `dist/`; dependencies, test vaults, login settings, and build artifacts are excluded from Git. Detailed documentation is currently in Chinese:

- [Development and metadata](docs/DEVELOPMENT.md)
- [Migration](docs/MIGRATION.md)
- [Test report and limitations](docs/TEST_REPORT.md)
- [Repository and release instructions](docs/RELEASING.md)
- [Changelog](CHANGELOG.md)

## License and credits

Thanks to **Wanxp and the obsidian-douban contributors**. Upstream Git history and existing source notices are preserved, including the login component's Weread plugin reference. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Compiled distributions include bundled dependencies' licenses in `THIRD_PARTY_NOTICES.txt`. This is an independent project, unaffiliated with Douban or Obsidian.