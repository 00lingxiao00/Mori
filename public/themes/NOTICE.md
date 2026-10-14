# Theme sources

The document styles are adaptations of the themes installed with the user's Typora 1.9.4 and their custom theme folder. This application is independently implemented and is not affiliated with Typora.

- Github, Gothic, Newsprint, Night, Pixyll, Whitey: https://github.com/typora/typora-default-themes . The installed versions are used to match the user's existing appearance. Existing author comments are retained. Pixyll includes the John Otander MIT notice; Newsprint includes the public-domain Meyer reset notice. No blanket MIT license is asserted for the entire theme collection.
- Lapis and Lapis Dark: YiNN, https://github.com/YiNNx/typora-theme-lapis . MIT license in LAPIS-LICENSE. Missing font assets were obtained from this upstream repository.

Changes: scoped document selectors, translated Typora/CodeMirror 5 classes to ProseMirror/CodeMirror 6, flattened local imports, removed Typora-only application chrome selectors, and adapted list/table wrappers and code controls. No Typora application JavaScript or binaries are included.

Fonts retain their metadata. Additional upstream licenses are in `licenses/`; TeX Gyre Adventor includes its GUST e-foundry license in `gothic/`. Font families: Open Sans, TeX Gyre Adventor, Didact Gothic, PT Serif, Merriweather, Lato, Cantarell, JetBrains Mono, Source Han Serif CN. The Apache 2.0 text is included for legacy font versions using that license; current upstream OFL notices are included where available.
