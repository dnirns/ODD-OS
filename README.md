# ODD/OS

A browser-based fictional DOS operating system, built with Next.js, React and TypeScript.

## Development

Requires Node.js `^22.12.0` or `>=24`.

```bash
npm install
npm run dev        # start the development server at http://localhost:3000
npm test           # run the tests once
npm run typecheck  # generate route types and type check
npm run lint       # run ESLint
npm run build      # create a production build
```

CI runs `npm test`, `npm run typecheck`, `npm run lint` and `npm run build` on Node 22 and 24 for every push and pull request to `master`.

## Licence

The source code is released under the [MIT License](LICENSE).

## Font

The terminal uses [More Perfect DOS VGA](https://laemeur.sdf.org/fonts), a TrueType font by LÆMEUR, which is not covered by the MIT License. It is a modified version of [Perfect DOS VGA 437](http://www.dafont.com/perfect-dos-vga-437.font) by [Zeh Fernando](http://www.zehfernando.com/about). The glyphs follow the IBM VGA ROM font. Its page states that the font is "free for all use, commercial and non-commercial".
