# mobilegym-data

Companion dataset for the **mobile-gym** research environment, a
platform for training and evaluating vision-language agents that
operate mobile user interfaces.

## What is in this package

| Path           | Description                                                      |
|----------------|------------------------------------------------------------------|
| `bilibili/`    | Synthetic Bilibili-style content (images, post and user metadata)|
| `ebay/`        | Synthetic eBay-style product and listing data                    |
| `redbook/`     | Synthetic RedNote (Xiaohongshu)-style content and assets         |
| `spotify/`     | Spotify-style music catalog, artwork and metadata      |
| `map/`         | Map data used by the simulated Maps app       |
| `themes/`      | Sample theme packages used by the simulated ThemeStore app       |
| `wallpapers/`  | Default wallpaper assets for the simulated launcher              |

## Versioning

Each release of this package is tagged with a version that matches a
compatible version of the mobile-gym code repository. Use the same
release tag on both sides to ensure schema and asset compatibility.

## How to use

Download the latest release tarball and extract it next to your
mobile-gym code checkout:

```bash
curl -L -o mobilegym-data.tar.gz \
  https://github.com/Purewhiter/mobilegym/releases/download/data-v0.1.0/mobilegym-data-v0.1.0.tar.gz
tar -xzf mobilegym-data.tar.gz
```

The directory must be at `mobilegym-data/` adjacent to the code
checkout (the Vite dev middleware serves it at `/cdn`). For deployed
builds, set the `VITE_CDN_BASE` environment variable to a URL that
serves these files (e.g. an R2/CF mirror). See the mobile-gym
repository for details.

## Licensing

- **Dataset compilation and synthetic content authored by the
  maintainers**: Creative Commons Attribution-NonCommercial 4.0
  International (CC BY-NC 4.0). See `LICENSE`.
- **Underlying author copyright in third-party content**: NOT
  relicensed by this package; remains with the original creators.
- **Trademarks, dataset provenance, position on AI / ML training, and
  takedown procedure**: see `DISCLAIMER.md`.

This package is intended for **non-commercial academic research only**.

## Citation

If you use this dataset, please cite the accompanying paper:

```bibtex
@misc{mobilegym2026,
  title  = {mobile-gym: <paper title placeholder>},
  author = {<author list placeholder>},
  year   = {2026},
  note   = {<venue or arXiv id placeholder>}
}
```

## Contact

For takedown requests, dataset issues, or questions, please open an
issue on the mobile-gym code repository or contact the maintainers.
