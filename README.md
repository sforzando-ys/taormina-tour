# Teatro Antico di Taormina: simulated acoustics tour

A virtual acoustics tour of two computer models of the ancient theatre of Taormina, Sicily:
**A**, an intact Roman hypothesis, and **B**, a stylised model of the theatre in its present
ruined state. Each building has 24 listening seats. At each seat you see a 360-degree picture of
the drawn model of the study's website and hear a recording (by default a dry, anechoic soprano excerpt)
played through the seat's simulated first-order ambisonic impulse response, which turns with your view.
**The responses are simulated predictions, not recordings.**

- Start page: [`index.html`](index.html) (choose A or B; the switch inside the tour opens the same
  seat in the other building)
- A, intact Roman hypothesis: [`a/`](a/)
- B, present ruin: [`b/`](b/)
- About (what you hear and see, credits, licences, how to cite): [`about.html`](about.html)

Press Start Audio, then drag the picture to look around and pick other seats on the map. Best with
headphones (a simple left/right stereo decode). The tour is a static site built with the
CAVERN Template by Luna Leila Valentin and Celeste Betancur Gutierrez
(<https://github.com/lunavalentin/CAVERN_Template>); it needs no server-side code.

## Simulated, not recorded

> Simulated, not recorded. These responses are the predictions of an uncalibrated computational
> model (COMSOL Multiphysics® v. 6.4 ray acoustics; statistical phase synthesised from ray energy) of
> two states of the theatre: A, an intact Roman hypothesis, and B, the present ruin. This model has
> not been calibrated against measured impulse responses; it is what our model predicts, not what it
> sounded like.

The first-order ambisonic encoding is derived from ray arrival directions at a 1 m-radius
collection cylinder; reverberation-time metrics are unreliable outdoors; no absolute level or
speech-intelligibility claim is made. The headphone decode is a simple left/right stereo decode (no
HRTF, so not binaural; no front-back or height cue). Each response is one random realisation of the
model's ray energy. `about.html` gives the full statement.

## The pictures

The pictures are the study website's own rendering of its drawn model of the theatre (<https://yishanshen.com/acoustic/taormina/>), with one capture-only change to the website's shadow test (a slope-scaled depth bias that removes shadow-acne streaks), captured in a browser at each seat from the website's own seated eye (1.2 m above that model's tread; for seat 1M05, which the website keeps as an input-only seat, at the seat's recorded plan position, 1.2 m above the drawn surface); for the 8 seats per building without a website voice (1M05, 2I12, 3I03, 4I08, 5I12, 6I08, 7I03 and 9M05) the page was seated at the nearest voiced seat, with the camera at the seat's own eye. They show a drawn reconstruction: not photographs, not a claimed historical appearance, and not the geometry the sound was computed in. The sound is simulated in the study's acoustic model, at that model's ear point for the seat; the two models are drawn separately, so the picture's viewpoint and the ear point are not the same place. Seen from the picture's viewpoint and heard at the ear point, the direction toward the simulated voice position differs by at most 2.5 degrees in azimuth and 3.3 degrees in elevation.

## Credits and licences

| Part | Credit | Licence |
|---|---|---|
| Study, method, direction | Taormina acoustics study: Yishan Shen (direction, method, groundwork and supervision; AI agents assisted) | - |
| First-order ambisonic impulse responses and result data (`*/assets/irs/`, `*/config.json`, `*/DataSet.csv`) | Taormina acoustics study; simulation COMSOL Multiphysics® v. 6.4, COMSOL AB (precomputed outputs only; no COMSOL application, vendor software or model files) | Intended [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), **not yet declared**: the study declares its result-data licence at its first data release; until then no reuse licence is granted for them |
| Voice-source directivity (inside the voice responses) | Pörschmann, C. (2023), supplementary material for "A database for the comparison of measured datasets of human voice directivity", Forum Acusticum 2023, Zenodo, doi:[10.5281/zenodo.7834211](https://doi.org/10.5281/zenodo.7834211) | CC BY 4.0 |
| Soprano excerpt (`*/assets/audio/soprano-o-mio-babbino-caro-excerpt.*`) | Dario D'Orazio, University of Bologna, *Anechoic recordings of Italian opera*, Zenodo, doi:[10.5281/zenodo.3628247](https://doi.org/10.5281/zenodo.3628247); Puccini, "O mio babbino caro" from *Gianni Schicchi*, soprano track. Changes: excerpt (10.942 s) of the left channel | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (derived audio) |
| Sample `bacchae-1-63-excerpt.wav` (`*/assets/audio/`), chosen by the project's owner | Euripides, Bacchae 1-63, narrated in Ancient Attic Greek by Ioannis Stratakis; Podium-Arts, YouTube, https://youtu.be/m0EkSYMQp2U. Changes: the first 24.0 s of the narration, both channels averaged. | used by the owner's decision (Yishan Shen, 2026-10-14); the project did not verify the source's terms and this is not a verified entitlement; the project grants no reuse rights for this excerpt. Rights basis in its provenance file: `rights.basis` = "owner decision"; `rights.decision`: "Owner (Yishan Shen) directed on 2026-10-14 that these recordings be used as the tour's samples; the lead did not verify the source terms (Podium-Arts terms unread; Sound Effect Database states a paid single licence). This is the owner's decision, not a verified entitlement." |
| Sample `gladiator-fight-excerpt.wav` (`*/assets/audio/`), chosen by the project's owner | "Gladiator Fight Sound Effect", Sound Effect Database, YouTube, https://youtu.be/wC8NPyIk2Os, (c) 2022. Changes: the whole clip, both channels averaged. | used by the owner's decision (Yishan Shen, 2026-10-14); the project did not verify the source's terms and this is not a verified entitlement; the project grants no reuse rights for this excerpt. Rights basis in its provenance file: `rights.basis` = "owner decision"; `rights.decision`: "Owner (Yishan Shen) directed on 2026-10-14 that these recordings be used as the tour's samples; the lead did not verify the source terms (Podium-Arts terms unread; Sound Effect Database states a paid single licence). This is the owner's decision, not a verified entitlement." |
| Panoramic pictures (`*/assets/images/`) | Taormina acoustics study: the study website's own rendering of its drawn model of the theatre (<https://yishanshen.com/acoustic/taormina/>), captured in a browser at each seat from the website's own seated eye (with one capture-only change to the website's shadow test (a slope-scaled depth bias that removes shadow-acne streaks); for the 8 seats per building without a website voice (1M05, 2I12, 3I03, 4I08, 5I12, 6I08, 7I03 and 9M05) the page was seated at the nearest voiced seat, with the camera at the seat's own eye) and resampled to the tour's equirectangular view (website build: `index.html` SHA-256 `8e9883222d793242...`, `main.js` `15ef1b887ced953f...`); a drawn reconstruction, not a photograph and not the acoustic model's geometry | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/); any terrain shading in the pictures keeps the terrain's upstream terms |
| Plan maps (`*/assets/map.svg`) | Taormina acoustics study | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) |
| Terrain of the acoustic model | Regione Siciliana, S.I.T.R., MDT 2 m, Volo ATA 2012-2013, produced by ICE-GEIE (Stereocarto SA and RPA s.r.l.); SITR metadata records [946](https://www.sitr.regione.sicilia.it/geoportale/it/metadata/details/946) (dataset) and [947](https://www.sitr.regione.sicilia.it/geoportale/it/metadata/details/947) (download service). Acquired through the SITR WCS download service, clipped and sampled for the acoustic model; the pictures draw no terrain surface (the website draws the theatre on plain paper), though the website's sun shadows may be cast by the acoustic model's terrain; no terrain data file is offered. No endorsement by the Regione Siciliana is implied | Upstream terms: [SITR supply and download conditions](https://www.sitr.regione.sicilia.it/costi-di-cessione/) (free non-commercial use of the OGC services, including WCS, subject to the dataset conditions; default CC BY 4.0 download terms) and [SITR portal terms](https://www.sitr.regione.sicilia.it/geoportale/it/Home/Terms); for context, [SITR general reuse policy](https://www.sitr.regione.sicilia.it/licenza-duso/). Non-commercial research display on the project's reviewed reading of these terms: the project's interpretation, not a ruling by the Regione Siciliana or an unrestricted licence; the publication-consent and transfer warnings of SITR's earlier supply procedure remain a limitation. The terrain keeps its upstream rights, separate from this site's licences, which neither replace nor restrict them |
| Georeference and footprint check | © OpenStreetMap contributors | [openstreetmap.org/copyright](https://www.openstreetmap.org/copyright) |
| Tour template (`*/index.html`, `*/scripts/`, `*/sw.js`, `*/LICENSE`) | CAVERN Template by Luna Leila Valentin and Celeste Betancur Gutierrez, <https://github.com/lunavalentin/CAVERN_Template>, commit `f54c6afd`; five of its files are changed for this tour (`index.html`, `sw.js`, `scripts/audio.js`, `scripts/main.js`, `scripts/map.js`; `about.html` lists the changes). The template fixes proposed from this project were merged into the template upstream ([pull request #1](https://github.com/lunavalentin/CAVERN_Template/pull/1), 2026-10-29); this site serves commit `f54c6afd` with its own patches | The CAVERN Template Non-Commercial License, in the text its authors wrote on 2026-10-29 (upstream commit `26089e24`): [`a/LICENSE`](a/LICENSE), [`b/LICENSE`](b/LICENSE). Non-commercial use, publication and sharing, including tours hosted online, need no permission; the credit "CAVERN Template by Luna Leila Valentin and Celeste Betancur Gutierrez" with a link to <https://github.com/lunavalentin/CAVERN_Template> is required, and the licence file stays with any copy of the code; commercial use needs the authors' prior written permission. It covers the template's code only: the content added to this tour keeps the licences of the other rows |
| Spatial audio library (`*/JSAmbisonics/`) | JSAmbisonics 0.4.0 by Archontis Politis and David Poirier-Quinot, as bundled with the template; the bundle also contains the code of 22 other packages and of two components inside one of them | JSAmbisonics: BSD 3-Clause, [`a/JSAmbisonics/LICENSE`](a/JSAmbisonics/LICENSE). The other packages: MIT or BSD 3-Clause, each with name, version, licence, copyright line and full licence text in [`a/JSAmbisonics/THIRD_PARTY_NOTICES.txt`](a/JSAmbisonics/THIRD_PARTY_NOTICES.txt) (the same files are in `b/`). Open: for bit-twiddle, gl-matrix, babel-runtime, core-js 1.x and fractional-delay the bundle does not show the exact release (the notices name the possible releases; their licence texts are the same, apart from the copyright years of babel-runtime 6.x); get-float-time-domain-data declares MIT but publishes no copyright line |
| Start page, About page, this README and LICENSE-NOTES | Taormina acoustics study | CC BY-NC-SA 4.0 |

Where each part's licence text is: [`LICENSE-NOTES.md`](LICENSE-NOTES.md).

## Non-commercial

This tour is offered for non-commercial use only (research, teaching, artistic and personal use).
The non-commercial condition applies to the tour template and its modified files and to the
pictures and maps. It adds no restriction to material under CC BY 4.0, such as the soprano excerpt.
Under the template's licence, non-commercial use, publication and sharing of the template and of
works built on it need no permission from its authors; commercial use needs their prior written
permission.

## How to cite

Taormina acoustics study, directed by Yishan Shen.

Attribute project-derived results to the Taormina acoustics study, Yishan Shen, with the data
release identifier. Include the original speech-source credit when referring to a listening
example. Keep the uncalibrated-model statement, and do not describe the listening examples as
recordings from the theatre. A data release identifier has not been assigned yet.

Whoever publishes, presents or shares this tour or its code must, by the template's licence, credit
"CAVERN Template by Luna Leila Valentin and Celeste Betancur Gutierrez" with a link to
<https://github.com/lunavalentin/CAVERN_Template>, and keep the template's `LICENSE` file with any copy
of the code.

## Outside services

The A and B pages load these outside services, as the template does: A-Frame 1.4.2 (aframe.io);
p5.js 1.4.0 (cdnjs.cloudflare.com); Bootstrap 5.3.3 and Bootstrap Icons 1.11.3 (cdn.jsdelivr.net);
Google Fonts Archivo and Inter (fonts.googleapis.com, fonts.gstatic.com). Each of these hosts
receives the visitor's IP address when the page loads. The start page and the About page load none.
Mic and Upload modes process audio in the browser; nothing is uploaded or recorded.

## This repository

The tour files are copied byte for byte from the tour build of the 2026-10-11 package (final
build 2026-11-09, 278 files, 106341093 bytes). `.nojekyll` makes GitHub Pages serve every file as
it is; `.gitattributes` turns off line-ending conversion so the served bytes equal the build.
